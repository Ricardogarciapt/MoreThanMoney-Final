/**
 * A ETIQUETA DE UMA CONTA — o nome próprio que o DONO dá à conta (113, pedido do dono 17/09).
 *
 * O WebTrader lista três famílias de contas e cada uma identifica-se com o que a corretora dá
 * (login, servidor, «MT5»/«TradeLocker», «F1»/«Active»). Com várias contas do mesmo tipo o seletor
 * fica cheio de linhas iguais. A etiqueta é uma palavra do dono («Conta grande», «Teste Sensei»)
 * que passa a acompanhar a conta em todos os sítios onde ela aparece.
 *
 * UMA regra, um sítio: a coluna chama-se `etiqueta` nas quatro tabelas de contas
 *   · mtm_trading_accounts  — MTM Funded simuladas/reais
 *   · mtmcopy_connections   — ligador do site (TradeLocker e MT5/MT4)
 *   · mtmauto_accounts      — contas ligadas na app MTM Auto
 *   · webtrader_contas_mt5  — contas MT5 abertas só no WebTrader
 *
 * `normalizarEtiqueta` é a ÚNICA porta de escrita: corta a 40 caracteres, tira espaços das pontas,
 * junta espaços repetidos, recusa `<` e `>` (nada de HTML) e devolve `null` quando fica vazia —
 * vazio quer dizer «sem etiqueta», e aí cada ecrã mostra o nome que já mostrava hoje.
 *
 * Puro: sem React, sem base de dados — testado em lib/contas/__tests__/etiqueta.check.ts.
 */

/** Limite escolhido pelo dono: cabe no seletor sem partir a linha. */
export const ETIQUETA_MAX = 40

/**
 * Um caractere que vale como espaço: os brancos de `\s` (que já inclui o espaço duro, os espaços
 * tipográficos e os separadores de linha do copy-paste) mais os de controlo (0x00–0x1F e 0x7F), que
 * `\s` não apanha todos. Todos viram UM espaço normal e depois colapsam.
 */
function ehBranco(c: string): boolean {
  const cp = c.charCodeAt(0)
  return cp < 32 || cp === 127 || /\s/.test(c)
}

const ESPACOS_REPETIDOS = / {2,}/g

/**
 * O texto que se grava na coluna `etiqueta`, ou `null` (sem etiqueta).
 *
 * Aceita o que vem do corpo do pedido sem confiar no tipo: `undefined`, `null`, números e objectos
 * dão `null` em vez de rebentar. O corte a 40 é feito DEPOIS de limpar, para que espaços à direita
 * não gastem caracteres.
 */
export function normalizarEtiqueta(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  // `<` e `>` desaparecem (a etiqueta é texto, nunca marcação); os brancos viram espaço.
  const limpo = Array.from(valor)
    .map((c) => (c === '<' || c === '>' ? '' : ehBranco(c) ? ' ' : c))
    .join('')
    .replace(ESPACOS_REPETIDOS, ' ')
    .trim()
  if (!limpo) return null
  // Corte a 40 e outro trim: o corte pode deixar um espaço na ponta.
  return limpo.slice(0, ETIQUETA_MAX).trim() || null
}

/**
 * A etiqueta de uma linha da base, pronta para mostrar. Devolve `null` quando a coluna ainda não
 * existe (migração 113 por aplicar) ou está vazia — nunca `undefined`, para o JSON ser sempre igual.
 */
export function etiquetaDaLinha(linha: { etiqueta?: unknown } | null | undefined): string | null {
  return normalizarEtiqueta(linha?.etiqueta)
}

/** O que se mostra: a etiqueta do dono se existir, senão o nome de sempre daquele ecrã. */
export function nomeMostrado(etiqueta: string | null | undefined, nomeDeSempre: string): string {
  return etiqueta?.trim() ? etiqueta.trim() : nomeDeSempre
}

// ── onde gravar: a referência da conta → tabela e linha ──────────────────────────────────────

