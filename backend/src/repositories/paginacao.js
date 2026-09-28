const ApiError = require("../utils/ApiError");

function parametros(query, permitidos, padrao = "criadoEm") {
  const pagina = Number(query.pagina || 1);
  const limite = Number(query.limite || 20);
  const ordenarPor = query.ordenarPor || padrao;
  const ordem = query.ordem || "asc";
  if (
    !Number.isInteger(pagina) ||
    pagina < 1 ||
    !Number.isInteger(limite) ||
    limite < 1 ||
    limite > 100 ||
    !permitidos.includes(ordenarPor) ||
    !["asc", "desc"].includes(ordem)
  ) {
    throw new ApiError(
      400,
      "REQUISICAO_INVALIDA",
      "Parâmetros de paginação ou ordenação inválidos.",
    );
  }
  return { pagina, limite, ordenarPor, direcao: ordem === "asc" ? 1 : -1 };
}

async function listar(Model, filtro, query, permitidos, padrao) {
  const p = parametros(query, permitidos, padrao);
  const [dados, totalItens] = await Promise.all([
    Model.find(filtro)
      .sort({ [p.ordenarPor]: p.direcao })
      .skip((p.pagina - 1) * p.limite)
      .limit(p.limite),
    Model.countDocuments(filtro),
  ]);
  return {
    dados,
    paginacao: {
      pagina: p.pagina,
      limite: p.limite,
      totalItens,
      totalPaginas: Math.ceil(totalItens / p.limite),
    },
  };
}

module.exports = { listar };
