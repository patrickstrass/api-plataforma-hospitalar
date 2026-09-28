class ApiError extends Error {
    constructor(status, codigo, mensagem, detalhes = []) {
        super(mensagem);
        this.status = status;
        this.codigo = codigo;
        this.detalhes = detalhes;
    }
}

module.exports = ApiError;
