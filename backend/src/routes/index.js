const express = require("express");
const rateLimit = require("express-rate-limit");
const ApiError = require("../utils/ApiError");
const { permitir } = require("../middlewares/auth");

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function criarRotas({
  autenticar,
  authService,
  cadastroService,
  internacaoService,
  agendamentoService,
}) {
  const router = express.Router();
  const loginLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, _res, next) =>
      next(
        new ApiError(
          429,
          "LIMITE_EXCEDIDO",
          "Muitas tentativas de login. Tente novamente mais tarde.",
        ),
      ),
  });

  router.post(
    "/auth/login",
    loginLimit,
    asyncRoute(async (req, res) => res.json(await authService.login(req.body))),
  );
  router.use(autenticar);

  router.get(
    "/usuarios/me",
    asyncRoute(async (req, res) => res.json(req.usuario)),
  );
  router.get(
    "/usuarios",
    permitir("ADMIN"),
    asyncRoute(async (req, res) => res.json(await cadastroService.listarUsuarios(req.query))),
  );
  router.post(
    "/usuarios",
    permitir("ADMIN"),
    asyncRoute(async (req, res) =>
      res.status(201).json(await cadastroService.criarUsuario(req.body)),
    ),
  );
  router.get(
    "/usuarios/:id",
    permitir("ADMIN"),
    asyncRoute(async (req, res) => res.json(await cadastroService.obterUsuario(req.params.id))),
  );
  router.patch(
    "/usuarios/:id",
    permitir("ADMIN"),
    asyncRoute(async (req, res) =>
      res.json(await cadastroService.atualizarUsuario(req.params.id, req.body)),
    ),
  );

  const cadastrar = {
    medicos: ["ADMIN"],
    pacientes: ["ADMIN", "RECEPCAO"],
    leitos: ["ADMIN"],
  };
  const consultar = {
    medicos: ["ADMIN", "RECEPCAO", "MEDICO"],
    pacientes: ["ADMIN", "RECEPCAO", "MEDICO"],
    leitos: ["ADMIN", "RECEPCAO", "MEDICO"],
  };
  for (const recurso of ["medicos", "pacientes", "leitos"]) {
    router.get(
      `/${recurso}`,
      permitir(...consultar[recurso]),
      asyncRoute(async (req, res) => res.json(await cadastroService.listar(recurso, req.query))),
    );
    router.post(
      `/${recurso}`,
      permitir(...cadastrar[recurso]),
      asyncRoute(async (req, res) =>
        res.status(201).json(await cadastroService.criar(recurso, req.body)),
      ),
    );
    router.get(
      `/${recurso}/:id`,
      permitir(...consultar[recurso]),
      asyncRoute(async (req, res) => res.json(await cadastroService.obter(recurso, req.params.id))),
    );
    router.patch(
      `/${recurso}/:id`,
      permitir(...cadastrar[recurso]),
      asyncRoute(async (req, res) =>
        res.json(await cadastroService.atualizar(recurso, req.params.id, req.body)),
      ),
    );
  }

  router.get(
    "/internacoes",
    permitir("ADMIN", "RECEPCAO", "MEDICO"),
    asyncRoute(async (req, res) =>
      res.json(await internacaoService.listar(req.query, req.usuario)),
    ),
  );
  router.post(
    "/internacoes",
    permitir("ADMIN", "RECEPCAO"),
    asyncRoute(async (req, res) =>
      res.status(201).json(await internacaoService.criar(req.body, req.usuario._id)),
    ),
  );
  router.get(
    "/internacoes/:id",
    permitir("ADMIN", "RECEPCAO", "MEDICO"),
    asyncRoute(async (req, res) =>
      res.json(await internacaoService.obter(req.params.id, req.usuario)),
    ),
  );
  router.patch(
    "/internacoes/:id",
    permitir("ADMIN", "RECEPCAO"),
    asyncRoute(async (req, res) =>
      res.json(await internacaoService.encerrar(req.params.id, req.body)),
    ),
  );

  router.get(
    "/agendamentos",
    permitir("ADMIN", "RECEPCAO", "MEDICO"),
    asyncRoute(async (req, res) =>
      res.json(await agendamentoService.listar(req.query, req.usuario)),
    ),
  );
  router.post(
    "/agendamentos",
    permitir("ADMIN", "RECEPCAO", "MEDICO"),
    asyncRoute(async (req, res) => {
      const resultado = await agendamentoService.criar(
        req.body,
        req.usuario,
        req.get("Idempotency-Key"),
        req.correlationId,
      );
      res.status(resultado.status).json(resultado.body);
    }),
  );
  router.get(
    "/agendamentos/:id",
    permitir("ADMIN", "RECEPCAO", "MEDICO"),
    asyncRoute(async (req, res) =>
      res.json(await agendamentoService.obter(req.params.id, req.usuario)),
    ),
  );
  router.patch(
    "/agendamentos/:id",
    permitir("ADMIN", "RECEPCAO", "MEDICO"),
    asyncRoute(async (req, res) =>
      res.json(
        await agendamentoService.atualizar(req.params.id, req.body, req.usuario, req.correlationId),
      ),
    ),
  );
  return router;
}

module.exports = criarRotas;
