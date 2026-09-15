/**
 * REGRAS PURAS DO WEBTRADER MULTI-CORRETORA (sem base, sem Next, sem rede).
 *
 *  · referência de conta que viaja no URL (`mtmfunded:<uuid>`, `tradelocker:site:<uuid>`,
 *    `mt5:auto:<uuid>`…) — a origem viaja no id, o dono verifica-se SEMPRE no servidor;
 *  · símbolo da corretora → canónico do catálogo (para o gráfico e os preços indicativos);
 *  · acesso MT5 no WebTrader conforme a quota MetaApi (grátis = a sua 1 conta);
 *  · limitador de leituras por conta (MetaApi/TradeLocker cobram ou limitam por pedido).
 *
 * Testado em lib/webtrader/__tests__/corretoras.check.ts.
 */
import type { PlataformaWT } from './tipos'

// ── referência de conta ──────────────────────────────────────────────────────────────────────

export type RefConta =
  | { plataforma: 'mtmfunded'; id: string }
  | { plataforma: 'tradelocker'; origem: 'site'; id: string }
  | { plataforma: 'tradelocker'; origem: 'sessao'; id: string }
  | { plataforma: 'mt5'; origem: 'site' | 'auto' | 'wt'; id: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function lerRefConta(plataforma: string, ref: unknown): RefConta | null {
  const partes = String(ref ?? '').split(':')
  if (partes[0] !== plataforma) return null
  if (plataforma === 'mtmfunded') return partes.length === 2 && UUID.test(partes[1]) ? { plataforma, id: partes[1] } : null
  if (partes.length !== 3) return null
  const [, origem, id] = partes
  if (plataforma === 'tradelocker') {
    if (origem === 'site' && UUID.test(id)) return { plataforma, origem, id }
    // Sessão do WebTrader: o id é o accountId TradeLocker (numérico); a posse vem do bilhete.
    if (origem === 'sessao' && /^\d{1,20}$/.test(id)) return { plataforma, origem, id }
    return null
  }
  if (plataforma === 'mt5' && (origem === 'site' || origem === 'auto' || origem === 'wt') && UUID.test(id)) {
    return { plataforma, origem, id }
  }
  return null
}

export function refTexto(r: RefConta): string {
  return r.plataforma === 'mtmfunded' ? `mtmfunded:${r.id}` : `${r.plataforma}:${r.origem}:${r.id}`
}

export function plataformaValida(v: unknown): PlataformaWT | null {
  return v === 'mtmfunded' || v === 'tradelocker' || v === 'mt5' ? v : null
}

// ── símbolos ─────────────────────────────────────────────────────────────────────────────────

/** Nomes de corretora → símbolo do catálogo MTM Funded (o do gráfico). */
const ALIAS_CATALOGO: Record<string, string> = {
  GOLD: 'XAUUSD', GOLDUSD: 'XAUUSD', XAUUSD: 'XAUUSD',
  SILVER: 'XAGUSD', SILVERUSD: 'XAGUSD', XAGUSD: 'XAGUSD',
  US100: 'NAS100', USTEC: 'NAS100', USTECH: 'NAS100', NAS100: 'NAS100', NASDAQ: 'NAS100', NDX: 'NAS100',
  US500: 'US500', SPX500: 'US500', SP500: 'US500', SPX: 'US500',
  US30: 'US30', DJ30: 'US30', DOW30: 'US30', WS30: 'US30', USA30: 'US30',
  GER40: 'GER40', DE40: 'GER40', DAX40: 'GER40', GER30: 'GER40', DE30: 'GER40',
  UK100: 'UK100', FTSE100: 'UK100',
  JPN225: 'JPN225', JP225: 'JPN225', NIKKEI225: 'JPN225',
  USOIL: 'USOUSD', WTI: 'USOUSD', XTIUSD: 'USOUSD', USOUSD: 'USOUSD', WTIUSD: 'USOUSD',
  UKOIL: 'UKOUSD', BRENT: 'UKOUSD', XBRUSD: 'UKOUSD', UKOUSD: 'UKOUSD',
  BTCUSDT: 'BTCUSD', ETHUSDT: 'ETHUSD',
}

const MOEDAS = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'XAU', 'XAG', 'SGD', 'HKD', 'NOK', 'SEK', 'ZAR', 'MXN', 'TRY', 'PLN', 'CNH', 'BTC', 'ETH', 'LTC', 'XRP', 'SOL'])

/**
 * `XAUUSD.s` → XAUUSD · `EURUSDm` → EURUSD · `US100.cash` → NAS100 · `GOLD` → XAUUSD.
 * Nunca por substring cega: um par só se reconhece quando as duas metades são moedas.
 */
