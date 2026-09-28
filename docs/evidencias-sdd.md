# Evidências de aderência ao SDD e robustez arquitetural

Este documento relaciona requisitos da especificação aos respectivos trechos da
implementação. As fontes de verdade consideradas são [`spec.md`](../spec.md) e o
contrato OpenAPI congelado em [`docs/openapi.yaml`](./openapi.yaml).

> **Nota sobre o formato de erro:** `mensagem_erro` é um exemplo de nome de chave.
> Neste projeto, o contrato real define o envelope `erro` com as propriedades
> `codigo`, `mensagem`, `detalhes` e `correlationId`. A implementação deve seguir
> esses nomes exatamente.

## 1. Fidelidade ao contrato SDD

### 1.1 O contrato define respostas de erro e seu formato

O OpenAPI referencia o mesmo schema `Erro` para requisições inválidas e demais
falhas previstas:

```yaml
# docs/openapi.yaml
responses:
  RequisicaoInvalida:
    description: Requisição inválida
    headers:
      X-Correlation-Id:
        $ref: '#/components/headers/CorrelationId'
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/Erro'

schemas:
  Erro:
    type: object
    required: [erro]
    properties:
      erro:
        type: object
        required: [codigo, mensagem, detalhes, correlationId]
        properties:
          codigo: { type: string }
          mensagem: { type: string }
          detalhes:
            type: array
            items: { $ref: '#/components/schemas/DetalheErro' }
          correlationId: { type: string, format: uuid }
```

Por exemplo, `POST /api/v1/agendamentos` declara explicitamente os códigos que
podem ser retornados:

```yaml
# docs/openapi.yaml
responses:
  '201':
    description: Confirmado
  '400': { $ref: '#/components/responses/RequisicaoInvalida' }
  '401': { $ref: '#/components/responses/NaoAutorizado' }
  '403': { $ref: '#/components/responses/AcessoNegado' }
  '404': { $ref: '#/components/responses/NaoEncontrado' }
  '409': { $ref: '#/components/responses/Conflito' }
  '502': { $ref: '#/components/responses/ProvedorFalhou' }
  '503': { $ref: '#/components/responses/ServicoIndisponivel' }
  '504': { $ref: '#/components/responses/ProvedorTimeout' }
```

### 1.2 Erros de negócio carregam o status HTTP previsto

A classe de erro da aplicação mantém status, código, mensagem e detalhes como
dados estruturados:

```js
// backend/src/utils/ApiError.js
class ApiError extends Error {
    constructor(status, codigo, mensagem, detalhes = []) {
        super(mensagem);
        this.status = status;
        this.codigo = codigo;
        this.detalhes = detalhes;
    }
}
```

As validações de serviço lançam `ApiError(400, ...)`, em vez de erros genéricos.
Assim, uma falha conhecida não é convertida incorretamente em `500`:

```js
// backend/src/services/agendamentoService.js
function validarPeriodo(body, futuro = true) {
    const inicio = new Date(body.inicio), fim = new Date(body.fim);
    if (!body.inicio || !body.fim || Number.isNaN(inicio.getTime()) ||
        Number.isNaN(fim.getTime()) || inicio >= fim ||
        (futuro && inicio <= new Date())) {
        throw new ApiError(
            400,
            'VALIDACAO_FALHOU',
            'O período deve ser válido, futuro e ter início anterior ao fim.'
        );
    }
    return { inicio, fim };
}
```

Outro exemplo é a obrigatoriedade contratual de `Idempotency-Key`:

```js
// backend/src/services/agendamentoService.js
if (!chave) {
    throw new ApiError(
        400,
        'VALIDACAO_FALHOU',
        'O cabeçalho Idempotency-Key é obrigatório.',
        [{ campo: 'Idempotency-Key', motivo: 'ausente' }]
    );
}
```

### 1.3 O middleware preserva o status e o envelope contratados

O tratador central reconhece falhas previstas, converte validações do Mongoose
para `400` e só usa `500` para defeitos realmente não tratados:

