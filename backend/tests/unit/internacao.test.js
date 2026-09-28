const mongoose = require('mongoose');
const criarInternacaoService = require('../../src/services/internacaoService');

const internacaoId = '66f000000000000000000001';
const leitoId = '66f000000000000000000002';

function preparar(dataEntrada) {
    const session = {
        withTransaction: jest.fn(async callback => callback()),
        endSession: jest.fn().mockResolvedValue(undefined)
    };
    jest.spyOn(mongoose, 'startSession').mockResolvedValue(session);
    const doc = { dataEntrada, dataAlta: null, status: 'ATIVA', leitoId, save: jest.fn().mockResolvedValue(undefined) };
    const models = {
        Internacao: { findOne: jest.fn(() => ({ session: jest.fn().mockResolvedValue(doc) })) },
        Leito: { updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }) }
    };
    return { service: criarInternacaoService(models), models, doc };
}

describe('conclusão de internações', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2030-01-10T12:00:00Z'));
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    test('cancela internação futura e libera o leito', async () => {
        const { service, models, doc } = preparar(new Date('2030-01-11T12:00:00Z'));

        await expect(service.encerrar(internacaoId, { status: 'CANCELADA' })).resolves.toBe(doc);

        expect(doc.status).toBe('CANCELADA');
        expect(doc.dataAlta).toBeNull();
        expect(doc.save).toHaveBeenCalled();
        expect(models.Leito.updateOne).toHaveBeenCalledWith(
            { _id: leitoId },
            { ocupado: false },
            expect.objectContaining({ runValidators: false })
        );
    });

    test('não encerra uma internação antes do início', async () => {
        const { service } = preparar(new Date('2030-01-11T12:00:00Z'));

        await expect(service.encerrar(internacaoId, {
            status: 'ENCERRADA',
            dataAlta: '2030-01-10T12:00:00Z'
        })).rejects.toMatchObject({ status: 409, codigo: 'INTERNACAO_NAO_INICIADA' });
    });

    test('não cancela uma internação que já começou', async () => {
        const { service } = preparar(new Date('2030-01-09T12:00:00Z'));

        await expect(service.encerrar(internacaoId, { status: 'CANCELADA' }))
            .rejects.toMatchObject({ status: 409, codigo: 'INTERNACAO_JA_INICIADA' });
    });
});
