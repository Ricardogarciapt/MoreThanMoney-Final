/**
 * A GUARDA DA FRESCURA DOS PREÇOS.
 *
 *   npx tsx lib/webtrader/frescura-preco.check.ts
 *
 * O caso mau é o que foi medido a 01/10: um preço de 5 de Junho servido como se fosse de agora.
 * Não dá erro — dá um número plausível, que é pior.
 */
import { FRESCO_SEGUNDOS, avisoParaOTicket, frescuraDoPreco } from './frescura-preco'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }
const AGORA = new Date('2026-10-01T17:00:00Z')
const haSeg = (s: number) => new Date(AGORA.getTime() - s * 1000).toISOString()

// ── Vivo ────────────────────────────────────────────────────────────────────
{
  const f = frescuraDoPreco(haSeg(10), AGORA)
  teste('um tick de há 10 s está vivo', f.grau === 'vivo' && f.fresco)
  teste('e não leva ressalva nenhuma', f.rotulo === '' && avisoParaOTicket(f) === null)
  teste('no limite ainda está vivo', frescuraDoPreco(haSeg(FRESCO_SEGUNDOS), AGORA).fresco)
  teste('um segundo depois já não', !frescuraDoPreco(haSeg(FRESCO_SEGUNDOS + 1), AGORA).fresco)
}

// ── O CASO MAU: o preço de Junho ────────────────────────────────────────────
{
  /**
   * 5 de Junho a 1 de Outubro: quase quatro meses. `precoIndicativo` devolvia-o na mesma, e o
   * ticket mostrava-o como se fosse o preço de agora.
   */
  const junho = frescuraDoPreco('2026-06-05T18:49:53Z', AGORA)
  teste('o preço de Junho não é fresco', !junho.fresco)
  teste('e é classificado como morto', junho.grau === 'morto')
  teste('e o rótulo diz há quanto tempo', /meses/.test(junho.rotulo))
  teste('e o ticket avisa que o preço pode não existir',
    (avisoParaOTicket(junho) ?? '').includes('pode não existir'))
}

// ── O fim-de-semana NÃO é um defeito ────────────────────────────────────────
{
  /**
   * Ao sábado o EURUSD tem legitimamente o preço de sexta à noite. Recusar o preço velho apagava
   * o gráfico de toda a gente ao fim de semana — por isso declara-se em vez de se esconder.
   */
  const sabado = frescuraDoPreco(haSeg(36 * 3600), AGORA)
  teste('o fecho de sexta não é dado como morto', sabado.grau === 'sessao_anterior')
  teste('mas também não passa por actual', !sabado.fresco)
  teste('e o ecrã diz que é fecho anterior', sabado.rotulo.includes('fecho anterior'))
  // Um feriado à segunda a seguir ao fim de semana ainda cabe.
  teste('70 horas ainda é sessão anterior', frescuraDoPreco(haSeg(70 * 3600), AGORA).grau === 'sessao_anterior')
  teste('uma semana já é morto', frescuraDoPreco(haSeg(7 * 24 * 3600), AGORA).grau === 'morto')
}

// ── Falta de informação nunca vira «está tudo bem» ──────────────────────────
{
  for (const mau of [null, undefined, '', 'ontem', 'NaN']) {
    const f = frescuraDoPreco(mau as never, AGORA)
    teste(`«${String(mau)}» não passa por fresco`, !f.fresco && f.grau === 'morto')
  }
  // Relógio trocado: uma data no futuro não promove o preço a vivo.
  teste('uma data no futuro não é viva', !frescuraDoPreco(new Date(AGORA.getTime() + 86_400_000), AGORA).fresco)
}

// ── O intermédio ────────────────────────────────────────────────────────────
{
  const f = frescuraDoPreco(haSeg(20 * 60), AGORA)
  teste('20 minutos é atrasado', f.grau === 'atrasado')
  teste('e o aviso lembra que a execução é na corretora',
    (avisoParaOTicket(f) ?? '').includes('corretora'))
}

if (falhas.length) {
  console.error(`webtrader/frescura: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('webtrader/frescura: um preço velho mostra-se como velho, e o fim-de-semana não é um defeito ✓')
