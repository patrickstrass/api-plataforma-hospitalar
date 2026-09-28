const ApiError = require("../utils/ApiError");
const { validarId, hashRequisicao } = require("../utils/helpers");
const { listar } = require("../repositories/paginacao");

function validarPeriodo(body, futuro = true) {
  const inicio = new Date(body.inicio),
    fim = new Date(body.fim);
  if (
    !body.inicio ||
    !body.fim ||
    Number.isNaN(inicio.getTime()) ||
    Number.isNaN(fim.getTime()) ||
    inicio >= fim ||
    (futuro && inicio <= new Date())
  ) {
    throw new ApiError(
      400,
      "VALIDACAO_FALHOU",
      "O período deve ser válido, futuro e ter início anterior ao fim.",
    );
  }
  return { inicio, fim };
}

function resposta(doc, paciente, medico) {
  return {
    id: String(doc._id),
    paciente: { id: String(paciente._id), nome: paciente.nome },
    medico: { id: String(medico._id), nome: medico.nome, especialidade: medico.especialidade },
    titulo: doc.titulo,
    descricao: doc.descricao,
    inicio: doc.inicio,
    fim: doc.fim,
    status: doc.status,
    calendarSincronizado: doc.status !== "PENDENTE",
    criadoEm: doc.criadoEm,
  };
}

