/**
 * APAGAR UMA CONTA MTM FUNDED — o que está pendurado nela, e se pode levar com ela (pedido do
 * dono 24/09: «permite ao admin apagar a conta que desejar»).
 *
 * Apagar uma conta é irreversível e mexe em dinheiro. O que aconteceu a 23/09 é o que este
 * ficheiro existe para evitar: apagou-se a conta no site e ficaram rotas de cópia e linhas de
 * mestre em modo LIVE a apontar para uma conta que já não existe — o motor a tentar executar em
 * nada. A base resolve uma parte sozinha (FK em cascata), mas as rotas e as mestres guardam a
 * conta por TEXTO (`copia_rotas.origem_chave/destino_chave`, `mestres_contas.conta_chave`) e
 * dessas a base não sabe. São essas que deixam órfãos.
 *
 * Três listas, e só três:
 *   · BLOQUEIOS  — recusa-se e explica-se. Nunca se apaga meia conta.
 *   · ARRASTA    — o que desaparece junto, mostrado no diálogo ANTES de o botão destrancar.
 *   · AVISOS     — o que FICA e ninguém toca (a conta MetaApi, o histórico com a conta a null).
 *
 * A conta MetaApi NÃO se apaga a partir daqui: é dinheiro real numa corretora, trabalho à parte
 * feito com os olhos em cima. Diz-se no diálogo e deixa-se lá.
 *
 * Puro: sem React, sem base de dados — testado em lib/mtmfunded/__tests__/apagar-conta.check.ts.
 * Quem lê a base e escreve é lib/mtmfunded/apagar-conta-servidor.ts.
 */

/** As duas formas como uma conta MTM Funded se identifica fora da sua própria tabela. */
export interface RefsDaConta {
  /** Identidade física nas rotas de cópia e nas mestres (lib/copia-contas/regras.ts::chaveFisica). */
  chaveFisica: string
  /** Referência das rotas (`copia_rotas.origem_ref` / `destino_ref`). */
  ref: string
}

/** `mtmfunded:<uuid>` e `funded:<uuid>`, sempre em minúsculas — é assim que ficam gravadas. */
export function refsDaConta(id: string): RefsDaConta {
  const x = String(id).toLowerCase()
  return { chaveFisica: `mtmfunded:${x}`, ref: `funded:${x}` }
}

// ── o que se leu da base ─────────────────────────────────────────────────────

export interface LinhaRota {
  id: string
  /** `true` quando ESTA conta é a origem da rota (alimenta outra pessoa). */
  origem: boolean
  ativa: boolean
  modo: string
  estrategiaSlug?: string | null
  rotulo?: string | null
}

export interface DadosPendurados {
  conta: {
    id: string
    login: string | null
    tipo: string
    estado: string
    motor: string
    contaRealDaCasa: boolean
    /** Id da conta na MetaApi, se a conta viver numa corretora. */
    metaapiAccountId: string | null
    /** Saldo simulado exacto, ou null nas contas da corretora. */
    saldo: number | null
    saldoInicial: number | null
  }
  /** Posições abertas e ordens pendentes (só contas simuladas). */
  abertas: number
  pendentes: number
  /** Posições já fechadas — o histórico que vai com a conta. */
  fechadas: number
  /** Estratégias das quais esta conta é a MESTRE (`mestres_estrategias.conta_mestre_id`). */
  mestreDe: string[]
  /** Estratégias que a apontam como conta ou como espelho (`mtmauto_providers`). */
  providerDe: string[]
  /** Levantamentos por fechar (pedido/em análise/aprovado) — dinheiro a meio caminho. */
  levantamentosAbertos: number
  /** Rotas de cópia que a mencionam, directamente ou pelas ligações arrastadas. */
  rotas: LinhaRota[]
  /** Linhas de `mestres_contas` que a mencionam (por chave física). */
  mestresContas: number
  /** Ligações do ligador do site (`mtmcopy_connections.funded_account_id`) — caem em cascata. */
  ligacoesT2T: number
  /** Contas da app MTM Auto (`mtmauto_accounts.funded_account_id`) — caem em cascata. */
  contasMtmAuto: number
  /** Subscrições do MTM Auto presas às contas acima (`mtmauto_subscriptions.conta_id`). */
  subscricoes: number
  /** Certificados, participações de torneio e compras: ficam, com a conta a `null`. */
  certificados: number
  participacoes: number
  compras: number
}

export interface ItemArrastado {
  tabela: string
  quantas: number
  /** Uma frase curta para o diálogo — o que é isto, em português de quem lê. */
  nota: string
}

export interface DecisaoApagar {
  /** Falso quando há bloqueios: recusa-se e explica-se, não se apaga meio. */
  pode: boolean
  bloqueios: string[]
  arrasta: ItemArrastado[]
  avisos: string[]
  /** O que o admin tem de escrever para destrancar o botão. */
  confirmacaoEsperada: string
}

