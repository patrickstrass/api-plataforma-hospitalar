const { z } = require("zod");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  MONGO_URI: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("30m"),
  FRONTEND_ORIGIN: z.url().default("http://localhost:4200"),
  GOOGLE_CALENDAR_ID: z.string().default(""),
  GOOGLE_CLIENT_EMAIL: z.string().default(""),
  GOOGLE_PRIVATE_KEY: z.string().default(""),
  GOOGLE_API_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  GOOGLE_API_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(3),
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: z.coerce.number().int().min(1).default(5),
  CIRCUIT_BREAKER_RESET_MS: z.coerce.number().int().positive().default(30000),
});

function carregarConfiguracao(env = process.env) {
  const resultado = schema.safeParse(env);

  if (!resultado.success) {
    const campos = resultado.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Configuração inválida ou ausente: ${campos}`);
  }

  return {
    ...resultado.data,
    GOOGLE_PRIVATE_KEY: resultado.data.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  };
}

module.exports = { carregarConfiguracao };
