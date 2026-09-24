/**
 * 01-exportar.mjs — LEITURA APENAS (nunca escreve na base).
 *
 * Porquê: o dono perguntou se um trailing diferente teria dado mais lucro na conta
 * mestre do Sensei (9782326a-5519-4c48-bda9-4080131f3ce5, login 77094082). Para
 * responder com números é preciso (a) os sinais originais do "MTM Sensei X" em
 * XAUUSD — que são a população verdadeira, muito maior do que as 10 posições da
 * conta — e (b) as posições reais da conta, para validar a reconstrução contra o
 * que aconteceu mesmo.
 *
 * Grava tudo em scripts/dados/ para o 02-simular.mjs trabalhar offline.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const env = Object.fromEntries(
  readFileSync(join(raiz, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const CONTA_MESTRE = '9782326a-5519-4c48-bda9-4080131f3ce5'
const dados = join(raiz, 'scripts', 'dados')

const { data: sinais, error: e1 } = await sb
  .from('tradingview_signals')
  .select('id, received_at, ticker, timeframe, action, price, sl, tp, signal_kind, alert_name')
  .eq('alert_name', 'MTM Sensei X')
  .eq('ticker', 'XAUUSD')
  .eq('signal_kind', 'entry')
  .order('received_at', { ascending: true })
  .limit(1000)
if (e1) throw e1

const { data: posicoes, error: e2 } = await sb
  .from('funded_positions')
  .select('id, symbol, direcao, volume, preco_entrada, sl, tp, preco_fecho, pnl, motivo_fecho, origem, ideia_ref, aberta_em, fechada_em, trailing_distancia, trailing_ativacao, be_gatilho, be_offset, be_no_tp1, be_feito, tps, risco_inicial, comentario, tick_entrada, tick_fecho')
  .eq('account_id', CONTA_MESTRE)
  .order('aberta_em', { ascending: true })
if (e2) throw e2

writeFileSync(join(dados, 'sinais-sensei-xauusd.json'), JSON.stringify(sinais, null, 1))
writeFileSync(join(dados, 'posicoes-mestre-sensei.json'), JSON.stringify(posicoes, null, 1))
console.log(`sinais entry XAUUSD: ${sinais.length} (${sinais[0]?.received_at} → ${sinais.at(-1)?.received_at})`)
console.log(`posicoes da conta mestre: ${posicoes.length}`)
