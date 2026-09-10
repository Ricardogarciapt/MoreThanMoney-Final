/**
 * O motor que decide quem fica e quem sai de um torneio com prémios a sério.
 *
 * Tudo é medido sobre EQUITY, não sobre saldo: medir a saldo deixa passar quem está a −40%
 * com a posição aberta e só fecha quando lhe convém — é o buraco clássico dos challenges
 * caseiros, e é dinheiro e reputação a sair pela porta.
 */
import { avaliarConta, ordenarClassificacao, type RegrasConta, type EstadoConta } from '../regras'

let ok = 0
let mau = 0
function eq(nome: string, a: unknown, b: unknown) {
  if (a === b) { ok++; return }
  mau++
  console.error(`✗ ${nome}\n   esperado: ${String(b)}\n   obtido:   ${String(a)}`)
}

const R: RegrasConta = { perda_diaria_pct: 5, perda_maxima_pct: 10, dias_minimos: 10, consistencia_pct: 40 }
const base = (p: Partial<EstadoConta>): EstadoConta => ({
  saldoInicial: 10000, equity: 10000, saldoReferenciaDia: 10000,
  lucroPorDia: {}, diasNegociados: 10, ...p,
})

// ── perda diária ───────────────────────────────────────────────────────────
eq('a 5% exactos quebra', avaliarConta(R, base({ equity: 9500 })).motivo, 'perda_diaria')
eq('um cêntimo acima não quebra', avaliarConta(R, base({ equity: 9500.01 })).quebrou, false)
eq('em lucro não quebra', avaliarConta(R, base({ equity: 10500 })).quebrou, false)
// Um dia que abre mais alto sobe o chão: quem ganhou ontem não pode perder tudo hoje.
eq('o chão do dia sobe com o saldo', avaliarConta(R, base({ equity: 10400, saldoReferenciaDia: 11000 })).motivo, 'perda_diaria')

// ── perda máxima, e qual das duas se reporta ───────────────────────────────
eq('a 10% do inicial quebra', avaliarConta(R, base({ equity: 9000, saldoReferenciaDia: 9400 })).motivo, 'perda_maxima')
// As duas ao mesmo tempo: reporta-se a mais grave, senão descreve-se mal o que aconteceu.
eq('as duas juntas → perda máxima', avaliarConta(R, base({ equity: 8000 })).motivo, 'perda_maxima')

// ── o resultado ────────────────────────────────────────────────────────────
eq('+10%', avaliarConta(R, base({ equity: 11000 })).resultadoPct, 10)
eq('−2,5%', avaliarConta(R, base({ equity: 9750 })).resultadoPct, -2.5)
eq('saldo inicial zero não rebenta', avaliarConta(R, base({ saldoInicial: 0 })).resultadoPct, 0)
eq('saldo inicial zero não é elegível', avaliarConta(R, base({ saldoInicial: 0 })).elegivel, false)

// ── dias mínimos ───────────────────────────────────────────────────────────
eq('com 9 dias não conta', avaliarConta(R, base({ equity: 12000, diasNegociados: 9 })).elegivel, false)
eq('com 10 dias conta', avaliarConta(R, base({ equity: 12000, diasNegociados: 10 })).elegivel, true)
eq('e continua vivo', avaliarConta(R, base({ equity: 12000, diasNegociados: 9 })).quebrou, false)

// ── consistência ───────────────────────────────────────────────────────────
// 1000 de lucro, 500 num só dia = 50% > 40% → não conta.
eq('um dia a valer metade não conta',
   avaliarConta(R, base({ equity: 11000, lucroPorDia: { a: 500, b: 300, c: 200 } })).elegivel, false)
// 350 de 1000 = 35% → conta.
eq('espalhado conta',
   avaliarConta(R, base({ equity: 11000, lucroPorDia: { a: 350, b: 350, c: 300 } })).elegivel, true)
// Numa conta em PERDA a regra não se aplica: seria aritmética sem significado.
eq('conta em perda não é julgada pela consistência',
   avaliarConta(R, base({ equity: 9800, lucroPorDia: { a: 500, b: -700 } })).elegivel, true)

// ── prazo ──────────────────────────────────────────────────────────────────
const comPrazo: RegrasConta = { ...R, dias_maximos: 90 }
eq('dentro do prazo', avaliarConta(comPrazo, base({ diasDecorridos: 90 })).quebrou, false)
eq('passado o prazo', avaliarConta(comPrazo, base({ diasDecorridos: 91 })).motivo, 'tempo_esgotado')

// ── margens (o que se mostra ao participante) ──────────────────────────────
eq('margem diária', avaliarConta(R, base({ equity: 10000 })).margemDiaria, 500)
eq('margem total', avaliarConta(R, base({ equity: 10000 })).margemTotal, 1000)

// ── classificação ──────────────────────────────────────────────────────────
const linhas = [
  { nome: 'quebrado com +50%', resultadoPct: 50, elegivel: false, quebrou: true },
  { nome: 'poucos dias, +30%', resultadoPct: 30, elegivel: false, quebrou: false },
  { nome: 'elegível +5%', resultadoPct: 5, elegivel: true, quebrou: false, drawdownPct: 3 },
  { nome: 'elegível +12%', resultadoPct: 12, elegivel: true, quebrou: false },
  { nome: 'empate arriscou menos', resultadoPct: 5, elegivel: true, quebrou: false, drawdownPct: 1 },
]
const ord = ordenarClassificacao(linhas)
eq('1.º é o melhor elegível', ord[0].nome, 'elegível +12%')
eq('empate: ganha quem arriscou menos', ord[1].nome, 'empate arriscou menos')
eq('depois o outro do empate', ord[2].nome, 'elegível +5%')
eq('inelegível fica atrás dos elegíveis', ord[3].nome, 'poucos dias, +30%')
eq('quebrado vai para o fim, mesmo com +50%', ord[4].nome, 'quebrado com +50%')

console.log(mau === 0 ? `✓ ${ok} verificações passaram` : `${ok} ok, ${mau} FALHARAM`)
process.exit(mau === 0 ? 0 : 1)
