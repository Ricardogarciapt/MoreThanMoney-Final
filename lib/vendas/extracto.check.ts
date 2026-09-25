/**
 * GUARDA do extracto único. É o número que a pessoa vê e com que discute: tem de fechar ao cêntimo.
 *
 * O que se prova aqui:
 *  · as duas origens (papéis + MLM binário) somam no MESMO extracto, e cada uma continua
 *    identificada — o pedido do dono foi «UM só extracto», não «uma soma sem se saber de onde vem»;
 *  · o MLM fala inglês ('pending'/'paid') e o livro da equipa português: um vocabulário só, senão
 *    linhas inteiras caíam para fora da conta sem ninguém notar;
 *  · o que foi pago e depois DEVOLVIDO desconta no saldo. Um extracto que só soma manda pagar
 *    outra vez sobre dinheiro que voltou para o cliente.
 *
 *   npx tsx lib/vendas/extracto.check.ts
 */
import { somarExtracto, type LinhaExtracto } from './extracto'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => {
  if (!ok) falhas.push(nome)
}

const linha = (p: Partial<LinhaExtracto>): LinhaExtracto => ({
  id: Math.random().toString(36).slice(2),
  origem: 'papel',
  detalhe: 'closer',
  valor_cents: 1000,
  moeda: 'EUR',
  estado: 'pendente',
  em: '2026-09-01T00:00:00.000Z',
  paga_em: null,
  estornada_em: null,
  pack: 'premium_monthly',
  referencia: 'ref',
  ...p,
})

// ── o básico ──
{
  const { totais } = somarExtracto([linha({ valor_cents: 1300 }), linha({ valor_cents: 650 })])
  teste('duas pendentes somam no por pagar', totais.por_pagar_cents === 1950 && totais.saldo_cents === 1950)
  teste('nada pago ainda', totais.pago_cents === 0)
}

// ── o vocabulário do MLM ──
{
  const { totais, porOrigem } = somarExtracto([
    linha({ origem: 'mlm', detalhe: 'monthly_residual', estado: 'pending', valor_cents: 3250 }),
    linha({ origem: 'mlm', detalhe: 'direct_referral', estado: 'paid', paga_em: '2026-09-10T00:00:00.000Z', valor_cents: 1000 }),
    linha({ origem: 'papel', estado: 'aprovada', valor_cents: 500 }),
  ])
  teste("'pending' do MLM conta como por pagar", totais.por_pagar_cents === 3750)
  teste("'paid' do MLM conta como pago", totais.pago_cents === 1000)
  teste('o extracto separa as origens sem as misturar', porOrigem.mlm.ganho_cents === 4250 && porOrigem.papel.ganho_cents === 500)
  teste('o ganho é a soma das duas origens', totais.ganho_cents === 4750)
}

// ── A REGRA QUE MAIS IMPORTA: o que foi devolvido desconta ──
{
  const { totais } = somarExtracto([
    linha({ valor_cents: 2000, estado: 'paga', paga_em: '2026-09-05T00:00:00.000Z' }),
    linha({ valor_cents: 1300, estado: 'paga', paga_em: '2026-09-05T00:00:00.000Z', estornada_em: '2026-09-20T00:00:00.000Z' }),
    linha({ valor_cents: 800, estado: 'pendente' }),
  ])
  teste('paga e devolvida entra em «a descontar»', totais.a_descontar_cents === 1300)
  teste('o saldo desconta a devolução (800 − 1300 = −500)', totais.saldo_cents === -500)
  teste('continua a contar como pago (o dinheiro saiu mesmo)', totais.pago_cents === 3300)
}
{
  // Estornada ANTES de ser paga: nunca saiu dinheiro. Não é dívida nem ganho — é nada.
  const { totais } = somarExtracto([linha({ valor_cents: 1300, estado: 'estornada', estornada_em: '2026-09-20T00:00:00.000Z' })])
  teste('estornada sem ter sido paga não entra no ganho', totais.ganho_cents === 0)
  teste('estornada sem ter sido paga não cria dívida', totais.a_descontar_cents === 0 && totais.saldo_cents === 0)
  teste('estornada sem ter sido paga fica em cancelado', totais.cancelado_cents === 1300)
}
{
  const { totais } = somarExtracto([linha({ valor_cents: 1300, estado: 'cancelada' })])
  teste('cancelada não conta para nada', totais.ganho_cents === 0 && totais.cancelado_cents === 1300)
}

// ── fronteiras ──
teste('extracto vazio é zero em tudo', somarExtracto([]).totais.saldo_cents === 0)
teste(
  'valor zero não estraga a soma',
  somarExtracto([linha({ valor_cents: 0 }), linha({ valor_cents: 199 })]).totais.por_pagar_cents === 199,
)
teste(
  'o total é a soma exacta das linhas, ao cêntimo',
  somarExtracto([linha({ valor_cents: 1 }), linha({ valor_cents: 2 }), linha({ valor_cents: 4 })]).totais.ganho_cents === 7,
)

if (falhas.length) {
  console.error(`vendas/extracto: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('vendas/extracto: as duas origens num só extracto, o vocabulário é um, e o que foi devolvido desconta ✓')
