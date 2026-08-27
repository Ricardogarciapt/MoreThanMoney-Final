import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { preset, presetDosValores } from '@/lib/risk-presets'

/**
 * A ponte para o MTM Auto.
 *
 * As duas apps partilham o mesmo Supabase, mas até agora viviam de costas voltadas: quem tinha
 * uma conta ligada no MTM Auto e abria a app MoreThanMoney não a via, e vice-versa. Como é a
 * MESMA conta de corretora, isso obrigava a pessoa a lembrar-se em que app tinha configurado o
 * risco — e a descobrir a resposta errada num dia em que importava.
 *
 * O MTM Auto é o código que MANDA nisto: as contas, os riscos e as estratégias vivem nas tabelas
 * dele (`mtmauto_*`). Esta ponte só lê e escreve lá; não duplica nada. Duplicar seria criar duas
 * versões da mesma conta e um dia elas discordarem sobre quanto arriscar.
 *
 * ── O que a app-mobile NÃO pode fazer ─────────────────────────────────────────────────────────
 * Ligar a cópia automática. Essa é a parte paga (MTM Copy / MTM Auto) e liga-se onde se paga:
 * na app MTM Auto ou no MTM Copy. Aqui vê-se, configura-se o risco e aceita-se sinal a sinal —
 * que é Tap to Trade, trabalho manual da pessoa. Não é uma limitação técnica: é a diferença
 * entre o produto manual e o produto automático, e apagá-la seria dar de graça o que se vende.
 */

/** Quem pode ver o MTM Auto dentro da app-mobile. */
export type NivelMtm = { premium: boolean; vip: boolean; admin: boolean }

export function podeVerMtmAuto(p: {
  user_type?: string | null
  member_category?: string | null
  subscription_plan?: string | null
  is_active?: boolean | null
} | null): boolean {
  if (!p) return false
  if (p.user_type === 'admin') return true
  if (!p.is_active) return false
  return (
    p.subscription_plan === 'premium' ||
    p.member_category === 'premium' ||
    p.member_category === 'vip' ||
    p.member_category === 'iq'
  )
}

export interface ContaMtmAuto {
  id: string
  rotulo: string | null
  login: string | null
  servidor: string | null
  corretora: string | null
  estado: string
  demo: boolean
  principal: boolean
  saldo: number | null
  moeda: string | null
  /** A cópia automática está ligada? Mostra-se; NÃO se muda a partir daqui. */
  copiaAtiva: boolean
  /** Qual dos perfis de risco corresponde aos valores actuais ('personalizado' se nenhum). */
  preset: string
  riscoPct: number
  riscoMaxPct: number
  maxPosicoes: number
  beAtivo: boolean
  beGatilho: number
  trailingAtivo: boolean
  protecaoEquity: boolean
  equityMinima: number | null
  perdaDiariaMax: number | null
  ganhoDiarioMax: number | null
  modoLote: string
  loteValor: number
  simbolos: string[]
  saidasPct: number[]
}

