const crypto = require('crypto');
const mongoose = require('mongoose');
const ApiError = require('./ApiError');

function normalizarTexto(valor) {
    return typeof valor === 'string' ? valor.trim().replace(/\s+/g, ' ') : valor;
}

function normalizarEmail(valor) {
    return typeof valor === 'string' ? valor.trim().toLowerCase() : valor;
}

function validarId(id, campo = 'id') {
    if (!mongoose.isObjectIdOrHexString(id)) {
        throw new ApiError(400, 'ID_INVALIDO', 'O identificador informado é inválido.', [{ campo, motivo: 'ObjectId inválido' }]);
    }
    return id;
}

function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
    }
    return value;
}

function hashRequisicao(body) {
    return crypto.createHash('sha256').update(JSON.stringify(stable(body))).digest('hex');
}

function paraObjeto(documento) {
    if (!documento) return documento;
    const obj = documento.toObject ? documento.toObject() : { ...documento };
    obj.id = String(obj._id || obj.id);
    delete obj._id;
    delete obj.__v;
    delete obj.senhaHash;
    delete obj.googleEventId;
    return obj;
}

module.exports = { normalizarTexto, normalizarEmail, validarId, hashRequisicao, paraObjeto };
