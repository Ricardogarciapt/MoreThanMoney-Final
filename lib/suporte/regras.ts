/**
 * APOIO AO CLIENTE NO SITE — as regras, sem base de dados.
 *
 * Regras do dono (16/11/2026), e é por elas que este ficheiro existe:
 *   · O agente responde SOZINHO a toda a gente: membros, não membros, leads, prospects.
 *   · A primeira resposta é IMEDIATA, com triagem por assunto. Depois, se a conversa ficar à
 *     espera de uma pessoa, os prazos são 15 minutos e depois 1 hora.
 *   · Reclamações e pedidos de reembolso sobem SEMPRE para o Ricardo. O agente nunca promete
 *     reembolso nem diz que o dinheiro vai ser devolvido.
 *   · Reembolso automático: DESLIGADO. A regra guardada só o deixa ligar quando a faturação
 *     passar os 5.000 €/mês, e mesmo assim só abaixo de 50 €. Nenhum código o executa hoje.
 *
 * Tudo aqui é puro (provado em `regras.check.ts`). A triagem é por palavras e não por IA de
 * propósito: é o que permite a primeira resposta sair em milissegundos, mesmo com a IA em baixo.
 */

export const ASSUNTOS = ['acessos', 'pagamentos', 'app', 'vendas', 'capital', 'reclamacao', 'reembolso', 'outro'] as const
export type Assunto = (typeof ASSUNTOS)[number]

export const NOME_ASSUNTO: Record<Assunto, string> = {
  acessos: 'Acessos e conta',
  pagamentos: 'Pagamentos e faturação',
  app: 'App e ferramentas',
  vendas: 'Planos e produtos',
  capital: 'Capital / MTM Funded',
  reclamacao: 'Reclamação',
  reembolso: 'Reembolso',
  outro: 'Outro assunto',
}

/** Os botões da triagem que o balão mostra logo ao abrir. */
export const ASSUNTOS_DO_BALAO: readonly Assunto[] = ['acessos', 'pagamentos', 'app', 'vendas', 'outro']

export const ESTADOS = ['com_agente', 'a_aguardar_equipa', 'escalada', 'resolvida'] as const
export type Estado = (typeof ESTADOS)[number]

export const NOME_ESTADO: Record<Estado, string> = {
  com_agente: 'Com o agente',
  a_aguardar_equipa: 'À espera da equipa',
  escalada: 'Escalada ao Ricardo',
  resolvida: 'Resolvida',
}

function semAcentos(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * A ordem conta: reembolso e reclamação primeiro, porque «paguei e quero o dinheiro de volta»
 * também fala de pagamento — e a regra do dono é que isso sobe, não que se responde.
 */
const PADROES: Array<[Assunto, RegExp]> = [
  ['reembolso', /\b(reembols\w*|devolu\w*|devolv\w*|estorn\w*|refund\w*|chargeback|(quero|queria) (o )?(meu )?dinheiro de volta|money back)\b/],
  ['reclamacao', /\b(reclama\w*|queixa\w*|burla\w*|fraude\w*|enganad\w*|vergonha|inaceitavel|livro de reclamac\w*|advogad\w*|denuncia\w*|scam|complain\w*)\b/],
  ['pagamentos', /\b(pagament\w*|paguei|pagar|cobra\w*|fatura\w*|factura\w*|recibo\w*|cartao|stripe|mbway|subscri\w*|cancelar|cancelamento|renova\w*|iva|nif)\b/],
  ['acessos', /\b(acesso\w*|login|entrar|password|palavra[- ]passe|senha|conta bloqueada|nao consigo entrar|registo|email de confirmac\w*|verificac\w*|desbloque\w*)\b/],
  ['app', /\b(app|aplicac\w*|telemovel|iphone|android|notificac\w*|webtrader|mt5|metatrader|tradingview|scanner\w*|indicador\w*|mtm auto|copia|copytrading|tap to trade|erro|bug|nao funciona|nao abre)\b/],
  ['capital', /\b(capital|nao tenho dinheiro|sem dinheiro|financiad\w*|funded|conta financiada|prop firm|desafio)\b/],
  ['vendas', /\b(prec\w*|quanto custa|planos?|premium|membro|elite|comprar|aderir|trial|experimentar|desconto|cupao|bootcamp|curso\w*|mentoria|corretora|pu prime)\b/],
]

/** Triagem imediata por palavras. Sem correspondência → 'outro' (a IA trata do resto). */
export function triar(texto: string): Assunto {
  const t = semAcentos(texto)
  for (const [assunto, re] of PADROES) if (re.test(t)) return assunto
  return 'outro'
}

/** Reclamações e reembolsos sobem sempre para o Ricardo. Não há excepção nem interruptor. */
export function deveEscalar(assunto: Assunto): boolean {
  return assunto === 'reclamacao' || assunto === 'reembolso'
}

/**
 * Pedido explícito para falar com uma pessoa. Não é escalada ao dono: é «à espera da equipa»,
 * com os prazos de 15 min / 1 h.
 */
export function pedePessoa(texto: string): boolean {
  return /\b(falar com (uma )?(pessoa|humano|alguem|ricardo|equipa)|pessoa real|humano|atendente|operador)\b/.test(semAcentos(texto))
}

// ─────────────────────────────── prazos (SLA) ───────────────────────────────

/** Primeira resposta: imediata (0 s). Depois, à espera de pessoa: 15 min, e a seguir 1 h. */
export const PRAZOS_MIN = [15, 60] as const

/**
 * Quando é que uma conversa à espera de pessoa deve ser lembrada, dado o nível já avisado.
 * Nível 0 = acabou de ficar à espera → prazo a 15 min. Nível 1 → 1 h depois da entrada em espera.
 * Nível 2 ou mais → sem novo prazo (já se avisou o que havia a avisar).
 */
export function proximoPrazo(desdeIso: string, nivelAvisado: number): string | null {
  const min = PRAZOS_MIN[nivelAvisado]
  if (min == null) return null
  return new Date(new Date(desdeIso).getTime() + min * 60_000).toISOString()
}

export function prazoPassou(prazoIso: string | null, agora = Date.now()): boolean {
  return prazoIso != null && new Date(prazoIso).getTime() <= agora
}

// ─────────────────────────────── reembolso automático ───────────────────────────────

export type RegrasReembolso = {
  /** Interruptor geral. Hoje: false, por ordem do dono. */
  ligado: boolean
  /** Só abaixo deste valor (EUR). */
  limite_eur: number
  /** Só com faturação mensal a partir deste valor (EUR). */
  faturacao_minima_mensal_eur: number
}

export const REGRAS_REEMBOLSO_OMISSAO: RegrasReembolso = {
  ligado: false,
  limite_eur: 50,
  faturacao_minima_mensal_eur: 5000,
}

/** Lê o JSON de `site_settings.suporte_regras` sem confiar nele: o que faltar fica na omissão. */
export function lerRegrasReembolso(v: unknown): RegrasReembolso {
  const r = (v as { reembolso_automatico?: Partial<RegrasReembolso> } | null)?.reembolso_automatico ?? {}
  const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : d)
  return {
    ligado: r.ligado === true,
    // Os tectos nunca sobem acima do que o dono disse, mesmo que alguém escreva outro número.
    limite_eur: Math.min(num(r.limite_eur, REGRAS_REEMBOLSO_OMISSAO.limite_eur), REGRAS_REEMBOLSO_OMISSAO.limite_eur),
    faturacao_minima_mensal_eur: Math.max(
      num(r.faturacao_minima_mensal_eur, REGRAS_REEMBOLSO_OMISSAO.faturacao_minima_mensal_eur),
      REGRAS_REEMBOLSO_OMISSAO.faturacao_minima_mensal_eur,
    ),
  }
}

