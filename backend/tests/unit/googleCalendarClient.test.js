const criarCliente = require('../../src/integrations/googleCalendarClient');

const config = { GOOGLE_CALENDAR_ID: 'calendario', GOOGLE_API_TIMEOUT_MS: 100, GOOGLE_API_MAX_ATTEMPTS: 3, CIRCUIT_BREAKER_FAILURE_THRESHOLD: 5, CIRCUIT_BREAKER_RESET_MS: 30000 };

describe('GoogleCalendarClient', () => {
    test('repete 5xx e transforma o evento local', async () => {
        const fetch = jest.fn()
            .mockResolvedValueOnce({ ok: false, status: 503, headers: { get: () => null } })
            .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'google-1' }) });
        const cliente = criarCliente(config, { fetch, obterToken: async () => 'token', dormir: async () => {}, random: () => 0 });
        const resultado = await cliente.criar({ titulo: 'Consulta', descricao: 'Retorno', inicio: '2030-01-01T10:00:00Z', fim: '2030-01-01T11:00:00Z' }, 'corr');
        expect(resultado.id).toBe('google-1');
        expect(fetch).toHaveBeenCalledTimes(2);
        const enviado = JSON.parse(fetch.mock.calls[1][1].body);
        expect(enviado).toEqual(expect.objectContaining({ summary: 'Consulta', description: 'Retorno' }));
        expect(enviado).not.toHaveProperty('cpf');
    });

    test('não repete erros 4xx que não sejam 429', async () => {
        const fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, headers: { get: () => null } });
        const cliente = criarCliente(config, { fetch, obterToken: async () => 'token', dormir: async () => {} });
        await expect(cliente.criar({ titulo: 'x', inicio: '2030-01-01', fim: '2030-01-02' }, 'corr')).rejects.toMatchObject({ codigo: 'PROVEDOR_RESPOSTA_INVALIDA' });
        expect(fetch).toHaveBeenCalledTimes(1);
    });
});
