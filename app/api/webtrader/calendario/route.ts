import { NextRequest, NextResponse } from 'next/server'
import { eventosDasMoedas, moedasDoSimbolo } from '@/lib/webtrader/calendario'

/**
 * EVENTOS DO CALENDÁRIO ECONÓMICO de um símbolo, para o gráfico do WebTrader (lib/webtrader/calendario.ts).
 *
 *   GET ?symbol=EURUSD → { eventos, moedas, semChave? }
 *
 * Os 3 dias para trás e os 7 para a frente, impacto médio e alto. A chamada à Finnhub fica em cache
 * 30 min no servidor (uma por janela de datas para todos os símbolos), e a chave nunca sai daqui.
 * Sem FINNHUB_API_KEY responde vazio com `semChave` — o gráfico continua, só sem eventos.
 */
export const revalidate = 1800

const DIA = 86_400_000
const dia = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export async function GET(request: NextRequest) {
  const symbol = (request.nextUrl.searchParams.get('symbol') ?? '').slice(0, 24)
  const moedas = moedasDoSimbolo(symbol)
  const chave = process.env.FINNHUB_API_KEY
  if (!chave) return NextResponse.json({ eventos: [], moedas, semChave: true })
  if (!moedas.length) return NextResponse.json({ eventos: [], moedas })
  // Janela arredondada ao dia: todos os pedidos do dia partilham a mesma resposta em cache.
  const hoje = Math.floor(Date.now() / DIA) * DIA
  const url = `https://finnhub.io/api/v1/calendar/economic?from=${dia(hoje - 3 * DIA)}&to=${dia(hoje + 7 * DIA)}&token=${encodeURIComponent(chave)}`
  try {
    const r = await fetch(url, { next: { revalidate: 1800 } })
    if (!r.ok) return NextResponse.json({ eventos: [], moedas, erro: `finnhub ${r.status}` }, { status: 502 })
    const d = await r.json()
    return NextResponse.json({ eventos: eventosDasMoedas(d?.economicCalendar ?? [], moedas), moedas }, {
      headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=600' },
    })
  } catch {
    return NextResponse.json({ eventos: [], moedas, erro: 'finnhub indisponível' }, { status: 502 })
  }
}
