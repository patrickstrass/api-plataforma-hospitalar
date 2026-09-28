# Especificação funcional e técnica — Plataforma de Gestão Hospitalar

**Versão:** 1.0 (decisões validadas)  
**Base:** `SpecInicial.md`  
**Abordagem:** API-first / Contract-First (SDD)

> Esta é a especificação funcional e técnica consolidada. O próximo artefato deve
> ser o contrato `openapi.yaml`, criado antes da implementação da lógica.

## 1. Objetivo

Disponibilizar uma aplicação web para cadastrar pacientes, médicos e leitos;
controlar internações; e agendar compromissos médicos sincronizados com o Google
Calendar. O backend será a única fonte de acesso aos dados e aplicará autenticação,
autorização, validações de negócio, rastreabilidade e resiliência.

## 2. Escopo do MVP

### Incluído

- Autenticação com e-mail/senha e JWT.
- Administração de usuários e papéis.
- Cadastro e consulta de médicos, pacientes e leitos.
- Controle do ciclo de vida de internações.
- Consulta de ocupação e disponibilidade de leitos.
- Agendamento de consultas e sincronização com Google Calendar.
- Paginação, filtros e ordenação nas listagens principais.
- RBAC, idempotência, correlation ID, retry, timeout, circuit breaker e saga.
- Frontend Angular consumindo exclusivamente o contrato OpenAPI.
- Documentação Swagger UI e testes automatizados.

### Fora do escopo inicial

- Prontuário clínico, prescrições, exames e diagnósticos.
- Faturamento, convênios, estoque e farmácia.
- Telemedicina e notificações por SMS/e-mail.
- Escala completa de plantões.
- Integrações com padrões hospitalares como HL7/FHIR.
- Gestão de múltiplos hospitais (o MVP considera uma unidade hospitalar).

Itens fora do escopo podem ser incluídos após validação, com revisão do contrato.

## 3. Decisões de escopo confirmadas

1. Somente funcionários acessam o sistema; pacientes não possuem login.
2. Os papéis são apenas `ADMIN`, `RECEPCAO` e `MEDICO`.
3. A associação entre paciente, médico e leito existe somente durante a internação.
4. Cada paciente e cada leito podem participar de no máximo uma internação ativa.
5. Leito possui somente dois estados, representados por `ocupado: boolean`.
6. O Google Calendar é usado somente para consultas e há um único calendário
   institucional.
7. Se a criação do evento no Google falhar após as tentativas, o agendamento local
   pendente é apagado como ação compensatória.
8. Não haverá troca de médico ou leito durante uma internação. Se necessário, a
   internação atual deve ser encerrada e outra deve ser criada.
9. O JWT dura 30 minutos e não haverá refresh token nem revogação/logout no backend.
10. O frontend guarda o JWT em `localStorage`.
11. O sistema atende uma única unidade hospitalar.
12. Apenas `POST /agendamentos` exige `Idempotency-Key`; internações não exigem.
13. Datas são persistidas em UTC/ISO 8601 e exibidas no fuso
    `America/Sao_Paulo`.
14. O projeto prioriza soluções simples e não possui meta mínima de cobertura.

## 4. Atores e permissões

| Ação | ADMIN | RECEPCAO | MEDICO |
| --- | :---: | :---: | :---: |
| Entrar e consultar o próprio perfil | Sim | Sim | Sim |
| Gerenciar usuários e papéis | Sim | Não | Não |
| Cadastrar/editar médicos | Sim | Não | Não |
| Consultar médicos | Sim | Sim | Sim |
| Cadastrar/editar pacientes | Sim | Sim | Não |
| Consultar pacientes | Sim | Sim | Sim |
| Cadastrar/editar leitos | Sim | Não | Não |
| Consultar leitos | Sim | Sim | Sim |
| Criar/encerrar internações | Sim | Sim | Não |
| Consultar internações | Sim | Sim | Sim (somente as próprias) |
| Criar/alterar agendamentos | Sim | Sim | Sim (somente os próprios) |

O backend deve aplicar essas regras; ocultar botões no frontend não é controle de
segurança. Tentativa autenticada sem permissão retorna `403`.

## 5. Modelo de domínio

### Usuario

