/**
 * FLYER "Resultados da Semana" — imagem 1080×1920 (formato story) gerada ao vivo
 * com os números canónicos da semana (lib/mtm-flyer/weekly-stats).
 *
 * É esta imagem que o cron semanal envia por Telegram e agenda como Instagram
 * Story: o Telegram e o Graph API do IG fazem fetch deste URL diretamente, por
 * isso a rota é pública e devolve sempre PNG. `?w=YYYY-MM-DD` (segunda-feira)
 * permite regenerar semanas passadas.
 */

import { ImageResponse } from 'next/og'
import { getWeeklyFlyerStats, fmtSignedNum, fmtNum, winRatePct, type FlyerLang } from '@/lib/mtm-flyer/weekly-stats'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const GOLD = '#efb810'
const GREY = '#bdbdbd'

function Card({ emoji, name, detail, value, unit, compacto }: { emoji: string; name: string; detail: string; value: string; unit: string; compacto?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(255,255,255,0.05)',
        border: `1px solid rgba(239,184,16,0.35)`,
        borderRadius: 24,
        padding: compacto ? '12px 28px' : '22px 32px',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', fontSize: compacto ? 30 : 36, fontWeight: 700, color: '#fff' }}>{`${emoji} ${name}`}</div>
        <div style={{ display: 'flex', fontSize: compacto ? 21 : 24, color: GREY }}>{detail}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', fontSize: compacto ? 42 : 52, fontWeight: 700, color: GOLD, lineHeight: 1 }}>{value}</div>
        <div style={{ display: 'flex', fontSize: compacto ? 19 : 22, color: GREY, marginTop: 4 }}>{unit}</div>
      </div>
    </div>
  )
}

/** Textos por língua — o flyer sai SEMPRE em PT e EN (dois separados, pedido Ricardo). */
const STR = {
  pt: {
    title1: 'RESULTADOS ',
    title2: 'DA SEMANA',
    days: 'SEG–SEX',
    sub: 'PIPS EM TRADES FECHADAS · TODAS AS ESTRATÉGIAS',
    trades: 'trades',
    winRate: 'win rate',
    with: 'c/',
    pts: 'pontos',
    vazio: 'Sem trades fechadas nesta semana.',
    best: 'Melhores trades',
    minLot: (usd: string) => `💰 Com lote mínimo 0.01 (forex/ouro): ≈ $${usd} na semana`,
    cta: 'QUERO RECEBER OS SINAIS 🚀',
    disc0: 'Medido nas contas-mestre MTM (simuladas) que o MTM Auto copia. Índices e cripto em pontos, fora do total.',
    disc1: 'Conteúdo educativo — não constitui consultoria financeira. Simulação aproximada: ≈$0,10/pip a 0.01 lote.',
    disc2: 'Resultados passados não garantem resultados futuros. Trading envolve risco de perda de capital.',
  },
  en: {
    title1: 'WEEKLY ',
    title2: 'RESULTS',
    days: 'MON–FRI',
    sub: 'PIPS ON CLOSED TRADES · ALL STRATEGIES',
    trades: 'trades',
    winRate: 'win rate',
    with: 'w/',
    pts: 'points',
    vazio: 'No closed trades this week.',
    best: 'Best trades',
    minLot: (usd: string) => `💰 With minimum lot 0.01 (forex/gold): ≈ $${usd} this week`,
    cta: 'GET THE SIGNALS 🚀',
    disc0: 'Measured on the MTM master accounts (simulated) that MTM Auto copies. Indices and crypto in points, outside the total.',
    disc1: 'Educational content — not financial advice. Approximate simulation: ≈$0.10/pip at 0.01 lot.',
    disc2: 'Past results do not guarantee future results. Trading involves risk of capital loss.',
  },
} as const

