import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { camposDeContaSimulada, SERVIDOR_SIMULADO } from '@/lib/mtmfunded/simulado/motor'

/**
 * CONTAS DE ACOMPANHAMENTO DAS ESTRATÉGIAS — uma conta MTM Funded simulada por estratégia do MTM
 * Auto, atribuída pelo admin a um utilizador para ele medir cada estratégia em tempo real.
 *
 * O que nasce, por utilizador e por estratégia (idempotente — correr duas vezes não duplica):
 *
 *  1. `mtm_trading_accounts` motor `sim`, tipo `financiada`, 1 000 USD, com
 *     `segue_estrategia = <slug>` (o motor do VPS espelha a conta-mestre — migração 070),
 *     `aceita_t2t = true` e `metricas.analise = true` (as regras do programa não a quebram).
 *     O programa é o 1K de uma fase (inactivo à venda) só para herdar o resto do painel.
 *  2. `mtmauto_accounts` com `plataforma = 'mtmfunded'` e `funded_account_id` — a conta aparece no
 *     MTM Auto como qualquer conta do cliente. Nenhum executor MetaApi/CopyFactory lhe toca.
 *  3. `mtmauto_subscriptions` à estratégia, com `conta_id` desta conta e `auto_aceitar = false` — só
 *     se o utilizador ainda não tiver subscrição a essa estratégia. Há `unique (user_id,
 *     provider_id)` e o MTM Auto faz upsert por essas colunas: mexer na subscrição que já aponta a
 *     uma conta real mudava para onde vão as trades reais dele. Nesse caso fica como estava.
 *
 * Não conta para os limites de contas (lib/entitlements.ts): é atribuída pelo admin para análise.
 * As rotas que contam contas filtram `plataforma = 'mtmfunded'`.
 *
 * As passwords nunca saem daqui — nem na resposta, nem no aviso (vêem-se no painel, com sessão).
 * O aviso ao utilizador está em ./aviso-contas-estrategia e só corre com `notificar: true`.
 */

export const ESTRATEGIAS_PADRAO = ['premium-ouro', 'Goldkiller', 'sensei', 'aurum-flow', 'mtm-scanner']

export interface ContaCriada {
  estrategia: string
  nomeEstrategia: string
  accountId: string
  login: string | null
  nova: boolean
  mtmautoAccountId: string | null
  subscricao: 'criada' | 'existente_mantida' | 'existente_nesta_conta' | 'erro'
  erro?: string
}

export interface ResultadoUtilizador {
  userId: string
  email: string | null
  primeiroNome: string
  contas: ContaCriada[]
  erro?: string
}

