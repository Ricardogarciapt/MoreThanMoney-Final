/** npx tsx lib/webtrader/feed-directo/avisador.check.ts — o ecrã redesenha até 4×/s, nunca por tick. */
import { criarAvisador, RITMO_ECRA_MS } from './avisador'
const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function main() {
  let f = 0
  const certo = (c: boolean, o: string) => { if (!c) { f++; console.error('  ✗ ' + o) } }
  certo(RITMO_ECRA_MS === 250, 'ritmo do ecrã é 250 ms')
  const a = criarAvisador()
  let n = 0
  a.aoMudar(() => n++)
  // 100 ticks em ~1 s (um a cada 10 ms) → no máximo ~5 redesenhos, nunca 100.
  for (let i = 0; i < 100; i++) { a.avisar(); await dorme(10) }
  await dorme(300)
  certo(n >= 3 && n <= 6, `100 ticks num segundo dão 3–6 redesenhos, deram ${n}`)
  const antes = n
  await dorme(600)
  certo(n === antes, 'sem ticks não há redesenho')
  a.fechar()
  if (f) { console.error(`avisador: ${f} falha(s)`); process.exit(1) }
  console.log(`avisador: 100 ticks/s → ${antes} redesenhos; parado → 0 ✓`)
}
void main()
