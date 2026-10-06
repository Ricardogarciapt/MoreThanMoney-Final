/**
 * PrimeGate — interpretar a resposta (PURO: sem rede, sem base de dados).
 *
 * O PDF da PrimeVerse diz o que os estados SIGNIFICAM mas não o formato exacto do corpo. Por isso
 * este parser é tolerante de propósito: aceita `status`/`result`/`verification`/`state` com
 * `confirmed`/`undetermined` em qualquer caixa, `confirmed: true`, e o mesmo dentro de `data`.
 *
 * A regra que NUNCA pode cair: tudo o que não for um «confirmed» inequívoco é `undetermined`
 * (ou `erro` quando foi a chamada que falhou). Não existe estado «recusado». Em falta, fora de
 * âmbito ou ainda não importado dá todos `undetermined` — o cliente fica «a confirmar» e
 * volta-se a verificar mais tarde. Tratar isso como recusa era fechar a porta a quem se registou
 * pelo nosso link mas ainda não apareceu no upload da organização.
 */

import { validarUidBroker } from '@/lib/broker/dados-corretora'

export type EstadoPrimeGate = 'confirmed' | 'undetermined' | 'erro'

export interface Interpretacao {
  estado: EstadoPrimeGate
  /** Texto curto para o admin e para a base. Nunca contém a chave. */
  motivo: string
  /** Formato desconhecido → undetermined + aviso (para o admin olhar para o corpo cru). */
  aviso?: string
  /** Quando reagendar (segundos), se for caso disso. null = usar o backoff normal. */
  reagendarEmSeg?: number | null
  /** A chave falhou (401/403): não vale a pena insistir até alguém a corrigir. */
  chaveInvalida?: boolean
}

const PALAVRAS_ESTADO = ['status', 'result', 'verification', 'state', 'outcome', 'registration_status', 'verificationStatus']

function normalizar(v: unknown): 'confirmed' | 'undetermined' | null {
  if (v === true) return 'confirmed'
  if (typeof v !== 'string') return null
  const s = v.trim().toLowerCase()
  if (s === 'confirmed') return 'confirmed'
  if (s === 'undetermined') return 'undetermined'
  return null
}

/** Procura o estado num objecto (e num `data`/`result` aninhado, um nível). */
function procurar(obj: Record<string, unknown>): 'confirmed' | 'undetermined' | null {
  // `confirmed: true` explícito. `confirmed: false` NÃO é recusa — é só «não confirmado».
  if (obj.confirmed === true) return 'confirmed'
  for (const k of PALAVRAS_ESTADO) {
    const n = normalizar(obj[k])
    if (n) return n
  }
  if (obj.confirmed === false) return 'undetermined'
  return null
}

/** Interpreta só o CORPO de uma resposta 2xx. */
export function interpretarCorpo(corpo: unknown): Interpretacao {
  if (typeof corpo === 'string') {
    const n = normalizar(corpo)
    if (n === 'confirmed') return { estado: 'confirmed', motivo: 'confirmado no ramo de IB' }
    if (n === 'undetermined') return { estado: 'undetermined', motivo: 'ainda não aparece no ramo' }
  }
  if (corpo && typeof corpo === 'object' && !Array.isArray(corpo)) {
    const o = corpo as Record<string, unknown>
    let achado = procurar(o)
    for (const aninhado of ['data', 'result', 'verification', 'registration']) {
      if (achado) break
      const v = o[aninhado]
      if (v && typeof v === 'object' && !Array.isArray(v)) achado = procurar(v as Record<string, unknown>)
    }
    if (achado === 'confirmed') return { estado: 'confirmed', motivo: 'confirmado no ramo de IB' }
    if (achado === 'undetermined') return { estado: 'undetermined', motivo: 'ainda não aparece no ramo' }
  }
  return {
    estado: 'undetermined',
    motivo: 'resposta em formato desconhecido',
    aviso: 'A PrimeGate respondeu num formato que não reconheço — ver o corpo cru no /admin.',
  }
}

