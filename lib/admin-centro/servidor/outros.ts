import { emCache } from '../cache'
import { MOTIVOS_DIREITO, percentil } from '../regras'
import { appMemberSemAcessoMtmAuto, decidirDireitoMtmAuto } from '@/lib/entitlements'
import { carregarContas } from './contas'
import { carregarEstrategias } from './estrategias'
import { carregarInfra } from './infra'
import { db, ehUuid, ler, num, txt, type Linha } from './base'

// ── CÓPIA ───────────────────────────────────────────────────────────────────────────────────────

/** KPIs da cópia entre contas (a gestão das rotas reutiliza /api/admin/mtmauto-copia/rotas). */
export async function carregarCopia() {
  return (await emCache('centro:copia', 20_000, async () => {
    const desde = new Date(Date.now() - 86_400_000).toISOString()
    const [infra, ev, legado] = await Promise.all([
      carregarInfra(),
      ler(db().from('copia_eventos').select('resultado, latencia_ms, acao_pretendida, acao_real, criado_em').gte('criado_em', desde).order('criado_em', { ascending: false }).limit(1000)),
      ler(db().from('funded_copiers').select('ativo').limit(500)),
    ])
    const porResultado: Record<string, number> = {}
    for (const e of ev.linhas) porResultado[String(e.resultado ?? 'pendente')] = (porResultado[String(e.resultado ?? 'pendente')] ?? 0) + 1
    const lat = ev.linhas.map((e) => num(e.latencia_ms)).filter((x): x is number => x != null)
    const comReal = ev.linhas.filter((e) => e.acao_real != null).length
    return {
      ...infra.copia,
      eventos24h: ev.linhas.length,
      porResultado,
      pretendidasVsReais: { pretendidas: ev.linhas.filter((e) => e.acao_pretendida != null).length, reais: comReal },
      latenciaP50Ms: percentil(lat, 0.5), latenciaP95Ms: percentil(lat, 0.95),
      legado: { copiadores: legado.linhas.length, ativos: legado.linhas.filter((l) => l.ativo === true).length, pendente: legado.semTabela },
      lidaEm: new Date().toISOString(),
    }
  })).v
}

// ── UTILIZADORES ────────────────────────────────────────────────────────────────────────────────

export interface UtilizadorCentro {
  id: string
  email: string | null
  nome: string | null
  tipo: string | null
  categoria: string | null
  motivo: string
  temMtmAuto: boolean
  legadoMtmCopy: { ativo: boolean; expira: string | null }
  mtmauto: { subscricao: string | null; apple: string | null; manual: boolean; isento: boolean; suspenso: boolean; equipa: string | null } | null
  contas: number
  contasMetaApi: number
  quotaLimite: number | null
  quotaAcima: boolean
  t2t: { ligacoes: number; fontes: string[]; risco: string | null }
  ultimoLogin: string | null
}