export function canonicoDe(simboloCorretora: string): string {
  const up = String(simboloCorretora ?? '').toUpperCase().trim()
  if (!up) return up
  const antesSep = up.split(/[._\-+#/\\ :]/)[0] || up
  const compacto = antesSep.replace(/[^A-Z0-9]/g, '')
  if (ALIAS_CATALOGO[compacto]) return ALIAS_CATALOGO[compacto]
  // Sufixo colado (EURUSDm, XAUUSDpro, US30cash): tenta prefixos de 6 letras com moedas dos dois lados.
  if (compacto.length >= 6) {
    const par = compacto.slice(0, 6)
    if (MOEDAS.has(par.slice(0, 3)) && MOEDAS.has(par.slice(3, 6))) return ALIAS_CATALOGO[par] ?? par
  }
  for (const suf of ['CASH', 'SPOT', 'PRO', 'ECN', 'RAW', 'STD', 'MICRO', 'MINI']) {
    if (compacto.endsWith(suf) && ALIAS_CATALOGO[compacto.slice(0, -suf.length)]) return ALIAS_CATALOGO[compacto.slice(0, -suf.length)]
  }
  return compacto
}

// ── MT5: acesso conforme a quota MetaApi ─────────────────────────────────────────────────────

export interface ContaMetaApiDoUtilizador {
  metaapi_account_id: string | null
  login?: string | null
  servidor?: string | null
  created_at?: string | null
}

/**
 * Pode USAR esta conta MT5 no WebTrader (ler e negociar)?
 *
 * A regra é a da quota (lib/contas/quota-metaapi.ts): grátis 1, Premium/VIP/MTM Auto 2, admin sem
 * limite, + extras. Quem ficou acima do limite com contas antigas NÃO as perde nos outros produtos,
 * mas no WebTrader só abrem as primeiras `limite` contas (por ordem de ligação) — assim um grátis
 * com duas contas antigas negoceia a sua 1, e não a segunda, que ninguém paga.
 */
export function decidirAcessoMt5(
  q: { plano: 'admin' | 'premium' | 'gratis'; limite: number },
  contas: ContaMetaApiDoUtilizador[],
  metaapiAccountId: string,
): { ok: true } | { ok: false; erro: string } {
  if (q.plano === 'admin') return { ok: true }
  const vistas: string[] = []
  const ordenadas = [...contas]
    .filter((c) => c.metaapi_account_id)
    .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))
  for (const c of ordenadas) {
    const id = String(c.metaapi_account_id)
    if (!vistas.includes(id)) vistas.push(id)
  }
  const pos = vistas.indexOf(metaapiAccountId)
  if (pos < 0) return { ok: false, erro: 'Conta MT5 não encontrada entre as tuas.' }
  if (pos < q.limite) return { ok: true }
  return {
    ok: false,
    erro:
      q.plano === 'gratis'
        ? `O teu plano inclui ${q.limite} conta MetaTrader no WebTrader e esta é a ${pos + 1}.ª. Com Premium ou MTM Auto passas a ter 2. Contas TradeLocker e MTM Funded não contam.`
        : `O teu plano inclui ${q.limite} contas MetaTrader e esta é a ${pos + 1}.ª. Para mais, fala connosco para uma conta extra.`,
  }
}

// ── limitador de leituras ────────────────────────────────────────────────────────────────────

/** Intervalo mínimo entre leituras reais por conta (MT5 por REST cobra créditos por pedido). */
export const INTERVALO_MIN_LEITURA_MS = { mt5: 5_000, tradelocker: 2_000, mtmfunded: 1_000 } as const
export const INTERVALO_HISTORICO_MS = 60_000

/**
 * Cache partilhada por chave (conta+leitura): dentro do prazo devolve o último valor; pedidos em
 * simultâneo partilham UMA ida à corretora. Erros não ficam guardados, mas também não se repetem
 * antes do prazo (devolve-se o último valor bom, se houver) — uma corretora em baixo não recebe
 * uma rajada de pedidos por cada separador aberto.
 */
export function criarLimitador(agora: () => number = Date.now) {
  const valores = new Map<string, { v: unknown; em: number }>()
  const falhas = new Map<string, { erro: unknown; em: number }>()
  const emCurso = new Map<string, Promise<unknown>>()
  return {
    async ler<T>(chave: string, intervaloMs: number, carregar: () => Promise<T>): Promise<T> {
      const t = agora()
      const guardado = valores.get(chave)
      if (guardado && t - guardado.em < intervaloMs) return guardado.v as T
      const falhou = falhas.get(chave)
      if (falhou && t - falhou.em < intervaloMs) {
        if (guardado) return guardado.v as T
        throw falhou.erro
      }
      const pendente = emCurso.get(chave)
      if (pendente) return pendente as Promise<T>
      const p = (async () => {
        try {
          const v = await carregar()
          valores.set(chave, { v, em: agora() })
          falhas.delete(chave)
          return v
        } catch (e) {
          falhas.set(chave, { erro: e, em: agora() })
          throw e
        } finally {
          emCurso.delete(chave)
        }
      })()
      emCurso.set(chave, p)
      return p
    },
    /** Depois de uma ordem: a próxima leitura desta conta vai à corretora. */
    invalidarPrefixo(prefixo: string) {
      for (const k of [...valores.keys()]) if (k.startsWith(prefixo)) valores.delete(k)
      for (const k of [...falhas.keys()]) if (k.startsWith(prefixo)) falhas.delete(k)
    },
  }
}

// ── tentativas de login ──────────────────────────────────────────────────────────────────────

/**
 * Chave do login nas tentativas (tabela mtmfunded_ligacao_tentativas da 074). Nunca o email/login
 * em claro: o valor passa num filtro PostgREST e fica numa tabela de registo.
 */
export function chaveTentativa(plataforma: 'tradelocker' | 'mt5', identificador: string, servidor: string, hash: (s: string) => string): string {
  return `wt-${plataforma}-${hash(`${identificador.trim().toLowerCase()}@${servidor.trim().toLowerCase()}`).slice(0, 32)}`
}
