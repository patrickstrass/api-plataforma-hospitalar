const request = require("supertest");
const criarApp = require("../../src/app");

const config = {
  MONGO_URI: "mongodb://localhost/test",
  PORT: 3000,
  JWT_SECRET: "12345678901234567890123456789012",
  JWT_EXPIRES_IN: "30m",
  FRONTEND_ORIGIN: "http://localhost:4200",
  GOOGLE_CALENDAR_ID: "",
  GOOGLE_CLIENT_EMAIL: "",
  GOOGLE_PRIVATE_KEY: "",
  GOOGLE_API_TIMEOUT_MS: 10,
  GOOGLE_API_MAX_ATTEMPTS: 1,
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: 5,
  CIRCUIT_BREAKER_RESET_MS: 30000,
};
const vazio = {};

describe("contrato HTTP transversal", () => {
  const app = criarApp({ config, models: vazio, googleClient: {} });

  test("health responde e devolve correlation id", async () => {
    const response = await request(app)
      .get("/health")
      .set("X-Correlation-Id", "123e4567-e89b-12d3-a456-426614174000");
    expect(response.status).toBe(200);
    expect(response.headers["x-correlation-id"]).toBe("123e4567-e89b-12d3-a456-426614174000");
    expect(response.body).toEqual({ status: "ok" });
  });

  test("rota protegida sem JWT segue schema de erro", async () => {
    const response = await request(app).get("/api/v1/pacientes");
    expect(response.status).toBe(401);
    expect(response.body.erro).toEqual(
      expect.objectContaining({
        codigo: "TOKEN_AUSENTE",
        correlationId: expect.any(String),
        detalhes: [],
      }),
    );
  });

  test("rota inexistente retorna 404 padronizado", async () => {
    const response = await request(app).get("/inexistente");
    expect(response.status).toBe(404);
    expect(response.body.erro.codigo).toBe("RECURSO_NAO_ENCONTRADO");
  });
});
