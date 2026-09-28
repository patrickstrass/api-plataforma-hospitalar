function log(level, mensagem, correlationId, meta = {}) {
    const seguros = { ...meta };
    for (const campo of ['senha', 'senhaHash', 'token', 'cpf', 'authorization', 'privateKey']) delete seguros[campo];
    const registro = { timestamp: new Date().toISOString(), level, correlationId, mensagem, ...seguros };
    console.log(JSON.stringify(registro));
}

module.exports = { log };
