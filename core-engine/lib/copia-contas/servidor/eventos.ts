import { db } from './base'

/**
 * EVENTOS / AUDITORIA — o registo unificado: eventos da cópia entre contas (copia_eventos) e do
 * copiador MTM Funded 068 (funded_copy_events), no mesmo formato. Tudo por índice
 * (criado_em desc / rota_id), com limite.
 */

export interface FiltroEventos {
  rotaId?: string | null
  userId?: string | null
  tipo?: string | null
  resultado?: string | null
  desde?: string | null
  ate?: string | null
  sistema?: 'copia_contas' | 'funded_copier' | 'todos' | null
  limite?: number
}

export interface EventoAuditoria {
  sistema: 'copia_contas' | 'funded_copier'
  id: string
  rotaId: string | null
  userId: string | null
  origemPosicao: string
  tipo: string
  simbolo: string | null
  direcao: string | null
  volumeOrigem: number | null
  resultado: string
  acaoPretendida: unknown
  acaoReal: unknown
  latenciaMs: number | null
  erro: string | null
  tentativas: number
  criadoEm: string
  processadoEm: string | null
}

export async function listarEventos(f: FiltroEventos): Promise<{ eventos: EventoAuditoria[]; avisos: string[] }> {
  const limite = Math.min(Math.max(1, f.limite ?? 200), 2000)
  const avisos: string[] = []
  const out: EventoAuditoria[] = []
  const sistema = f.sistema ?? 'todos'

  let rotasDoUser: string[] | null = null
  if (f.userId) {
    const { data } = await db().from('copia_rotas').select('id').eq('user_id', f.userId)
    rotasDoUser = (data ?? []).map((r) => String(r.id))
  }

  if (sistema !== 'funded_copier') {
    let q = db().from('copia_eventos')
      .select('id, rota_id, origem_posicao_id, tipo, payload, resultado, acao_pretendida, acao_real, latencia_ms, erro, tentativas, criado_em, processado_em')
      .order('criado_em', { ascending: false }).limit(limite)
    if (f.rotaId) q = q.eq('rota_id', f.rotaId)
    if (rotasDoUser) q = rotasDoUser.length ? q.in('rota_id', rotasDoUser) : q.eq('rota_id', '00000000-0000-0000-0000-000000000000')
    if (f.tipo) q = q.eq('tipo', f.tipo)
    if (f.resultado === 'pendente') q = q.is('processado_em', null)
    else if (f.resultado) q = q.eq('resultado', f.resultado)
    if (f.desde) q = q.gte('criado_em', f.desde)
    if (f.ate) q = q.lte('criado_em', f.ate)
    const { data, error } = await q
    if (error) avisos.push(/does not exist|schema cache/i.test(error.message) ? 'copia_eventos: migração 078 por aplicar.' : `copia_eventos: ${error.message}`)
    const donos = new Map<string, string>()
    const ids = [...new Set((data ?? []).map((e) => String(e.rota_id)))]
    if (ids.length) {
      const { data: r } = await db().from('copia_rotas').select('id, user_id').in('id', ids)
      for (const x of r ?? []) donos.set(String(x.id), String(x.user_id))
    }
    for (const e of data ?? []) {
      const p = (e.payload ?? {}) as Record<string, unknown>
      out.push({
        sistema: 'copia_contas', id: String(e.id), rotaId: String(e.rota_id), userId: donos.get(String(e.rota_id)) ?? null,
        origemPosicao: String(e.origem_posicao_id), tipo: String(e.tipo), simbolo: (p.symbol as string) ?? null, direcao: (p.direcao as string) ?? null,
        volumeOrigem: p.volume == null ? null : Number(p.volume), resultado: e.processado_em ? String(e.resultado ?? '—') : 'pendente',
        acaoPretendida: e.acao_pretendida, acaoReal: e.acao_real, latenciaMs: e.latencia_ms == null ? null : Number(e.latencia_ms),
        erro: (e.erro as string) ?? null, tentativas: Number(e.tentativas ?? 0), criadoEm: String(e.criado_em), processadoEm: (e.processado_em as string) ?? null,
      })
    }
  }

  if (sistema !== 'copia_contas' && !f.rotaId) {
    let q = db().from('funded_copy_events')
      .select('id, account_id, position_id, tipo, payload, criado_em, processado_em, tentativas, erro')
      .order('id', { ascending: false }).limit(limite)
    if (f.tipo) q = q.eq('tipo', f.tipo)
    if (f.desde) q = q.gte('criado_em', f.desde)
    if (f.ate) q = q.lte('criado_em', f.ate)
    if (f.userId) {
      const { data: contas } = await db().from('funded_copiers').select('account_id').eq('user_id', f.userId)
      const ids = [...new Set((contas ?? []).map((c) => String(c.account_id)))]
      q = ids.length ? q.in('account_id', ids) : q.eq('account_id', '00000000-0000-0000-0000-000000000000')
    }
    const { data, error } = await q
    if (error) avisos.push(`funded_copy_events: ${error.message}`)
    for (const e of data ?? []) {
      const p = (e.payload ?? {}) as Record<string, unknown>
      const erro = (e.erro as string) ?? null
      const resultado = !e.processado_em ? 'pendente' : erro?.startsWith('seco:') ? 'sombra' : erro ? 'erro' : 'ok'
      if (f.resultado && f.resultado !== resultado) continue
      out.push({
        sistema: 'funded_copier', id: String(e.id), rotaId: null, userId: null, origemPosicao: String(e.position_id), tipo: String(e.tipo),
        simbolo: (p.symbol as string) ?? null, direcao: (p.direcao as string) ?? null, volumeOrigem: p.volume == null ? null : Number(p.volume),
        resultado, acaoPretendida: erro?.startsWith('seco:') ? erro.slice(5).trim() : null, acaoReal: null,
        latenciaMs: e.processado_em ? Math.max(0, Date.parse(String(e.processado_em)) - Date.parse(String(e.criado_em))) : null,
        erro: erro?.startsWith('seco:') ? null : erro, tentativas: Number(e.tentativas ?? 0), criadoEm: String(e.criado_em), processadoEm: (e.processado_em as string) ?? null,
      })
    }
  }

  out.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
  return { eventos: out.slice(0, limite), avisos }
}

export const COLUNAS_CSV = ['sistema', 'criadoEm', 'processadoEm', 'rotaId', 'userId', 'origemPosicao', 'tipo', 'simbolo', 'direcao', 'volumeOrigem', 'resultado', 'acaoPretendida', 'acaoReal', 'latenciaMs', 'tentativas', 'erro']

/** Filtros do pedido, validados (ids uuid, datas ISO, listas fechadas). */
export function lerFiltro(req: Request): FiltroEventos {
  const p = new URL(req.url).searchParams
  const uuid = (v: string | null) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null)
  const data = (v: string | null) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null)
  const sistema = p.get('sistema')
  return {
    rotaId: uuid(p.get('rotaId')), userId: uuid(p.get('userId')),
    tipo: ['open', 'modify', 'partial', 'close'].includes(p.get('tipo') ?? '') ? p.get('tipo') : null,
    resultado: ['sombra', 'ok', 'recusado', 'erro', 'saltado', 'pendente'].includes(p.get('resultado') ?? '') ? p.get('resultado') : null,
    desde: data(p.get('desde')), ate: data(p.get('ate')),
    sistema: sistema === 'copia_contas' || sistema === 'funded_copier' ? sistema : 'todos',
    limite: Number(p.get('limite') ?? 200) || 200,
  }
}

