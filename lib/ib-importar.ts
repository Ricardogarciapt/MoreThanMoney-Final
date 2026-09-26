/**
 * O IMPORTADOR DAS EXPORTAÇÕES DE CORRETORA.
 *
 * PORQUE É QUE ISTO É UM IMPORTADOR E NÃO UMA LISTA ESCRITA À MÃO
 * O dono colou quatro exportações — PU Prime, Infinox, Hantec e VT Markets — com quase duzentas
 * contas. Eu podia transcrevê-las uma vez. Mas daqui a um mês há outra exportação, e outra no mês
 * seguinte, e a transcrição feita à mão por mim envelhece no dia em que é feita. Pior: uma vírgula
 * mal lida numa coluna de comissão é dinheiro mal pago a uma pessoa real.
 *
 * Por isso isto lê o formato tal como a corretora o exporta, e é PURO — dá-se-lhe texto, devolve
 * linhas. Não toca na base de dados. É assim que pode ser preso por guardas, com exemplos reais de
 * cada uma das quatro corretoras, em vez de se descobrir o erro quando alguém reclamar do valor.
 *
 * CINCO FORMATOS, não quatro: a Infinox exporta clientes e referências em ficheiros diferentes,
 * com colunas diferentes, e as duas coisas interessam.
 */

export const CORRETORAS = ['pu_prime', 'infinox', 'hantec', 'vtmarkets'] as const
export type Corretora = (typeof CORRETORAS)[number]

export const CORRETORA_NOME: Record<Corretora, string> = {
  pu_prime: 'PU Prime',
  infinox: 'Infinox',
  hantec: 'Hantec Markets',
  vtmarkets: 'VT Markets',
}

/** A casa. As contas que estão aqui não têm de ser trazidas para lado nenhum. */
export const CORRETORA_DA_CASA: Corretora = 'pu_prime'

export type Formato = 'pu_prime' | 'vtmarkets' | 'hantec' | 'infinox_clientes' | 'infinox_referencias'

export interface ContaImportada {
  corretora: Corretora
  conta: string
  cliente_nome: string | null
  cliente_email: string | null
  cliente_telefone: string | null
  ib_externo: string | null
  tipo_conta: string | null
  plataforma: string | null
  moeda: string | null
  saldo: number | null
  equity: number | null
  volume_lotes: number | null
  comissao_usd: number | null
  depositos_usd: number | null
  registo: string | null
  ultima_negociacao: string | null
  ultimo_deposito: string | null
}

// ── Leitura de valores ───────────────────────────────────────────────────────

/**
 * Um número, sabendo que corretora usa que vírgula.
 *
 * A PU Prime e a VT Markets exportam `-11,77`; a Infinox e a Hantec exportam `12474.48000000`.
 * Ler `-11,77` com as regras da Infinox dá `-11` — perde-se o valor e ninguém dá por isso, porque
 * o resultado continua a parecer um número.
 */
export function numero(bruto: string | undefined, virgulaDecimal: boolean): number | null {
  const s = (bruto ?? '').trim()
  if (!s || s === '-' || s.toUpperCase() === 'N/A') return null
  // Tirar moeda e espaços: «100(USD)» e «2000(USC)» aparecem na coluna de depósito.
  const limpo = s.replace(/\([^)]*\)/g, '').replace(/[^\d.,\-]/g, '').trim()
  if (!limpo) return null
  const normal = virgulaDecimal ? limpo.replace(/\./g, '').replace(',', '.') : limpo.replace(/,/g, '')
  const n = Number(normal)
  return Number.isFinite(n) ? n : null
}

