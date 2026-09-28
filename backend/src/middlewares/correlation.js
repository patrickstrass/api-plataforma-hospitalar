const crypto = require("crypto");

function correlation(req, res, next) {
  const recebido = req.get("X-Correlation-Id");
  req.correlationId =
    recebido &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(recebido)
      ? recebido
      : crypto.randomUUID();
  res.set("X-Correlation-Id", req.correlationId);
  next();
}

module.exports = correlation;