```js
// backend/src/middlewares/errors.js
function tratarErros(erro, req, res, _next) {
    let apiError = erro;

    if (erro?.name === 'ValidationError') {
        apiError = new ApiError(
            400,
            'VALIDACAO_FALHOU',
            'Um ou mais campos são inválidos.',
            Object.values(erro.errors).map(e => ({
                campo: e.path,
                motivo: e.message
            }))
        );
    }

    if (!(apiError instanceof ApiError)) {
        log('error', 'Erro não tratado', req.correlationId, {
            tipo: erro?.name,
            mensagemInterna: erro?.message
        });
        apiError = new ApiError(500, 'ERRO_INTERNO', 'Ocorreu um erro interno.');
    }

    res.status(apiError.status).json({ erro: {
        codigo: apiError.codigo,
        mensagem: apiError.message,
        detalhes: apiError.detalhes,
        correlationId: req.correlationId
    } });
}
```

Consequentemente, um `ApiError` com status `400` chega ao cliente como `400` e
com a chave contratada `erro.mensagem`; o fallback `500` fica restrito a erros de
programação ou infraestrutura não classificados.

### 1.4 Erros assíncronos chegam ao middleware central

As rotas não escondem rejeições de promises. O adaptador `asyncRoute` encaminha
qualquer erro ao middleware do Express:

```js
// backend/src/routes/index.js
const asyncRoute = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

router.post(
  '/internacoes',
  permitir('ADMIN', 'RECEPCAO'),
  asyncRoute(async (req, res) =>
    res.status(201).json(
      await internacaoService.criar(req.body, req.usuario._id)
    )
  )
);
```

No final da composição da aplicação, os middlewares de rota inexistente e erro
são registrados depois das rotas:

```js
// backend/src/app.js
app.use('/api/v1', criarRotas({
    autenticar: criarAutenticacao(config, models.Usuario),
    authService: criarAuthService({ Usuario: models.Usuario, config }),
    cadastroService: criarCadastroService(models),
    internacaoService: criarInternacaoService(models),
    agendamentoService: criarAgendamentoService(models, google)
}));
app.use(naoEncontrado);
app.use(tratarErros);
```

### 1.5 Validação automatizada do contrato

O projeto valida sintaticamente e semanticamente o OpenAPI no comando
`npm run contract:check`:

```js
// scripts/check-contract.js
SwaggerParser.validate(path.resolve(__dirname, '../docs/openapi.yaml'))
  .then((api) => console.log(`Contrato OpenAPI ${api.info.version} válido.`))
  .catch((erro) => {
    console.error(erro.message);
    process.exit(1);
  });
```

## 2. Segregação de responsabilidades

A composição demonstra separação por camadas:

| Camada | Responsabilidade | Exemplos |
| --- | --- | --- |
| Rotas | HTTP, status de sucesso e autorização por papel | `backend/src/routes/index.js` |
| Serviços | Regras de negócio e orquestração | `backend/src/services/*Service.js` |
| Repositório | Paginação, ordenação e consultas comuns | `backend/src/repositories/paginacao.js` |
| Modelos | Schema, índices e validações persistentes | `backend/src/models/index.js` |
| Middlewares | Autenticação, correlação e erros | `backend/src/middlewares/*.js` |
| Integrações | Comunicação e resiliência do Google Calendar | `backend/src/integrations/*.js` |
| Configuração | Leitura e validação das variáveis de ambiente | `backend/src/config/index.js` |

### 2.1 Rota fina, regra no serviço

A rota conhece HTTP, mas delega a criação e sincronização ao serviço:

```js
// backend/src/routes/index.js
router.post(
  '/agendamentos',
  permitir('ADMIN', 'RECEPCAO', 'MEDICO'),
  asyncRoute(async (req, res) => {
    const resultado = await agendamentoService.criar(
      req.body,
      req.usuario,
      req.get('Idempotency-Key'),
      req.correlationId
    );
    res.status(resultado.status).json(resultado.body);
  })
);
```

O serviço concentra regras como idempotência, conflito de horário e estados da
saga; ele depende de uma abstração `google`, não de `fetch` diretamente:

