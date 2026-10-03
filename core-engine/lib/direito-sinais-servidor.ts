import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { appMemberSemAcessoMtmAuto, decidirDireitoMtmAuto, direitoMtmAuto } from '@/lib/entitlements'
import { temDireitoSinaisPagos, type PerfilSinais } from '@/lib/direito-sinais'

/**
 * O lado do servidor de `lib/direito-sinais.ts`: lê o perfil (e, se for preciso, o direito MTM
 * Auto) e responde à pergunta «pode ler sinais pagos?».
 */

const COLUNAS_PERFIL =
  'id, user_type, member_category, subscription_plan, membership_level, is_active, subscription_status, subscription_expires_at, mtmcopy_subscription_active, mtmcopy_subscription_expires_at'

/** Uma pessoa (Alertas MTM, gestão IA). O direito MTM Auto só se pergunta se o perfil não chegar. */
export async function temDireitoSinaisPagosUtilizador(userId: string): Promise<boolean> {
  const { data: perfil } = await getSupabaseAdmin()
    .from('profiles')
    .select('user_type, member_category, subscription_plan, membership_level, is_active')
    .eq('id', userId)
    .maybeSingle()
  if (temDireitoSinaisPagos(perfil as PerfilSinais | null)) return true
  try {
    const d = await direitoMtmAuto(userId)
    return temDireitoSinaisPagos(perfil as PerfilSinais | null, { direitoMtmAuto: d.tem })
  } catch {
    return false
  }
}

/**
 * Muitas pessoas de uma vez (destinatários de uma notificação). Duas leituras, não uma por pessoa:
 * o direito MTM Auto decide-se com o espelho TypeScript da função SQL (`decidirDireitoMtmAuto`),
 * que é o que os testes do MTM Auto exercitam.
 *
 * Se a leitura falhar devolve a lista TAL COMO VEIO, e diz-o no registo. É uma escolha: uma falha
 * da base não pode calar as notificações de quem paga — a regra de ouro manda deixar aberto na
 * dúvida. A fuga que isto fecha é a de todos os dias, não a de um minuto de base em baixo.
 */
export async function filtrarComDireitoSinaisPagos(userIds: string[]): Promise<string[]> {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return []
  const db = getSupabaseAdmin()
  const semMembro = appMemberSemAcessoMtmAuto()
  const perfis = new Map<string, Record<string, unknown>>()
  const autos = new Map<string, Record<string, unknown>>()
  try {
    for (let i = 0; i < ids.length; i += 500) {
      const lote = ids.slice(i, i + 500)
      const [p, a] = await Promise.all([
        db.from('profiles').select(COLUNAS_PERFIL).in('id', lote),
        db
          .from('mtmauto_users')
          .select('user_id, papel, subscricao, isento, motivo_isencao, acesso_manual, acesso_ate, suspenso, apple_estado, apple_expira_em')
          .in('user_id', lote),
      ])
      if (p.error) throw new Error(p.error.message)
      if (a.error) throw new Error(a.error.message)
      for (const r of p.data ?? []) perfis.set(String((r as { id: string }).id), r as Record<string, unknown>)
      for (const r of a.data ?? []) autos.set(String((r as { user_id: string }).user_id), r as Record<string, unknown>)
    }
  } catch (e) {
    console.warn('[direito-sinais] não consegui ler os direitos — sigo sem filtrar:', e instanceof Error ? e.message : e)
    return ids
  }
  return ids.filter((id) => {
    const perfil = perfis.get(id) ?? null
    if (temDireitoSinaisPagos(perfil as PerfilSinais | null)) return true
    const auto = decidirDireitoMtmAuto(perfil as never, (autos.get(id) ?? null) as never, { appMemberSemAcesso: semMembro })
    return temDireitoSinaisPagos(perfil as PerfilSinais | null, { direitoMtmAuto: auto.tem })
  })
}
