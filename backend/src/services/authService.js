const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const ApiError = require("../utils/ApiError");
const { normalizarEmail } = require("../utils/helpers");

function criarAuthService({ Usuario, config }) {
  return {
    async login({ email, senha }) {
      if (!email || !senha)
        throw new ApiError(400, "VALIDACAO_FALHOU", "E-mail e senha são obrigatórios.");
      const usuario = await Usuario.findOne({ email: normalizarEmail(email) }).select("+senhaHash");
      if (!usuario || !usuario.ativo || !(await bcrypt.compare(senha, usuario.senhaHash))) {
        throw new ApiError(401, "CREDENCIAIS_INVALIDAS", "E-mail ou senha inválidos.");
      }
      const accessToken = jwt.sign({ papel: usuario.papel }, config.JWT_SECRET, {
        subject: String(usuario._id),
        expiresIn: config.JWT_EXPIRES_IN,
      });
      return {
        accessToken,
        tokenType: "Bearer",
        expiresIn: 1800,
        usuario: { id: String(usuario._id), nome: usuario.nome, papel: usuario.papel },
      };
    },
  };
}

module.exports = criarAuthService;