export async function criarContasDeEstrategia(p: {
  userIds: string[]
  estrategias?: string[]
  saldo?: number
  criadoPor?: string | null
}): Promise<ResultadoUtilizador[]> {
  const db = getSupabaseAdmin()
  const saldo = p.saldo && p.saldo > 0 ? p.saldo : 1000
  const pedidas = (p.estrategias?.length ? p.estrategias : ESTRATEGIAS_PADRAO).map((s) => String(s).trim()).filter(Boolean)

  const [{ data: provs }, { data: progs }] = await Promise.all([
    db.from('mtmauto_providers').select('id, slug, nome'),
    db.from('mtm_funded_programs').select('id, slug, saldo, fases'),
  ])
  const programa = (progs ?? []).find((x) => x.slug === `${Math.round(saldo / 1000)}k-1f`)
    ?? (progs ?? []).find((x) => Number(x.saldo) === saldo && Number(x.fases) === 1)
    ?? null
  const provPorSlug = new Map((provs ?? []).map((x) => [String(x.slug).toLowerCase(), x]))

  const saida: ResultadoUtilizador[] = []
  for (const userId of [...new Set(p.userIds)]) {
    const { data: perfil } = await db.from('profiles').select('id, email, full_name').eq('id', userId).maybeSingle()
    if (!perfil) { saida.push({ userId, email: null, primeiroNome: '', contas: [], erro: 'utilizador não encontrado' }); continue }
    const r: ResultadoUtilizador = {
      userId, email: (perfil.email as string) ?? null,
      primeiroNome: String(perfil.full_name ?? '').trim().split(/\s+/)[0] || 'trader', contas: [],
    }

    for (const pedida of pedidas) {
      const prov = provPorSlug.get(pedida.toLowerCase())
      if (!prov) {
        r.contas.push({ estrategia: pedida, nomeEstrategia: pedida, accountId: '', login: null, nova: false, mtmautoAccountId: null, subscricao: 'erro', erro: 'estratégia desconhecida' })
        continue
      }
      const slug = String(prov.slug)
      const nome = String(prov.nome ?? slug)
      try {
        // 1. a conta simulada
        const { data: existente } = await db.from('mtm_trading_accounts')
          .select('id, mt5_login').eq('user_id', userId).eq('motor', 'sim').eq('segue_estrategia', slug)
          .neq('estado', 'cancelada').order('created_at', { ascending: true }).limit(1).maybeSingle()
        let accountId = existente?.id as string | undefined
        let login = (existente?.mt5_login as string) ?? null
        const nova = !accountId
        if (!accountId) {
          const { data: criada, error } = await db.from('mtm_trading_accounts').insert({
            user_id: userId,
            tipo: 'financiada',
            program_id: programa?.id ?? null,
            saldo_inicial: saldo,
            alavancagem: 100,
            ...(await camposDeContaSimulada(saldo)),
            segue_estrategia: slug,
            aceita_t2t: true,
            metricas: { analise: true, estrategia: nome, atribuidaEm: new Date().toISOString(), atribuidaPor: p.criadoPor ?? 'admin' },
          }).select('id, mt5_login').single()
          if (error || !criada) throw new Error(error?.message ?? 'insert sem linha')
          accountId = String(criada.id)
          login = (criada.mt5_login as string) ?? null
        }

        // 2. a conta no MTM Auto
        const rotulo = `MTM Funded · ${nome}`
        let { data: auto } = await db.from('mtmauto_accounts').select('id').eq('funded_account_id', accountId).maybeSingle()
        if (!auto) {
          const { data: a, error } = await db.from('mtmauto_accounts').insert({
            user_id: userId, funded_account_id: accountId, plataforma: 'mtmfunded',
            login, servidor: SERVIDOR_SIMULADO, corretora: 'MTM Funded', estado: 'connected',
            copia_ativa: true, demo: false, paga: false, principal: false,
            rotulo, nome_exibicao: rotulo, metaapi_account_id: null,
          }).select('id').single()
          if (error) throw new Error(`mtmauto_accounts: ${error.message}`)
          auto = a
        }
        const mtmautoAccountId = auto ? String(auto.id) : null

        // 3. a subscrição à estratégia
        let subscricao: ContaCriada['subscricao']
        const { data: sub } = await db.from('mtmauto_subscriptions').select('id, conta_id').eq('user_id', userId).eq('provider_id', prov.id).maybeSingle()
        if (sub) {
          subscricao = sub.conta_id === mtmautoAccountId ? 'existente_nesta_conta' : 'existente_mantida'
        } else {
          const { error } = await db.from('mtmauto_subscriptions').insert({
            user_id: userId, provider_id: prov.id, ativo: true, auto_aceitar: false, modo_risco: 'conta', conta_id: mtmautoAccountId,
          })
          subscricao = error ? (error.code === '23505' ? 'existente_mantida' : 'erro') : 'criada'
        }
        r.contas.push({ estrategia: slug, nomeEstrategia: nome, accountId, login, nova, mtmautoAccountId, subscricao })
      } catch (e) {
        r.contas.push({ estrategia: slug, nomeEstrategia: nome, accountId: '', login: null, nova: false, mtmautoAccountId: null, subscricao: 'erro', erro: e instanceof Error ? e.message : String(e) })
      }
    }
    saida.push(r)
  }
  return saida
}