/** Lê o Retry-After (segundos OU data HTTP). Devolve segundos, ou null se não houver. */
export function lerRetryAfter(valor: string | null | undefined, agoraMs = Date.now()): number | null {
  if (!valor) return null
  const s = valor.trim()
  if (/^\d+$/.test(s)) return Math.max(1, Number(s))
  const t = Date.parse(s)
  if (Number.isFinite(t)) return Math.max(1, Math.ceil((t - agoraMs) / 1000))
  return null
}

/** Interpreta a resposta HTTP inteira. */
export function interpretarResposta(httpStatus: number, corpo: unknown, retryAfter?: string | null): Interpretacao {
  if (httpStatus >= 200 && httpStatus < 300) return interpretarCorpo(corpo)
  if (httpStatus === 401 || httpStatus === 403) {
    return { estado: 'erro', motivo: 'chave inválida ou ainda sem aprovação da PrimeVerse', chaveInvalida: true, reagendarEmSeg: 6 * 3600 }
  }
  if (httpStatus === 429) {
    return { estado: 'erro', motivo: 'limite de pedidos da PrimeGate (429)', reagendarEmSeg: lerRetryAfter(retryAfter) ?? 60 }
  }
  if (httpStatus >= 500) return { estado: 'erro', motivo: `PrimeGate indisponível (${httpStatus})`, reagendarEmSeg: 15 * 60 }
  // 400/404/422…: o pedido não serviu. Também NÃO é recusa — fica por confirmar.
  return { estado: 'erro', motivo: `PrimeGate respondeu ${httpStatus}`, reagendarEmSeg: null }
}

// ───────────────────────────── backoff das reverificações ─────────────────────────────

/** 1h → 6h → 24h → 24h → 24h, e depois pára (5 tentativas no total). */
export const BACKOFF_HORAS = [1, 6, 24, 24, 24] as const
export const MAX_TENTATIVAS = 5

/**
 * Quando voltar a tentar depois de `tentativas` feitas (já contando a que acabou de acontecer).
 * null = acabou: não há mais tentativas automáticas, avisa-se o admin.
 */
export function proximaTentativa(tentativas: number, agoraMs = Date.now(), reagendarEmSeg?: number | null): Date | null {
  if (tentativas >= MAX_TENTATIVAS) return null
  if (reagendarEmSeg && reagendarEmSeg > 0) return new Date(agoraMs + reagendarEmSeg * 1000)
  const h = BACKOFF_HORAS[Math.max(0, Math.min(BACKOFF_HORAS.length - 1, tentativas - 1))]
  return new Date(agoraMs + h * 3600_000)
}

// ───────────────────────────── segredos ─────────────────────────────

/** Só os últimos 4 caracteres — é tudo o que o browser alguma vez vê. */
export function ultimos4(chave: string): string {
  const s = chave.trim()
  return s.length <= 4 ? '••••' : s.slice(-4)
}

/** Apaga a chave (e qualquer `pg_ib_…`) de um texto antes de o guardar ou mostrar. */
export function semSegredos(texto: string, chave?: string | null): string {
  let t = texto
  if (chave && chave.length >= 8) t = t.split(chave).join('[chave]')
  return t.replace(/pg_ib_[A-Za-z0-9_\-]+/g, 'pg_ib_[…]').replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [chave]')
}

/** Uma chave plausível? (formato, não validade) */
export function chaveComFormato(chave: string): boolean {
  return /^pg_ib_[A-Za-z0-9_\-]{8,}$/.test(chave.trim())
}

/** Normaliza o par antes de enviar/guardar. Devolve null se não servir. */
export function normalizarPar(email: unknown, uid: unknown): { email: string; uid: string } | null {
  const e = String(email ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null
  // A MESMA regra de UID do broker-gate e do importador (duas regras que se afastam = leads em limbo).
  const v = validarUidBroker(uid)
  if (!v.ok) return null
  return { email: e, uid: v.uid }
}
