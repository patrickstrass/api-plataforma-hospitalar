const ApiError = require("../utils/ApiError");

class CircuitBreaker {
  constructor({ limiteFalhas = 5, resetMs = 30000, agora = () => Date.now() } = {}) {
    this.limiteFalhas = limiteFalhas;
    this.resetMs = resetMs;
    this.agora = agora;
    this.estado = "CLOSED";
    this.falhas = 0;
    this.abertoEm = 0;
    this.testeEmCurso = false;
  }
  async executar(operacao) {
    if (this.estado === "OPEN") {
      if (this.agora() - this.abertoEm < this.resetMs)
        throw new ApiError(503, "CIRCUITO_ABERTO", "Integração temporariamente indisponível.");
      this.estado = "HALF_OPEN";
    }
    if (this.estado === "HALF_OPEN" && this.testeEmCurso)
      throw new ApiError(503, "CIRCUITO_ABERTO", "Integração temporariamente indisponível.");
    if (this.estado === "HALF_OPEN") this.testeEmCurso = true;
    try {
      const resultado = await operacao();
      this.estado = "CLOSED";
      this.falhas = 0;
      this.testeEmCurso = false;
      return resultado;
    } catch (erro) {
      this.testeEmCurso = false;
      this.falhas++;
      if (this.estado === "HALF_OPEN" || this.falhas >= this.limiteFalhas) {
        this.estado = "OPEN";
        this.abertoEm = this.agora();
      }
      throw erro;
    }
  }
}
module.exports = CircuitBreaker;
