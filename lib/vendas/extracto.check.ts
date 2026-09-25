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
import { LIMITE_EXTRACTO, extractoDoAmbito, somarExtracto, type LinhaExtracto } from './extracto'

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

// ── QUEM VÊ O QUÊ: o filtro do âmbito não se esquece ──
//
// Isto não é um teste de soma, é um teste de separação. A página do backoffice lê o extracto por uma
// LISTA de ids (a que `ambitoDeLeitura` devolve). Se a consulta perdesse o `.in('pessoa_id', …)`,
// um setter passava a ver o dinheiro dos colegas e nada no ecrã o denunciava.
async function guardaDoAmbito() {
  const pedidos: Array<{ metodo: string; args: unknown[] }> = []
  // Um cliente de faz-de-conta que grava o que lhe pediram em vez de ir à base.
  const falso = () => {
    const q: Record<string, (...a: unknown[]) => unknown> = {}
    for (const m of ['select', 'order', 'limit', 'in', 'gte', 'lte', 'eq']) {
      q[m] = (...args: unknown[]) => {
        pedidos.push({ metodo: m, args })
        return q
      }
    }
    ;(q as { then?: unknown }).then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null })
    return { from: (t: string) => { pedidos.push({ metodo: 'from', args: [t] }); return q } }
  }

  const cliente = falso() as unknown as Parameters<typeof extractoDoAmbito>[0]

  await extractoDoAmbito(cliente, { ids: ['pessoa-a'], todos: false })
  const filtro = pedidos.find((p) => p.metodo === 'in')
  teste('lê a vista do extracto', pedidos.some((p) => p.metodo === 'from' && p.args[0] === 'vendas_extracto'))
  teste('filtra por pessoa_id, pela lista do âmbito', !!filtro && filtro.args[0] === 'pessoa_id' && JSON.stringify(filtro.args[1]) === '["pessoa-a"]')

  // O dono (e só ele) lê sem filtro. Tem de ser um caminho explícito: se uma lista vazia pudesse
  // significar «tudo», um erro de leitura dos liderados abria a casa a quem não é dono.
  pedidos.length = 0
  await extractoDoAmbito(cliente, { ids: [], todos: true })
  teste('só o âmbito «todos» lê sem filtro', !pedidos.some((p) => p.metodo === 'in'))

  // E um âmbito vazio não lê NADA — nem sequer chega à base.
  pedidos.length = 0
  const nada = await extractoDoAmbito(cliente, { ids: [], todos: false })
  teste('âmbito vazio não consulta a base', pedidos.length === 0 && nada.length === 0)

  // ── O filtro por data. Sem ele, um extracto com anos de movimentos batia no tecto de linhas e
  // os totais fechavam ao cêntimo sobre metade deles, sem ninguém saber.
  pedidos.length = 0
  await extractoDoAmbito(cliente, { ids: ['pessoa-a'], todos: false }, { desde: '2026-01-01T00:00:00.000Z', ate: '2026-09-25T23:59:59.999Z' })
  teste('o «desde» filtra na base', pedidos.some((p) => p.metodo === 'gte' && p.args[0] === 'em'))
  teste('o «até» filtra na base', pedidos.some((p) => p.metodo === 'lte' && p.args[0] === 'em'))
  // ⭐ E o filtro por data não substitui o filtro de quem: uma data no endereço não pode abrir
  // linhas de terceiros.
  teste('⭐ filtrar por data não perde o filtro da pessoa', pedidos.some((p) => p.metodo === 'in' && p.args[0] === 'pessoa_id'))
  // O tecto está exportado para a página o poder comparar e avisar. Um limite silencioso num
  // extracto é a pior espécie de mentira.
  teste('o tecto de linhas é público', LIMITE_EXTRACTO > 0 && pedidos.some((p) => p.metodo === 'limit' && p.args[0] === LIMITE_EXTRACTO))
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

// A guarda do âmbito é assíncrona (finge uma consulta), por isso o relatório espera por ela.
void guardaDoAmbito().then(() => {
  if (falhas.length) {
    console.error(`vendas/extracto: ${falhas.length} falha(s)`)
    for (const f of falhas) console.error('  · ' + f)
    process.exit(1)
  }
  console.log(
    'vendas/extracto: as duas origens num só extracto, o vocabulário é um, o que foi devolvido desconta, e o filtro por pessoa não se esquece ✓',
  )
})
