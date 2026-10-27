/**
 * Puxa velas XAUUSD (M5 e M15) da MetaApi desde 01/06/2026 para a tabela _bt_velas
 * (sym XAUUSD_M5_P e XAUUSD_M15_P; apaga as anteriores com esses nomes antes de gravar),
 * para o estudo do MTM Premium Scanner (scripts/estudos/premium-scanner-check.py).
 *
 *   npx tsx scripts/estudos/premium-velas-puxar.ts [desde=2026-06-01] [--csv <pasta>]
 *
 * Com --csv não escreve na Supabase: grava <pasta>/xau-m15.csv e <pasta>/xau-m5.csv (t,o,h,l,c).
 *
 * Mesma fonte e mesma conta provider que scripts/estudos/sensei-check.ts (o histórico do WebTrader).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

for (const ln of readFileSync(resolve(__dirname, '../../.env.local'), 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(ln.trim())
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const MERCADO = 'https://mt-market-data-client-api-v1.new-york.agiliumtrade.ai'
const args = process.argv.slice(2)
const iCsv = args.indexOf('--csv')
const pastaCsv = iCsv >= 0 ? args[iCsv + 1] : ''
const dataArg = args.find((a, i) => !a.startsWith('--') && (iCsv < 0 || i !== iCsv + 1))
const desde = Date.parse((dataArg || '2026-06-01') + 'T00:00:00Z')

async function main() {
  const { getSupabaseAdmin } = await import('../../lib/supabase-admin-client')
  const sb = getSupabaseAdmin()
  const { data } = await sb.from('mtm_trading_accounts').select('metaapi_account_id').eq('tipo', 'provider').not('metaapi_account_id', 'is', null)
  const { data: s } = await sb.from('funded_symbols').select('simbolo_fonte').eq('symbol', 'XAUUSD').maybeSingle()
  const contas = [...new Set((data ?? []).map((d) => d.metaapi_account_id as string))]
  const simbolos = [...new Set([String(s?.simbolo_fonte || 'XAUUSD'), 'XAUUSD'])]

  let conta = '', fonte = ''
  achar: for (const c of contas) for (const simb of simbolos) {
    const r = await fetch(`${MERCADO}/users/current/accounts/${c}/historical-market-data/symbols/${encodeURIComponent(simb)}/timeframes/15m/candles?limit=2`,
      { headers: { 'auth-token': process.env.METAAPI_TOKEN! } }).catch(() => null)
    if (r?.ok) { conta = c; fonte = simb; break achar }
  }
  if (!conta) throw new Error('nenhuma conta provider serve histórico de XAUUSD')
  console.log(`conta ${conta.slice(0, 8)}… símbolo ${fonte}`)

  for (const tf of ['15m', '5m']) {
    const sym = tf === '5m' ? 'XAUUSD_M5_P' : 'XAUUSD_M15_P'
    if (!pastaCsv) await sb.from('_bt_velas').delete().eq('sym', sym)
    const csv: string[] = []
    let ate = Date.now(), total = 0
    while (ate > desde) {
      const url = `${MERCADO}/users/current/accounts/${conta}/historical-market-data/symbols/${encodeURIComponent(fonte)}/timeframes/${tf}/candles?startTime=${new Date(ate).toISOString()}&limit=1000`
      const r = await fetch(url, { headers: { 'auth-token': process.env.METAAPI_TOKEN! } })
      if (!r.ok) throw new Error(`MetaApi ${tf} ${r.status} ${await r.text()}`)
      const lote = (await r.json()) as Array<Record<string, unknown>>
      if (!lote.length) break
      const linhas = lote.map((v) => ({
        sym, t: Math.floor(Date.parse(String(v.time)) / 1000), o: +v.open!, h: +v.high!, l: +v.low!, c: +v.close!,
      })).filter((x) => x.t * 1000 >= desde && x.t * 1000 < ate)
      if (pastaCsv) for (const x of linhas) csv.push(`${x.t},${x.o},${x.h},${x.l},${x.c}`)
      else if (linhas.length) {
        const { error } = await sb.from('_bt_velas').insert(linhas.map(({ o: _o, ...x }) => x))
        if (error) throw error
      }
      total += linhas.length
      const minT = Math.min(...lote.map((v) => Date.parse(String(v.time))))
      if (lote.length < 2 || minT >= ate) break
      ate = minT
      process.stdout.write(`\r${tf}: ${total} velas, até ${new Date(ate).toISOString().slice(0, 10)}   `)
    }
    if (pastaCsv) {
      mkdirSync(pastaCsv, { recursive: true })
      writeFileSync(resolve(pastaCsv, tf === '5m' ? 'xau-m5.csv' : 'xau-m15.csv'), csv.sort((a, b) => +a.split(',')[0] - +b.split(',')[0]).join('\n') + '\n')
    }
    console.log(`\n${tf}: ${total} velas gravadas`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
