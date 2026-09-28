# Plataforma de Gestão Hospitalar

MVP API-first em Node.js/Express, MongoDB/Mongoose e Angular. O contrato congelado está em [`docs/openapi.yaml`](docs/openapi.yaml) e é servido em `GET /api-docs`.

## Execução

Requisitos: Node.js 24+, MongoDB em replica set (necessário às transações) e, para sincronização real, uma conta de serviço do Google com acesso ao calendário institucional.

```bash
cp .env.example .env
npm ci
npm --prefix frontend install
npm run seed
npm start
```

Em outro terminal, execute `npm run frontend`. A API usa `http://localhost:3000` e o frontend `http://localhost:4200` por padrão. Preencha `JWT_SECRET` com pelo menos 32 caracteres e `SEED_ADMIN_PASSWORD` antes do seed. A chave privada do Google aceita quebras como `\n`.

## Validação

```bash
npm run contract:check
npm test
npm run build
# ou tudo:
npm run check
```

Os testes não acessam o Google: o cliente é injetável e simulado. A criação de internações requer MongoDB com transações; para desenvolvimento local, inicie um replica set. A coleção de idempotência possui TTL de 24 horas e chave única por usuário, rota e chave.

## Segurança e comportamento

- O primeiro administrador existe somente via `npm run seed`; não há registro público.
- JWT expira em 30 minutos, sem refresh token. O frontend guarda e remove o token no `localStorage`.
- Toda resposta leva `X-Correlation-Id`; erros seguem o mesmo envelope.
- Apenas `POST /agendamentos` requer `Idempotency-Key`.
- Falha definitiva do Google remove o agendamento `PENDENTE` e libera a chave para nova tentativa.
- Senhas usam bcrypt com 12 rounds; CPF, tokens e credenciais não são escritos nos logs.