function criarAgendamentoService(models, google) {
  async function entidades(body) {
    validarId(body.pacienteId, "pacienteId");
    validarId(body.medicoId, "medicoId");
    const [paciente, medico] = await Promise.all([
      models.Paciente.findOne({ _id: body.pacienteId, ativo: true }),
      models.Medico.findOne({ _id: body.medicoId, ativo: true }),
    ]);
    if (!paciente || !medico)
      throw new ApiError(
        404,
        "RECURSO_NAO_ENCONTRADO",
        "Paciente ou médico não encontrado ou inativo.",
      );
    return { paciente, medico };
  }
  async function conflito(medicoId, inicio, fim, ignorarId) {
    const filtro = { medicoId, status: "CONFIRMADO", inicio: { $lt: fim }, fim: { $gt: inicio } };
    if (ignorarId) filtro._id = { $ne: ignorarId };
    if (await models.Agendamento.exists(filtro))
      throw new ApiError(
        409,
        "HORARIO_INDISPONIVEL",
        "O médico já possui agendamento nesse período.",
      );
  }
  return {
    async criar(body, usuario, chave, correlationId) {
      if (!chave)
        throw new ApiError(400, "VALIDACAO_FALHOU", "O cabeçalho Idempotency-Key é obrigatório.", [
          { campo: "Idempotency-Key", motivo: "ausente" },
        ]);
      const permitidos = ["pacienteId", "medicoId", "titulo", "descricao", "inicio", "fim"];
      if (Object.keys(body).some((k) => !permitidos.includes(k)))
        throw new ApiError(400, "VALIDACAO_FALHOU", "O corpo contém campos não permitidos.");
      if (usuario.papel === "MEDICO" && String(usuario.medicoId) !== String(body.medicoId))
        throw new ApiError(
          403,
          "ACESSO_NEGADO",
          "Médicos só podem criar os próprios agendamentos.",
        );
      const hash = hashRequisicao(body),
        rota = "/api/v1/agendamentos";
      const anterior = await models.RegistroIdempotencia.findOne({
        usuarioId: usuario._id,
        rota,
        chave,
      });
      if (anterior) {
        if (anterior.hashRequisicao !== hash)
          throw new ApiError(
            409,
            "IDEMPOTENCY_KEY_REUSED",
            "A chave de idempotência já foi usada com outro corpo.",
          );
        if (anterior.resposta) return { status: anterior.statusHttp, body: anterior.resposta };
        throw new ApiError(
          409,
          "REQUISICAO_INVALIDA",
          "Uma requisição com essa chave está em processamento.",
        );
      }
      const periodo = validarPeriodo(body);
      const { paciente, medico } = await entidades(body);
      await conflito(body.medicoId, periodo.inicio, periodo.fim);
      let registro;
      try {
        registro = await models.RegistroIdempotencia.create({
          chave,
          usuarioId: usuario._id,
          rota,
          hashRequisicao: hash,
          expiraEm: new Date(Date.now() + 86400000),
        });
      } catch (e) {
        if (e.code === 11000)
          throw new ApiError(
            409,
            "REQUISICAO_INVALIDA",
            "Uma requisição com essa chave está em processamento.",
          );
        throw e;
      }
      let doc;
      try {
        doc = await models.Agendamento.create({ ...body, ...periodo, status: "PENDENTE" });
        const evento = await google.criar(doc, correlationId);
        if (!evento?.id)
          throw new ApiError(
            502,
            "PROVEDOR_RESPOSTA_INVALIDA",
            "O calendário retornou uma resposta inválida.",
          );
        doc.status = "CONFIRMADO";
        doc.googleEventId = evento.id;
        await doc.save();
        const bodyResposta = resposta(doc, paciente, medico);
        registro.statusHttp = 201;
        registro.resposta = bodyResposta;
        await registro.save();
        return { status: 201, body: bodyResposta };
      } catch (erro) {
        if (doc) await models.Agendamento.deleteOne({ _id: doc._id, status: "PENDENTE" });
        if (registro) await registro.deleteOne();
        throw erro;
      }
    },
    async obter(id, usuario) {
      validarId(id);
      const filtro = { _id: id };
      if (usuario.papel === "MEDICO") filtro.medicoId = usuario.medicoId;
      const doc = await models.Agendamento.findOne(filtro);
      if (!doc) throw new ApiError(404, "RECURSO_NAO_ENCONTRADO", "Agendamento não encontrado.");
      const { paciente, medico } = await entidades(doc);
      return resposta(doc, paciente, medico);
    },
    async listar(query, usuario) {
      const filtro = {};
      for (const campo of ["pacienteId", "medicoId"])
        if (query[campo]) {
          validarId(query[campo], campo);
          filtro[campo] = query[campo];
        }
      if (query.status) filtro.status = query.status;
      if (query.inicio || query.fim)
        filtro.inicio = {
          ...(query.inicio && { $gte: new Date(query.inicio) }),
          ...(query.fim && { $lte: new Date(query.fim) }),
        };
      if (usuario.papel === "MEDICO") filtro.medicoId = usuario.medicoId;
      const pagina = await listar(
        models.Agendamento,
        filtro,
        query,
        ["inicio", "fim", "status", "criadoEm"],
        "inicio",
      );
      pagina.dados = await Promise.all(
        pagina.dados.map(async (doc) => {
          const { paciente, medico } = await entidades(doc);
          return resposta(doc, paciente, medico);
        }),
      );
      return pagina;
    },
    async atualizar(id, body, usuario, correlationId) {
      validarId(id);
      const doc = await models.Agendamento.findById(id).select("+googleEventId");
      if (!doc) throw new ApiError(404, "RECURSO_NAO_ENCONTRADO", "Agendamento não encontrado.");
      if (usuario.papel === "MEDICO" && String(usuario.medicoId) !== String(doc.medicoId))
        throw new ApiError(
          403,
          "ACESSO_NEGADO",
          "Médicos só podem alterar os próprios agendamentos.",
        );
      if (doc.status === "CANCELADO")
        throw new ApiError(409, "REQUISICAO_INVALIDA", "Agendamento já cancelado.");
      const permitidos = ["titulo", "descricao", "inicio", "fim", "status"];
      if (Object.keys(body).some((k) => !permitidos.includes(k)))
        throw new ApiError(400, "VALIDACAO_FALHOU", "O corpo contém campos não permitidos.");
      if (body.status === "CANCELADO") {
        await google.remover(doc.googleEventId, correlationId);
        doc.status = "CANCELADO";
        await doc.save();
      } else {
        const novo = { ...doc.toObject(), ...body };
        const periodo = validarPeriodo(novo);
        await conflito(doc.medicoId, periodo.inicio, periodo.fim, doc._id);
        Object.assign(doc, body, periodo);
        await google.atualizar(doc.googleEventId, doc, correlationId);
        await doc.save();
      }
      const { paciente, medico } = await entidades(doc);
      return resposta(doc, paciente, medico);
    },
  };
}
module.exports = criarAgendamentoService;
