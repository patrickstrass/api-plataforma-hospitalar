const { Usuario, Medico } = require('../../src/models');

describe('campos opcionais com índice único sparse', () => {
    test('não grava medicoId nulo para usuário sem vínculo médico', async () => {
        const usuario = new Usuario({
            nome: 'Administrador',
            email: 'admin@example.test',
            senhaHash: 'hash',
            papel: 'ADMIN'
        });

        await usuario.validate();

        expect(usuario.medicoId).toBeUndefined();
        expect(usuario.toObject()).not.toHaveProperty('medicoId');
    });

    test('não grava usuarioId nulo para médico sem acesso associado', () => {
        const medico = new Medico({
            nome: 'Dra. Maria Silva',
            crm: '123456',
            email: 'maria@example.test'
        });

        expect(medico.usuarioId).toBeUndefined();
        expect(medico.toObject()).not.toHaveProperty('usuarioId');
    });
});
