import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * Quem pode ligar o quê, e quantas contas — num sítio só.
 *
 * A regra vivia repartida por três: o MTM Copy tinha um limite por perfil (4 contas, 5 se VIP),
 * o MTM Auto tinha o seu (uma real e uma demo, extras a 7 €) e o Tap to Trade tinha um terceiro,
 * escondido na rota de provisionamento. O mesmo cliente ouvia três respostas diferentes à mesma
 * pergunta conforme a porta por onde entrava — e a mais generosa das três era a que valia, porque
 * bastava usar essa porta.
 *
 * Aqui a regra é uma:
 *
 *   • Cada produto inclui UMA conta real e UMA demo. A demo não se vende: é onde se experimenta
 *     sem arriscar dinheiro, e cobrá-la empurrava toda a gente a testar em real — o pior sítio
 *     para descobrir que uma definição estava errada.
 *   • A partir daí cada conta extra são 7 € por mês, em qualquer um dos três.
 *   • Quem validou a corretora parceira com depósito acima do mínimo ganha a PRIMEIRA extra de
 *     graça. Paga só as seguintes.
 *   • A cópia automática — a parte que abre ordens sozinha — é a parte paga: MTM Copy, MTM Auto,
 *     Premium, VIP ou admin. O Tap to Trade não, porque aí é o cliente que carrega no botão.
 *
 * Validado no SERVIDOR. Uma app pode ser modificada; o servidor não.
 */

export const PRECO_CONTA_EXTRA_EUR = 7

/** Depósito na corretora parceira que oferece a primeira conta extra. */
export const DEPOSITO_BONUS_USD = 350

/** Por produto: uma real e uma demo, sempre incluídas. */
export const REAIS_INCLUIDAS = 1
export const DEMOS_INCLUIDAS = 1

export type Superficie = 'mtmcopy' | 'mtmauto' | 't2t'

export const NOME_DA_SUPERFICIE: Record<Superficie, string> = {
  mtmcopy: 'MTM Copy',
  mtmauto: 'MTM Auto',
  t2t: 'Tap to Trade',
}

/**
 * Servidores de demonstração dizem-no no nome. É o único sinal fiável que a corretora dá — o
 * saldo não serve (uma demo pode ter 100 000) e o cliente também não, porque quem quer fugir ao
 * limite diria sempre "demo".
 */
export function pareceDemo(servidor?: string | null, corretora?: string | null): boolean {
  const t = `${servidor ?? ''} ${corretora ?? ''}`.toLowerCase()
  return /\b(demo|trial|practice|paper|contest)\b/.test(t)
}

export type MotivoCopia = 'admin' | 'vip' | 'premium' | 'mtmcopy' | 'mtmauto' | 'nenhum'

export interface Direitos {
  admin: boolean
  vip: boolean
  premium: boolean
  /** A cópia automática abre ordens sozinha — é a parte paga. */
  copiaAutomatica: boolean
  motivoCopia: MotivoCopia
  /** Extras compradas (7 €/mês cada), somadas do site e da app MTM Auto. */
  extrasPagas: number
  /** Corretora parceira validada acima do mínimo → a primeira extra não se paga. */
  bonusCorretora: boolean
  depositoUsd: number | null
}