/** Uma data em AAAA-MM-DD, venha ela com hora ou sem ela. Vazio e `N/A` são nulo, não hoje. */
export function data(bruto: string | undefined): string | null {
  const s = (bruto ?? '').trim()
  if (!s || s === '-' || s.toUpperCase() === 'N/A') return null
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

function texto(bruto: string | undefined): string | null {
  const s = (bruto ?? '').trim()
  if (!s || s === '-' || s.toUpperCase() === 'N/A') return null
  return s
}

// ── Que ficheiro é este ──────────────────────────────────────────────────────

/**
 * Reconhece o formato pelo cabeçalho.
 *
 * Por colunas próprias de cada exportação, e não pela ordem: a ordem muda quando alguém arrasta uma
 * coluna no Excel antes de copiar, e um importador que depende disso falha em silêncio — pior,
 * importa tudo trocado.
 */
export function detectarFormato(cabecalho: string): Formato | null {
  const c = cabecalho.toLowerCase()
  if (c.includes('id de afiliado superior') || c.includes('proprietário da conta')) return 'pu_prime'
  if (c.includes('account journey') && c.includes('campaign source')) return 'vtmarkets'
  if (c.includes('comm. unpaid') || (c.includes('ib id') && c.includes('vol. traded'))) return 'hantec'
  if (c.includes('commissioned lots') || c.includes('country of residence')) return 'infinox_referencias'
  if (c.includes('is ib') && c.includes('withdrawals')) return 'infinox_clientes'
  return null
}

const CORRETORA_DO_FORMATO: Record<Formato, Corretora> = {
  pu_prime: 'pu_prime',
  vtmarkets: 'vtmarkets',
  hantec: 'hantec',
  infinox_clientes: 'infinox',
  infinox_referencias: 'infinox',
}

function colunas(linha: string): string[] {
  return linha.split('\t').map((c) => c.trim())
}

function indice(cab: string[], ...nomes: string[]): number {
  for (const n of nomes) {
    const i = cab.findIndex((c) => c.toLowerCase() === n.toLowerCase())
    if (i >= 0) return i
  }
  return -1
}

// ── A leitura, formato a formato ─────────────────────────────────────────────

export interface Resultado {
  formato: Formato | null
  corretora: Corretora | null
  linhas: ContaImportada[]
  /** Linhas que não tinham número de conta. Sem conta não há registo possível. */
  ignoradas: number
  erro?: string
}

export function importar(textoBruto: string): Resultado {
  const linhasTexto = textoBruto
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim().length > 0)

  if (linhasTexto.length < 2) {
    return { formato: null, corretora: null, linhas: [], ignoradas: 0, erro: 'Faltam linhas — cola o cabeçalho e os dados.' }
  }

  const formato = detectarFormato(linhasTexto[0])
  if (!formato) {
    return {
      formato: null,
      corretora: null,
      linhas: [],
      ignoradas: 0,
      erro: 'Não reconheci o cabeçalho. Cola a exportação COM a linha dos títulos, tal como vem da corretora.',
    }
  }

  const corretora = CORRETORA_DO_FORMATO[formato]
  const cab = colunas(linhasTexto[0])
  const virgula = formato === 'pu_prime' || formato === 'vtmarkets'
  const linhas: ContaImportada[] = []
  let ignoradas = 0

  for (const bruta of linhasTexto.slice(1)) {
    const c = colunas(bruta)
    const conta = lerConta(formato, cab, c)
    if (!conta) {
      ignoradas++
      continue
    }
    linhas.push(lerLinha(formato, corretora, cab, c, conta, virgula))
  }

  return { formato, corretora, linhas, ignoradas }
}

function lerConta(formato: Formato, cab: string[], c: string[]): string | null {
  switch (formato) {
    case 'pu_prime':
      return texto(c[indice(cab, 'Conta')])
    case 'vtmarkets':
      return texto(c[indice(cab, 'Account')])
    case 'hantec':
      return texto(c[indice(cab, 'Acc.')])
    case 'infinox_referencias':
      return texto(c[indice(cab, 'Account')])
    case 'infinox_clientes': {
      // Este ficheiro não traz número de conta — traz pessoas. O email é o que a identifica, e é
      // estável entre exportações; o nome não é (muda de acentuação, de ordem, de maiúsculas).
      const email = texto(c[indice(cab, 'Email')])
      return email ? `email:${email.toLowerCase()}` : null
    }
  }
}

