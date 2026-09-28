const crypto = require("crypto");
const ApiError = require("../utils/ApiError");
const CircuitBreaker = require("./circuitBreaker");
const { log } = require("../utils/logger");

const base64url = (valor) =>
  Buffer.from(typeof valor === "string" ? valor : JSON.stringify(valor)).toString("base64url");

function criarGoogleCalendarClient(config, deps = {}) {
  const fetchFn = deps.fetch || global.fetch;
  const dormir = deps.dormir || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const random = deps.random || Math.random;
  const breaker =
    deps.breaker ||
    new CircuitBreaker({
      limiteFalhas: config.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
      resetMs: config.CIRCUIT_BREAKER_RESET_MS,
    });
  let tokenCache;

  async function token(correlationId, signal) {
    if (deps.obterToken) return deps.obterToken(correlationId);
    if (tokenCache?.expiraEm > Date.now() + 60000) return tokenCache.valor;
    if (!config.GOOGLE_CLIENT_EMAIL || !config.GOOGLE_PRIVATE_KEY)
      throw new ApiError(503, "SERVICO_INDISPONIVEL", "Integração com calendário não configurada.");
    const agora = Math.floor(Date.now() / 1000);
    const header = base64url({ alg: "RS256", typ: "JWT" });
    const claim = base64url({
      iss: config.GOOGLE_CLIENT_EMAIL,
      scope: "https://www.googleapis.com/auth/calendar",
      aud: "https://oauth2.googleapis.com/token",
      iat: agora,
      exp: agora + 3600,
    });
    const assinatura = crypto
      .sign("RSA-SHA256", Buffer.from(`${header}.${claim}`), config.GOOGLE_PRIVATE_KEY)
      .toString("base64url");
    const response = await fetchFn("https://oauth2.googleapis.com/token", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Correlation-Id": correlationId,
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${header}.${claim}.${assinatura}`,
      }),
    });
    if (!response.ok)
      throw new ApiError(
        502,
        "PROVEDOR_INDISPONIVEL",
        "Não foi possível autenticar no calendário.",
      );
    const body = await response.json();
    tokenCache = { valor: body.access_token, expiraEm: Date.now() + body.expires_in * 1000 };
    return tokenCache.valor;
  }

  async function requisitar(url, options, correlationId) {
    let ultimo;
    for (let tentativa = 1; tentativa <= config.GOOGLE_API_MAX_ATTEMPTS; tentativa++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.GOOGLE_API_TIMEOUT_MS);
      try {
        const accessToken = await token(correlationId, controller.signal);
        const response = await fetchFn(url, {
          ...options,
          signal: controller.signal,
          headers: {
            ...options.headers,
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
            "X-Correlation-Id": correlationId,
          },
        });
        clearTimeout(timeout);
        if (response.ok) return response.status === 204 ? null : response.json();
        let codigo =
          response.status === 429 || response.status >= 500
            ? "PROVEDOR_INDISPONIVEL"
            : "PROVEDOR_RESPOSTA_INVALIDA";
        ultimo = new ApiError(502, codigo, "O calendário recusou a operação.");
        if (response.status < 500 && response.status !== 429) throw ultimo;
        const retryAfter = Number(response.headers.get("retry-after")) * 1000;
        if (tentativa < config.GOOGLE_API_MAX_ATTEMPTS)
          await dormir(
            Number.isFinite(retryAfter) && retryAfter > 0
              ? retryAfter
              : 500 * 2 ** (tentativa - 1) + random() * 250,
          );
      } catch (erro) {
        clearTimeout(timeout);
        if (erro instanceof ApiError && erro.codigo === "PROVEDOR_RESPOSTA_INVALIDA") throw erro;
        ultimo =
          erro.name === "AbortError" || erro.name === "TimeoutError"
            ? new ApiError(504, "PROVEDOR_TIMEOUT", "O calendário excedeu o tempo limite.")
            : erro instanceof ApiError
              ? erro
              : new ApiError(502, "PROVEDOR_INDISPONIVEL", "O calendário está indisponível.");
        if (tentativa < config.GOOGLE_API_MAX_ATTEMPTS)
          await dormir(500 * 2 ** (tentativa - 1) + random() * 250);
      }
      log("warn", "Tentativa de integração falhou", correlationId, { tentativa });
    }
    throw ultimo;
  }

  const endpoint = (id) =>
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.GOOGLE_CALENDAR_ID)}/events${id ? `/${encodeURIComponent(id)}` : ""}`;
  const evento = (a) => ({
    summary: a.titulo,
    description: a.descricao || "",
    start: { dateTime: new Date(a.inicio).toISOString(), timeZone: "America/Sao_Paulo" },
    end: { dateTime: new Date(a.fim).toISOString(), timeZone: "America/Sao_Paulo" },
  });
  return {
    criar: (a, c) =>
      breaker.executar(() =>
        requisitar(
          endpoint(),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(evento(a)),
          },
          c,
        ),
      ),
    atualizar: (id, a, c) =>
      breaker.executar(() =>
        requisitar(
          endpoint(id),
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(evento(a)),
          },
          c,
        ),
      ),
    remover: (id, c) =>
      breaker.executar(() => requisitar(endpoint(id), { method: "DELETE", headers: {} }, c)),
    breaker,
  };
}
module.exports = criarGoogleCalendarClient;
