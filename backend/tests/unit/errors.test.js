const { tratarErros } = require('../../src/middlewares/errors');

function resposta() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

describe('tratamento de erros', () => {
    test('informa os campos que violaram um índice único', () => {
        const res = resposta();

        tratarErros({ code: 11000, keyPattern: { crm: 1 } }, { correlationId: 'corr-1' }, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({ erro: {
            codigo: 'RECURSO_DUPLICADO',
            mensagem: 'Já existe um recurso com os dados informados.',
            detalhes: [{ campo: 'crm', motivo: 'já cadastrado' }],
            correlationId: 'corr-1'
        } });
    });
});