/** As contas MTM Auto desta pessoa, com o saldo lido do broker quando possível. */
export async function contasDoUtilizador(userId: string, comSaldo = true): Promise<ContaMtmAuto[]> {
  const { data } = await getSupabaseAdmin()
    .from('mtmauto_accounts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at')

  const linhas = (data ?? []) as Record<string, unknown>[]
  const saldos = new Map<string, { balance?: number; currency?: string }>()

  if (comSaldo) {
    const token = process.env.METAAPI_TOKEN
    if (token) {
      // Em paralelo: em série, três contas somavam três viagens antes de o ecrã aparecer.
      await Promise.all(
        linhas.map(async (c) => {
          const id = c.metaapi_account_id as string | null
          if (!id) return
          try {
            const r = await fetch(
              `https://mt-client-api-v1.new-york.agiliumtrade.ai/users/current/accounts/${id}/accountInformation`,
              { headers: { 'auth-token': token }, signal: AbortSignal.timeout(8000) },
            )
            if (r.ok) saldos.set(id, (await r.json()) as { balance?: number; currency?: string })
          } catch {
            /* sem saldo: mostra-se a conta na mesma, com o último estado conhecido */
          }
        }),
      )
    }
  }

  return linhas.map((c) => {
    const info = saldos.get((c.metaapi_account_id as string) ?? '')
    return {
      id: c.id as string,
      rotulo: (c.rotulo as string) ?? null,
      login: (c.login as string) ?? null,
      servidor: (c.servidor as string) ?? null,
      corretora: (c.corretora as string) ?? null,
      estado: (c.estado as string) ?? 'unknown',
      demo: Boolean(c.demo),
      principal: Boolean(c.principal),
      saldo: info?.balance ?? null,
      moeda: info?.currency ?? null,
      copiaAtiva: Boolean(c.copia_ativa),
      // O preset é DEDUZIDO dos valores, não da coluna: guardar só o nome deixava-o a dizer
      // "Equilibrado" depois de a pessoa mexer no risco à mão.
      preset: presetDosValores({
        riscoPct: Number(c.risco_pct ?? 1),
        riscoMaxPct: Number(c.risco_max_pct ?? 2),
        maxPosicoes: Number(c.max_posicoes ?? 10),
        beGatilho: Number(c.be_gatilho ?? 1),
        saidasPct: (c.saidas_pct as number[]) ?? [33, 33, 34],
      }),
      riscoPct: Number(c.risco_pct ?? 1),
      riscoMaxPct: Number(c.risco_max_pct ?? 2),
      maxPosicoes: Number(c.max_posicoes ?? 10),
      beAtivo: c.be_ativo !== false,
      beGatilho: Number(c.be_gatilho ?? 1),
      trailingAtivo: c.trailing_ativo !== false,
      protecaoEquity: Boolean(c.protecao_equity),
      equityMinima: c.equity_minima != null ? Number(c.equity_minima) : null,
      perdaDiariaMax: c.perda_diaria_max != null ? Number(c.perda_diaria_max) : null,
      ganhoDiarioMax: c.ganho_diario_max != null ? Number(c.ganho_diario_max) : null,
      modoLote: (c.modo_lote as string) ?? 'risk_percent',
      loteValor: Number(c.lote_valor ?? 0.01),
      simbolos: ((c.simbolos_permitidos as string[]) ?? []),
      saidasPct: ((c.saidas_pct as number[]) ?? [50, 30, 20]),
    }
  })
}

/**
 * Os campos que a app-mobile PODE mudar numa conta MTM Auto.
 *
 * `copia_ativa` está deliberadamente fora desta lista, e é o ponto todo: ligar a cópia automática
 * faz-se onde se paga por ela. Os limites de risco não — esses são proteção da pessoa, e quem
 * está a aceitar sinais à mão tem tanto direito a apertá-los como quem tem a cópia ligada.
 */
const CAMPOS_EDITAVEIS: Record<string, string> = {
  riscoPct: 'risco_pct',
  riscoMaxPct: 'risco_max_pct',
  maxPosicoes: 'max_posicoes',
  beAtivo: 'be_ativo',
  beGatilho: 'be_gatilho',
  trailingAtivo: 'trailing_ativo',
  protecaoEquity: 'protecao_equity',
  equityMinima: 'equity_minima',
  perdaDiariaMax: 'perda_diaria_max',
  ganhoDiarioMax: 'ganho_diario_max',
}

/** As saídas parciais (TP1/TP2/TP3) — três percentagens que têm de somar 100. */
function saidasValidas(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length !== 3) return null
  const n = v.map((x) => Math.max(0, Math.min(100, Math.round(Number(x)) || 0)))
  // Não se aceita um split que não fecha: 50/30/10 deixaria 10% da posição sem regra nenhuma,
  // e essa fatia ficaria aberta para sempre à espera de uma ordem que nunca vem.
  return n.reduce((a, b) => a + b, 0) === 100 ? n : null
}

const LIMITES: Record<string, { min: number; max: number }> = {
  risco_pct: { min: 0.1, max: 5 },
  risco_max_pct: { min: 0.1, max: 5 },
  max_posicoes: { min: 1, max: 50 },
  be_gatilho: { min: 1, max: 3 },
}