- `id`: ObjectId serializado como string.
- `nome`: 3–120 caracteres.
- `email`: válido, normalizado em minúsculas e único.
- `senhaHash`: nunca exposto pela API.
- `papel`: `ADMIN | RECEPCAO | MEDICO`.
- `medicoId`: obrigatório somente quando `papel = MEDICO`.
- `ativo`: boolean.
- `criadoEm`, `atualizadoEm`: date-time.

### Medico

- `id`, `nome`, `crm`, `email`, `especialidade`, `ativo`, timestamps.
- Obrigatórios: `nome`, `crm` e `email`.
- `crm`: string única contendo somente algarismos. Não haverá consulta a serviço
  externo de validação neste protótipo.
- `email`: formato básico válido, normalizado em minúsculas e único.
- `usuarioId`: opcional até que um acesso seja associado.

### Paciente

- `id`, `nome`, `cpf`, `email`, `ativo`, `criadoEm`, `atualizadoEm`.
- Todos os campos, exceto os gerados pelo sistema, são obrigatórios.
- `cpf`: string única de exatamente 11 algarismos, armazenada sem pontuação. O
  protótipo valida somente formato numérico e tamanho, não os dígitos verificadores.
- `email`: formato básico válido e normalizado em minúsculas.
- O CPF nunca deve ser escrito integralmente nos logs.

### Leito

- `id`, `codigo`, `ocupado`, `criadoEm`, `atualizadoEm`.
- `codigo`: único.
- `ocupado`: boolean, iniciado sempre como `false` e alterado somente pelos fluxos
  de criação e encerramento de internação.

### Internacao

- `id`, `pacienteId`, `medicoResponsavelId`, `leitoId`.
- `dataEntrada`, `dataAlta`.
- `status`: `ATIVA | ENCERRADA | CANCELADA`.
- `criadoPor`, `criadoEm`, `atualizadoEm`.
- `pacienteId`, `medicoResponsavelId` e `leitoId` não podem ser alterados depois
  da criação.

### Agendamento

- `id`, `pacienteId`, `medicoId`, `titulo`, `descricao`.
- `inicio`, `fim`, `status`.
- `status`: `PENDENTE | CONFIRMADO | CANCELADO`. O estado `PENDENTE` existe apenas
  durante a saga de criação.
- `googleEventId`: interno e opcional; não é aceito na criação pelo cliente.
- timestamps.

### RegistroIdempotencia

- `chave`, `usuarioId`, `rota`, `hashRequisicao`, `statusHttp`, `resposta`,
  `criadoEm`, `expiraEm`.
- Índice único em `usuarioId + rota + chave` e TTL sugerido de 24 horas.

### Validações simples do protótipo

- `nome`: obrigatório, string de 3 a 120 caracteres após remover espaços extras.
- `email`: obrigatório, normalizado em minúsculas e validado por formato básico.
- `cpf`: obrigatório, exatamente 11 algarismos, sem validação de dígitos verificadores.
- `crm`: obrigatório, somente algarismos, sem consulta a conselho ou serviço externo.

## 6. Regras de negócio

### Internações e leitos

- Só entidades ativas podem participar de uma nova internação.
- O leito deve ter `ocupado = false`.
- Médico e paciente devem existir e estar ativos.
- A criação da internação muda `ocupado` para `true` atomicamente.
- Não pode existir mais de uma internação `ATIVA` para o mesmo paciente ou leito.
- Uma internação só pode ser encerrada depois de `dataEntrada`; o encerramento exige
  `dataAlta`, muda o status para `ENCERRADA` e libera o leito.
- Uma internação futura pode ser cancelada, passando para `CANCELADA` e liberando o leito.
- Uma internação encerrada ou cancelada não pode voltar a `ATIVA`.
- Médico, paciente e leito da internação são imutáveis. Não há transferência no MVP.
- A ocupação do leito e a criação/baixa da internação devem ser feitas em transação
  MongoDB para evitar dois pacientes no mesmo leito.

### Agendamentos

- `inicio` deve ser anterior a `fim`; ambos são obrigatórios e futuros na criação.
- Paciente e médico devem existir e estar ativos.
- Um médico não pode ter dois agendamentos confirmados sobrepostos.
- `POST /agendamentos` exige `Idempotency-Key`.
- Repetir a mesma chave e o mesmo corpo devolve a resposta originalmente salva,
  sem criar outro documento ou evento.