export async function carregarUtilizadores() {
  return (await emCache('centro:utilizadores', 30_000, async () => {
    const [perfis, autos, t2t, contas, tenants] = await Promise.all([
      ler(db().from('profiles').select('id, email, full_name, user_type, member_category, subscription_plan, membership_level, is_active, subscription_status, subscription_expires_at, mtmcopy_subscription_active, mtmcopy_subscription_expires_at, last_login').limit(5000)),
      ler(db().from('mtmauto_users').select('user_id, papel, subscricao, isento, motivo_isencao, acesso_manual, acesso_ate, suspenso, apple_estado, apple_expira_em, tenant_id').limit(5000)),
      ler(db().from('mtmcopy_connections').select('user_id, t2t_enabled, purpose, t2t_sources, t2t_risk_level').neq('mt5_status', 'disconnected').limit(3000)),
      carregarContas(),
      ler(db().from('mtmauto_tenants').select('id, nome').limit(200)),
    ])
    const semMembro = appMemberSemAcessoMtmAuto()
    const autoDe = new Map(autos.linhas.map((a) => [String(a.user_id), a]))
    const equipa = new Map(tenants.linhas.map((t) => [String(t.id), String(t.nome ?? '')]))
    const contasDe = new Map<string, typeof contas.contas>()
    for (const c of contas.contas) if (c.userId) contasDe.set(c.userId, [...(contasDe.get(c.userId) ?? []), c])
    const t2tDe = new Map<string, Linha[]>()
    for (const l of t2t.linhas) if (l.purpose === 'tap_to_trade' || l.t2t_enabled === true) t2tDe.set(String(l.user_id), [...(t2tDe.get(String(l.user_id)) ?? []), l])

    // utilizadores = perfis + quem só existe no MTM Auto
    const ids = new Set<string>([...perfis.linhas.map((p) => String(p.id)), ...autos.linhas.map((a) => String(a.user_id))])
    const perfilDe = new Map(perfis.linhas.map((p) => [String(p.id), p]))
    const utilizadores: UtilizadorCentro[] = [...ids].map((id) => {
      const p = perfilDe.get(id) ?? null
      const a = autoDe.get(id) ?? null
      const d = decidirDireitoMtmAuto(p as never, a as never, { appMemberSemAcesso: semMembro })
      const cs = contasDe.get(id) ?? []
      const t = t2tDe.get(id) ?? []
      const q = cs.find((c) => c.contaMetaApi)?.quota ?? cs[0]?.quota
      return {
        id, email: txt(p?.email), nome: txt(p?.full_name), tipo: txt(p?.user_type), categoria: txt(p?.member_category),
        motivo: d.motivo, temMtmAuto: d.tem,
        legadoMtmCopy: { ativo: p?.mtmcopy_subscription_active === true, expira: txt(p?.mtmcopy_subscription_expires_at) },
        mtmauto: a ? { subscricao: txt(a.subscricao), apple: txt(a.apple_estado), manual: a.acesso_manual === true, isento: a.isento === true, suspenso: a.suspenso === true, equipa: a.tenant_id ? equipa.get(String(a.tenant_id)) ?? 'equipa' : null } : null,
        contas: cs.length, contasMetaApi: q?.emUso ?? 0, quotaLimite: q?.limite ?? null, quotaAcima: q?.acima ?? false,
        t2t: { ligacoes: t.length, fontes: [...new Set(t.flatMap((l) => (Array.isArray(l.t2t_sources) ? (l.t2t_sources as unknown[]).map(String) : [])))], risco: txt(t[0]?.t2t_risk_level) },
        ultimoLogin: txt(p?.last_login),
      }
    })
    const matriz = MOTIVOS_DIREITO.map((m) => ({ ...m, total: utilizadores.filter((u) => u.motivo === m.motivo).length, comContas: utilizadores.filter((u) => u.motivo === m.motivo && u.contas > 0).length }))
    // «membro sem acesso» = tem contas ligadas mas não tem direito (a cópia automática não corre para ele)
    const semAcessoComContas = utilizadores.filter((u) => !u.temMtmAuto && u.contas > 0).length
    const legadoPagantes = utilizadores.filter((u) => u.legadoMtmCopy.ativo).length
    return {
      utilizadores: utilizadores.sort((x, y) => y.contas - x.contas || String(x.email).localeCompare(String(y.email))),
      matriz, semAcessoComContas, legadoPagantes, acimaDaQuota: utilizadores.filter((u) => u.quotaAcima).length,
      lidaEm: new Date().toISOString(),
    }
  })).v
}

// ── MTM FUNDED ──────────────────────────────────────────────────────────────────────────────────

export async function carregarFunded() {
  return (await emCache('centro:funded', 30_000, async () => {
    const [programas, contas] = await Promise.all([
      ler(db().from('mtm_funded_programs').select('id, slug, nome, fases, saldo, preco_cents, moeda, ativo, ordem').order('ordem', { ascending: true }).limit(100)),
      carregarContas(),
    ])
    const funded = contas.contas.filter((c) => c.origem === 'funded')
    // As mestres de estratégia (116) são contas da casa: entram na soma da casa, nunca como clientes.
    const casa = funded.filter((c) => c.categoria === 'casa' || c.mestreDe)
    const porEstado: Record<string, number> = {}
    for (const c of funded) porEstado[c.estado] = (porEstado[c.estado] ?? 0) + 1
    const colunaCasa = !contas.avisos.some((a) => /conta_casa/.test(a))
    return {
      programas: programas.linhas,
      contas: funded,
      porEstado,
      seguidoras: funded.filter((c) => c.categoria === 'seguidora').length,
      mestres: funded.filter((c) => c.mestreDe).map((c) => ({ login: c.login, rotulo: c.mestreDe!.rotulo, modo: c.mestreDe!.modo })),
      clientes: funded.filter((c) => c.categoria === 'cliente').length,
      equidadeCasa: {
        pendente: casa.length === 0,
        contas: casa.length,
        saldo: casa.reduce((a, c) => a + (c.saldo ?? 0), 0),
        equity: casa.reduce((a, c) => a + (c.equity ?? c.saldo ?? 0), 0),
        nota: casa.length ? 'Soma nominal das contas da casa (conta_casa e reais da casa, 109) — a contribuição oficial está no painel de equidade.' : colunaCasa ? 'Sem contas marcadas como conta_casa (ramo estrategias-primeverse, migração «contas da casa»).' : 'Coluna conta_casa por aplicar.',
      },
      lidaEm: new Date().toISOString(),
    }
  })).v
}

