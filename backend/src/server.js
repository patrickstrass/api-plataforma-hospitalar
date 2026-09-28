require("dotenv").config();

const mongoose = require("mongoose");
const { carregarConfiguracao } = require("./config");
const criarApp = require("./app");

async function iniciar() {
  const config = carregarConfiguracao();
  await mongoose.connect(config.MONGO_URI);
  const server = criarApp({ config }).listen(config.PORT, () =>
    console.log(`API disponível em http://localhost:${config.PORT}`),
  );
  const encerrar = async () => {
    await mongoose.disconnect();
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", encerrar);
  process.on("SIGTERM", encerrar);
}

iniciar().catch((erro) => {
  console.error(`Falha ao iniciar: ${erro.message}`);
  process.exit(1);
});
