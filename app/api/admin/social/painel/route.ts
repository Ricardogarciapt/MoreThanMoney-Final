import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { factosParaCartao, getPipsProof, publicavel, RESSALVA_LEGAL } from '@/lib/pips-proof'
import { buildSalesState, salesStateSummary } from '@/lib/sales-machine'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * O painel do /admin/social: o que se vai publicar, com que factos, e onde estão as pessoas.
 *
 * A página era uma fila de posts e mais nada. Aprovar um post sem ver o número que vai na imagem
 * é aprovar às cegas — e foi assim que a linha "675 trades · 63% · +7.060€" ficou dois meses a
 * sair em cartões novos depois de os números terem deixado de ser verdade.
 *
 * Junta três coisas que decidem juntas e viviam em ecrãs diferentes:
 *   • os FACTOS que entram nos cartões (vivos, dos pips)
 *   • o CONTEÚDO em fila (rascunhos, aprovados, publicados, falhados)
 *   • o FUNIL — quantas pessoas em cada degrau, do lead ao pagante
 */

async function autorizar(request: NextRequest): Promise<boolean> {
  const cabecalho = request.headers.get('Authorization') ?? ''
  const token = cabecalho.replace(/^Bearer\s+/i, '').trim()
  const db = getSupabaseAdmin()
  if (token) {
    const { data } = await db.auth.getUser(token)
    if (data.user) {
      const { data: p } = await db.from('profiles').select('user_type').eq('id', data.user.id).maybeSingle()
      if (p?.user_type === 'admin') return true
    }
  }
  // A página do admin já corre atrás do middleware; o cabeçalho é o segundo cadeado, não o único.
  return false
}

export async function GET(request: NextRequest) {
  if (!(await autorizar(request))) {
    return NextResponse.json({ error: 'Só para administradores' }, { status: 403 })
  }

  const db = getSupabaseAdmin()
  const prova = await getPipsProof()

  /**
   * A máquina de vendas, aqui dentro.
   *
   * O estado dela vivia no AIOS e no /admin/sales-machine, e quem aprovava conteúdo tinha de
   * saltar entre ecrãs para saber se havia gente à espera de acesso ou se o piloto automático
   * estava ligado. São decisões que se tomam juntas.
   */
  const maquina = await buildSalesState().catch(() => null)

  const [{ data: posts }, { data: leads }, { data: perfis }, { data: autopilotRow }] = await Promise.all([
    db.from('social_scheduled_posts').select('status, scheduled_at, ig_username, pillar, media_urls').limit(500),
    db.from('telegram_leads').select('interest, stage, interesse, mtmauto_passo, broker_uid, granted_at, created_at'),
    db.from('profiles').select('user_type, member_category, broker_verified, mtmcopy_subscription_active'),
    db.from('site_settings').select('value').eq('key', 'content_autopilot').maybeSingle(),
  ])

  const p = posts ?? []
  const contarPor = (campo: 'status' | 'pillar') =>
    Object.entries(
      p.reduce<Record<string, number>>((acc, x) => {
        const k = String(x[campo] ?? '—')
        acc[k] = (acc[k] ?? 0) + 1
        return acc
      }, {}),
    )
      .map(([chave, total]) => ({ chave, total }))
      .sort((a, b) => b.total - a.total)

  const agora = Date.now()
  const proximos = p
    .filter((x) => x.status === 'approved' && new Date(x.scheduled_at).getTime() > agora)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    .slice(0, 5)
    .map((x) => ({
      quando: x.scheduled_at,
      conta: x.ig_username,
      pilar: x.pillar,
      temImagem: (x.media_urls ?? []).length > 0,
    }))

  const l = leads ?? []
  const perf = perfis ?? []
  const ativo = (x: { user_type?: string | null }) => x.user_type !== 'inactive'

  return NextResponse.json({
    ok: true,

    // ── A máquina de vendas, em números ───────────────────────────────────────────────────
    maquina: maquina
      ? {
          resumo: salesStateSummary(maquina),
          novos24h: maquina.funnel.novos24h,
          acessosHoje: maquina.funnel.grantedToday,
          conversoes24h: maquina.conversions_24h,
          corretoraValidada: maquina.broker_clients,
          sinais24h: maquina.signals_24h,
          rascunhosPorRever: maquina.content.pending,
          autopilot: maquina.content.autopilot,
          // Os interruptores de execução: é aqui que se vê se um motor está desligado sem que
          // ninguém tenha dado por isso.
          execucao: Object.entries(maquina.execution).map(([chave, ligado]) => ({ chave, ligado })),
        }
      : null,

    // ── Os factos que entram nos cartões ──────────────────────────────────────────────────
    factos: {
      // Uma amostra pequena não é prova: publicar 3 trades como resultado é ruído com ar de
      // prova. Abaixo do mínimo não sai número nenhum, e o painel di-lo.
      publicavel: publicavel(prova),
      lista: factosParaCartao(prova),
      trades: prova?.executado.trades ?? 0,
      winRatePct: prova?.executado.winRatePct ?? null,
      pips: prova?.executado.pips ?? null,
      atualizadoEm: prova?.asOf ?? null,
      ressalva: RESSALVA_LEGAL,
    },

    // ── O conteúdo em fila ────────────────────────────────────────────────────────────────
    conteudo: {
      total: p.length,
      porEstado: contarPor('status'),
      porPilar: contarPor('pillar'),
      proximos,
      autopilot: Boolean((autopilotRow?.value as { morethanmoney?: boolean } | null)?.morethanmoney),
      // Um post aprovado sem imagem nunca publica: o Instagram exige media. Vale a pena vê-lo
      // aqui em vez de o descobrir pelo erro do cron.
      aprovadosSemImagem: p.filter((x) => x.status === 'approved' && !(x.media_urls ?? []).length).length,
      falhados: p.filter((x) => x.status === 'failed').length,
    },

    // ── O funil: quantos em cada degrau ───────────────────────────────────────────────────
    //
    // Por degraus e não por totais soltos: um número sozinho ("132 perfis") não diz onde a
    // conversão trava, e é a travagem que se quer ver.
    funil: {
      degraus: [
        { degrau: 'Leads no Telegram', total: l.length },
        { degrau: 'Disseram o que querem', total: l.filter((x) => x.interest || x.interesse).length },
        { degrau: 'Corretora validada', total: l.filter((x) => x.broker_uid).length },
        { degrau: 'Acesso concedido', total: l.filter((x) => x.granted_at).length },
        { degrau: 'Registados no site', total: perf.length },
        { degrau: 'Corretora ligada', total: perf.filter((x) => x.broker_verified).length },
        {
          degrau: 'Premium ou VIP',
          total: perf.filter(
            (x) => ativo(x) && ['premium', 'vip'].includes(String(x.member_category ?? '').toLowerCase()),
          ).length,
        },
        { degrau: 'MTM Copy pago', total: perf.filter((x) => x.mtmcopy_subscription_active).length },
      ],
      // Onde estão os que entraram no funil do MTM Auto, passo a passo.
      mtmauto: Object.entries(
        l.reduce<Record<string, number>>((acc, x) => {
          const k = String(x.mtmauto_passo ?? '—')
          acc[k] = (acc[k] ?? 0) + 1
          return acc
        }, {}),
      ).map(([passo, total]) => ({ passo, total })),
    },
  })
}
