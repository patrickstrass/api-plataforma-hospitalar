const CircuitBreaker = require('../../src/integrations/circuitBreaker');

describe('CircuitBreaker', () => {
    test('abre depois do limite e recupera por HALF_OPEN', async () => {
        let agora = 1000;
        const breaker = new CircuitBreaker({ limiteFalhas: 2, resetMs: 100, agora: () => agora });
        await expect(breaker.executar(async () => { throw new Error('falha'); })).rejects.toThrow('falha');
        await expect(breaker.executar(async () => { throw new Error('falha'); })).rejects.toThrow('falha');
        expect(breaker.estado).toBe('OPEN');
        await expect(breaker.executar(async () => 'nunca')).rejects.toMatchObject({ codigo: 'CIRCUITO_ABERTO' });
        agora += 101;
        await expect(breaker.executar(async () => 'ok')).resolves.toBe('ok');
        expect(breaker.estado).toBe('CLOSED');
    });
});