- Repetir a chave com corpo diferente retorna `409 IDEMPOTENCY_KEY_REUSED`.
- Cancelar um agendamento confirmado também tenta remover/cancelar o evento no
  Google Calendar.

### Saga de criação do agendamento

1. Validar dados, autorização, idempotência e conflito de horário.
2. Persistir o agendamento local com status `PENDENTE`.
3. Criar o evento no Google Calendar.
4. Se houver sucesso, salvar `googleEventId` e mudar para `CONFIRMADO`.
5. Se a integração falhar após retry, executar a compensação: apagar o agendamento
   local `PENDENTE` e liberar a chave de idempotência para uma nova tentativa.
6. Retornar o erro externo padronizado. Nenhum agendamento é mantido após a falha.

## 7. Contrato HTTP proposto

Prefixo de todas as rotas de negócio: `/api/v1`. JSON usa `camelCase`. IDs inválidos
retornam `400`; IDs válidos, mas inexistentes, retornam `404`.

### Autenticação e usuários

| Método e rota | Papel | Sucesso | Erros previstos |
| --- | --- | --- | --- |
| `POST /auth/login` | Público | `200` | `400`, `401`, `429` |
| `GET /usuarios/me` | Autenticado | `200` | `401`, `404` |
| `GET /usuarios` | ADMIN | `200` | `400`, `401`, `403` |
| `POST /usuarios` | ADMIN | `201` | `400`, `401`, `403`, `409` |
| `GET /usuarios/{id}` | ADMIN | `200` | `400`, `401`, `403`, `404` |
| `PATCH /usuarios/{id}` | ADMIN | `200` | `400`, `401`, `403`, `404`, `409` |

Não haverá registro público. O primeiro administrador será criado por seed/script,
nunca pelo cliente se autodeclarando `ADMIN`.

### Médicos, pacientes e leitos

| Método e rota | Uso | Sucesso | Erros previstos |
| --- | --- | --- | --- |
| `GET /medicos` | Listar/filtrar | `200` | `400`, `401` |
| `POST /medicos` | Criar | `201` | `400`, `401`, `403`, `409` |
| `GET /medicos/{id}` | Detalhar | `200` | `400`, `401`, `404` |
| `PATCH /medicos/{id}` | Atualizar/desativar | `200` | `400`, `401`, `403`, `404`, `409` |
| `GET /pacientes` | Listar/filtrar | `200` | `400`, `401`, `403` |
| `POST /pacientes` | Criar | `201` | `400`, `401`, `403`, `409` |
| `GET /pacientes/{id}` | Detalhar | `200` | `400`, `401`, `403`, `404` |
| `PATCH /pacientes/{id}` | Atualizar/desativar | `200` | `400`, `401`, `403`, `404`, `409` |
| `GET /leitos` | Listar/filtrar | `200` | `400`, `401` |
| `POST /leitos` | Criar | `201` | `400`, `401`, `403`, `409` |
| `GET /leitos/{id}` | Detalhar | `200` | `400`, `401`, `404` |
| `PATCH /leitos/{id}` | Atualizar | `200` | `400`, `401`, `403`, `404`, `409` |

### Internações e agendamentos

| Método e rota | Uso | Sucesso | Erros previstos |
| --- | --- | --- | --- |
| `GET /internacoes` | Listar/filtrar | `200` | `400`, `401`, `403` |
| `POST /internacoes` | Internar e ocupar leito | `201` | `400`, `401`, `403`, `404`, `409` |
| `GET /internacoes/{id}` | Detalhar | `200` | `400`, `401`, `403`, `404` |
| `PATCH /internacoes/{id}` | Encerrar ou cancelar internação | `200` | `400`, `401`, `403`, `404`, `409` |
| `GET /agendamentos` | Listar local + visão transformada | `200` | `400`, `401`, `403` |
| `POST /agendamentos` | Criar e sincronizar | `201` | `400`, `401`, `403`, `404`, `409`, `502`, `503`, `504` |
| `GET /agendamentos/{id}` | Detalhar | `200` | `400`, `401`, `403`, `404` |
| `PATCH /agendamentos/{id}` | Reagendar/cancelar | `200` | `400`, `401`, `403`, `404`, `409`, `502`, `503`, `504` |