const plural = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`

/**
 * Pode esta conta ser apagada, e o que leva consigo.
 *
 * Os bloqueios são todos «isto está VIVO e alguém depende dele»: uma conta que é mestre de uma
 * estratégia, que alimenta rotas de cópia de outras pessoas, que tem posições por fechar, ou que
 * tem um levantamento a meio. A conta real da casa (109) e o tipo `real` (dinheiro do cliente) não
 * se apagam por um botão de painel, e ponto.
 */
export function decidirApagarConta(d: DadosPendurados): DecisaoApagar {
  const bloqueios: string[] = []
  const avisos: string[] = []
  const c = d.conta

  if (c.contaRealDaCasa) {
    bloqueios.push('Esta é uma conta REAL da casa (109) — negociação real e equidade da MTM dependem dela. Não se apaga por aqui.')
  }
  if (c.tipo === 'real') {
    bloqueios.push('Esta conta é do tipo «real» (dinheiro do cliente). Apagá-la apagava o registo do dinheiro dele.')
  }
  if (d.mestreDe.length) {
    bloqueios.push(`É a conta MESTRE de ${d.mestreDe.join(', ')} — troca a mestre da estratégia primeiro (a base recusa na mesma: mestres_estrategias.conta_mestre_id).`)
  }
  if (d.providerDe.length) {
    bloqueios.push(`Está ligada às estratégias ${d.providerDe.join(', ')} (conta ou espelho) — desliga-a lá primeiro, senão a estratégia fica sem conta.`)
  }
  const origensVivas = d.rotas.filter((r) => r.origem)
  if (origensVivas.length) {
    const vivas = origensVivas.filter((r) => r.ativa && r.modo === 'live').length
    bloqueios.push(
      `É ORIGEM de ${plural(origensVivas.length, 'rota de cópia', 'rotas de cópia')}${vivas ? ` (${vivas} em LIVE)` : ''} — há contas a copiar desta. Apaga as rotas primeiro, senão o motor fica a executar a partir do vazio.`,
    )
  }
  if (c.motor === 'sim' && (d.abertas > 0 || d.pendentes > 0)) {
    bloqueios.push(`Tem ${plural(d.abertas, 'posição aberta', 'posições abertas')} e ${plural(d.pendentes, 'ordem pendente', 'ordens pendentes')} — fecha-as primeiro (separador Posições).`)
  }
  if (d.levantamentosAbertos > 0) {
    bloqueios.push(`Tem ${plural(d.levantamentosAbertos, 'levantamento por fechar', 'levantamentos por fechar')} — resolve o pagamento antes de apagar a conta.`)
  }

  const arrasta: ItemArrastado[] = []
  const juntar = (tabela: string, quantas: number, nota: string) => { if (quantas > 0) arrasta.push({ tabela, quantas, nota }) }

  juntar('funded_positions', d.fechadas, 'histórico de trades desta conta')
  juntar('mtmcopy_connections', d.ligacoesT2T, 'ligações do site (T2T / MTM Copy) a esta conta')
  juntar('mtmauto_accounts', d.contasMtmAuto, 'contas ligadas na app MTM Auto')
  juntar('mtmauto_subscriptions', d.subscricoes, 'subscrições de estratégia presas a essas contas')
  juntar('copia_rotas', d.rotas.filter((r) => !r.origem).length, 'rotas de cópia que entregavam NESTA conta (e as posições copiadas)')
  juntar('mestres_contas', d.mestresContas, 'regras do motor das mestres para esta conta')

  if (c.metaapiAccountId) {
    avisos.push(`A conta ${c.metaapiAccountId} na MetaApi NÃO é tocada — fica lá. Apagá-la é trabalho à parte, feito à mão.`)
  }
  if (d.certificados > 0) avisos.push(`${plural(d.certificados, 'certificado fica', 'certificados ficam')} (deixam de apontar a esta conta, mas continuam válidos).`)
  if (d.participacoes > 0) avisos.push(`${plural(d.participacoes, 'participação de torneio fica', 'participações de torneio ficam')} na classificação, sem conta associada.`)
  if (d.compras > 0) avisos.push(`${plural(d.compras, 'compra fica', 'compras ficam')} no registo de pagamentos, sem conta associada.`)
  if (c.motor === 'sim' && c.saldo != null && c.saldo > 0) {
    avisos.push(`O saldo simulado de ${c.saldo.toLocaleString('pt-PT', { maximumFractionDigits: 2 })} USD desaparece com a conta.`)
  }

  return {
    pode: bloqueios.length === 0,
    bloqueios,
    arrasta,
    avisos,
    // Escrever o LOGIN é o que separa «carreguei sem ler» de «quis mesmo esta conta».
    confirmacaoEsperada: c.login ?? '',
  }
}

/**
 * O texto escrito destranca o botão?
 *
 * Compara-se sem espaços das pontas. Uma conta sem login ainda não foi emitida no MetaTrader e
 * não tem nada para escrever: pede-se a palavra `APAGAR`, que é explícita na mesma.
 */
export const PALAVRA_SEM_LOGIN = 'APAGAR'

export function confirmacaoApagarValida(escrito: unknown, login: string | null | undefined): boolean {
  const texto = typeof escrito === 'string' ? escrito.trim() : ''
  const esperado = String(login ?? '').trim()
  return esperado ? texto === esperado : texto === PALAVRA_SEM_LOGIN
}