/** As quatro tabelas onde uma conta pode viver (todas com `user_id` e a coluna `etiqueta`). */
export type TabelaDeConta = 'mtm_trading_accounts' | 'mtmcopy_connections' | 'mtmauto_accounts' | 'webtrader_contas_mt5'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A tabela e a linha onde a etiqueta de uma conta se grava, a partir da referência que o seletor do
 * WebTrader já usa (lib/webtrader/corretoras/regras.ts::refTexto):
 *
 *   mtmfunded:<uuid>            → mtm_trading_accounts   (MTM Funded simuladas/reais)
 *   mt5|tradelocker:site:<uuid> → mtmcopy_connections    (ligador do site)
 *   mt5|tradelocker:auto:<uuid> → mtmauto_accounts       (app MTM Auto)
 *   mt5:wt:<uuid>               → webtrader_contas_mt5   (aberta só no WebTrader)
 *
 * `null` quando a referência não serve — em especial `tradelocker:sessao:<n>`, uma conta aberta só
 * neste separador com login+password: não há linha na base onde pôr a etiqueta.
 *
 * O `id` é sempre um UUID validado aqui; quem grava junta-lhe SEMPRE o dono (`user_id`).
 */
export function tabelaDaEtiqueta(ref: unknown): { tabela: TabelaDeConta; id: string } | null {
  // Só texto: um array de uma posição daria a mesma coisa que o texto lá dentro se fosse coagido.
  if (typeof ref !== 'string') return null
  const partes = ref.split(':')
  if (partes[0] === 'mtmfunded') {
    return partes.length === 2 && UUID.test(partes[1]) ? { tabela: 'mtm_trading_accounts', id: partes[1] } : null
  }
  if (partes.length !== 3) return null
  const [plataforma, origem, id] = partes
  if (plataforma !== 'mt5' && plataforma !== 'tradelocker') return null
  if (!UUID.test(id)) return null
  if (origem === 'site') return { tabela: 'mtmcopy_connections', id }
  if (origem === 'auto') return { tabela: 'mtmauto_accounts', id }
  // A conta aberta só no WebTrader é sempre MT5 (076); TradeLocker por aí é sessão, sem linha.
  if (origem === 'wt' && plataforma === 'mt5') return { tabela: 'webtrader_contas_mt5', id }
  return null
}

// ── o pedido de gravação (PATCH /api/contas/etiqueta), sem base de dados ─────────────────────

export type PedidoEtiqueta =
  | { ok: true; tabela: TabelaDeConta; id: string; etiqueta: string | null }
  | { ok: false; status: 400; erro: string }

/**
 * Valida o corpo do PATCH antes de tocar na base: a referência tem de apontar para uma das quatro
 * tabelas, e a etiqueta tem de ser texto ou `null` (`undefined` NÃO apaga — quem quer apagar manda
 * '' ou null). Devolve o texto já normalizado. Puro: a rota só junta a sessão e o UPDATE.
 */
export function lerPedidoEtiqueta(corpo: unknown): PedidoEtiqueta {
  const c = (corpo && typeof corpo === 'object' ? corpo : {}) as Record<string, unknown>
  const alvo = tabelaDaEtiqueta(c.ref)
  if (!alvo) {
    return { ok: false, status: 400, erro: 'Esta conta não guarda etiqueta — só as contas ligadas à tua conta MTM (as abertas com login+password neste separador não).' }
  }
  if (c.etiqueta !== null && typeof c.etiqueta !== 'string') {
    return { ok: false, status: 400, erro: `Escreve a etiqueta (até ${ETIQUETA_MAX} caracteres) ou deixa em branco para a tirar.` }
  }
  return { ok: true, ...alvo, etiqueta: normalizarEtiqueta(c.etiqueta) }
}

/** O erro do PostgREST quer dizer «a coluna `etiqueta` não existe» (113 por aplicar)? */
export function erroSemColunaEtiqueta(erro: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!erro) return false
  return erro.code === '42703' || /column .*etiqueta.* does not exist/i.test(erro.message ?? '')
}
