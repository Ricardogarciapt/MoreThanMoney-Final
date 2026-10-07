/**
 * OURO À VISTA, NUNCA O FUTURO (auditoria Sensei 07/10/2026).
 *
 * O avaliador dos Alertas MTM lia o XAUUSD do GC=F (futuro, ~25 USD acima do spot) e marcava
 * «loss» em todas as vendas do Sensei no primeiro minuto. Este teste prende:
 *  · o preço da casa só vale fresco (o avaliador não decide com um retrato velho);
 *  · o mapa da Yahoo deixou de ser o caminho do XAUUSD.
 *
 * Correr: npx tsx lib/mtm-alerts/evaluate-ouro.check.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'x'

async function main() {
  const { precoSpotFresco } = await import('./evaluate')
  const quase = (a: number | null, b: number, msg: string) => assert.ok(a != null && Math.abs(a - b) < 1e-6, msg)
  const agora = Date.parse('2026-10-07T14:14:40Z')

  quase(
    precoSpotFresco({ bid: '4097.36', ask: '4097.52', em: '2026-10-07T14:14:30.096Z', em_mercado: '2026-10-07T14:14:30.016Z' }, agora),
    4097.44,
    'meio do bid/ask da casa',
  )
  assert.equal(
    precoSpotFresco({ bid: 4097.36, ask: 4097.52, em: '2026-10-07T14:14:30Z', em_mercado: '2026-10-07T14:00:00Z' }, agora),
    null,
    'o mercado parado há 14 min não serve para decidir um desfecho',
  )
  quase(
    precoSpotFresco({ bid: 4097.36, ask: 4097.52, em: '2026-10-07T14:14:30Z', em_mercado: '2026-10-07T14:00:00Z' }, agora, 4 * 86_400_000),
    4097.44,
    'um ecrã que só mostra a cotação aceita o último preço',
  )
  assert.equal(precoSpotFresco({ bid: 0, ask: 4097, em: '2026-10-07T14:14:30Z' }, agora), null)
  assert.equal(precoSpotFresco(null, agora), null)

  // O caso real: venda do Sensei 07/10 08:00 — entrada 4132,73, stop 4138,58. Com o futuro (~+25)
  // o preço «estava» acima do stop; com o spot não.
  const futuro = 4132.73 + 25
  assert.ok(futuro >= 4138.58, 'com o GC=F a venda batia no stop no primeiro minuto')

  const fonte = readFileSync(join(__dirname, 'evaluate.ts'), 'utf8')
  const corpo = fonte.slice(fonte.indexOf('export async function resolveCurrentPrice'))
  assert.ok(
    corpo.indexOf('SIMBOLOS_PRECO_DA_CASA[clean]') > -1 &&
      corpo.indexOf('SIMBOLOS_PRECO_DA_CASA[clean]') < corpo.indexOf('YAHOO_MAP[clean]'),
    'o XAUUSD resolve-se pelo preço da casa ANTES de chegar ao mapa da Yahoo',
  )
  console.log('evaluate-ouro: ok')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
