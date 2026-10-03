/**
 * REGISTO DE CONTAS INEXISTENTES da MetaApi (incidente 2026-09-15 ~16:30 UTC).
 *
 * A MetaApi estrangulou o token INTEIRO com «TooManyRequestsError: It seems like you are trying
 * to access too many unexisting or undeployed trading accounts». Não era falta de créditos: eram
 * leituras de fundo (monitores, métricas, admin) a pedir contas apagadas — cada pedido um
 * NotFoundError — e o castigo caiu em cima das ORDENS dos clientes (ws:trade falhou em 3 contas).
 *
 * Regra:
 *  - Contas apagadas conhecidas vivem em `CONTAS_METAAPI_APAGADAS` (sem base de dados).
 *  - Um NotFoundError numa chamada AO NÍVEL DA CONTA (getAccount, provisioning GET, REST da conta)
 *    marca a conta durante 24 h: memória + linha em `metaapi_simbolos_cache`
 *    (`metaapi_quota_api='nao_existe'`, `metaapi_quota_bloqueio_ate=agora+24h`). A mesma linha faz
 *    o travão de quota saltar as leituras de fundo dessa conta, e o MTM Auto lê o mesmo registo.
 *  - Quem vai à MetaApi pergunta `contaInexistente(id)` antes: leituras saltam; ordens registam um
 *    erro claro e NÃO tentam (tentar outra vez é exatamente o que nos estrangula).
 *  - Nunca se marca por «position/order/symbol not found» — só erros da conta.
 *
 * Sem imports `node:` — este módulo entra na cadeia de metaapi.ts, que páginas cliente importam.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const MOTIVO_NAO_EXISTE = 'nao_existe'
export const DURACAO_INEXISTENTE_MS = 24 * 60 * 60_000
const RELER_MS = 60_000
const ESCRITA_MIN_MS = 60_000

/**
 * Contas que JÁ NÃO EXISTEM na MetaApi (lista do token principal a 2026-09-15 17:15 UTC).
 * Nunca voltam: um id da MetaApi apagado não é reutilizado. Conta nova = id novo.
 */
export const CONTAS_METAAPI_APAGADAS: ReadonlySet<string> = new Set([
  // mtmcopy_connections inativas
  '128fabf2-c894-45ed-a6b2-258b3bd274e1',
  '2f2bdf0d-ab60-434c-a6f7-6dcc2abef1bf',
  '9e224f09-3f58-45de-98de-c13c6e94656f',
  'a54832a6-7aeb-48f3-ab7e-8ecf4cdc305a',
  'bd421604-2c44-4b31-bfa0-e7ef20c53fc3',
  // mtmauto_providers inativo (Gold Did Premium)
  '9dfb4df3-112d-4c7b-8d7d-b8cf97ca6fa6',
  // mtmauto_accounts ATIVA a apontar para uma conta que já não existe (Alcy Landim, 26421512):
  // 404 confirmado a 2026-09-23, e com rota de cópia viva a bater-lhe à porta a cada sinal. É este
  // padrão — pedidos repetidos a contas apagadas — que estrangulou o token inteiro a 15/09.
  'f6ac75f0-0c74-4ab2-8629-6c68d1e7e77d',
  // constantes antigas do código
  '0f38257a-ba12-4f6c-b20c-9139693b3674', // Copy Trader Ricardo Garcia (su0a)
  'a4ea0c45-3dd1-4b55-bd2a-7f44d8d6884b', // Aurum Flow (vT8w)
  'a5a1dddd-0099-4d67-98f1-86b65aad5845', // Sensei antigo
  'bddad3b8-353f-4a19-badf-f8df8f532678', // GoldKiller antigo
  'dc588b39-1f0a-47a5-8985-28e6fbc98817', // Monaxa booster
  'fbeeafeb-96a9-4133-bc6c-194cc281b6e0', // Trade Ideas / Forex antigo
  // Também ausentes da lista de 15/09, encontradas no código:
  '6014b4fc-3ed3-458a-8cea-7099cf29b51f', // espelho T2T por defeito (signal-tracker, pips-proof) — definir METAAPI_T2T_MIRROR_ACCOUNT_ID
  '16f4f233-5cbe-4fe9-9530-89a58965bfe0', // conta Sensei 34744071 (reformada, estratégia removida 14/09)
  '6de59846-40e3-48d8-b908-1a8bda54d19a', // add-rg-slave (cascade RG antiga)
])

// ── regras puras ────────────────────────────────────────────────────────────────────────────────

function textoDoErro(err: unknown): string {
  if (err == null) return ''
  if (typeof err === 'string') return err
  const e = err as { message?: unknown; name?: unknown; error?: unknown }
  return `${String(e.name ?? '')} ${String(e.error ?? '')} ${String(e.message ?? '')}`
}