// ── AUDITORIA ───────────────────────────────────────────────────────────────────────────────────

export const TABELA_AUDITORIA = 'admin_centro_auditoria'

export async function registarAuditoria(e: { adminId: string; acao: string; alvo?: string | null; pedido?: unknown; resultado?: unknown; ok: boolean }): Promise<boolean> {
  const r = await ler(db().from(TABELA_AUDITORIA).insert({
    admin_id: e.adminId, acao: e.acao.slice(0, 80), alvo: e.alvo?.slice(0, 200) ?? null,
    pedido: e.pedido ?? {}, resultado: e.resultado ?? null, ok: e.ok,
  }))
  if (r.semTabela || r.erro) {
    // Sem a 095 aplicada, a auditoria fica nos logs da Vercel (nunca bloqueia a acção).
    console.warn('[admin-centro] auditoria (sem tabela):', JSON.stringify({ ...e, pedido: undefined }).slice(0, 500))
    return false
  }
  return true
}

export async function lerAuditoria(limite = 150) {
  const [centro, funded] = await Promise.all([
    ler(db().from(TABELA_AUDITORIA).select('id, admin_id, acao, alvo, pedido, resultado, ok, criado_em').order('criado_em', { ascending: false }).limit(limite)),
    ler(db().from('mtm_funded_admin_audit').select('id, account_id, admin_email, accao, motivo, estado, criado_em').order('criado_em', { ascending: false }).limit(limite)),
  ])
  const ids = [...new Set(centro.linhas.map((l) => String(l.admin_id)).filter(ehUuid))]
  const emails = new Map<string, string | null>()
  if (ids.length) {
    const p = await ler(db().from('profiles').select('id, email').in('id', ids.slice(0, 200)))
    for (const l of p.linhas) emails.set(String(l.id), txt(l.email))
  }
  const linhas = [
    ...centro.linhas.map((l) => ({ origem: 'centro' as const, id: String(l.id), quem: emails.get(String(l.admin_id)) ?? String(l.admin_id).slice(0, 8), acao: String(l.acao), alvo: txt(l.alvo), ok: l.ok === true, detalhe: l.resultado ?? null, em: String(l.criado_em) })),
    ...funded.linhas.map((l) => ({ origem: 'mtmfunded' as const, id: String(l.id), quem: txt(l.admin_email) ?? '—', acao: String(l.accao), alvo: `funded:${l.account_id}`, ok: l.estado === 'ok', detalhe: l.motivo ?? null, em: String(l.criado_em) })),
  ].sort((a, b) => b.em.localeCompare(a.em)).slice(0, limite)
  return { linhas, centroPendente: centro.semTabela, fundedPendente: funded.semTabela }
}

// ── PESQUISA (paleta de comandos) ───────────────────────────────────────────────────────────────

export async function pesquisar(q: string) {
  const termo = q.trim().toLowerCase()
  if (termo.length < 2) return { resultados: [] }
  const [contas, utilizadores, estrategias] = await Promise.all([carregarContas(), carregarUtilizadores(), carregarEstrategias()])
  const tem = (...xs: (string | null | undefined)[]) => xs.some((x) => x && x.toLowerCase().includes(termo))
  const resultados = [
    ...estrategias.estrategias.filter((e) => tem(e.nome, e.slug, e.id, e.estrategiaCf, e.metaapiAccountId)).slice(0, 8).map((e) => ({ tipo: 'estrategia' as const, id: e.id, titulo: e.nome, sub: `${e.slug}${e.estrategiaCf ? ` · CF ${e.estrategiaCf}` : ''} · ${e.seguidores.total} seguidores` })),
    ...contas.contas.filter((c) => tem(c.login, c.email, c.rotulo, c.servidor, c.metaapiAccountId, c.ref, c.nome)).slice(0, 12).map((c) => ({ tipo: 'conta' as const, id: c.ref, titulo: `${c.plataforma.toUpperCase()} ${c.login ?? '—'}${c.rotulo ? ` · ${c.rotulo}` : ''}`, sub: `${c.email ?? '—'} · ${c.estado}` })),
    ...utilizadores.utilizadores.filter((u) => tem(u.email, u.nome, u.id)).slice(0, 8).map((u) => ({ tipo: 'utilizador' as const, id: u.id, titulo: u.email ?? u.id, sub: `${u.nome ?? ''} · ${u.contas} conta(s)` })),
  ]
  return { resultados }
}
