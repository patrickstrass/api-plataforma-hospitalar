const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yaml");
const fs = require("fs");
const mongoose = require("mongoose");
const modelsPadrao = require("./models");
const correlation = require("./middlewares/correlation");
const { criarAutenticacao } = require("./middlewares/auth");
const { naoEncontrado, tratarErros } = require("./middlewares/errors");
const criarAuthService = require("./services/authService");
const criarCadastroService = require("./services/cadastroService");
const criarInternacaoService = require("./services/internacaoService");
const criarAgendamentoService = require("./services/agendamentoService");
const criarGoogleCalendarClient = require("./integrations/googleCalendarClient");
const criarRotas = require("./routes");

function criarApp({ config, models = modelsPadrao, googleClient } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: config.FRONTEND_ORIGIN }));
  app.use(express.json({ limit: "100kb" }));
  app.use(correlation);

  const google = googleClient || criarGoogleCalendarClient(config);
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/ready", (req, res) => {
    const pronto = mongoose.connection.readyState === 1 && Boolean(config.JWT_SECRET);
    if (pronto) return res.json({ status: "ready" });
    return res.status(503).json({
      erro: {
        codigo: "SERVICO_INDISPONIVEL",
        mensagem: "Dependências essenciais indisponíveis.",
        detalhes: [],
        correlationId: req.correlationId,
      },
    });
  });
  const contrato = YAML.parse(
    fs.readFileSync(path.resolve(__dirname, "../../docs/openapi.yaml"), "utf8"),
  );
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(contrato));
  app.use(
    "/api/v1",
    criarRotas({
      autenticar: criarAutenticacao(config, models.Usuario),
      authService: criarAuthService({ Usuario: models.Usuario, config }),
      cadastroService: criarCadastroService(models),
      internacaoService: criarInternacaoService(models),
      agendamentoService: criarAgendamentoService(models, google),
    }),
  );
  app.use(naoEncontrado);
  app.use(tratarErros);
  return app;
}
module.exports = criarApp;
