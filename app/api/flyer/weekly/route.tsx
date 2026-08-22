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
import { getWeeklyFlyerStats, fmtSigned, fmtPt } from '@/lib/mtm-flyer/weekly-stats'

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

export async function GET(request: Request) {
  const url = new URL(request.url)
  const stats = await getWeeklyFlyerStats(url.searchParams.get('w'))
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || `${url.protocol}//${url.host}`

  const s = stats.scanner
  const winRate = s.wins + s.losses > 0 ? Math.round((s.wins / (s.wins + s.losses)) * 100) : 0
  const scannerUnit =
    s.points !== 0 ? `pips · ${fmtSigned(s.points)} pts índices` : 'pips'
  const bests: string[] = []
  if (s.bestPips > 0) bests.push(`+${fmtPt(s.bestPips)} pips (Scanner · ${s.bestSymbol ?? ''})`)
  if (stats.premium.bestPips > 0) bests.push(`+${fmtPt(stats.premium.bestPips)} pips (Premium · GOLD)`)

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
          <span style={{ color: '#fff' }}>RESULTADOS&nbsp;</span>
          <span style={{ color: GOLD }}>DA SEMANA</span>
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
            {`${stats.periodLabel} · SEG–SEX`}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 26 }}>
          <div style={{ display: 'flex', fontSize: 128, fontWeight: 700, color: GOLD, lineHeight: 1 }}>
            {fmtSigned(stats.totalPips)}
          </div>
          <div style={{ display: 'flex', fontSize: 34, letterSpacing: 4, fontWeight: 700, marginTop: 8 }}>
            PIPS ACUMULADOS EM SINAIS FECHADOS
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Card
            emoji="🥇"
            name="Sinais Premium"
            detail={`${stats.premium.trades} trades · ${stats.premium.wins}W/${stats.premium.losses}L`}
            value={fmtSigned(stats.premium.netPips)}
            unit={`pips ≈ $${fmtPt(Math.round(stats.premium.netPips * 0.1))} c/ 0.01`}
          />
          <Card
            emoji="📡"
            name="MTM Scanner V3.4"
            detail={`${s.signals} sinais fechados · ${winRate}% win rate`}
            value={fmtSigned(s.pips)}
            unit={scannerUnit}
          />
          <Card
            emoji="🧠"
            name="Sensei X"
            detail={`${stats.sensei.signals} sinais · XAUUSD`}
            value={fmtSigned(stats.sensei.pips)}
            unit={`pips ≈ $${fmtPt(Math.round(stats.sensei.pips * 0.1))} c/ 0.01`}
          />
          <Card
            emoji="⚔️"
            name="GoldKiller"
            detail={`${stats.goldkiller.signals} sinais fechados${stats.goldkiller.losses === 0 && stats.goldkiller.signals > 0 ? ' · sem perdas' : ''}`}
            value={fmtSigned(stats.goldkiller.pips)}
            unit={`pips ≈ $${fmtPt(Math.round(stats.goldkiller.pips * 0.1))} c/ 0.01`}
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
            {`🏆 Melhores trades: ${bests.join(' · ')}`}
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
          {`💰 Com lote mínimo 0.01 (forex/ouro) e 0.1 (índices): ≈ $${fmtPt(stats.minLotUsd)} na semana`}
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
          <div style={{ display: 'flex', fontSize: 38, fontWeight: 700 }}>QUERO RECEBER OS SINAIS 🚀</div>
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
          <div style={{ display: 'flex' }}>
            Conteúdo educativo — não constitui consultoria financeira. Simulação aproximada: ≈$0,10/pip a 0.01 lote.
          </div>
          <div style={{ display: 'flex' }}>
            Resultados passados não garantem resultados futuros. Trading envolve risco de perda de capital.
          </div>
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
