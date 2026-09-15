import { verificarQuotaMetaApi } from '@/lib/contas/quota-metaapi'
import { MAX_FANOUT, pedidoDeModo, validarRota, type ArestaRota } from '../regras'
import { MODOS_LOTE_COPIA, type ModoLoteCopia, type RotaCopia } from '../tipos'
import { db, lerInterruptores } from './base'
import { lerContaPorRef, usaChaveMetaApiDaCasa } from './refs'

/**
 * ROTAS DE CÓPIA ENTRE CONTAS — criar, editar, aprovar, pausar, apagar. As regras vivem em
 * ../regras (e na base, trigger copia_rotas_guarda). Aqui só se lê, valida e escreve.
 *
 * Nesta entrega nenhuma rota fica em live: `pedidoDeModo` recusa sem o desbloqueio da instalação,
 * e a base recusa outra vez.
 */

const COLUNAS = 'id, user_id, origem_tipo, origem_ref, origem_chave, destino_tipo, destino_ref, destino_chave, rotulo, modo_lote, valor, mapa_simbolos, filtro_simbolos, filtro_direcao, lote_max, max_abertas, copiar_sl, copiar_tp, copiar_parciais, copiar_modificacoes, fechar_com_origem, ativa, modo, estado, pedido_pelo_cliente, notas, aprovada_por, aprovada_em, pausada_motivo, created_at, updated_at'

export interface ConfigRota {
  rotulo?: string | null
  modo_lote?: ModoLoteCopia
  valor?: number
  mapa_simbolos?: Record<string, string>
  filtro_simbolos?: string[]
  filtro_direcao?: 'ambas' | 'buy' | 'sell'
  lote_max?: number | null
  max_abertas?: number | null
  copiar_sl?: boolean
  copiar_tp?: boolean
  copiar_parciais?: boolean
  copiar_modificacoes?: boolean
  fechar_com_origem?: boolean
  notas?: string | null
}

type Erro = { ok: false; status: number; erro: string }