/**
 * O erro diz que a CONTA não existe?
 * `nivelConta=true` quando a chamada era sobre a conta em si (getAccount, GET /accounts/:id):
 * aí qualquer 404/NotFoundError é da conta. Nas outras exige-se que a mensagem fale da conta —
 * «Specified symbol not found» ou «position not found» não apagam ninguém.
 */
export function ehErroContaInexistente(err: unknown, nivelConta = false): boolean {
  if (!err) return false
  const e = err as { status?: unknown; statusCode?: unknown; name?: unknown; error?: unknown }
  const txt = textoDoErro(err)
  const notFound =
    e.status === 404 || e.statusCode === 404 ||
    String(e.name ?? '') === 'NotFoundError' || String(e.error ?? '') === 'NotFoundError' ||
    /NotFoundError|HTTP 404|not found/i.test(txt)
  if (!notFound) return false
  // Conta pedida na região errada também responde 404 — a conta existe, só está noutro lado.
  if (/region/i.test(txt)) return false
  if (/symbol|position|order|deal|strategy|subscriber/i.test(txt) && !/account/i.test(txt)) return false
  if (nivelConta) return true
  return /(trading )?account[^.]*not found|NotFoundError[^.]*account/i.test(txt)
}

/** O estrangulamento de 15/09: «too many unexisting or undeployed trading accounts». */
export function ehErroContasInexistentesEmExcesso(err: unknown): boolean {
  return /unexisting or undeployed|too many unexisting/i.test(textoDoErro(err))
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/** Ids de conta que o erro traga (mensagem ou metadata), para os logs. */
export function idsDeContaNoErro(err: unknown): string[] {
  const partes: string[] = [textoDoErro(err)]
  try {
    const meta = (err as { metadata?: unknown; details?: unknown } | null)
    if (meta?.metadata) partes.push(JSON.stringify(meta.metadata))
    if (meta?.details) partes.push(JSON.stringify(meta.details))
  } catch { /* ignore */ }
  return [...new Set(partes.join(' ').match(UUID) ?? [])].map((s) => s.toLowerCase())
}

/** Erro lançado quando se recusa ir à MetaApi por a conta estar marcada como inexistente. */
export class ContaInexistenteError extends Error {
  readonly accountId: string
  constructor(accountId: string) {
    super(`Conta MetaApi ${accountId} não existe (apagada/404) — pedido não enviado para não estrangular o token`)
    this.name = 'ContaInexistenteError'
    this.accountId = accountId
  }
}

// ── loja (trocável nos testes) ──────────────────────────────────────────────────────────────────

export interface LojaInexistentes {
  /** Das contas pedidas, as marcadas (epoch ms até quando). */
  ler(ids: string[]): Promise<Map<string, number>>
  marcar(id: string, ateMs: number, motivo: string): Promise<void>
}

export const lojaInexistentesSupabase: LojaInexistentes = {
  async ler(ids) {
    const m = new Map<string, number>()
    if (ids.length === 0) return m
    const { data, error } = await getSupabaseAdmin()
      .from('metaapi_simbolos_cache')
      .select('account_id, metaapi_quota_bloqueio_ate')
      .in('account_id', ids)
      .eq('metaapi_quota_api', MOTIVO_NAO_EXISTE)
    if (error) throw new Error(error.message)
    for (const r of data ?? []) {
      const t = Date.parse(String(r.metaapi_quota_bloqueio_ate ?? ''))
      if (Number.isFinite(t)) m.set(String(r.account_id), t)
    }
    return m
  },
  async marcar(id, ateMs, motivo) {
    const { error } = await getSupabaseAdmin()
      .from('metaapi_simbolos_cache')
      .upsert(
        {
          account_id: id,
          metaapi_quota_bloqueio_ate: new Date(ateMs).toISOString(),
          metaapi_quota_api: MOTIVO_NAO_EXISTE,
          metaapi_quota_motivo: `${MOTIVO_NAO_EXISTE}: ${motivo}`.slice(0, 300),
        },
        { onConflict: 'account_id' },
      )
    if (error) throw new Error(error.message)
  },
}

let lojaAtual: LojaInexistentes = lojaInexistentesSupabase
export function __definirLojaInexistentes(l: LojaInexistentes | null): void {
  lojaAtual = l ?? lojaInexistentesSupabase
}

// ── estado ──────────────────────────────────────────────────────────────────────────────────────

const marcadasLocais = new Map<string, number>()
const lidas = new Map<string, { ate: number | null; lidoEm: number }>()
const ultimaEscrita = new Map<string, number>()

const norm = (id: string | null | undefined) => String(id ?? '').trim().toLowerCase()

/** Síncrono, sem base: lista estática + marcações desta instância. */
export function contaMarcadaInexistente(accountId: string | null | undefined, agoraMs = Date.now()): boolean {
  const id = norm(accountId)
  if (!id) return false
  if (CONTAS_METAAPI_APAGADAS.has(id)) return true
  return (marcadasLocais.get(id) ?? 0) > agoraMs
}

/** A conta está marcada como inexistente? Memória → tabela (relida no máx. 1×/min por conta). Falha a ler = não. */
export async function contaInexistente(accountId: string | null | undefined, agoraMs = Date.now()): Promise<boolean> {
  const id = norm(accountId)
  if (!id) return false
  if (contaMarcadaInexistente(id, agoraMs)) return true
  const lido = lidas.get(id)
  if (lido && agoraMs - lido.lidoEm < RELER_MS) return lido.ate != null && lido.ate > agoraMs
  let ate: number | null = null
  try {
    ate = (await lojaAtual.ler([id])).get(id) ?? null
  } catch {
    ate = null
  }
  lidas.set(id, { ate, lidoEm: agoraMs })
  if (ate != null && ate > agoraMs) marcadasLocais.set(id, ate)
  return ate != null && ate > agoraMs
}

/** Das contas pedidas, só as que NÃO estão marcadas. Uma leitura à base para as que faltam. */
export async function filtrarContasExistentes<T extends string | null | undefined>(ids: T[], agoraMs = Date.now()): Promise<string[]> {
  const unicos = [...new Set(ids.map((i) => norm(i)).filter(Boolean))]
  const porLer = unicos.filter((id) => {
    if (contaMarcadaInexistente(id, agoraMs)) return false
    const l = lidas.get(id)
    return !(l && agoraMs - l.lidoEm < RELER_MS)
  })
  if (porLer.length) {
    let m = new Map<string, number>()
    let falhou = false
    try { m = await lojaAtual.ler(porLer) } catch { falhou = true }
    for (const id of porLer) {
      const ate = falhou ? null : (m.get(id) ?? null)
      lidas.set(id, { ate, lidoEm: agoraMs })
      if (ate != null && ate > agoraMs) marcadasLocais.set(id, ate)
    }
  }
  // Devolve com a grafia original (os ids da base às vezes vêm em maiúsculas).
  const vivos = new Set(unicos.filter((id) => {
    if (contaMarcadaInexistente(id, agoraMs)) return false
    const l = lidas.get(id)
    return !(l?.ate != null && l.ate > agoraMs)
  }))
  return [...new Set(ids.filter((i): i is NonNullable<T> => Boolean(i) && vivos.has(norm(i))).map(String))]
}

/**
 * Regista que a conta não existe (24 h). Nunca lança. Escreve na tabela no máx. 1×/min por conta.
 * Devolve true se marcou (o erro era mesmo de conta inexistente).
 */
export async function marcarContaInexistente(
  accountId: string | null | undefined,
  err: unknown,
  opts?: { nivelConta?: boolean; agoraMs?: number; origem?: string },
): Promise<boolean> {
  const id = norm(accountId)
  if (!id || !ehErroContaInexistente(err, opts?.nivelConta ?? false)) return false
  const agora = opts?.agoraMs ?? Date.now()
  const ate = agora + DURACAO_INEXISTENTE_MS
  marcadasLocais.set(id, Math.max(marcadasLocais.get(id) ?? 0, ate))
  lidas.set(id, { ate, lidoEm: agora })
  if (agora - (ultimaEscrita.get(id) ?? 0) < ESCRITA_MIN_MS) return true
  ultimaEscrita.set(id, agora)
  const motivo = textoDoErro(err).trim().slice(0, 250)
  console.error(
    `[conta-inexistente] ${id} não existe na MetaApi (${opts?.origem ?? '?'}) — fica fora de leituras e ordens durante 24 h:`,
    motivo,
  )
  try {
    await lojaAtual.marcar(id, ate, motivo)
  } catch (e) {
    console.warn('[conta-inexistente] não gravou a marca:', e instanceof Error ? e.message : String(e))
  }
  return true
}

/** Log único e claro quando um caminho de ORDEM encontra uma conta marcada. */
const avisadas = new Map<string, number>()
export function avisarOrdemParaContaInexistente(accountId: string, contexto: string, agoraMs = Date.now()): void {
  const id = norm(accountId)
  if (agoraMs - (avisadas.get(id) ?? 0) < ESCRITA_MIN_MS) return
  avisadas.set(id, agoraMs)
  console.error(`[conta-inexistente] ${id} não existe na MetaApi — ${contexto} não enviado (sem novas tentativas). Desligar/repor a ligação no admin.`)
}

/** Só para testes. */
export function __limparInexistentes(): void {
  marcadasLocais.clear()
  lidas.clear()
  ultimaEscrita.clear()
  avisadas.clear()
}