export const SEM_DIREITOS: Direitos = {
  admin: false,
  vip: false,
  premium: false,
  copiaAutomatica: false,
  motivoCopia: 'nenhum',
  extrasPagas: 0,
  bonusCorretora: false,
  depositoUsd: null,
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// DIREITO AO MTM AUTO — a regra única (fase 1 da consolidação MTM Copy → MTM Auto)
//
// A fonte é a função SQL `direito_mtm_auto` (supabase/migrations/073_direito_mtm_auto.sql), que
// serve o site E a app MTM Auto. Isto é o espelho em TypeScript: é o que os testes exercitam e o
// que corre se a função ainda não existir na base (deploy antes da migração). Mudar a regra =
// mudar a SQL, este espelho, o de mtm-auto/lib/direito.ts e os testes.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type MotivoDireitoMtmAuto =
  | 'suspenso'
  | 'admin'
  | 'mtmauto_stripe'
  | 'mtmauto_apple'
  | 'legado_mtmcopy'
  | 'mtmauto_isento'
  | 'mtmauto_manual'
  | 'vip'
  | 'premium'
  | 'membro_mtm'
  | 'nenhum'

export interface DireitoMtmAuto {
  tem: boolean
  motivo: MotivoDireitoMtmAuto
}

export interface PerfilDireito {
  user_type?: string | null
  member_category?: string | null
  subscription_plan?: string | null
  membership_level?: string | null
  is_active?: boolean | null
  subscription_status?: string | null
  subscription_expires_at?: string | null
  mtmcopy_subscription_active?: boolean | null
  mtmcopy_subscription_expires_at?: string | null
}

export interface AutoDireito {
  papel?: string | null
  subscricao?: string | null
  isento?: boolean | null
  motivo_isencao?: string | null
  acesso_manual?: boolean | null
  acesso_ate?: string | null
  suspenso?: boolean | null
  apple_estado?: string | null
  apple_expira_em?: string | null
}

/**
 * O Membro (app_member) NÃO tem MTM Auto — decisão do dono: queremos mais Premium do que Membros.
 * `MTMAUTO_APP_MEMBER_SEM_ACESSO=0` devolve-lhe o acesso (só para uma transição, se for preciso).
 */
export function appMemberSemAcessoMtmAuto(): boolean {
  return String(process.env.MTMAUTO_APP_MEMBER_SEM_ACESSO ?? '1').trim() !== '0'
}

const depois = (data: string | null | undefined, agora: Date) => Boolean(data) && new Date(String(data)) > agora

export function decidirDireitoMtmAuto(
  perfil: PerfilDireito | null | undefined,
  auto: AutoDireito | null | undefined,
  opcoes: { appMemberSemAcesso?: boolean; agora?: Date } = {},
): DireitoMtmAuto {
  const agora = opcoes.agora ?? new Date()
  const semMembro = opcoes.appMemberSemAcesso ?? true
  const sim = (motivo: MotivoDireitoMtmAuto): DireitoMtmAuto => ({ tem: true, motivo })

  if (auto?.suspenso) return { tem: false, motivo: 'suspenso' }

  const tipo = String(perfil?.user_type ?? '').toLowerCase()
  const categoria = String(perfil?.member_category ?? '').toLowerCase()
  const plano = String(perfil?.subscription_plan ?? '').toLowerCase()
  const nivel = String(perfil?.membership_level ?? '').toLowerCase()

  if (tipo === 'admin' || auto?.papel === 'admin') return sim('admin')
  if (auto?.subscricao === 'active' || auto?.subscricao === 'trialing') return sim('mtmauto_stripe')
  if (auto?.apple_estado === 'grace' || (auto?.apple_estado === 'active' && (!auto.apple_expira_em || depois(auto.apple_expira_em, agora)))) {
    return sim('mtmauto_apple')
  }
  // MTM Copy legado: pago E datado. Sem data não conta.
  if (perfil?.mtmcopy_subscription_active && depois(perfil.mtmcopy_subscription_expires_at, agora)) return sim('legado_mtmcopy')
  // A isenção 'cliente_mtm' é derivada do perfil do site: revê-se abaixo, com o perfil de hoje.
  if (auto?.isento && auto.motivo_isencao !== 'cliente_mtm') return sim('mtmauto_isento')
  if (auto?.acesso_manual && (!auto.acesso_ate || depois(auto.acesso_ate, agora))) return sim('mtmauto_manual')

  // Do site: `inactive` ou is_active=false perdem tudo.
  if (perfil && tipo && tipo !== 'inactive' && perfil.is_active === true) {
    // VIP vive em dois campos (user_type OU member_category).
    if (tipo === 'vip' || categoria === 'vip') return sim('vip')
    const estadoOk = !['canceled', 'unpaid', 'incomplete_expired'].includes(String(perfil.subscription_status ?? '').toLowerCase())
    const noPrazo = !perfil.subscription_expires_at || depois(perfil.subscription_expires_at, agora)
    const premium =
      /premium|founder|fundador|elite/.test(plano) || /premium|fundador/.test(categoria) || /premium|founder|fundador/.test(nivel)
    if (estadoOk && noPrazo && premium) return sim('premium')
    const membro = /app_member|membro/.test(plano) || /membro/.test(categoria)
    if (!semMembro && estadoOk && noPrazo && membro) return sim('membro_mtm')
  }
  return { tem: false, motivo: 'nenhum' }
}

const MOTIVOS_VALIDOS = new Set<MotivoDireitoMtmAuto>([
  'suspenso', 'admin', 'mtmauto_stripe', 'mtmauto_apple', 'legado_mtmcopy', 'mtmauto_isento',
  'mtmauto_manual', 'vip', 'premium', 'membro_mtm', 'nenhum',
])

/**
 * Tem direito ao MTM Auto (= cópia automática, em qualquer superfície)?
 * Pergunta à função SQL; se ela ainda não existir, decide aqui com a mesma regra.
 */
export async function direitoMtmAuto(userId: string): Promise<DireitoMtmAuto> {
  const db = getSupabaseAdmin()
  const semMembro = appMemberSemAcessoMtmAuto()
  const { data, error } = await db.rpc('direito_mtm_auto', { p_user: userId, p_app_member_sem_acesso: semMembro })
  const linha = Array.isArray(data) ? data[0] : data
  if (!error && linha && typeof linha.tem === 'boolean') {
    const motivo = String(linha.motivo ?? 'nenhum') as MotivoDireitoMtmAuto
    return { tem: linha.tem, motivo: MOTIVOS_VALIDOS.has(motivo) ? motivo : 'nenhum' }
  }
  const [{ data: perfil }, { data: auto }] = await Promise.all([
    db
      .from('profiles')
      .select('user_type, member_category, subscription_plan, membership_level, is_active, subscription_status, subscription_expires_at, mtmcopy_subscription_active, mtmcopy_subscription_expires_at')
      .eq('id', userId)
      .maybeSingle(),
    db
      .from('mtmauto_users')
      .select('papel, subscricao, isento, motivo_isencao, acesso_manual, acesso_ate, suspenso, apple_estado, apple_expira_em')
      .eq('user_id', userId)
      .maybeSingle(),
  ])
  return decidirDireitoMtmAuto(perfil, auto, { appMemberSemAcesso: semMembro })
}

/** O motivo do direito, na linguagem de `MotivoCopia` que o resto do site já usa. */
export function motivoCopiaDoDireito(d: DireitoMtmAuto): MotivoCopia {
  switch (d.motivo) {
    case 'admin':
      return 'admin'
    case 'legado_mtmcopy':
      return 'mtmcopy'
    case 'mtmauto_stripe':
    case 'mtmauto_apple':
    case 'mtmauto_isento':
    case 'mtmauto_manual':
    case 'membro_mtm':
      return 'mtmauto'
    case 'vip':
      return 'vip'
    case 'premium':
      return 'premium'
    default:
      return 'nenhum'
  }
}

export function ehPremium(perfil: Record<string, unknown> | null): boolean {
  const nivel = String(perfil?.membership_level ?? '').toLowerCase()
  const categoria = String(perfil?.member_category ?? '').toLowerCase()
  const tipo = String(perfil?.user_type ?? '').toLowerCase()
  // A categoria NÃO se apaga quando a subscrição acaba: há contas marcadas 'premium' com o tipo
  // já em 'inactive'. Ler só a categoria dava cópia automática a quem deixou de pagar.
  if (tipo === 'inactive') return false
  return (
    nivel.includes('premium') ||
    categoria.includes('premium') ||
    tipo === 'premium' ||
    // O Fundador é Premium com outro nome — negá-lo aqui seria vender-lhe o que já pagou.
    nivel.includes('founder') ||
    nivel.includes('fundador') ||
    categoria.includes('fundador')
  )
}

/**
 * Lê tudo o que decide os direitos deste cliente.
 *
 * Uma leitura, não uma por pergunta: cada rota que perguntava por si dava-se ao trabalho de ir
 * buscar o perfil outra vez, e as respostas divergiam sempre que uma delas esquecia uma coluna.
 */
export async function carregarDireitos(userId: string): Promise<Direitos> {
  const db = getSupabaseAdmin()

  const [{ data: perfil }, { data: auto }, direito] = await Promise.all([
    db
      .from('profiles')
      .select(
        'user_type, membership_level, member_category, broker_uid, broker_verified, contas_extra_pagas',
      )
      .eq('id', userId)
      .maybeSingle(),
    db
      .from('mtmauto_users')
      .select('papel, contas_extra_pagas, contas_extra_apple')
      .eq('user_id', userId)
      .maybeSingle(),
    // A cópia automática decide-se na regra única (direito_mtm_auto) — não aqui.
    direitoMtmAuto(userId),
  ])

  const admin = String(perfil?.user_type ?? '') === 'admin' || String(auto?.papel ?? '') === 'admin'
  const inativo = String(perfil?.user_type ?? '') === 'inactive'
  const vip =
    !inativo &&
    (String(perfil?.user_type ?? '') === 'vip' || String(perfil?.member_category ?? '').toLowerCase() === 'vip')
  const premium = ehPremium(perfil ?? null)

  // Fase 1: MTM Copy legado, MTM Auto, Premium, VIP e admin têm EXACTAMENTE o mesmo direito, e é
  // a função `direito_mtm_auto` que o decide. O Membro (app_member) fica de fora.
  const motivoCopia: MotivoCopia = direito.tem ? motivoCopiaDoDireito(direito) : 'nenhum'

  // O bónus da corretora precisa do depósito REAL, não da palavra do cliente: `broker_clients` é
  // alimentado pelo relatório da corretora, e é por isso que serve de prova.
  let depositoUsd: number | null = null
  const uid = String(perfil?.broker_uid ?? '').trim()
  if (uid) {
    const { data: cliente } = await db
      .from('broker_clients')
      .select('deposits_usd, balance_usd')
      .eq('uid', uid)
      .maybeSingle()
    const dep = Number(cliente?.deposits_usd ?? 0)
    const sal = Number(cliente?.balance_usd ?? 0)
    depositoUsd = Math.max(Number.isFinite(dep) ? dep : 0, Number.isFinite(sal) ? sal : 0)
  }

  return {
    admin,
    vip,
    premium,
    copiaAutomatica: direito.tem,
    motivoCopia,
    extrasPagas:
      Number(perfil?.contas_extra_pagas ?? 0) +
      Number(auto?.contas_extra_pagas ?? 0) +
      Number(auto?.contas_extra_apple ?? 0),
    bonusCorretora: Boolean(perfil?.broker_verified) && (depositoUsd ?? 0) >= DEPOSITO_BONUS_USD,
    depositoUsd,
  }
}

export interface ContaLigada {
  superficie: Superficie
  demo: boolean
}

export interface Veredicto {
  ok: boolean
  erro?: string
  /** Quando o "não" se resolve a pagar, o preço vai junto — um "não" seco não vende nada. */
  precoEur?: number
  /** Para o checkout saber o que está a vender. */
  codigo?: 'conta_extra' | 'sem_copia_automatica'
}

/**
 * Pode ligar mais uma? A pergunta certa é "mais uma DE QUE TIPO, e ONDE".
 *
 * Quem já tem a real incluída do MTM Auto continua a poder ligar a demo sem pagar, e ao
 * contrário também. As extras, essas, vêm de um saco comum: pagar 7 € dá direito a uma conta a
 * mais, e o cliente escolhe onde a põe — obrigá-lo a comprar "uma extra de MTM Copy" que depois
 * não pode usar no Tap to Trade seria vender-lhe o mesmo duas vezes.
 */
export function podeLigarConta(
  d: Direitos,
  superficie: Superficie,
  novaEhDemo: boolean,
  ligadas: ContaLigada[],
): Veredicto {
  if (d.admin) return { ok: true }

  // A cópia automática é a parte paga. O Tap to Trade fica de fora: aí é o cliente que carrega.
  if (superficie !== 't2t' && !d.copiaAutomatica) {
    return {
      ok: false,
      codigo: 'sem_copia_automatica',
      erro: `A cópia automática do ${NOME_DA_SUPERFICIE[superficie]} precisa de subscrição (ou de seres Premium/VIP). No Tap to Trade continuas a poder aceitar sinais à mão.`,
    }
  }

  const nesta = ligadas.filter((c) => c.superficie === superficie)
  const reais = nesta.filter((c) => !c.demo).length
  const demos = nesta.filter((c) => c.demo).length

  // Uma incluída livre neste produto? Então entra sem pagar.
  if (novaEhDemo ? demos < DEMOS_INCLUIDAS : reais < REAIS_INCLUIDAS) return { ok: true }

  // Caso contrário consome uma extra do saco comum.
  const extrasEmUso = contarExtras(ligadas)
  const extrasDisponiveis = d.extrasPagas + (d.bonusCorretora ? 1 : 0)
  if (extrasEmUso < extrasDisponiveis) return { ok: true }

  return {
    ok: false,
    codigo: 'conta_extra',
    precoEur: PRECO_CONTA_EXTRA_EUR,
    erro: novaEhDemo
      ? `Já tens a conta demo incluída no ${NOME_DA_SUPERFICIE[superficie]}. Outra conta são ${PRECO_CONTA_EXTRA_EUR} €/mês.`
      : `Já tens a conta real incluída no ${NOME_DA_SUPERFICIE[superficie]}. Outra conta são ${PRECO_CONTA_EXTRA_EUR} €/mês.`,
  }
}

/** Quantas contas estão a consumir extras (acima do incluído de cada produto). */
export function contarExtras(ligadas: ContaLigada[]): number {
  let extras = 0
  for (const s of ['mtmcopy', 'mtmauto', 't2t'] as Superficie[]) {
    const nesta = ligadas.filter((c) => c.superficie === s)
    const reais = nesta.filter((c) => !c.demo).length
    const demos = nesta.filter((c) => c.demo).length
    extras += Math.max(0, reais - REAIS_INCLUIDAS) + Math.max(0, demos - DEMOS_INCLUIDAS)
  }
  return extras
}

/** O que dizer no ecrã: o que está incluído, o que já se paga e o que falta para a próxima. */
export function resumoDeContas(d: Direitos, ligadas: ContaLigada[]) {
  const extrasEmUso = contarExtras(ligadas)
  const extrasDisponiveis = d.extrasPagas + (d.bonusCorretora ? 1 : 0)
  return {
    copiaAutomatica: d.copiaAutomatica,
    motivoCopia: d.motivoCopia,
    porProduto: (['mtmcopy', 'mtmauto', 't2t'] as Superficie[]).map((s) => {
      const nesta = ligadas.filter((c) => c.superficie === s)
      return {
        superficie: s,
        nome: NOME_DA_SUPERFICIE[s],
        reais: nesta.filter((c) => !c.demo).length,
        demos: nesta.filter((c) => c.demo).length,
        incluidas: { reais: REAIS_INCLUIDAS, demos: DEMOS_INCLUIDAS },
      }
    }),
    extras: {
      emUso: extrasEmUso,
      disponiveis: extrasDisponiveis,
      pagas: d.extrasPagas,
      bonusCorretora: d.bonusCorretora,
      precoEur: PRECO_CONTA_EXTRA_EUR,
    },
  }
}