export async function GET(request: Request) {
  const url = new URL(request.url)
  const lang: FlyerLang = url.searchParams.get('lang') === 'en' ? 'en' : 'pt'
  const t = STR[lang]
  const stats = await getWeeklyFlyerStats(url.searchParams.get('w'))
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || `${url.protocol}//${url.host}`

  const fmt = (n: number) => fmtNum(n, lang)
  const fmtS = (n: number) => fmtSignedNum(n, lang)
  const wr = (wins: number, losses: number) => {
    const p = winRatePct(wins, losses)
    return p == null ? '' : ` · ${p}% ${t.winRate}`
  }

  const periodLabel = lang === 'en' ? stats.periodLabelEn : stats.periodLabel
  const EMOJIS = ['🥇', '🥈', '🥉', '📡', '⚔️', '🧠', '🌀', '🎯']
  const lista = stats.estrategias.slice(0, 8)
  const compacto = lista.length > 5
  const bests = [...stats.estrategias]
    .filter((e) => e.bestPips > 0)
    .sort((x, y) => y.bestPips - x.bestPips)
    .slice(0, 2)
    .map((e) => `+${fmt(e.bestPips)} pips (${e.nome}${e.bestSymbol ? ` · ${e.bestSymbol}` : ''})`)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#000',
          color: '#fff',
          padding: '56px 64px 52px',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* moldura dourada */}
        <div
          style={{
            position: 'absolute',
            top: 28,
            left: 28,
            right: 28,
            bottom: 28,
            border: `2px solid rgba(239,184,16,0.5)`,
            borderRadius: 36,
            display: 'flex',
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${origin}/logo-mtm-transparent.png`} alt="" width={190} height={190} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', fontSize: 64, fontWeight: 700 }}>
          <span style={{ color: '#fff' }}>{t.title1}</span>
          <span style={{ color: GOLD }}>{t.title2}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14, marginBottom: 24 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 30,
              color: '#d9d9d9',
              letterSpacing: 2,
              border: `1px solid rgba(239,184,16,0.55)`,
              borderRadius: 999,
              padding: '12px 34px',
              background: 'rgba(239,184,16,0.07)',
            }}
          >
            {`${periodLabel} · ${t.days}`}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 26 }}>
          <div style={{ display: 'flex', fontSize: 128, fontWeight: 700, color: GOLD, lineHeight: 1 }}>
            {fmtS(stats.totalPips)}
          </div>
          <div style={{ display: 'flex', fontSize: 34, letterSpacing: 4, fontWeight: 700, marginTop: 8 }}>
            {t.sub}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: compacto ? 10 : 18 }}>
          {lista.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', fontSize: 30, color: GREY }}>{t.vazio}</div>
          ) : null}
          {lista.map((e, i) => {
            const emPips = e.pips !== 0 || e.points === 0
            const unit = emPips
              ? `pips ≈ $${fmt(Math.round(e.pips * 0.1))} ${t.with} 0.01${e.points !== 0 ? ` · ${fmtS(e.points)} ${t.pts}` : ''}`
              : t.pts
            return (
              <Card
                key={e.slug}
                compacto={compacto}
                emoji={EMOJIS[i] ?? '•'}
                name={e.nome}
                detail={`${e.trades} ${t.trades} · ${e.wins}W/${e.losses}L${wr(e.wins, e.losses)}`}
                value={fmtS(emPips ? e.pips : e.points)}
                unit={unit}
              />
            )
          })}
        </div>

        {bests.length > 0 ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginTop: 24,
              fontSize: 28,
              background: 'rgba(239,184,16,0.1)',
              border: `1px dashed rgba(239,184,16,0.5)`,
              borderRadius: 18,
              padding: '18px 24px',
            }}
          >
            {`🏆 ${t.best}: ${bests.join(' · ')}`}
          </div>
        ) : null}

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: 16,
            fontSize: 28,
            background: 'rgba(239,184,16,0.1)',
            border: `1px dashed rgba(239,184,16,0.5)`,
            borderRadius: 18,
            padding: '18px 24px',
          }}
        >
          {t.minLot(fmt(stats.minLotUsd))}
        </div>

        <div style={{ display: 'flex', flexGrow: 1 }} />

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            background: GOLD,
            color: '#000',
            borderRadius: 24,
            padding: '30px 36px',
          }}
        >
          <div style={{ display: 'flex', fontSize: 38, fontWeight: 700 }}>{t.cta}</div>
          <div style={{ display: 'flex', fontSize: 32, fontWeight: 700, marginTop: 8 }}>📲 WhatsApp +351 912 666 699</div>
          <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, marginTop: 6 }}>morethanmoney.pt/scanners</div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginTop: 22,
            fontSize: 19,
            color: '#9a9a9a',
            textAlign: 'center',
          }}
        >
          <div style={{ display: 'flex' }}>{t.disc0}</div>
          <div style={{ display: 'flex' }}>{t.disc1}</div>
          <div style={{ display: 'flex' }}>{t.disc2}</div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1920,
      emoji: 'twemoji',
      headers: {
        'Content-Type': 'image/png',
        // O IG/Telegram fazem fetch único; cache curto evita recomputar em retries.
        'Cache-Control': 'public, max-age=300',
      },
    },
  )
}
