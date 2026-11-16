import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { sendTelegramChannelMessage } from '@/lib/mtmcopy/telegram-bot'
import {
  arquivarPorDesempenho,
  guardarSemanas,
  medirSemanas,
  semanasParaArquivo,
  SEMANAS_NEGATIVAS_PARA_ARQUIVO,
} from '@/lib/mtmauto/semanas-estrategias'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const ADMIN_CHAT = () => process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || '1446687230'

/**
 * AS SEMANAS DAS ESTRATÉGIAS + A REGRA DO ARQUIVO — sábado 09:30 UTC, antes do flyer (10:00).
 *
 * 1. Mede os pips por semana de cada estratégia na conta-mestre e guarda-os
 *    (`site_settings.estrategias_semanas`) — é daí que o flyer tira as estratégias em uso.
 * 2. Regra do dono (16/11/2026): três semanas FECHADAS seguidas, todas com trades e todas
 *    negativas em pips → arquivo. Sai dos catálogos e das estatísticas, a cópia pára, a mestre
 *    continua a medir em sombra. O admin recebe o aviso com as semanas que o justificam.
 *
 * `?seco=1` mede e diz o que arquivaria, sem guardar nem arquivar nada.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const seco = request.nextUrl.searchParams.get('seco') === '1'
  const db = getSupabaseAdmin()
  try {
    const retrato = await medirSemanas(db)
    if (!seco) await guardarSemanas(db, retrato)

    const { data: provs } = await db
      .from('mtmauto_providers').select('id, slug').is('apagado_em', null).is('arquivada_em', null)
    const idDe = new Map((provs ?? []).map((p) => [String(p.slug), String(p.id)]))

    const arquivadas: Array<{ slug: string; nome: string; semanas: string; ok: boolean; erro?: string }> = []
    for (const e of retrato.estrategias) {
      if (e.arquivada || !idDe.has(e.slug)) continue
      const negativas = semanasParaArquivo(e.semanas)
      if (!negativas) continue
      const resumo = negativas
        .map((s) => `${s.inicio.slice(8, 10)}/${s.inicio.slice(5, 7)}: ${Math.round(s.pips + s.pontos)} (${s.trades} trades)`)
        .join(' · ')
      if (seco) {
        arquivadas.push({ slug: e.slug, nome: e.nome, semanas: resumo, ok: true })
        continue
      }
      const r = await arquivarPorDesempenho(
        db,
        { id: idDe.get(e.slug)!, slug: e.slug },
        `${SEMANAS_NEGATIVAS_PARA_ARQUIVO} semanas negativas em pips`,
      )
      arquivadas.push({ slug: e.slug, nome: e.nome, semanas: resumo, ok: r.ok, erro: r.erro })
    }

    if (!seco && arquivadas.length) {
      const texto = [
        '🗄️ Estratégias arquivadas pela regra das 3 semanas negativas',
        '',
        ...arquivadas.map((a) => `• ${a.nome} — ${a.semanas}${a.ok ? '' : ` ⚠️ ${a.erro}`}`),
        '',
        'Saíram dos catálogos e das estatísticas do MTM Auto e do MTM System; a cópia parou. A mestre continua a medir em sombra.',
        'Para reverter: no Centro de Controlo, ou arquivada_em = null em mtmauto_providers.',
      ].join('\n')
      await sendTelegramChannelMessage(ADMIN_CHAT(), texto).catch(() => undefined)
    }

    return NextResponse.json({
      ok: true,
      seco,
      em: retrato.em,
      estrategias: retrato.estrategias.map((e) => ({
        slug: e.slug, ativo: e.ativo, arquivada: e.arquivada,
        ultimas: e.semanas.slice(-4).map((s) => ({ inicio: s.inicio, trades: s.trades, pips: s.pips, pontos: s.pontos, fechada: s.fechada })),
      })),
      arquivadas,
    })
  } catch (e) {
    console.error('[CRON estrategias-semanas]', e)
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'erro' }, { status: 500 })
  }
}