function lerLinha(
  formato: Formato,
  corretora: Corretora,
  cab: string[],
  c: string[],
  conta: string,
  virgula: boolean,
): ContaImportada {
  const base: ContaImportada = {
    corretora,
    conta,
    cliente_nome: null,
    cliente_email: null,
    cliente_telefone: null,
    ib_externo: null,
    tipo_conta: null,
    plataforma: null,
    moeda: null,
    saldo: null,
    equity: null,
    volume_lotes: null,
    comissao_usd: null,
    depositos_usd: null,
    registo: null,
    ultima_negociacao: null,
    ultimo_deposito: null,
  }

  const n = (...nomes: string[]) => numero(c[indice(cab, ...nomes)], virgula)
  const t = (...nomes: string[]) => texto(c[indice(cab, ...nomes)])
  const d = (...nomes: string[]) => data(c[indice(cab, ...nomes)])

  switch (formato) {
    case 'pu_prime':
      return {
        ...base,
        cliente_nome: t('Nome'),
        ib_externo: t('ID de afiliado superior'),
        tipo_conta: t('TIPO DE CONTA'),
        plataforma: t('PLATAFORMA'),
        moeda: t('MOEDA BASE'),
        saldo: n('SALDO'),
        equity: n('Equidade da Conta'),
        volume_lotes: n('Últimos lotes negociados'),
        depositos_usd: n('Montante do Último Depósito'),
        registo: d('DATA'),
        ultima_negociacao: d('Data da Última Negociação'),
        ultimo_deposito: d('Data do Último Depósito'),
      }

    case 'vtmarkets':
      return {
        ...base,
        tipo_conta: t('Account type'),
        plataforma: t('Platform'),
        moeda: t('Base currency'),
        saldo: n('Balance'),
        equity: n('Account Equity'),
        volume_lotes: n('Last Traded Lots'),
        depositos_usd: n('Last Deposit Amount'),
        registo: d('Date'),
        ultima_negociacao: d('Last Trade Date'),
        ultimo_deposito: d('Last Deposit Date'),
      }

    case 'hantec':
      return {
        ...base,
        cliente_nome: t('Name'),
        cliente_email: t('Email'),
        cliente_telefone: t('Phone'),
        ib_externo: t('IB ID'),
        plataforma: t('Platform'),
        saldo: n('Balance'),
        equity: n('Equity'),
        volume_lotes: n('Vol. Traded'),
        // Paga + por pagar: o que interessa é o volume de negócio que esta conta gera, não o
        // estado do pagamento dela.
        comissao_usd: (n('Comm. Paid') ?? 0) + (n('Comm. Unpaid') ?? 0) || null,
        depositos_usd: n('Deposits'),
        registo: d('Reg. Date'),
      }

    case 'infinox_clientes': {
      const nome = [t('First Name'), t('Last Name')].filter(Boolean).join(' ').trim()
      return {
        ...base,
        cliente_nome: nome || null,
        cliente_email: t('Email'),
        cliente_telefone: t('Phone'),
        saldo: n('Balance, USD'),
        volume_lotes: n('Lots'),
        comissao_usd: n('Commission, USD'),
        depositos_usd: n('Deposits, USD'),
      }
    }

    case 'infinox_referencias':
      return {
        ...base,
        // Nesta exportação, «Referral» é quem trouxe a conta — a pessoa da nossa rede.
        cliente_nome: t('Referral'),
        saldo: n('Balance'),
        volume_lotes: n('Commissioned Lots'),
        comissao_usd: n('Commission Received, USD'),
        registo: d('Reg. Date'),
      }
  }
}

// ── Em que ponto da migração está esta conta ────────────────────────────────

export type EstadoMigracao = 'na_casa' | 'a_transitar' | 'a_fechar' | 'perdido' | 'por_avaliar'

/**
 * O ESTADO DE ENTRADA de uma conta acabada de importar.
 *
 * Isto decide onde cada pessoa vai parar, e por isso é uma regra escrita e não um palpite:
 *
 * · Já está na PU Prime → `na_casa`. Não há nada a trazer.
 * · Está noutra corretora E mexeu dinheiro (negociou lotes ou depositou) → `a_transitar`. É uma
 *   conversa que vale a pena ter: há volume real a mudar de sítio.
 * · Está noutra corretora e nunca mexeu nada → `a_fechar`. São a maioria das linhas destas
 *   exportações, e gastar a equipa com elas é o que faz uma lista de cem nomes não ser trabalhada.
 *
 * `perdido` não se atribui automaticamente: quem tenta e não consegue é que o marca, e escreve
 * porquê. Um sistema que desiste sozinho de uma pessoa esconde a razão de ter desistido.
 */
export function estadoInicial(c: ContaImportada): EstadoMigracao {
  if (c.corretora === CORRETORA_DA_CASA) return 'na_casa'
  const mexeu = (c.volume_lotes ?? 0) > 0 || (c.depositos_usd ?? 0) > 0 || (c.comissao_usd ?? 0) > 0
  return mexeu ? 'a_transitar' : 'a_fechar'
}

/**
 * Vale a pena pôr esta conta à frente das outras?
 *
 * O volume manda. Uma conta com 228 lotes negociados vale mais atenção do que vinte contas a zero
 * — e sem esta ordem a equipa trabalhava a lista pela ordem alfabética, que é a ordem de ninguém.
 */
export function pesoDaConta(c: ContaImportada): number {
  return (c.volume_lotes ?? 0) * 10 + (c.comissao_usd ?? 0) + (c.depositos_usd ?? 0) / 100
}
