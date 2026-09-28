const jwt = require("jsonwebtoken");
const ApiError = require("../utils/ApiError");

function criarAutenticacao(config, Usuario) {
  return async function autenticar(req, res, next) {
    try {
      const header = req.get("Authorization");
      if (!header) throw new ApiError(401, "TOKEN_AUSENTE", "Token de acesso não fornecido.");
      const partes = header.split(" ");
      if (partes.length !== 2 || partes[0] !== "Bearer")
        throw new ApiError(401, "TOKEN_INVALIDO", "Token de acesso inválido.");
      let payload;
      try {
        payload = jwt.verify(partes[1], config.JWT_SECRET);
      } catch (erro) {
        if (erro.name === "TokenExpiredError")
          throw new ApiError(401, "TOKEN_EXPIRADO", "Token de acesso expirado.");
        throw new ApiError(401, "TOKEN_INVALIDO", "Token de acesso inválido.");
      }
      const usuario = await Usuario.findById(payload.sub).select("nome email papel medicoId ativo");
      if (!usuario || !usuario.ativo)
        throw new ApiError(401, "TOKEN_INVALIDO", "Token de acesso inválido.");
      req.usuario = usuario;
      next();
    } catch (erro) {
      next(erro);
    }
  };
}

function permitir(...papeis) {
  return (req, res, next) =>
    papeis.includes(req.usuario.papel)
      ? next()
      : next(new ApiError(403, "ACESSO_NEGADO", "Acesso negado para o seu papel."));
}

module.exports = { criarAutenticacao, permitir };
