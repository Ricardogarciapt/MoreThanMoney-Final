/**
 * A GUARDA DO FALLBACK — npx tsx lib/webtrader/feed-directo/fonte.check.ts
 *
 * O caso mau: o feed da conta cai (token expirou, SDK a reconectar, 429 da TradeLocker) e o ecrã
 * fica SEM preços porque ninguém volta ao feed MTM — ou o contrário, uma reconexão de 2 s a atirar
 * o trader para o preço indicativo e de volta, a piscar.
 */
import { QUEDA_PARA_MTM_MS, decidirFonte } from './fonte'

const falhas: string[] = []
const teste = (nome: string, cond: boolean) => { if (!cond) falhas.push(nome) }
const T0 = 1_700_000_000_000

{
  const m = { caidoDesde: null }
  teste('sem feed → mtm', decidirFonte(null, m, T0) === 'mtm')
  teste('ligado → conta', decidirFonte('ligado', m, T0) === 'conta')
  teste('cai: nos primeiros 10 s continua conta (reconexão)', decidirFonte('caido', m, T0 + 1000) === 'conta')
  teste('aos 5 s ainda conta', decidirFonte('caido', m, T0 + 5000) === 'conta')
  // A contagem começa no PRIMEIRO instante em que se viu o feed caído (T0+1 s), não em T0.
  teste('passados >10 s caído → mtm', decidirFonte('caido', m, T0 + 1000 + QUEDA_PARA_MTM_MS + 1) === 'mtm')
  teste('volta a ligar → conta outra vez', decidirFonte('ligado', m, T0 + 20_000) === 'conta')
  teste('e a memória da queda limpa-se', m.caidoDesde === null)
  teste('cai de novo: conta a contar do zero', decidirFonte('caido', m, T0 + 30_000) === 'conta' && m.caidoDesde === T0 + 30_000)
}

if (falhas.length) { console.error('FALHOU:\n - ' + falhas.join('\n - ')); process.exit(1) }
console.log('fonte.check: tudo verde')
