const mongoose = require("mongoose");
const ApiError = require("../utils/ApiError");
const { validarId } = require("../utils/helpers");
const { listar } = require("../repositories/paginacao");

function criarInternacaoService(models) {
  return {
    async criar(body, usuarioId) {
      const permitidos = ["pacienteId", "medicoResponsavelId", "leitoId", "dataEntrada"];
      if (Object.keys(body).some((k) => !permitidos.includes(k)))
        throw new ApiError(400, "VALIDACAO_FALHOU", "O corpo contém campos não permitidos.");
      for (const campo of ["pacienteId", "medicoResponsavelId", "leitoId"])
        validarId(body[campo], campo);
      const entrada = new Date(body.dataEntrada);
      if (!body.dataEntrada || Number.isNaN(entrada.getTime()))
        throw new ApiError(400, "VALIDACAO_FALHOU", "dataEntrada inválida.");
      const session = await mongoose.startSession();
      try {
        let criada;
        await session.withTransaction(async () => {
          // O driver do MongoDB não suporta operações paralelas na mesma transação.
          const paciente = await models.Paciente.findOne({
            _id: body.pacienteId,
            ativo: true,
          }).session(session);
          const medico = await models.Medico.findOne({
            _id: body.medicoResponsavelId,
            ativo: true,
          }).session(session);
          if (!paciente || !medico)
            throw new ApiError(
              404,
              "RECURSO_NAO_ENCONTRADO",
              "Paciente ou médico não encontrado ou inativo.",
            );
          const leito = await models.Leito.findOneAndUpdate(
            { _id: body.leitoId, ocupado: false },
            { ocupado: true },
            { new: true, session, runValidators: false },
          );
          if (!leito)
            throw new ApiError(
              409,
              "LEITO_INDISPONIVEL",
              "O leito informado não está disponível.",
              [{ campo: "leitoId", motivo: "ocupado ou inexistente" }],
            );
          [criada] = await models.Internacao.create(
            [
              {
                pacienteId: body.pacienteId,
                medicoResponsavelId: body.medicoResponsavelId,
                leitoId: body.leitoId,
                dataEntrada: entrada,
                criadoPor: usuarioId,
              },
            ],
            { session },
          );
        });
        return criada;
      } catch (erro) {
        if (erro.code === 11000)
          throw new ApiError(
            409,
            "LEITO_INDISPONIVEL",
            "Paciente ou leito já possui uma internação ativa.",
          );
        throw erro;
      } finally {
        await session.endSession();
      }
    },
    async encerrar(id, body) {
      validarId(id);
      const cancelando = body.status === "CANCELADA";
      const encerrando = body.status === "ENCERRADA";
      const camposPermitidos = cancelando ? ["status"] : ["status", "dataAlta"];
      if (
        (!cancelando && !encerrando) ||
        Object.keys(body).some((k) => !camposPermitidos.includes(k))
      ) {
        throw new ApiError(
          400,
          "VALIDACAO_FALHOU",
          "Use status CANCELADA ou status ENCERRADA acompanhado de dataAlta.",
        );
      }
      const alta = encerrando ? new Date(body.dataAlta) : null;
      if (encerrando && (!body.dataAlta || Number.isNaN(alta.getTime())))
        throw new ApiError(400, "VALIDACAO_FALHOU", "dataAlta inválida.");
      const session = await mongoose.startSession();
      try {
        let doc;
        await session.withTransaction(async () => {
          doc = await models.Internacao.findOne({ _id: id, status: "ATIVA" }).session(session);
          if (!doc)
            throw new ApiError(
              409,
              "REQUISICAO_INVALIDA",
              "A internação não existe ou já foi concluída.",
            );
          const agora = new Date();
          if (encerrando && doc.dataEntrada > agora)
            throw new ApiError(
              409,
              "INTERNACAO_NAO_INICIADA",
              "Uma internação futura não pode ser encerrada; cancele-a.",
            );
          if (cancelando && doc.dataEntrada <= agora)
            throw new ApiError(
              409,
              "INTERNACAO_JA_INICIADA",
              "Uma internação já iniciada não pode ser cancelada; encerre-a.",
            );
          if (encerrando && alta < doc.dataEntrada)
            throw new ApiError(
              400,
              "VALIDACAO_FALHOU",
              "dataAlta não pode ser anterior à entrada.",
            );
          doc.status = body.status;
          doc.dataAlta = alta;
          await doc.save({ session });
          await models.Leito.updateOne(
            { _id: doc.leitoId },
            { ocupado: false },
            { session, runValidators: false },
          );
        });
        return doc;
      } finally {
        await session.endSession();
      }
    },
    async obter(id, usuario) {
      validarId(id);
      const filtro = { _id: id };
      if (usuario.papel === "MEDICO") filtro.medicoResponsavelId = usuario.medicoId;
      const doc = await models.Internacao.findOne(filtro);
      if (!doc) throw new ApiError(404, "RECURSO_NAO_ENCONTRADO", "Internação não encontrada.");
      return doc;
    },
    async listar(query, usuario) {
      const filtro = {};
      for (const [q, campo] of Object.entries({
        pacienteId: "pacienteId",
        medicoId: "medicoResponsavelId",
        leitoId: "leitoId",
        status: "status",
      }))
        if (query[q]) {
          if (q !== "status") validarId(query[q], q);
          filtro[campo] = query[q];
        }
      if (query.dataInicio || query.dataFim)
        filtro.dataEntrada = {
          ...(query.dataInicio && { $gte: new Date(query.dataInicio) }),
          ...(query.dataFim && { $lte: new Date(query.dataFim) }),
        };
      if (usuario.papel === "MEDICO") filtro.medicoResponsavelId = usuario.medicoId;
      return listar(
        models.Internacao,
        filtro,
        query,
        ["dataEntrada", "dataAlta", "status", "criadoEm"],
        "dataEntrada",
      );
    },
  };
}
module.exports = criarInternacaoService;
