const ApiError = require("../utils/ApiError");
const { log } = require("../utils/logger");

function naoEncontrado(req, res, next) {
  next(new ApiError(404, "RECURSO_NAO_ENCONTRADO", "Rota não encontrada."));
}

function tratarErros(erro, req, res, _next) {
  let apiError = erro;
  if (erro?.code === 11000) {
    const campos = Object.keys(erro.keyPattern || erro.keyValue || {});
    apiError = new ApiError(
      409,
      "RECURSO_DUPLICADO",
      "Já existe um recurso com os dados informados.",
      campos.map((campo) => ({ campo, motivo: "já cadastrado" })),
    );
  }
  if (erro?.name === "ValidationError") {
    apiError = new ApiError(
      400,
      "VALIDACAO_FALHOU",
      "Um ou mais campos são inválidos.",
      Object.values(erro.errors).map((e) => ({ campo: e.path, motivo: e.message })),
    );
  }
  if (!(apiError instanceof ApiError)) {
    log("error", "Erro não tratado", req.correlationId, {
      tipo: erro?.name,
      mensagemInterna: erro?.message,
    });
    apiError = new ApiError(500, "ERRO_INTERNO", "Ocorreu um erro interno.");
  }
  res.status(apiError.status).json({
    erro: {
      codigo: apiError.codigo,
      mensagem: apiError.message,
      detalhes: apiError.detalhes,
      correlationId: req.correlationId,
    },
  });
}

module.exports = { naoEncontrado, tratarErros };