```js
// backend/src/services/agendamentoService.js
const periodo = validarPeriodo(body);
const { paciente, medico } = await entidades(body);
await conflito(body.medicoId, periodo.inicio, periodo.fim);

doc = await models.Agendamento.create({
    ...body,
    ...periodo,
    status: 'PENDENTE'
});
const evento = await google.criar(doc, correlationId);
doc.status = 'CONFIRMADO';
doc.googleEventId = evento.id;
await doc.save();
```

### 2.2 Injeção de dependências

`criarApp` aceita modelos e cliente externo substituíveis. Isso desacopla o
domínio da infraestrutura e permite testes sem chamadas reais ao Google:

```js
// backend/src/app.js
function criarApp({ config, models = modelsPadrao, googleClient } = {}) {
    // ...
    const google = googleClient || criarGoogleCalendarClient(config);
    // ...
    agendamentoService: criarAgendamentoService(models, google)
}
```

O cliente também aceita `fetch`, função de espera, fonte aleatória, obtenção de
token e circuit breaker injetáveis:

```js
// backend/src/integrations/googleCalendarClient.js
function criarGoogleCalendarClient(config, deps = {}) {
    const fetchFn = deps.fetch || global.fetch;
    const dormir = deps.dormir ||
        (ms => new Promise(resolve => setTimeout(resolve, ms)));
    const random = deps.random || Math.random;
    const breaker = deps.breaker || new CircuitBreaker({
        limiteFalhas: config.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
        resetMs: config.CIRCUIT_BREAKER_RESET_MS
    });
```

## 3. Robustez da integração externa

### 3.1 Timeout e limites configuráveis

Os parâmetros são validados na inicialização e possuem valores-padrão seguros:

```js
// backend/src/config/index.js
GOOGLE_API_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
GOOGLE_API_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(3),
CIRCUIT_BREAKER_FAILURE_THRESHOLD:
    z.coerce.number().int().min(1).default(5),
CIRCUIT_BREAKER_RESET_MS:
    z.coerce.number().int().positive().default(30000)
```

Cada tentativa possui seu próprio `AbortController`; ao exceder o limite, o
cliente aborta a chamada e converte a falha para o `504` previsto no contrato:

```js
// backend/src/integrations/googleCalendarClient.js
const controller = new AbortController();
const timeout = setTimeout(
    () => controller.abort(),
    config.GOOGLE_API_TIMEOUT_MS
);

const response = await fetchFn(url, {
    ...options,
    signal: controller.signal,
    headers: {
        ...options.headers,
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'X-Correlation-Id': correlationId
    }
});

// ...
ultimo = erro.name === 'AbortError' || erro.name === 'TimeoutError'
    ? new ApiError(504, 'PROVEDOR_TIMEOUT',
        'O calendário excedeu o tempo limite.')
    : new ApiError(502, 'PROVEDOR_INDISPONIVEL',
        'O calendário está indisponível.');
```

### 3.2 Retentativa somente para falhas temporárias

O laço respeita `GOOGLE_API_MAX_ATTEMPTS`. Respostas `429` e `5xx` são
retentáveis; outros `4xx` encerram imediatamente, pois representam requisições
inválidas e não tendem a se resolver com nova tentativa:

```js
// backend/src/integrations/googleCalendarClient.js
for (let tentativa = 1;
     tentativa <= config.GOOGLE_API_MAX_ATTEMPTS;
     tentativa++) {
    // ...
    const codigo = response.status === 429 || response.status >= 500
        ? 'PROVEDOR_INDISPONIVEL'
        : 'PROVEDOR_RESPOSTA_INVALIDA';
    ultimo = new ApiError(502, codigo, 'O calendário recusou a operação.');

    if (response.status < 500 && response.status !== 429) throw ultimo;

    const retryAfter = Number(response.headers.get('retry-after')) * 1000;
    if (tentativa < config.GOOGLE_API_MAX_ATTEMPTS) {
        await dormir(
            Number.isFinite(retryAfter) && retryAfter > 0
                ? retryAfter
                : 500 * 2 ** (tentativa - 1) + random() * 250
        );
    }
}
```

