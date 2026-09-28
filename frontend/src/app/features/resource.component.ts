import { Component, OnInit, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { ActivatedRoute } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { forkJoin } from "rxjs";
import { environment } from "../../environments/environment";
import { ErroApi, Pagina } from "../core/api.types";
import { AuthService } from "../core/auth.service";

interface CampoForm {
  nome: string;
  rotulo: string;
  tipo: string;
  obrigatorio: boolean;
}
interface OpcaoForm {
  valor: string;
  rotulo: string;
}

@Component({
  standalone: true,
  imports: [FormsModule],
  template: `<section>
    <header>
      <div>
        <h1>{{ titulo }}</h1>
        <p>{{ total }} registro(s)</p>
      </div>
      <div class="acoes">
        @if (podeCriar) {
          <button (click)="formAberto = !formAberto">{{ formAberto ? "Fechar" : "Novo" }}</button>
        }
        <button class="secundario" (click)="carregar()">Atualizar</button>
      </div>
    </header>
    @if (erro) {
      <div class="alerta">{{ erro }}</div>
    }
    @if (formAberto) {
      <form class="cadastro" (ngSubmit)="salvar()">
        <h2>Novo registro</h2>
        <div class="grade-form">
          @for (campo of definicao; track campo.nome) {
            <label
              >{{ campo.rotulo }}
              @if (recursoReferencia(campo.nome)) {
                <select
                  [name]="campo.nome"
                  [(ngModel)]="form[campo.nome]"
                  [required]="campo.obrigatorio"
                >
                  <option value="">Selecione…</option>
                  @for (opcao of opcoes[campo.nome] || []; track opcao.valor) {
                    <option [value]="opcao.valor">{{ opcao.rotulo }}</option>
                  }
                </select>
              } @else {
                <input
                  [type]="campo.tipo"
                  [name]="campo.nome"
                  [(ngModel)]="form[campo.nome]"
                  [required]="campo.obrigatorio"
                  [min]="campo.tipo === 'datetime-local' ? agoraLocal : null"
                />
              }
            </label>
          }
        </div>
        <button [disabled]="salvando">{{ salvando ? "Salvando…" : "Salvar" }}</button>
      </form>
    }
    @if (carregando) {
      <p>Carregando…</p>
    } @else {
      <div class="cards">
        @for (item of dados; track item["id"]) {
          <article>
            <h2>{{ tituloItem(item) }}</h2>
            @for (campo of campos(item); track campo) {
              <p>
                <strong>{{ rotuloCampo(campo) }}:</strong> {{ formatar(item[campo], campo) }}
              </p>
            }
            @if (item["status"] === "ATIVA" || item["status"] === "CONFIRMADO") {
              <button class="perigo" (click)="encerrar(item)">
                {{ recurso === "internacoes" ? acaoInternacao(item) : "Cancelar" }}
              </button>
            }
          </article>
        } @empty {
          <p>Nenhum registro encontrado.</p>
        }
      </div>
    }
  </section>`,
})
export class ResourceComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);
  recurso = "";
  titulo = "";
  dados: Record<string, unknown>[] = [];
  total = 0;
  carregando = true;
  erro = "";
  formAberto = false;
  salvando = false;
  form: Record<string, string> = {};
  opcoes: Record<string, OpcaoForm[]> = {};
  rotulosReferencias: Record<string, Record<string, string>> = {};
  private definicoes: Record<string, CampoForm[]> = {
    pacientes: this.camposForm([
      ["nome", "Nome", "text"],
      ["cpf", "CPF (11 dígitos)", "text"],
      ["email", "E-mail", "email"],
    ]),
    medicos: this.camposForm(
      [
        ["nome", "Nome", "text"],
        ["crm", "CRM", "text"],
        ["email", "E-mail", "email"],
        ["especialidade", "Especialidade", "text"],
      ],
      3,
    ),
    leitos: this.camposForm([["codigo", "Código", "text"]]),
    internacoes: this.camposForm([
      ["pacienteId", "Paciente", "text"],
      ["medicoResponsavelId", "Médico responsável", "text"],
      ["leitoId", "Leito", "text"],
      ["dataEntrada", "Entrada", "datetime-local"],
    ]),
    agendamentos: this.camposForm(
      [
        ["pacienteId", "Paciente", "text"],
        ["medicoId", "Médico", "text"],
        ["titulo", "Título", "text"],
        ["descricao", "Descrição", "text"],
        ["inicio", "Início", "datetime-local"],
        ["fim", "Fim", "datetime-local"],
      ],
      3,
      ["inicio", "fim"],
    ),
    usuarios: this.camposForm(
      [
        ["nome", "Nome", "text"],
        ["email", "E-mail", "email"],
        ["senha", "Senha", "password"],
        ["papel", "Papel", "text"],
        ["medicoId", "Médico (se MEDICO)", "text"],
      ],
      4,
    ),
  };
  private referencias: Record<string, string> = {
    pacienteId: "pacientes",
    medicoId: "medicos",
    medicoResponsavelId: "medicos",
    leitoId: "leitos",
  };
  get definicao() {
    return this.definicoes[this.recurso] || [];
  }
  get agoraLocal() {
    const data = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
    return data.toISOString().slice(0, 16);
  }
  get podeCriar() {
    const papel = this.auth.usuario?.papel;
    return (
      this.definicao.length > 0 &&
      (papel === "ADMIN" ||
        (papel === "RECEPCAO" &&
          ["pacientes", "internacoes", "agendamentos"].includes(this.recurso)) ||
        (papel === "MEDICO" && this.recurso === "agendamentos"))
    );
  }
  ngOnInit() {
    this.route.data.subscribe((data) => {
      this.recurso = data["recurso"];
      this.titulo = data["titulo"];
      this.formAberto = false;
      this.form = {};
      this.carregar();
      this.carregarReferencias();
    });
  }
  carregar() {
    this.carregando = true;
    this.erro = "";
    this.http
      .get<Pagina<Record<string, unknown>>>(`${environment.apiUrl}/${this.recurso}`)
      .subscribe({
        next: (r) => {
          this.dados = r.dados;
          this.total = r.paginacao.totalItens;
          this.carregando = false;
        },
        error: (e) => {
          this.erro = this.mensagemErro(e, "Falha ao carregar os dados.");
          this.carregando = false;
        },
      });
  }
  campos(item: Record<string, unknown>) {
    return Object.keys(item)
      .filter(
        (k) => !["id", "nome", "codigo", "titulo", "criadoEm", "atualizadoEm", "__v"].includes(k),
      )
      .slice(0, 6);
  }
  tituloItem(item: Record<string, unknown>) {
    if (this.recurso === "internacoes")
      return `Internação de ${this.formatar(item["pacienteId"], "pacienteId")}`;
    return String(item["nome"] || item["codigo"] || item["titulo"] || `Registro ${item["id"]}`);
  }
  rotuloCampo(campo: string) {
    const rotulos: Record<string, string> = {
      paciente: "Paciente",
      medico: "Médico",
      pacienteId: "Paciente",
      medicoId: "Médico",
      medicoResponsavelId: "Médico responsável",
      leitoId: "Leito",
      dataEntrada: "Entrada",
      dataAlta: "Alta",
      criadoPor: "Criado por",
      calendarSincronizado: "Calendário sincronizado",
    };
    return (
      rotulos[campo] ||
      campo.replace(/([A-Z])/g, " $1").replace(/^./, (letra) => letra.toUpperCase())
    );
  }
  formatar(valor: unknown, campo = "") {
    const referencia = this.rotulosReferencias[campo]?.[String(valor)];
    if (referencia) return referencia;
    if (typeof valor === "boolean") return valor ? "Sim" : "Não";
    if (valor && typeof valor === "object" && ["paciente", "medico"].includes(campo)) {
      return String((valor as Record<string, unknown>)["nome"] ?? "—");
    }
    if (valor && typeof valor === "object") return JSON.stringify(valor);
    if (valor && ["dataEntrada", "dataAlta", "inicio", "fim"].includes(campo))
      return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
        new Date(String(valor)),
      );
    const status: Record<string, string> = {
      ATIVA: "Ativa",
      ENCERRADA: "Encerrada",
      CANCELADA: "Cancelada",
      CONFIRMADO: "Confirmado",
      CANCELADO: "Cancelado",
      PENDENTE: "Pendente",
    };
    return status[String(valor)] || String(valor ?? "—");
  }
  salvar() {
    this.erro = "";
    if (this.recurso === "agendamentos") {
      const inicio = new Date(this.form["inicio"]);
      const fim = new Date(this.form["fim"]);
      if (
        Number.isNaN(inicio.getTime()) ||
        Number.isNaN(fim.getTime()) ||
        inicio <= new Date() ||
        inicio >= fim
      ) {
        this.erro = "Informe um período futuro, com o horário de término posterior ao início.";
        return;
      }
    }
    this.salvando = true;
    const datas = ["inicio", "fim", "dataEntrada"];
    const body = Object.fromEntries(
      Object.entries(this.form)
        .filter(([, v]) => v !== "")
        .map(([k, v]) => [k, datas.includes(k) ? new Date(v).toISOString() : v]),
    );
    const options =
      this.recurso === "agendamentos"
        ? { headers: { "Idempotency-Key": crypto.randomUUID() } }
        : {};
    this.http.post(`${environment.apiUrl}/${this.recurso}`, body, options).subscribe({
      next: () => {
        this.form = {};
        this.formAberto = false;
        this.salvando = false;
        this.carregar();
      },
      error: (e) => {
        this.erro = this.mensagemErro(e, "Não foi possível salvar.");
        this.salvando = false;
      },
    });
  }
  encerrar(item: Record<string, unknown>) {
    const futura =
      this.recurso === "internacoes" && new Date(String(item["dataEntrada"])) > new Date();
    const body =
      this.recurso === "internacoes"
        ? futura
          ? { status: "CANCELADA" }
          : { status: "ENCERRADA", dataAlta: new Date().toISOString() }
        : { status: "CANCELADO" };
    this.http.patch(`${environment.apiUrl}/${this.recurso}/${item["id"]}`, body).subscribe({
      next: () => this.carregar(),
      error: (e) => (this.erro = this.mensagemErro(e, "Não foi possível concluir a operação.")),
    });
  }
  acaoInternacao(item: Record<string, unknown>) {
    return new Date(String(item["dataEntrada"])) > new Date() ? "Cancelar" : "Encerrar";
  }
  recursoReferencia(campo: string) {
    return this.referencias[campo];
  }
  private carregarReferencias() {
    const campos = [
      ...new Set(
        this.definicao.map((campo) => campo.nome).filter((nome) => this.recursoReferencia(nome)),
      ),
    ];
    this.opcoes = {};
    if (!campos.length) return;
    const requisicoes = Object.fromEntries(
      campos.map((campo) => [
        campo,
        this.http.get<Pagina<Record<string, unknown>>>(
          `${environment.apiUrl}/${this.recursoReferencia(campo)}?limite=100`,
        ),
      ]),
    );
    forkJoin(requisicoes).subscribe({
      next: (paginas) => {
        for (const [campo, pagina] of Object.entries(paginas)) {
          const referencia = this.recursoReferencia(campo);
          const rotulos = Object.fromEntries(
            pagina.dados.map((item) => [
              String(item["id"]),
              String(item["nome"] || item["codigo"]),
            ]),
          );
          this.rotulosReferencias[campo] = rotulos;
          this.opcoes[campo] = pagina.dados
            .filter((item) =>
              referencia === "leitos" ? item["ocupado"] !== true : item["ativo"] !== false,
            )
            .map((item) => ({ valor: String(item["id"]), rotulo: rotulos[String(item["id"])] }));
        }
      },
      error: (e) =>
        (this.erro = this.mensagemErro(e, "Não foi possível carregar pacientes e médicos.")),
    });
  }
  private mensagemErro(e: { error?: ErroApi }, padrao: string) {
    const erro = e.error?.erro;
    if (!erro) return padrao;
    const detalhes = erro.detalhes?.map((d) => `${d.campo}: ${d.motivo}`).join("; ");
    return detalhes ? `${erro.mensagem} ${detalhes}` : erro.mensagem;
  }
  private camposForm(campos: string[][], obrigatorios = campos.length, adicionais: string[] = []) {
    return campos.map(([nome, rotulo, tipo], i) => ({
      nome,
      rotulo,
      tipo,
      obrigatorio: i < obrigatorios || adicionais.includes(nome),
    }));
  }
}
