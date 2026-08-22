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

function Card({ emoji, name, detail, value, unit }: { emoji: string; name: string; detail: string; value: string; unit: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(255,255,255,0.05)',
        border: `1px solid rgba(239,184,16,0.35)`,
        borderRadius: 24,
        padding: '22px 32px',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', fontSize: 36, fontWeight: 700, color: '#fff' }}>{`${emoji} ${name}`}</div>
        <div style={{ display: 'flex', fontSize: 24, color: GREY }}>{detail}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', fontSize: 52, fontWeight: 700, color: GOLD, lineHeight: 1 }}>{value}</div>
        <div style={{ display: 'flex', fontSize: 22, color: GREY, marginTop: 4 }}>{unit}</div>
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
    sub: 'PIPS ACUMULADOS EM SINAIS FECHADOS',
    premium: 'Sinais Premium',
    trades: 'trades',
    signals: 'sinais',
    closedSignals: 'sinais fechados',
    noLosses: ' · sem perdas',
    winRate: 'win rate',
    with: 'c/',
    idxPts: 'pts índices',
    best: 'Melhores trades',
    minLot: (usd: string) => `💰 Com lote mínimo 0.01 (forex/ouro) e 0.1 (índices): ≈ $${usd} na semana`,
    cta: 'QUERO RECEBER OS SINAIS 🚀',
    disc1: 'Conteúdo educativo — não constitui consultoria financeira. Simulação aproximada: ≈$0,10/pip a 0.01 lote.',
    disc2: 'Resultados passados não garantem resultados futuros. Trading envolve risco de perda de capital.',
  },
  en: {
    title1: 'WEEKLY ',
    title2: 'RESULTS',
    days: 'MON–FRI',
    sub: 'TOTAL PIPS ON CLOSED SIGNALS',
    premium: 'Premium Signals',
    trades: 'trades',
    signals: 'signals',
    closedSignals: 'closed signals',
    noLosses: ' · no losses',
    winRate: 'win rate',
    with: 'w/',
    idxPts: 'index pts',
    best: 'Best trades',
    minLot: (usd: string) => `💰 With minimum lot 0.01 (forex/gold) and 0.1 (indices): ≈ $${usd} this week`,
    cta: 'GET THE SIGNALS 🚀',
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

  const s = stats.scanner
  const periodLabel = lang === 'en' ? stats.periodLabelEn : stats.periodLabel
  const scannerUnit = s.points !== 0 ? `pips · ${fmtS(s.points)} ${t.idxPts}` : 'pips'
  const bests: string[] = []
  if (s.bestPips > 0) bests.push(`+${fmt(s.bestPips)} pips (Scanner · ${s.bestSymbol ?? ''})`)
  if (stats.premium.bestPips > 0) bests.push(`+${fmt(stats.premium.bestPips)} pips (Premium · GOLD)`)

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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Card
            emoji="🥇"
            name={t.premium}
            detail={`${stats.premium.trades} ${t.trades} · ${stats.premium.wins}W/${stats.premium.losses}L${wr(stats.premium.wins, stats.premium.losses)}`}
            value={fmtS(stats.premium.netPips)}
            unit={`pips ≈ $${fmt(Math.round(stats.premium.netPips * 0.1))} ${t.with} 0.01`}
          />
          <Card
            emoji="📡"
            name="MTM Scanner V3.4"
            detail={`${s.signals} ${t.closedSignals}${wr(s.wins, s.losses)}`}
            value={fmtS(s.pips)}
            unit={scannerUnit}
          />
          <Card
            emoji="🧠"
            name="Sensei X"
            detail={`${stats.sensei.signals} ${t.signals} · XAUUSD${wr(stats.sensei.wins, stats.sensei.losses)}`}
            value={fmtS(stats.sensei.pips)}
            unit={`pips ≈ $${fmt(Math.round(stats.sensei.pips * 0.1))} ${t.with} 0.01`}
          />
          <Card
            emoji="⚔️"
            name="GoldKiller"
            detail={`${stats.goldkiller.signals} ${t.closedSignals}${stats.goldkiller.losses === 0 && stats.goldkiller.signals > 0 ? t.noLosses : ''}${wr(stats.goldkiller.wins, stats.goldkiller.losses)}`}
            value={fmtS(stats.goldkiller.pips)}
            unit={`pips ≈ $${fmt(Math.round(stats.goldkiller.pips * 0.1))} ${t.with} 0.01`}
          />
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