A estratégia usa `Retry-After` quando fornecido pelo provedor. Caso contrário,
aplica backoff exponencial (`500ms`, `1000ms`, ...) com jitter aleatório de até
`250ms`, reduzindo rajadas simultâneas durante uma indisponibilidade.

### 3.3 Circuit breaker

Falhas consecutivas abrem o circuito. Durante o período de recuperação, novas
chamadas falham rapidamente com `503`; depois do intervalo, uma única tentativa
em `HALF_OPEN` testa a recuperação:

```js
// backend/src/integrations/circuitBreaker.js
if (this.estado === 'OPEN') {
    if (this.agora() - this.abertoEm < this.resetMs) {
        throw new ApiError(
            503,
            'CIRCUITO_ABERTO',
            'Integração temporariamente indisponível.'
        );
    }
    this.estado = 'HALF_OPEN';
}

if (this.estado === 'HALF_OPEN' && this.testeEmCurso) {
    throw new ApiError(
        503,
        'CIRCUITO_ABERTO',
        'Integração temporariamente indisponível.'
    );
}

try {
    const resultado = await operacao();
    this.estado = 'CLOSED';
    this.falhas = 0;
    return resultado;
} catch (erro) {
    this.falhas++;
    if (this.estado === 'HALF_OPEN' ||
        this.falhas >= this.limiteFalhas) {
        this.estado = 'OPEN';
        this.abertoEm = this.agora();
    }
    throw erro;
}
```

### 3.4 Compensação em falha externa

O agendamento local começa como `PENDENTE`. Se o Google falhar, o serviço remove
o documento pendente e o registro de idempotência, evitando um estado local
falsamente confirmado e permitindo uma nova tentativa limpa:

```js
// backend/src/services/agendamentoService.js
try {
    doc = await models.Agendamento.create({
        ...body,
        ...periodo,
        status: 'PENDENTE'
    });
    const evento = await google.criar(doc, correlationId);
    if (!evento?.id) {
        throw new ApiError(
            502,
            'PROVEDOR_RESPOSTA_INVALIDA',
            'O calendário retornou uma resposta inválida.'
        );
    }
    doc.status = 'CONFIRMADO';
    doc.googleEventId = evento.id;
    await doc.save();
} catch (erro) {
    if (doc) {
        await models.Agendamento.deleteOne({
            _id: doc._id,
            status: 'PENDENTE'
        });
    }
    if (registro) await registro.deleteOne();
    throw erro;
}
```

## 4. Evidências automatizadas

Os testes unitários verificam as decisões de retentativa e do circuit breaker:

```js
// backend/tests/unit/googleCalendarClient.test.js
const fetch = jest.fn()
    .mockResolvedValueOnce({
        ok: false,
        status: 503,
        headers: { get: () => null }
    })
    .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'google-1' })
    });

expect(fetch).toHaveBeenCalledTimes(2);
```

```js
// backend/tests/unit/googleCalendarClient.test.js
const fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 400,
    headers: { get: () => null }
});

await expect(cliente.criar(/* ... */))
    .rejects.toMatchObject({ codigo: 'PROVEDOR_RESPOSTA_INVALIDA' });
expect(fetch).toHaveBeenCalledTimes(1);
```

```js
// backend/tests/unit/circuitBreaker.test.js
await expect(breaker.executar(async () => { throw new Error('falha'); }))
    .rejects.toThrow('falha');
await expect(breaker.executar(async () => { throw new Error('falha'); }))
    .rejects.toThrow('falha');
expect(breaker.estado).toBe('OPEN');

await expect(breaker.executar(async () => 'nunca'))
    .rejects.toMatchObject({ codigo: 'CIRCUITO_ABERTO' });
```

Para reproduzir as verificações:

```bash
npm run contract:check
npm run test:unit
npm run build
```

Essas evidências demonstram a cadeia completa: o contrato declara o formato e os
status, os serviços classificam falhas conhecidas, o middleware preserva essa
classificação, as camadas têm responsabilidades distintas e a integração externa
possui timeout, retentativas seletivas, backoff, jitter, circuit breaker e
compensação de estado.
