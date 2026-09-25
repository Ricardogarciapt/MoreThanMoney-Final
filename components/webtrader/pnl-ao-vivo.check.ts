/**
 * GUARDA do P&L ao vivo. Isto mostra dinheiro REAL de contas reais: a regra que nunca pode cair é
 * «na dúvida, mostra-se o número da corretora, nunca um inventado».
 *
 *   npx tsx components/webtrader/pnl-ao-vivo.check.ts
 */
import { calibrar, lucroAoVivo, equityAoVivo, precoDeSaida, CALIBRACAO_VALIDA_MS, type PosicaoParaPnl } from './pnl-ao-vivo'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => { if (!ok) falhas.push(nome) }

const compra: PosicaoParaPnl = { symbol: 'XAUUSD', direcao: 'buy', volume: 0.1, precoEntrada: 4300, lucro: 20 }
const venda: PosicaoParaPnl = { symbol: 'EURUSD', direcao: 'sell', volume: 1, precoEntrada: 1.14, lucro: 50 }
const fresco = (bid: number, ask: number) => ({ bid, ask, fresco: true })

// Uma compra fecha ao BID, uma venda ao ASK — trocar isto dá um lucro errado por um spread inteiro.
teste('compra sai ao bid', precoDeSaida('buy', fresco(10, 12)) === 10)
teste('venda sai ao ask', precoDeSaida('sell', fresco(10, 12)) === 12)

// Calibração: 20 € com 2 pontos a favor = 10 €/ponto.
const cal = calibrar(compra, fresco(4302, 4302.2))
teste('calibra pelo que a corretora disse', !!cal && Math.abs(cal.porPonto - 10) < 1e-9)

// E entre sondagens o número move-se com o preço.
const maisUm = lucroAoVivo(compra, fresco(4303, 4303.2), cal)
teste('lucro move-se com o preço', maisUm.aoVivo && Math.abs((maisUm.valor ?? 0) - 30) < 1e-9)

// Venda: preço a descer é lucro a subir.
const calV = calibrar(venda, fresco(1.1394, 1.1395))
teste('calibra uma venda', !!calV && calV.porPonto > 0)
const vLucro = lucroAoVivo(venda, fresco(1.1384, 1.1385), calV)
teste('venda ganha quando o preço desce', (vLucro.valor ?? 0) > 50)

// ── as quedas para o valor da corretora ────────────────────────────────────
teste('preço não fresco → valor da corretora', lucroAoVivo(compra, { bid: 4310, ask: 4310.2, fresco: false }, cal).valor === 20)
teste('preço não fresco não se diz ao vivo', lucroAoVivo(compra, { bid: 4310, ask: 4310.2, fresco: false }, cal).aoVivo === false)
teste('sem calibração → valor da corretora', lucroAoVivo(compra, fresco(4310, 4310.2), null).valor === 20)
teste('calibração velha → valor da corretora',
  lucroAoVivo(compra, fresco(4310, 4310.2), cal, (cal?.em ?? 0) + CALIBRACAO_VALIDA_MS + 1).valor === 20)
teste('sem preço → valor da corretora', lucroAoVivo(compra, null, cal).valor === 20)

// Não calibrar a partir de ruído: em cima da entrada o divisor é zero.
teste('não calibra em cima da entrada', calibrar(compra, fresco(4300, 4300)) === null)
teste('não calibra sem lucro da corretora', calibrar({ ...compra, lucro: null }, fresco(4302, 4302.2)) === null)
// Factor negativo = a corretora ainda não tinha actualizado; não se usa.
teste('não aceita factor negativo', calibrar({ ...compra, lucro: -20 }, fresco(4302, 4302.2)) === null)

// Equity nunca se inventa.
teste('equity = saldo + flutuante', equityAoVivo(1000, 30) === 1030)
teste('sem saldo não há equity', equityAoVivo(null, 30) === null)
teste('sem flutuante não há equity', equityAoVivo(1000, null) === null)

// ── a LIGAÇÃO ao ecrã ──────────────────────────────────────────────────────
// O módulo pode estar perfeito e não servir de nada se ninguém o chamar: foi exactamente assim
// que a gestão automática viveu meses só no localStorage. A guarda verifica que o trader o usa.
import { readFileSync } from 'node:fs'
const trader = readFileSync('components/webtrader/corretora-trader.tsx', 'utf8')
teste('o trader calibra a cada sondagem', /calibrar\(/.test(trader))
teste('o trader mostra o lucro ao vivo', /lucroAoVivo\(/.test(trader))
teste('o trader recalcula a equity', /equityAoVivo\(/.test(trader))
// O cálculo precisa de saber se o preço é fresco — com `mapa` (que não traz `fresco`) devolvia
// sempre o número da corretora e ninguém dava por isso.
teste('o trader passa os preços com frescura à tabela', /vivos=\{vivos\}/.test(trader))

if (falhas.length) {
  console.error(`pnl-ao-vivo: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('pnl-ao-vivo: calibra pela corretora, move-se com o preço, e na dúvida não inventa ✓')