/**
 * Pode o agente emitir sozinho um reembolso deste valor? Só se as TRÊS condições se cumprirem.
 * Hoje responde sempre «não», porque `ligado` está a false — e mesmo quando um dia responder
 * «sim», o pedido continua a ir ao Ricardo (é ele quem fica com os reembolsos).
 */
export function reembolsoAutomaticoPermitido(regras: RegrasReembolso, faturacaoMensalEur: number, valorEur: number): boolean {
  return (
    regras.ligado &&
    Number.isFinite(faturacaoMensalEur) &&
    faturacaoMensalEur >= regras.faturacao_minima_mensal_eur &&
    Number.isFinite(valorEur) &&
    valorEur > 0 &&
    valorEur < regras.limite_eur
  )
}

// ─────────────────────────────── textos ───────────────────────────────

/** A frase do balão quando a conversa fica à espera do Ricardo. */
export function textoEscalada(assunto: Assunto): string {
  const sobre = assunto === 'reembolso' ? 'O teu pedido de reembolso' : 'A tua reclamação'
  return (
    `${sobre} foi registado e passado diretamente ao Ricardo, que trata pessoalmente destes casos. ` +
    'Não consigo decidir nem prometer nada sobre isto, mas ficou com prioridade. ' +
    'Deixa aqui o teu email (e, se tiveres, o email da conta e a data do pagamento) para te respondermos.'
  )
}

export function textoEsperaEquipa(): string {
  return 'Passei a conversa à equipa. Respondemos-te aqui em até 15 minutos no horário de trabalho. Se quiseres, deixa o teu email para não perderes a resposta.'
}

/** Resposta quando a IA está em baixo: honesta, e a conversa passa à equipa. */
export function textoIaIndisponivel(): string {
  return 'Neste momento não consigo responder a isto sozinho. Já passei a tua mensagem à equipa e respondemos-te aqui em até 15 minutos. Deixa o teu email se não quiseres esperar com o balão aberto.'
}

/**
 * Guarda de saída: o modelo NUNCA pode prometer reembolso nem devolução de dinheiro. Se o texto
 * o fizer, troca-se pela frase segura em vez de se tentar «corrigir» a frase dele.
 */
const PROMESSA_REEMBOLSO =
  /\b(vou|vamos|iremos|irei|ja) (proceder ao |processar o |emitir o |fazer o )?(reembols\w*|devolv\w*|estornar)|reembolso (foi |esta |fica )?(aprovad\w*|garantid\w*|confirmad\w*|processad\w*)|(tens|tem) direito (a|ao) reembolso|devolvemos o (teu )?dinheiro|o dinheiro (sera|vai ser) devolvid\w*/

export function prometeReembolso(texto: string): boolean {
  return PROMESSA_REEMBOLSO.test(semAcentos(texto))
}

export function respostaSegura(texto: string): string {
  if (prometeReembolso(texto)) {
    return 'Isso é um assunto de reembolso, e quem decide é sempre o Ricardo. Passei-lhe a tua mensagem com prioridade; deixa o teu email para te respondermos.'
  }
  return texto
}

/** Validação simples de email para o campo opcional do balão. */
export function emailValido(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim())
}