/**
 * Aplica alterações de risco. Os limites são validados AQUI, no servidor — uma app pode ser
 * modificada, e o que está do lado do cliente é uma sugestão.
 */
export async function guardarDefinicoes(
  userId: string,
  contaId: string,
  corpo: Record<string, unknown>,
): Promise<{ ok: boolean; erro?: string }> {
  const patch: Record<string, unknown> = {}
  for (const [chave, coluna] of Object.entries(CAMPOS_EDITAVEIS)) {
    if (!(chave in corpo)) continue
    const valor = corpo[chave]
    if (typeof valor === 'boolean') {
      patch[coluna] = valor
      continue
    }
    const n = Number(valor)
    if (!Number.isFinite(n)) continue
    const lim = LIMITES[coluna]
    // Zero é "sem limite" nos tetos diários — um limite de 0 pararia tudo no primeiro cêntimo.
    if (coluna === 'perda_diaria_max' || coluna === 'ganho_diario_max' || coluna === 'equity_minima') {
      patch[coluna] = n > 0 ? n : null
      continue
    }
    patch[coluna] = lim ? Math.min(lim.max, Math.max(lim.min, n)) : n
  }
  if ('saidasPct' in corpo) {
    const s = saidasValidas(corpo.saidasPct)
    if (!s) return { ok: false, erro: 'As saídas têm de somar 100%.' }
    patch.saidas_pct = s
  }

  /**
   * O preset escreve os NÚMEROS, não o nome.
   *
   * Aplica-se ANTES do que veio no corpo? Não: aplica-se depois, mas só onde o corpo não mandou.
   * Assim, escolher uma estratégia e mexer num deslizador no mesmo pedido faz o que se espera —
   * o preset põe o resto e o valor mexido à mão fica de pé.
   */
  const escolhido = preset(String(corpo.preset ?? ''))
  if (escolhido) {
    const doPreset: Record<string, unknown> = {
      risco_pct: escolhido.riscoPct,
      risco_max_pct: escolhido.riscoMaxPct,
      max_posicoes: escolhido.maxPosicoes,
      be_ativo: escolhido.beAtivo,
      be_gatilho: escolhido.beGatilho,
      trailing_ativo: escolhido.trailingAtivo,
      saidas_pct: escolhido.saidasPct,
    }
    for (const [coluna, valor] of Object.entries(doPreset)) {
      if (!(coluna in patch)) patch[coluna] = valor
    }
    patch.preset = escolhido.id
  }
  if (!Object.keys(patch).length) return { ok: false, erro: 'Nada para alterar.' }

  patch.updated_at = new Date().toISOString()
  const { error } = await getSupabaseAdmin()
    .from('mtmauto_accounts')
    .update(patch)
    // O `user_id` é o que impede alguém de configurar a conta de outra pessoa com um id adivinhado.
    .eq('id', contaId)
    .eq('user_id', userId)
  if (error) return { ok: false, erro: error.message }
  return { ok: true }
}


/**
 * Quem está a pedir, e pode ver o MTM Auto aqui dentro?
 *
 * Vive na lib e não num `route.ts` porque o Next só permite exportar handlers de um ficheiro de
 * rota — exportar isto de lá compilava, mas com um erro de tipos a dizer que não devia.
 */
export async function autorizarMtmAuto(
  request: Request,
): Promise<{ erro?: Response; userId?: string }> {
  const { NextResponse } = await import('next/server')
  const db = getSupabaseAdmin()
  const cabecalho = request.headers.get('Authorization')
  if (!cabecalho?.startsWith('Bearer ')) {
    return { erro: NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 }) }
  }
  const { data: { user } } = await db.auth.getUser(cabecalho.replace('Bearer ', ''))
  if (!user) return { erro: NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 }) }

  const { data: perfil } = await db
    .from('profiles')
    .select('user_type, member_category, subscription_plan, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!podeVerMtmAuto(perfil)) {
    return {
      erro: NextResponse.json(
        { error: 'O MTM Auto aqui dentro é para membros Premium e VIP.', code: 'sem_acesso' },
        { status: 403 },
      ),
    }
  }
  return { userId: user.id }
}
