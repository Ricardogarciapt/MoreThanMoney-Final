/** npx tsx lib/webtrader/feed-directo/velas-tecto.check.ts — a corretora lenta não deixa o gráfico em branco. */
import { comTecto } from '../../../components/funded/armazem-velas'
async function main() {
  let f = 0
  const certo = (c: boolean, o: string) => { if (!c) { f++; console.error('  ✗ ' + o) } }
  const lenta = new Promise<number[]>((r) => setTimeout(() => r([1]), 500))
  const t0 = Date.now()
  let caiu = false
  try { await comTecto(lenta, 100) } catch { caiu = true }
  certo(caiu && Date.now() - t0 < 300, 'histórico lento é abandonado no tecto (e cai para a rota)')
  certo((await comTecto(Promise.resolve([1, 2]), 100)).length === 2, 'histórico a tempo passa intacto')
  let erro = false
  try { await comTecto(Promise.reject(new Error('x')), 100) } catch { erro = true }
  certo(erro, 'erro da corretora também cai para a rota')
  if (f) { console.error(`velas-tecto: ${f} falha(s)`); process.exit(1) }
  console.log('velas-tecto: corretora lenta ou com erro → velas do feed MTM, nunca gráfico vazio ✓')
}
void main()
