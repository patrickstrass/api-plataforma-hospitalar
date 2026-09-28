const path = require("path");
const SwaggerParser = require("@apidevtools/swagger-parser");

SwaggerParser.validate(path.resolve(__dirname, "../docs/openapi.yaml"))
  .then((api) => console.log(`Contrato OpenAPI ${api.info.version} válido.`))
  .catch((erro) => {
    console.error(erro.message);
    process.exit(1);
  });