`DELETE` não é usado nos cadastros centrais porque o histórico precisa ser
preservado. O `PATCH` aceita somente os campos declarados no OpenAPI. Na internação,
aceita `{ "status": "ENCERRADA", "dataAlta": "<date-time>" }` para uma internação
já iniciada ou `{ "status": "CANCELADA" }` para uma internação futura.
Em leitos, `ocupado` não pode ser alterado diretamente por `PATCH`.

### Operação

| Método e rota | Uso | Sucesso |
| --- | --- | --- |
| `GET /health` | Processo ativo, sem expor segredos | `200` |
| `GET /ready` | MongoDB/configurações essenciais disponíveis | `200` ou `503` |
| `GET /api-docs` | Swagger UI (desenvolvimento/avaliação) | `200` |

## 8. Query parameters e paginação

Listagens aceitam:

- `pagina`: inteiro >= 1, padrão `1`.
- `limite`: inteiro de 1 a 100, padrão `20`.
- `ordenarPor`: somente campos permitidos para o recurso.
- `ordem`: `asc | desc`, padrão `asc`.

Filtros:

- Médicos: `nome`, `especialidade`, `ativo`.
- Pacientes: `nome`, `cpf`, `ativo` (CPF exato; acesso restrito).
- Leitos: `ocupado`.
- Internações: `pacienteId`, `medicoId`, `leitoId`, `status`, `dataInicio`, `dataFim`.
- Agendamentos: `pacienteId`, `medicoId`, `status`, `inicio`, `fim`.

Resposta paginada:

```json
{
  "dados": [],
  "paginacao": {
    "pagina": 1,
    "limite": 20,
    "totalItens": 0,
    "totalPaginas": 0
  }
}
```

## 9. Exemplos essenciais de payload

### Login

```json
{
  "email": "admin@hospital.test",
  "senha": "senha-forte"
}
```

```json
{
  "accessToken": "<jwt>",
  "tokenType": "Bearer",
  "expiresIn": 1800,
  "usuario": {
    "id": "66f000000000000000000001",
    "nome": "Administrador",
    "papel": "ADMIN"
  }
}
```

### Criar internação

```json
{
  "pacienteId": "66f000000000000000000010",
  "medicoResponsavelId": "66f000000000000000000020",
  "leitoId": "66f000000000000000000030",
  "dataEntrada": "2026-09-25T14:00:00.000Z"
}
```

### Criar agendamento

Header obrigatório: `Idempotency-Key`.

```json
{
  "pacienteId": "66f000000000000000000010",
  "medicoId": "66f000000000000000000020",
  "titulo": "Consulta de acompanhamento",
  "descricao": "Retorno programado",
  "inicio": "2026-10-01T13:00:00.000Z",
  "fim": "2026-10-01T13:30:00.000Z"
}
```

Resposta `201` é o modelo local transformado; não deve devolver o objeto bruto do
Google:

```json
{
  "id": "66f000000000000000000040",
  "paciente": { "id": "66f000000000000000000010", "nome": "Ana Lima" },
  "medico": { "id": "66f000000000000000000020", "nome": "Dr. Rui", "especialidade": "Clínica médica" },
  "titulo": "Consulta de acompanhamento",
  "inicio": "2026-10-01T13:00:00.000Z",
  "fim": "2026-10-01T13:30:00.000Z",
  "status": "CONFIRMADO",
  "calendarSincronizado": true,
  "criadoEm": "2026-09-25T15:00:00.000Z"
}
```

## 10. Erros padronizados

Toda falha usa o mesmo schema e devolve `X-Correlation-Id` no header:

```json
{
  "erro": {
    "codigo": "LEITO_INDISPONIVEL",
    "mensagem": "O leito informado não está disponível.",
    "detalhes": [
      { "campo": "leitoId", "motivo": "ocupado: true" }
    ],
    "correlationId": "0f4a6434-7281-4bdb-89f8-743b84f97790"
  }
}
```