/** Normaliza e valida a configuração vinda do ecrã (nunca confia no cliente). */
export function lerConfig(corpo: Record<string, unknown>): { ok: true; config: ConfigRota } | Erro {
  const c: ConfigRota = {}
  const num = (v: unknown) => (v == null || v === '' ? null : Number(v))
  if (corpo.rotulo !== undefined) c.rotulo = String(corpo.rotulo ?? '').trim().slice(0, 80) || null
  if (corpo.modo_lote !== undefined) {
    if (!MODOS_LOTE_COPIA.includes(corpo.modo_lote as ModoLoteCopia)) return { ok: false, status: 400, erro: 'modo de lote inválido' }
    c.modo_lote = corpo.modo_lote as ModoLoteCopia
  }
  if (corpo.valor !== undefined) {
    const v = Number(corpo.valor)
    if (!(v > 0 && v <= 100)) return { ok: false, status: 400, erro: 'valor do lote inválido (0–100)' }
    c.valor = v
  }
  const modo = c.modo_lote
  if (modo === 'risco_pct' && c.valor != null && c.valor > 10) return { ok: false, status: 400, erro: 'risco % acima de 10' }
  if (corpo.mapa_simbolos !== undefined) {
    const m = corpo.mapa_simbolos && typeof corpo.mapa_simbolos === 'object' ? (corpo.mapa_simbolos as Record<string, unknown>) : {}
    const limpo: Record<string, string> = {}
    for (const [k, v] of Object.entries(m).slice(0, 100)) {
      const a = String(k).trim().toUpperCase()
      const b = String(v ?? '').trim()
      if (/^[A-Z0-9._#+\-/]{2,24}$/.test(a) && /^[A-Za-z0-9._#+\-/]{1,32}$/.test(b)) limpo[a] = b
    }
    c.mapa_simbolos = limpo
  }
  if (corpo.filtro_simbolos !== undefined) {
    const lista = Array.isArray(corpo.filtro_simbolos) ? corpo.filtro_simbolos : String(corpo.filtro_simbolos ?? '').split(/[\s,;]+/)
    c.filtro_simbolos = [...new Set(lista.map((s) => String(s).trim().toUpperCase()).filter((s) => /^[A-Z0-9._#+\-]{2,24}$/.test(s)))].slice(0, 100)
  }
  if (corpo.filtro_direcao !== undefined) {
    if (!['ambas', 'buy', 'sell'].includes(String(corpo.filtro_direcao))) return { ok: false, status: 400, erro: 'direcção inválida' }
    c.filtro_direcao = corpo.filtro_direcao as ConfigRota['filtro_direcao']
  }
  if (corpo.lote_max !== undefined) {
    const v = num(corpo.lote_max)
    if (v != null && !(v > 0 && v <= 100)) return { ok: false, status: 400, erro: 'lote máximo inválido' }
    c.lote_max = v
  }
  if (corpo.max_abertas !== undefined) {
    const v = num(corpo.max_abertas)
    if (v != null && !(Number.isInteger(v) && v > 0 && v <= 200)) return { ok: false, status: 400, erro: 'máximo de posições inválido' }
    c.max_abertas = v
  }
  for (const k of ['copiar_sl', 'copiar_tp', 'copiar_parciais', 'copiar_modificacoes', 'fechar_com_origem'] as const) {
    if (corpo[k] !== undefined) c[k] = corpo[k] === true
  }
  if (corpo.notas !== undefined) c.notas = String(corpo.notas ?? '').slice(0, 500) || null
  return { ok: true, config: c }
}

async function arestas(): Promise<ArestaRota[]> {
  const { data } = await db().from('copia_rotas').select('id, origem_chave, destino_chave, estado').neq('estado', 'recusada')
  return (data ?? []) as ArestaRota[]
}

export async function listarRotas(filtro: { userId?: string | null; estado?: string | null } = {}): Promise<{ rotas: RotaCopia[]; legado: Record<string, unknown>[] }> {
  let q = db().from('copia_rotas').select(COLUNAS).order('created_at', { ascending: false }).limit(500)
  if (filtro.userId) q = q.eq('user_id', filtro.userId)
  if (filtro.estado) q = q.eq('estado', filtro.estado)
  let l = db().from('funded_copiers').select('id, user_id, account_id, destino_tipo, destino_id, modo_lote, valor, lote_max, max_posicoes, copiar_sl, copiar_tp, simbolos, ativo, pausado_motivo, created_at').order('created_at', { ascending: false }).limit(200)
  if (filtro.userId) l = l.eq('user_id', filtro.userId)
  const [{ data, error }, { data: legado }] = await Promise.all([q, l])
  if (error) throw new Error(/relation .* does not exist|schema cache/i.test(error.message) ? 'Migração 078 por aplicar (copia_rotas não existe).' : error.message)
  return { rotas: (data ?? []) as unknown as RotaCopia[], legado: (legado ?? []) as Record<string, unknown>[] }
}

export async function criarRota(p: {
  origemRef: string
  destinoRef: string
  config: ConfigRota
  criadoPor: string
  pedidoPeloCliente: boolean
  /** só o cliente: o dono tem de ser ele */
  exigirDono?: string
}): Promise<{ ok: true; rota: RotaCopia } | Erro> {
  const [origem, destino] = await Promise.all([lerContaPorRef(p.origemRef), lerContaPorRef(p.destinoRef)])
  if (!origem || !destino) return { ok: false, status: 404, erro: 'Conta de origem ou de destino não encontrada.' }
  if (p.exigirDono && (origem.userId !== p.exigirDono || destino.userId !== p.exigirDono)) return { ok: false, status: 403, erro: 'Só podes copiar entre contas tuas.' }
  const v = validarRota(origem, destino, await arestas())
  if (!v.ok) return { ok: false, status: v.erro === 'fanout' || v.erro === 'ciclo' || v.erro === 'duplicada' ? 409 : 400, erro: v.mensagem }

  // Custo MetaApi: uma origem MT4/MT5 precisa de streaming (conta ligada 24 h) e um destino MT recebe
  // ordens — ambas têm de caber na quota do dono. Não se cria conta nova aqui; recusa-se se o dono
  // já está ACIMA do limite (as contas dele continuam, só não ganham trabalho novo).
  for (const c of [origem, destino]) {
    if ((c.plataforma === 'mt4' || c.plataforma === 'mt5') && !c.metaapiAccountId) {
      return { ok: false, status: 400, erro: 'A conta MetaTrader ainda não está ligada à MetaApi.' }
    }
    if (!(await usaChaveMetaApiDaCasa(c))) return { ok: false, status: 400, erro: 'Conta de uma equipa MTM Auto (outra chave MetaApi): ainda não entra na cópia entre contas.' }
  }
  if ([origem, destino].some((c) => c.plataforma === 'mt4' || c.plataforma === 'mt5')) {
    const q = await verificarQuotaMetaApi(origem.userId)
    if (q.estado.acimaDoLimite) return { ok: false, status: 402, erro: `O dono está acima da quota MetaApi (${q.estado.emUso}/${q.estado.limite}). Resolve a quota antes de criar cópias.` }
  }

  const linha = {
    user_id: origem.userId,
    origem_tipo: origem.plataforma, origem_ref: origem.ref, origem_chave: v.origemChave,
    destino_tipo: destino.plataforma, destino_ref: destino.ref, destino_chave: v.destinoChave,
    modo_lote: 'multiplicador', valor: 1,
    ...p.config,
    ativa: false, modo: 'shadow', estado: p.pedidoPeloCliente ? 'pedido' : 'aprovada',
    pedido_pelo_cliente: p.pedidoPeloCliente, created_by: p.criadoPor,
    ...(p.pedidoPeloCliente ? {} : { aprovada_por: p.criadoPor, aprovada_em: new Date().toISOString() }),
  }
  const { data, error } = await db().from('copia_rotas').insert(linha).select(COLUNAS).single()
  if (error) return { ok: false, status: /copia_rotas:/.test(error.message) || error.code === '23505' ? 409 : 500, erro: error.message.replace(/^.*copia_rotas: /, '') }
  return { ok: true, rota: data as unknown as RotaCopia }
}

export type AcaoRota = 'editar' | 'aprovar' | 'recusar' | 'ativar' | 'pausar' | 'modo'

export async function alterarRota(id: string, acao: AcaoRota, corpo: Record<string, unknown>, adminId: string): Promise<{ ok: true; rota: RotaCopia } | Erro> {
  const { data: atual } = await db().from('copia_rotas').select(COLUNAS).eq('id', id).maybeSingle()
  if (!atual) return { ok: false, status: 404, erro: 'Rota não encontrada.' }
  const rota = atual as unknown as RotaCopia
  let patch: Record<string, unknown> = {}
  switch (acao) {
    case 'editar': {
      const c = lerConfig(corpo)
      if (!c.ok) return c
      patch = { ...c.config }
      break
    }
    case 'aprovar':
      if (rota.estado === 'aprovada') return { ok: true, rota }
      patch = { estado: 'aprovada', aprovada_por: adminId, aprovada_em: new Date().toISOString() }
      break
    case 'recusar':
      patch = { estado: 'recusada', ativa: false, modo: 'shadow', notas: String(corpo.motivo ?? rota.notas ?? '').slice(0, 500) || null }
      break
    case 'ativar':
      if (rota.estado !== 'aprovada') return { ok: false, status: 409, erro: 'Aprova a rota antes de a activar.' }
      patch = { ativa: true, pausada_motivo: null }
      break
    case 'pausar':
      patch = { ativa: false, pausada_motivo: String(corpo.motivo ?? 'pausada pelo admin').slice(0, 200) }
      break
    case 'modo': {
      const s = await lerInterruptores()
      const d = pedidoDeModo({ modo: corpo.modo as 'shadow' | 'live', confirmacao: corpo.confirmacao as string | undefined }, rota, s.liveDesbloqueado)
      if (!d.ok) return d
      patch = { modo: corpo.modo }
      break
    }
    default:
      return { ok: false, status: 400, erro: 'acção inválida' }
  }
  const { data, error } = await db().from('copia_rotas').update(patch).eq('id', id).select(COLUNAS).single()
  if (error) return { ok: false, status: /copia_rotas:/.test(error.message) ? 409 : 500, erro: error.message.replace(/^.*copia_rotas: /, '') }
  return { ok: true, rota: data as unknown as RotaCopia }
}

export async function apagarRota(id: string): Promise<{ ok: true } | Erro> {
  // Com cópias abertas não se apaga: perdia-se a ponte e as saídas deixavam de chegar ao destino.
  const { count } = await db().from('copia_posicoes').select('id', { count: 'exact', head: true }).eq('rota_id', id).in('estado', ['enviando', 'aberta'])
  if ((count ?? 0) > 0) return { ok: false, status: 409, erro: `A rota tem ${count} cópia(s) abertas no destino — pausa-a e espera que fechem.` }
  const { error } = await db().from('copia_rotas').delete().eq('id', id)
  return error ? { ok: false, status: 500, erro: error.message } : { ok: true }
}

export { MAX_FANOUT }
