/**
 * CONTRATO da IA do site — o que entra e o que sai de `chamarIA`.
 *
 * Fixado a 04/10 para outros agentes codificarem contra ele em paralelo. Se mudar, mudam todos.
 * Está num ficheiro só de tipos para um fornecedor ou um ecrã poderem importar o contrato sem
 * arrastar a cadeia inteira (e a base de dados) para o bundle.
 */

export type NomeFornecedor = 'ollama' | 'groq' | 'gemini' | 'openai' | 'anthropic'

export type MensagemIA = { role: 'user' | 'assistant'; content: string }

/** Imagem em base64 — só os fornecedores com visão a recebem; os outros são saltados. */
export type ImagemIA = { mediaType: 'image/png' | 'image/jpeg' | 'image/webp'; dataBase64: string }

export type PedidoIA = {
  /** Prompt de sistema. */
  sistema?: string
  mensagens: MensagemIA[]
  /** Default 1024. */
  maxTokens?: number
  /** Pede resposta JSON (modo nativo onde existe + instrução). `texto` vem com o JSON extraído. */
  json?: boolean
  temperatura?: number
  /** Etiqueta para o livro ('mtm-terminal', 'mtmsocial', 'social-radar', 'telegram-bot', …). */
  tarefa?: string
  /** rápido = modelo pequeno primeiro; qualidade = o maior de cada fornecedor. */
  preferencia?: 'rapido' | 'qualidade'
  /**
   * Extensão (04/10): imagens para análise de capturas de ecrã (portefólio). Opcional — quem não
   * precisa nem repara. Fornecedores sem visão são SALTADOS, não tentados.
   */
  imagens?: ImagemIA[]
  /** Tecto por fornecedor, em ms. Sem ele: 25 s (Ollama 60 s). */
  timeoutMs?: number
}

export type TentativaIA = { fornecedor: string; erro: string }

export type RespostaIA = {
  texto: string
  fornecedor: NomeFornecedor
  modelo: string
  /** 0 nos gratuitos; ESTIMADO nos pagos (tabela em custos.ts). */
  custoCents: number
  /** true se NÃO foi o primeiro fornecedor da cadeia que respondeu. */
  emReserva: boolean
  /** Quem falhou antes e porquê. */
  tentativas: TentativaIA[]
}

/** O que cada fornecedor devolve ao núcleo. */
export type GeracaoFornecedor = {
  texto: string
  modelo: string
  tokensEntrada?: number
  tokensSaida?: number
  custoCents: number
}

/**
 * Um fornecedor. Todos têm a MESMA forma para se poder acrescentar/retirar um sem tocar nos
 * outros: a cadeia só sabe perguntar «tens chave?» e «gera».
 */
export interface Fornecedor {
  nome: NomeFornecedor
  /** Tem o que precisa no ambiente? Sem isto é saltado — não conta como tentativa. */
  disponivel(): boolean
  /** Aceita imagens no pedido? */
  suportaImagens: boolean
  /** Tecto por omissão para este fornecedor (o Ollama em CPU é lento). */
  timeoutMs: number
  gerar(p: PedidoIA, sinal: AbortSignal): Promise<GeracaoFornecedor>
}

/**
 * Falha de UM fornecedor. `passavel` é a decisão central desta casa:
 *   · true  — 401/402/403/404 de modelo/408/429/5xx/timeout/rede/«credit balance»: o problema é
 *             DELE, o seguinte pode responder.
 *   · false — 400 por pedido mal formado: o problema é NOSSO. Rebenta já, senão o bug esconde-se
 *             atrás de uma «reserva» e ninguém o vê.
 */
export class ErroFornecedor extends Error {
  constructor(
    public readonly fornecedor: string,
    message: string,
    public readonly passavel: boolean,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'ErroFornecedor'
  }
}

/** Todos falharam (ou nenhum tinha chave). Leva a lista para quem chama mostrar com honestidade. */
export class ErroIA extends Error {
  constructor(
    message: string,
    public readonly tentativas: TentativaIA[],
    public readonly saltados: string[],
  ) {
    super(message)
    this.name = 'ErroIA'
  }
}