| HTTP | Códigos principais |
| ---: | --- |
| `400` | `REQUISICAO_INVALIDA`, `VALIDACAO_FALHOU`, `ID_INVALIDO` |
| `401` | `CREDENCIAIS_INVALIDAS`, `TOKEN_AUSENTE`, `TOKEN_INVALIDO`, `TOKEN_EXPIRADO` |
| `403` | `ACESSO_NEGADO` |
| `404` | `RECURSO_NAO_ENCONTRADO` |
| `409` | `RECURSO_DUPLICADO`, `LEITO_INDISPONIVEL`, `HORARIO_INDISPONIVEL`, `IDEMPOTENCY_KEY_REUSED` |
| `429` | `LIMITE_EXCEDIDO` |
| `500` | `ERRO_INTERNO` |
| `502` | `PROVEDOR_RESPOSTA_INVALIDA`, `PROVEDOR_INDISPONIVEL` |
| `503` | `CIRCUITO_ABERTO`, `SERVICO_INDISPONIVEL` |
| `504` | `PROVEDOR_TIMEOUT` |

Mensagens internas, stack traces, tokens e dados sensíveis nunca entram na resposta.

## 11. Headers e comportamento transversal

- `Authorization: Bearer <token>` em todas as rotas protegidas.
- `Content-Type: application/json` em requisições com corpo.
- `X-Correlation-Id`: UUID recebido ou gerado pelo backend; devolvido na resposta e
  propagado à chamada externa quando o provedor aceitar headers customizados.
- `Idempotency-Key`: UUID recomendado e obrigatório somente em
  `POST /agendamentos`.
- Resposta repetida por idempotência deve preservar status e corpo originais.

## 12. Integração com Google Calendar

- Consumir a API via `fetch`, encapsulada em um cliente de infraestrutura.
- Compor título, descrição e período a partir do modelo local.
- Nunca enviar CPF, diagnóstico ou dados clínicos sensíveis ao calendário.
- Timeout sugerido: 5 segundos por tentativa.
- Até 3 tentativas para erro de rede, timeout, `429` e `5xx`.
- Backoff exponencial: 500 ms, 1 s e 2 s, com jitter de até 250 ms.
- Não repetir automaticamente erros `4xx`, exceto `429`.
- Respeitar `Retry-After` quando informado.
- Circuit breaker: abrir após 5 falhas consecutivas; permanecer aberto por 30
  segundos; permitir uma chamada de teste em `HALF_OPEN`.
- Estado do circuito: `CLOSED`, `OPEN`, `HALF_OPEN`.
- Quando aberto, não chamar o Google e retornar `503 CIRCUITO_ABERTO`.
- Os parâmetros devem vir de configuração para testes determinísticos.

## 13. Segurança e privacidade

- Senhas com bcrypt (12 rounds) e política mínima de 8 caracteres.
- JWT assinado por segredo forte, validade de 30 minutos e payload mínimo:
  `sub`, `papel`, `iat`, `exp`.
- Sem refresh token ou lista de revogação no MVP. “Sair” apenas remove o token do
  `localStorage` no frontend.
- Rate limit mais restritivo em login.
- CORS limitado à origem do frontend.
- Validação e sanitização de entrada; proteção contra NoSQL injection.
- Projeções MongoDB devem excluir `senhaHash` por padrão.
- Logs não podem conter senha, JWT, credenciais Google, CPF integral ou corpo
  clínico sensível.
- O projeto acadêmico deve usar dados fictícios; qualquer uso real exigiria análise
  de LGPD, base legal, retenção, auditoria e controles adicionais.
- `.env` e credenciais não entram no versionamento.

## 14. Configuração

O `.env` atual contém apenas `MONGO_URI`. Configurações previstas:

```dotenv
MONGO_URI=
PORT=3000
JWT_SECRET=
JWT_EXPIRES_IN=30m
FRONTEND_ORIGIN=http://localhost:4200
GOOGLE_CALENDAR_ID=
GOOGLE_CLIENT_EMAIL=
GOOGLE_PRIVATE_KEY=
GOOGLE_API_TIMEOUT_MS=5000
GOOGLE_API_MAX_ATTEMPTS=3
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
CIRCUIT_BREAKER_RESET_MS=30000
```

O calendário institucional deve ser compartilhado com a conta de serviço. A API
obtém um token com essa credencial e usa `fetch` para chamar o Google Calendar.
Deve existir `.env.example` sem valores secretos e validação das configurações na
inicialização.

## 15. Arquitetura sugerida

Para manter o projeto simples, serão usados Node.js, Express, Mongoose, Jest e
Supertest no backend e Angular no frontend.

