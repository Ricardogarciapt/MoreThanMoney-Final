/**
 * A GUARDA DA PODA DO FEED DE PREÇOS.
 *
 *   npx tsx lib/webtrader/simbolos-seguidos.check.ts
 *
 * O caso mau é o reflexo: podar só pela frescura. O GBPAUD tinha posições E o preço parado há
 * dias — e um corte pela frescura tirava-lhe o preço sem ninguém dar por isso.
 */
import { VIVO_SEGUNDOS, decidirFeed } from './simbolos-seguidos'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }
const AGORA = new Date('2026-10-01T17:00:00Z')
const haSeg = (s: number) => new Date(AGORA.getTime() - s * 1000).toISOString()

// ── O CASO MAU: parado mas negociado ────────────────────────────────────────
{
  const feed = [
    { symbol: 'EURUSD', em: haSeg(5) },            // vivo e negociado
    { symbol: 'GBPAUD', em: haSeg(4 * 24 * 3600) }, // PARADO há 4 dias, mas com posições
    { symbol: 'COCOA', em: haSeg(120 * 24 * 3600) },// parado e nunca negociado
  ]
  const d = decidirFeed(feed, ['EURUSD', 'GBPAUD'], AGORA)
  teste('o símbolo parado MAS negociado fica', d.manter.includes('GBPAUD'))
  teste('e aparece como salvo pela actividade', d.salvosPelaActividade.includes('GBPAUD'))
  teste('o parado e nunca negociado sai', d.remover.includes('COCOA'))
  teste('o vivo fica', d.manter.includes('EURUSD'))
  teste('e nada fica nos dois lados', d.manter.every((s) => !d.remover.includes(s)))
}

// ── A frescura sozinha não basta, e a actividade sozinha também não ─────────
{
  // Um símbolo vivo que nunca foi negociado fica na mesma: o motor já o alimenta e é o catálogo
  // que a casa mostra. Podar isso era partir a montra para poupar nada.
  const d = decidirFeed([{ symbol: 'XAGUSD', em: haSeg(10) }], [], AGORA)
  teste('vivo sem actividade fica', d.manter.includes('XAGUSD') && d.remover.length === 0)
  teste('e não conta como salvo pela actividade', d.salvosPelaActividade.length === 0)
}

// ── Os limites ──────────────────────────────────────────────────────────────
{
  teste('no limite ainda é vivo', decidirFeed([{ symbol: 'A', em: haSeg(VIVO_SEGUNDOS) }], [], AGORA).manter.length === 1)
  teste('um segundo depois já não', decidirFeed([{ symbol: 'A', em: haSeg(VIVO_SEGUNDOS + 1) }], [], AGORA).remover.length === 1)
  // Sem hora de leitura não é vivo — falta de informação não vira «está tudo bem».
  teste('sem hora não é vivo', decidirFeed([{ symbol: 'A', em: null }], [], AGORA).remover.includes('A'))
  teste('mas sem hora E com actividade fica', decidirFeed([{ symbol: 'A', em: null }], ['A'], AGORA).manter.includes('A'))
  // Caixa e espaços não fazem um símbolo diferente.
  teste('a caixa não engana', decidirFeed([{ symbol: ' eurusd ', em: null }], ['EURUSD'], AGORA).manter.includes('EURUSD'))
  teste('linha sem símbolo não entra', decidirFeed([{ symbol: '', em: haSeg(1) }], [], AGORA).manter.length === 0)
}

if (falhas.length) {
  console.error(`webtrader/simbolos: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('webtrader/simbolos: a actividade ganha sempre à frescura — um símbolo negociado nunca perde o preço ✓')
