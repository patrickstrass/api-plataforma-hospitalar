const mongoose = require("mongoose");
const { normalizarEmail, normalizarTexto } = require("../utils/helpers");

const opcoes = {
  timestamps: { createdAt: "criadoEm", updatedAt: "atualizadoEm" },
  toJSON: {
    virtuals: true,
    versionKey: false,
    transform(_doc, ret) {
      ret.id = String(ret._id);
      delete ret._id;
      delete ret.senhaHash;
      delete ret.googleEventId;
    },
  },
};
const email = {
  type: String,
  required: true,
  lowercase: true,
  trim: true,
  match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  set: normalizarEmail,
};
const nome = { type: String, required: true, minlength: 3, maxlength: 120, set: normalizarTexto };

const usuarioSchema = new mongoose.Schema(
  {
    nome,
    email: { ...email, unique: true },
    senhaHash: { type: String, required: true, select: false },
    papel: { type: String, enum: ["ADMIN", "RECEPCAO", "MEDICO"], required: true },
    medicoId: { type: mongoose.Schema.Types.ObjectId, ref: "Medico" },
    ativo: { type: Boolean, default: true },
  },
  opcoes,
);
usuarioSchema.pre("validate", function validarVinculo() {
  if (this.papel === "MEDICO" && !this.medicoId)
    this.invalidate("medicoId", "medicoId é obrigatório para o papel MEDICO");
  if (this.papel !== "MEDICO") this.medicoId = undefined;
});
usuarioSchema.index({ medicoId: 1 }, { unique: true, sparse: true });

const medicoSchema = new mongoose.Schema(
  {
    nome,
    crm: { type: String, required: true, unique: true, match: /^\d+$/ },
    email: { ...email, unique: true },
    especialidade: { type: String, trim: true, default: "" },
    ativo: { type: Boolean, default: true },
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
  },
  opcoes,
);
medicoSchema.index({ usuarioId: 1 }, { unique: true, sparse: true });

const pacienteSchema = new mongoose.Schema(
  {
    nome,
    cpf: { type: String, required: true, unique: true, match: /^\d{11}$/ },
    email,
    ativo: { type: Boolean, default: true },
  },
  opcoes,
);

const leitoSchema = new mongoose.Schema(
  {
    codigo: { type: String, required: true, unique: true, trim: true },
    ocupado: { type: Boolean, default: false },
  },
  opcoes,
);

const internacaoSchema = new mongoose.Schema(
  {
    pacienteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Paciente",
      required: true,
      immutable: true,
    },
    medicoResponsavelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Medico",
      required: true,
      immutable: true,
    },
    leitoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Leito",
      required: true,
      immutable: true,
    },
    dataEntrada: { type: Date, required: true, immutable: true },
    dataAlta: { type: Date, default: null },
    status: { type: String, enum: ["ATIVA", "ENCERRADA", "CANCELADA"], default: "ATIVA" },
    criadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
      immutable: true,
    },
  },
  opcoes,
);
internacaoSchema.index(
  { pacienteId: 1 },
  { unique: true, partialFilterExpression: { status: "ATIVA" } },
);
internacaoSchema.index(
  { leitoId: 1 },
  { unique: true, partialFilterExpression: { status: "ATIVA" } },
);

const agendamentoSchema = new mongoose.Schema(
  {
    pacienteId: { type: mongoose.Schema.Types.ObjectId, ref: "Paciente", required: true },
    medicoId: { type: mongoose.Schema.Types.ObjectId, ref: "Medico", required: true },
    titulo: { type: String, required: true, trim: true, maxlength: 160 },
    descricao: { type: String, trim: true, maxlength: 2000, default: "" },
    inicio: { type: Date, required: true },
    fim: { type: Date, required: true },
    status: { type: String, enum: ["PENDENTE", "CONFIRMADO", "CANCELADO"], default: "PENDENTE" },
    googleEventId: { type: String, select: false, default: null },
  },
  opcoes,
);
agendamentoSchema.index({ medicoId: 1, inicio: 1, fim: 1, status: 1 });

const idempotenciaSchema = new mongoose.Schema(
  {
    chave: { type: String, required: true },
    usuarioId: { type: mongoose.Schema.Types.ObjectId, required: true },
    rota: { type: String, required: true },
    hashRequisicao: { type: String, required: true },
    statusHttp: Number,
    resposta: mongoose.Schema.Types.Mixed,
    expiraEm: { type: Date, required: true },
  },
  { timestamps: { createdAt: "criadoEm", updatedAt: false } },
);
idempotenciaSchema.index({ usuarioId: 1, rota: 1, chave: 1 }, { unique: true });
idempotenciaSchema.index({ expiraEm: 1 }, { expireAfterSeconds: 0 });

module.exports = {
  Usuario: mongoose.model("Usuario", usuarioSchema),
  Medico: mongoose.model("Medico", medicoSchema),
  Paciente: mongoose.model("Paciente", pacienteSchema),
  Leito: mongoose.model("Leito", leitoSchema),
  Internacao: mongoose.model("Internacao", internacaoSchema),
  Agendamento: mongoose.model("Agendamento", agendamentoSchema),
  RegistroIdempotencia: mongoose.model("RegistroIdempotencia", idempotenciaSchema),
};
