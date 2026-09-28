const bcrypt = require("bcrypt");
const ApiError = require("../utils/ApiError");
const { listar } = require("../repositories/paginacao");
const { validarId, normalizarEmail, normalizarTexto } = require("../utils/helpers");

const definicoes = {
  medicos: {
    filtros: ["nome", "especialidade", "ativo"],
    ordenar: ["nome", "crm", "especialidade", "criadoEm"],
    campos: ["nome", "crm", "email", "especialidade", "ativo"],
  },
  pacientes: {
    filtros: ["nome", "cpf", "ativo"],
    ordenar: ["nome", "cpf", "criadoEm"],
    campos: ["nome", "cpf", "email", "ativo"],
  },
  leitos: { filtros: ["ocupado"], ordenar: ["codigo", "ocupado", "criadoEm"], campos: ["codigo"] },
};

function filtroDaQuery(recurso, query) {
  const filtro = {};
  for (const campo of definicoes[recurso].filtros) {
    if (query[campo] === undefined) continue;
    if (campo === "ativo" || campo === "ocupado") {
      if (!["true", "false"].includes(query[campo]))
        throw new ApiError(400, "REQUISICAO_INVALIDA", `Filtro ${campo} inválido.`);
      filtro[campo] = query[campo] === "true";
    } else if (campo === "cpf") filtro[campo] = query[campo];
    else
      filtro[campo] = {
        $regex: String(query[campo]).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        $options: "i",
      };
  }
  return filtro;
}

function preparar(body, campos) {
  const desconhecidos = Object.keys(body).filter((k) => !campos.includes(k));
  if (desconhecidos.length)
    throw new ApiError(
      400,
      "VALIDACAO_FALHOU",
      "O corpo contém campos não permitidos.",
      desconhecidos.map((campo) => ({ campo, motivo: "campo não permitido" })),
    );
  const dados = { ...body };
  if (dados.nome) dados.nome = normalizarTexto(dados.nome);
  if (dados.email) dados.email = normalizarEmail(dados.email);
  return dados;
}

function criarCadastroService(models) {
  const mapa = { medicos: models.Medico, pacientes: models.Paciente, leitos: models.Leito };
  return {
    async listar(recurso, query) {
      return listar(
        mapa[recurso],
        filtroDaQuery(recurso, query),
        query,
        definicoes[recurso].ordenar,
        recurso === "leitos" ? "codigo" : "nome",
      );
    },
    async obter(recurso, id) {
      validarId(id);
      const doc = await mapa[recurso].findById(id);
      if (!doc) throw new ApiError(404, "RECURSO_NAO_ENCONTRADO", "Recurso não encontrado.");
      return doc;
    },
    async criar(recurso, body) {
      const campos = definicoes[recurso].campos.filter((c) => c !== "ativo");
      const dados = preparar(body, campos);
      if (recurso === "leitos") dados.ocupado = false;
      return mapa[recurso].create(dados);
    },
    async atualizar(recurso, id, body) {
      validarId(id);
      const dados = preparar(body, definicoes[recurso].campos);
      const doc = await mapa[recurso].findByIdAndUpdate(id, dados, {
        new: true,
        runValidators: true,
      });
      if (!doc) throw new ApiError(404, "RECURSO_NAO_ENCONTRADO", "Recurso não encontrado.");
      return doc;
    },
    async criarUsuario(body) {
      const permitidos = ["nome", "email", "senha", "papel", "medicoId", "ativo"];
      const dados = preparar(body, permitidos);
      if (!dados.senha || dados.senha.length < 8)
        throw new ApiError(400, "VALIDACAO_FALHOU", "A senha deve possuir ao menos 8 caracteres.", [
          { campo: "senha", motivo: "mínimo de 8 caracteres" },
        ]);
      if (dados.papel === "MEDICO") {
        validarId(dados.medicoId, "medicoId");
        const medico = await models.Medico.findOne({ _id: dados.medicoId, ativo: true });
        if (!medico)
          throw new ApiError(404, "RECURSO_NAO_ENCONTRADO", "Médico não encontrado ou inativo.");
      }
      dados.senhaHash = await bcrypt.hash(dados.senha, 12);
      delete dados.senha;
      const usuario = await models.Usuario.create(dados);
      if (usuario.medicoId)
        await models.Medico.updateOne({ _id: usuario.medicoId }, { usuarioId: usuario._id });
      return usuario;
    },
    async listarUsuarios(query) {
      return listar(
        models.Usuario,
        {},
        query,
        ["nome", "email", "papel", "ativo", "criadoEm"],
        "nome",
      );
    },
    async obterUsuario(id) {
      validarId(id);
      const u = await models.Usuario.findById(id);
      if (!u) throw new ApiError(404, "RECURSO_NAO_ENCONTRADO", "Usuário não encontrado.");
      return u;
    },
    async atualizarUsuario(id, body) {
      validarId(id);
      const dados = preparar(body, ["nome", "email", "senha", "papel", "medicoId", "ativo"]);
      if (dados.senha !== undefined) {
        if (dados.senha.length < 8)
          throw new ApiError(
            400,
            "VALIDACAO_FALHOU",
            "A senha deve possuir ao menos 8 caracteres.",
          );
        dados.senhaHash = await bcrypt.hash(dados.senha, 12);
        delete dados.senha;
      }
      if (dados.papel === "MEDICO" && !dados.medicoId)
        throw new ApiError(400, "VALIDACAO_FALHOU", "medicoId é obrigatório para o papel MEDICO.");
      const u = await models.Usuario.findByIdAndUpdate(id, dados, {
        new: true,
        runValidators: true,
      });
      if (!u) throw new ApiError(404, "RECURSO_NAO_ENCONTRADO", "Usuário não encontrado.");
      return u;
    },
  };
}

module.exports = criarCadastroService;
