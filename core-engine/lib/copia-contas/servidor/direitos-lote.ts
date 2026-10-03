import { appMemberSemAcessoMtmAuto, decidirDireitoMtmAuto, ehPremium, type MotivoDireitoMtmAuto } from '@/lib/entitlements'
import { estadoDaQuota, type EstadoQuota } from '@/lib/contas/quota-metaapi'
import { db } from './base'

/**
 * Direitos de MUITOS utilizadores com 2 consultas (perfis + mtmauto_users), não 4 por pessoa.
 *
 * Mesma regra de `carregarDireitos`/`direito_mtm_auto` (decidirDireitoMtmAuto é a regra pura que a
 * função SQL espelha). O bónus da corretora não entra aqui (precisa de broker_clients por pessoa):
 * a quota mostrada ao admin é a base + extras pagas — e o texto diz isso.
 */
export interface DireitoResumo {
  plano: 'admin' | 'premium' | 'gratis'
  motivo: MotivoDireitoMtmAuto
  temMtmAuto: boolean
  email: string | null
  nome: string | null
  quotaBase: EstadoQuota
}

export async function direitosEmLote(userIds: string[]): Promise<Map<string, DireitoResumo>> {
  const ids = [...new Set(userIds.filter(Boolean))]
  const out = new Map<string, DireitoResumo>()
  if (!ids.length) return out
  const semMembro = appMemberSemAcessoMtmAuto()
  const perfis: Record<string, unknown>[] = []
  const autos: Record<string, unknown>[] = []
  // Lotes de 200 ids: um `in` gigante numa URL do PostgREST rebenta o limite do pedido.
  for (let i = 0; i < ids.length; i += 200) {
    const fatia = ids.slice(i, i + 200)
    const [{ data: p }, { data: a }] = await Promise.all([
      db().from('profiles').select('id, email, full_name, user_type, member_category, subscription_plan, membership_level, is_active, subscription_status, subscription_expires_at, mtmcopy_subscription_active, mtmcopy_subscription_expires_at, contas_extra_pagas').in('id', fatia),
      db().from('mtmauto_users').select('user_id, papel, subscricao, isento, motivo_isencao, acesso_manual, acesso_ate, suspenso, apple_estado, apple_expira_em, contas_extra_pagas, contas_extra_apple').in('user_id', fatia),
    ])
    perfis.push(...((p ?? []) as Record<string, unknown>[]))
    autos.push(...((a ?? []) as Record<string, unknown>[]))
  }
  const perfilDe = new Map(perfis.map((p) => [String(p.id), p]))
  const autoDe = new Map(autos.map((a) => [String(a.user_id), a]))
  for (const id of ids) {
    const perfil = perfilDe.get(id) ?? null
    const auto = autoDe.get(id) ?? null
    const d = decidirDireitoMtmAuto(perfil as never, auto as never, { appMemberSemAcesso: semMembro })
    const tipo = String(perfil?.user_type ?? '')
    const admin = tipo === 'admin' || String(auto?.papel ?? '') === 'admin'
    const vip = tipo !== 'inactive' && (tipo === 'vip' || String(perfil?.member_category ?? '').toLowerCase() === 'vip')
    const premium = ehPremium(perfil)
    const extrasPagas = Number(perfil?.contas_extra_pagas ?? 0) + Number(auto?.contas_extra_pagas ?? 0) + Number(auto?.contas_extra_apple ?? 0)
    const quotaBase = estadoDaQuota({ admin, vip, premium, copiaAutomatica: d.tem, extrasPagas, bonusCorretora: false }, 0)
    out.set(id, {
      plano: quotaBase.plano, motivo: d.motivo, temMtmAuto: d.tem,
      email: (perfil?.email as string) ?? null, nome: (perfil?.full_name as string) ?? null, quotaBase,
    })
  }
  return out
}