- `routes`: mapeamento HTTP e middlewares.
- `controllers`: tradução entre HTTP e casos de uso.
- `services`: regras e orquestração.
- `repositories`: persistência MongoDB.
- `integrations`: cliente Google Calendar e políticas de resiliência.
- `middlewares`: autenticação, RBAC, validação, correlation ID e erros.
- `models`: schemas e índices.
- `docs`: `openapi.yaml`.
- `tests`: testes unitários e de integração HTTP.

Rotas não acessam diretamente MongoDB ou Google Calendar. Dependências externas
devem ser injetáveis/substituíveis nos testes.

O código seguirá os padrões demonstrados em `codigo_exemplo/`: rotas REST em
`/api/v1` com substantivos, middleware JWT seguido de RBAC, `fetch` com transformação
da resposta externa, `AbortController`, retry com backoff/jitter e logs com
`X-Correlation-Id`. Os exemplos são referência didática; dados em memória e papel
escolhido pelo próprio usuário não serão reproduzidos.

## 16. Frontend Angular

Telas mínimas:

- Login.
- Layout autenticado com navegação conforme o papel.
- Listagem e formulário de pacientes.
- Listagem e formulário de médicos.
- Painel de leitos com status e filtros.
- Listagem, criação e encerramento de internações.
- Agenda com criação, reagendamento e cancelamento.
- Administração de usuários para `ADMIN`.
- Página de acesso negado e tratamento consistente de falhas.

Requisitos:

- Cliente/DTOs gerados ou implementados estritamente a partir do OpenAPI.
- Interceptor adiciona JWT e `X-Correlation-Id`.
- O JWT é salvo em `localStorage` após o login e removido ao sair. Como essa opção
  aumenta o impacto de XSS, o frontend não deve usar HTML não sanitizado nem expor
  o token em logs.
- Guardas de rota melhoram UX, sem substituir RBAC do backend.
- Informar claramente falha temporária de sincronização com o Google.
- Não mostrar detalhes técnicos internos ao usuário.

## 17. Testes e qualidade

### Unitários

- Validações e regras dos services/use cases.
- Middleware JWT: ausente, válido, inválido e expirado.
- RBAC para cada papel relevante.
- Mapeamento BFF da resposta externa.
- Retry: repete apenas falhas temporárias e respeita limite.
- Timeout via `AbortController`.
- Circuit breaker em todos os estados.
- Idempotência com mesma chave/corpo e chave/corpo diferente.
- Saga: sucesso e compensação quando Google falha.
- Conflitos de leito, paciente internado e agenda sobreposta.

### Integração HTTP

- Status, headers e schemas definidos no OpenAPI.
- Fluxo login → criação → consulta → atualização.
- Persistência com banco isolado/de teste.
- Google Calendar simulado; testes automatizados não dependem da internet.

Não há percentual mínimo de cobertura. Os fluxos críticos listados acima devem ter
testes. Para simplificar, Jest e Supertest serão usados. O processo de validação
deve executar testes e verificar o `openapi.yaml`.

## 18. Critérios de aceite

1. `openapi.yaml` válido documenta rotas, schemas, exemplos, segurança, headers e
   todos os status retornados pela implementação.
2. Swagger UI permite inspecionar e testar o contrato.
3. Nenhuma resposta real diverge do schema/status documentado.
4. Usuário sem JWT recebe `401`; papel insuficiente recebe `403`.
5. Apenas `ADMIN` gerencia usuários e leitos.
6. Duas internações concorrentes não conseguem ocupar o mesmo leito.
7. Repetir criação com a mesma chave idempotente não duplica dados/eventos.
8. Dados do Google são transformados no modelo `Agendamento` da API.
9. Timeout, retry/backoff e circuit breaker têm testes determinísticos.
10. Falha externa depois das tentativas apaga o agendamento local pendente.
11. Todas as respostas incluem `X-Correlation-Id`, também presente nos logs.
12. O frontend executa os fluxos permitidos e apresenta erros padronizados.

## 19. Entregáveis e ordem de execução

1. Criar `openapi.yaml` e validar com linter.
2. Criar schemas/índices Mongoose e massa fictícia de desenvolvimento.
3. Implementar backend conforme o contrato congelado.
4. Implementar testes e mocks da integração.
5. Implementar o cliente Angular a partir do contrato.
6. Executar os testes e registrar instruções no README.
