const jwt = require('jsonwebtoken');
const { criarAutenticacao, permitir } = require('../../src/middlewares/auth');

const segredo = '12345678901234567890123456789012';
function resposta() { return { status: jest.fn().mockReturnThis(), json: jest.fn() }; }

describe('autenticação e RBAC', () => {
    test('rejeita token ausente', async () => {
        const middleware = criarAutenticacao({ JWT_SECRET: segredo }, {});
        const next = jest.fn(); await middleware({ get: () => undefined }, resposta(), next);
        expect(next.mock.calls[0][0]).toMatchObject({ status: 401, codigo: 'TOKEN_AUSENTE' });
    });
    test('aceita token válido e injeta usuário', async () => {
        const usuario = { _id: '66f000000000000000000001', ativo: true, papel: 'ADMIN' };
        const query = { select: jest.fn().mockResolvedValue(usuario) };
        const middleware = criarAutenticacao({ JWT_SECRET: segredo }, { findById: jest.fn(() => query) });
        const req = { get: () => `Bearer ${jwt.sign({ papel: 'ADMIN' }, segredo, { subject: usuario._id, expiresIn: '30m' })}` };
        const next = jest.fn(); await middleware(req, resposta(), next);
        expect(next).toHaveBeenCalledWith(); expect(req.usuario).toBe(usuario);
    });
    test('RBAC devolve 403 para papel insuficiente', () => {
        const next = jest.fn(); permitir('ADMIN')({ usuario: { papel: 'MEDICO' } }, resposta(), next);
        expect(next.mock.calls[0][0]).toMatchObject({ status: 403, codigo: 'ACESSO_NEGADO' });
    });
});
