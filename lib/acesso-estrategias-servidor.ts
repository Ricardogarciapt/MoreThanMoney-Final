/**
 * Lê da base o que a regra `lib/acesso-estrategias.ts` precisa de saber de cada utilizador.
 *
 * PU Prime validada quando há QUALQUER uma destas provas:
 *   · `profiles.broker_verified` (UID confirmado no PrimeGate / admin);
 *   · `telegram_leads.stage = 'granted'` com o mesmo email (validador de corretora do Telegram);
 *   · `mtmauto_broker_claims.aprovado` numa corretora PU Prime (validação do MTM Auto);
 *   · uma conta REAL PU Prime ligada (MTM Auto ou site) — a MetaApi só liga com login e password
 *     verdadeiros, por isso a ligação já é prova de que a conta existe e é da pessoa.
 * Corretora validada = PU Prime validada OU isenção por corretora parceira (`mtmauto_users`) OU
 * validação aprovada noutra parceira (VT Markets).
 *
 * Na dúvida (erro a ler) NÃO se corta: devolve-se o perfil como desconhecido e quem chama decide.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { podeAcederPremiumUi } from '@/lib/perfil-ui'
import { acessoEstrategia, corretoraDoServidor, servidorDemo, type AcessoEstrategia, type PerfilAcessoEstrategia } from '@/lib/acesso-estrategias'

type Linha = Record<string, unknown>

export async function perfisAcessoEstrategia(userIds: string[]): Promise<Map<string, PerfilAcessoEstrategia>> {
  const ids = [...new Set(userIds.filter(Boolean))]
  const out = new Map<string, PerfilAcessoEstrategia>()
  if (!ids.length) return out
  const db = getSupabaseAdmin()

  const [perfis, autos, claims, contasAuto, ligacoes] = await Promise.all([
    db.from('profiles').select('id, email, user_type, member_category, membership_level, subscription_plan, is_active, broker_verified').in('id', ids),
    db.from('mtmauto_users').select('user_id, papel, isento, motivo_isencao, subscricao, apple_estado, apple_expira_em').in('user_id', ids),
    db.from('mtmauto_broker_claims').select('user_id, corretora, aprovado').in('user_id', ids).eq('aprovado', true),
    db.from('mtmauto_accounts').select('user_id, servidor, demo, plataforma').in('user_id', ids),
    db.from('mtmcopy_connections').select('user_id, mt5_server, mt5_status').in('user_id', ids),
  ])
  if (perfis.error) throw new Error(`profiles: ${perfis.error.message}`)

  const emails = (perfis.data ?? []).map((p) => String((p as Linha).email ?? '').trim().toLowerCase()).filter(Boolean)
  const leads = emails.length
    ? await db.from('telegram_leads').select('email, stage').in('email', emails).eq('stage', 'granted')
    : { data: [] as Linha[] }
  const emailValidado = new Set((leads.data ?? []).map((l) => String((l as Linha).email ?? '').trim().toLowerCase()))

  const autoDe = new Map((autos.data ?? []).map((a) => [String((a as Linha).user_id), a as Linha]))
  const puprime = new Set<string>()
  const parceira = new Set<string>()
  for (const c of (claims.data ?? []) as Linha[]) {
    const k = corretoraDoServidor(String(c.corretora ?? ''))
    if (k === 'puprime') puprime.add(String(c.user_id))
    if (k) parceira.add(String(c.user_id))
  }
  for (const c of (contasAuto.data ?? []) as Linha[]) {
    if (c.demo === true || String(c.plataforma ?? '') === 'mtmfunded' || servidorDemo(String(c.servidor ?? ''))) continue
    if (corretoraDoServidor(String(c.servidor ?? '')) === 'puprime') puprime.add(String(c.user_id))
  }
  for (const c of (ligacoes.data ?? []) as Linha[]) {
    if (String(c.mt5_status ?? '') === 'disconnected' || servidorDemo(String(c.mt5_server ?? ''))) continue
    if (corretoraDoServidor(String(c.mt5_server ?? '')) === 'puprime') puprime.add(String(c.user_id))
  }

  for (const p of (perfis.data ?? []) as Linha[]) {
    const id = String(p.id)
    const auto = autoDe.get(id)
    const email = String(p.email ?? '').trim().toLowerCase()
    const puPrimeValidado = p.broker_verified === true || (email && emailValidado.has(email)) || puprime.has(id)
    const isentoParceira = auto?.isento === true && String(auto.motivo_isencao ?? '') === 'corretora_parceira'
    const appleOk = auto?.apple_estado === 'grace' || (auto?.apple_estado === 'active' && (!auto.apple_expira_em || new Date(String(auto.apple_expira_em)) > new Date()))
    const mtmAutoPago = auto?.subscricao === 'active' || auto?.subscricao === 'trialing' || appleOk
    out.set(id, {
      mtmAutoPago: Boolean(mtmAutoPago),
      admin: String(p.user_type ?? '').toLowerCase() === 'admin' || String(auto?.papel ?? '') === 'admin',
      premiumOuMais: podeAcederPremiumUi(p as never),
      puPrimeValidado: Boolean(puPrimeValidado),
      corretoraValidada: Boolean(puPrimeValidado || isentoParceira || parceira.has(id)),
    })
  }
  return out
}

/** Acesso de um utilizador a uma estratégia (lê a base). */
export async function acessoEstrategiaDoUtilizador(userId: string, slug: string): Promise<AcessoEstrategia> {
  const perfis = await perfisAcessoEstrategia([userId])
  return acessoEstrategia(slug, perfis.get(userId) ?? null)
}

/**
 * Utilizadores SEM acesso a esta estratégia, com o motivo (para o planeador das rotas).
 * Erro a ler → mapa vazio (não se corta ninguém por uma falha de rede).
 */
export async function semAcessoAEstrategia(slug: string, userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const nivel = acessoEstrategia(slug, { admin: true }).nivel
  if (nivel === 'membros' || !userIds.length) return out
  try {
    const perfis = await perfisAcessoEstrategia(userIds)
    for (const u of new Set(userIds)) {
      const a = acessoEstrategia(slug, perfis.get(u) ?? null)
      if (!a.pode) out.set(u, a.motivo === 'falta_puprime' ? 'sem acesso à estratégia: só membros PU Prime validados' : 'sem acesso à estratégia: só Premium (65 €), assinantes MTM Auto ou corretora validada')
    }
  } catch (e) {
    console.warn('[acesso-estrategias] leitura falhou, ninguém é cortado:', e instanceof Error ? e.message : e)
  }
  return out
}
