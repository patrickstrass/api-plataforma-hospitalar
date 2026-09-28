require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const { carregarConfiguracao } = require("../src/config");
const { Usuario, Medico, Paciente, Leito } = require("../src/models");

async function seed() {
  const config = carregarConfiguracao();

  if (!process.env.SEED_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD.length < 8)
    throw new Error("Defina SEED_ADMIN_PASSWORD com ao menos 8 caracteres.");

  await mongoose.connect(config.MONGO_URI);
  await Usuario.updateOne(
    { email: process.env.SEED_ADMIN_EMAIL || "admin@hospital.test" },
    {
      $setOnInsert: {
        nome: process.env.SEED_ADMIN_NAME || "Administrador",
        senhaHash: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD, 12),
        papel: "ADMIN",
        ativo: true,
      },
    },
    { upsert: true },
  );
  await Medico.updateOne(
    { crm: "123456" },
    {
      $setOnInsert: {
        nome: "Dra. Helena Alves",
        email: "helena@hospital.test",
        especialidade: "Clínica médica",
        ativo: true,
      },
    },
    { upsert: true },
  );
  await Paciente.updateOne(
    { cpf: "12345678901" },
    { $setOnInsert: { nome: "Ana Lima", email: "ana@example.test", ativo: true } },
    { upsert: true },
  );
  await Leito.updateOne(
    { codigo: "UTI-01" },
    { $setOnInsert: { ocupado: false } },
    { upsert: true },
  );
  console.log("Massa fictícia criada.");
  await mongoose.disconnect();
}
seed().catch(async (erro) => {
  console.error(erro.message);
  await mongoose.disconnect();
  process.exit(1);
});
