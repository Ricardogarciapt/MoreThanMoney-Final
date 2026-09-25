/**
 * GUARDA do cálculo de comissões da equipa de vendas. Isto decide quanto se paga a pessoas: tem
 * de ser provado, não confiado.
 *
 * O que estes casos protegem, por ordem de gravidade:
 *  · uma venda SEM REGRA definida não pode gerar comissão nenhuma (nem a 0 %, nem a «20 % por
 *    defeito» como o MLM antigo fazia — ver `DEFAULT_DIRECT_RESIDUAL_PCT` em
 *    lib/mlm-renewal-commission.ts, que é exactamente o erro que não se repete aqui);
 *  · o arredondamento é meio-para-cima e feito em inteiros — um cêntimo a menos é uma queixa;
 *  · mudar a percentagem HOJE não muda o que se calculou ONTEM (vigência por data da venda);
 *  · valor zero e devolução não geram dinheiro.
 *
 *   npx tsx lib/vendas/calculo.check.ts
 */
import { readFileSync } from 'node:fs'
import {
  PACK_TODOS,
  PLANO_PADRAO,
  calcularComissoes,
  centimosEmEuros,
  comissaoEmCentimos,
  degrauDeRank,
  regraEmVigor,
  totalCentimos,
  type RegraComissao,
  type RegraRank,
} from './calculo'
import { arrastaEstornoTotal } from './livro'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => {
  if (!ok) falhas.push(nome)
}

const regra = (p: Partial<RegraComissao> & { id: string }): RegraComissao => ({
  papel: 'closer',
  pack: 'premium_monthly',
  pct: 10,
  aplica_a: 'ambos',
  valido_de: '2026-01-01T00:00:00.000Z',
  valido_ate: null,
  ...p,
})

const AGORA = '2026-09-25T12:00:00.000Z'
const venda = (v: Partial<Parameters<typeof calcularComissoes>[0]> = {}) => ({
  pack: 'premium_monthly',
  valor_cents: 6500,
  tipo: 'primeira' as const,
  moeda: 'EUR',
  ...v,
})

// ───────────────────────── aritmética: o cêntimo ─────────────────────────

teste('10 % de 65,00 € = 6,50 €', comissaoEmCentimos(6500, 10) === 650)
teste('zero de base é zero', comissaoEmCentimos(0, 25) === 0)
teste('zero por cento é zero', comissaoEmCentimos(6500, 0) === 0)
teste('base negativa não inventa dinheiro', comissaoEmCentimos(-6500, 10) === 0)
teste('percentagem negativa não inventa dinheiro', comissaoEmCentimos(6500, -10) === 0)
// 3499 × 15 % = 524,85 cêntimos → 525. É aqui que o float trai: 3499*0.15 = 524,8499999999999.
teste('meio cêntimo arredonda PARA CIMA (524,85 → 525)', comissaoEmCentimos(3499, 15) === 525)
// 6500 × 15,5 % = 1007,5 exactamente — o empate vai para quem recebe.
teste('empate exacto vai para cima (1007,5 → 1008)', comissaoEmCentimos(6500, 15.5) === 1008)
teste('abaixo do meio cêntimo arredonda para baixo', comissaoEmCentimos(3333, 10) === 333)
teste('percentagem com 3 casas conta (0,001 % de 597,00 €)', comissaoEmCentimos(59700, 0.001) === 1)
teste('100 % devolve a base inteira', comissaoEmCentimos(59700, 100) === 59700)
// 100 000,00 € × 12,345 % = 12 345,00 € — um lote grande não pode desviar-se um cêntimo.
teste('valores grandes não perdem precisão', comissaoEmCentimos(10_000_000, 12.345) === 1_234_500)

teste('cêntimos em euros à portuguesa', centimosEmEuros(6539) === '65,39 €')
teste('cêntimos redondos mostram as duas casas', centimosEmEuros(600) === '6,00 €')
teste('estorno mostra-se negativo', centimosEmEuros(-650) === '-6,50 €')

// ───────────────────────── vigência: o histórico ─────────────────────────

const antiga = regra({ id: 'r-antiga', pct: 10, valido_de: '2026-01-01T00:00:00.000Z', valido_ate: '2026-09-01T00:00:00.000Z' })
const nova = regra({ id: 'r-nova', pct: 20, valido_de: '2026-09-01T00:00:00.000Z' })

teste(
  'uma venda de Agosto usa a regra de Agosto',
  regraEmVigor([antiga, nova], 'closer', 'premium_monthly', 'primeira', '2026-08-15T00:00:00.000Z')?.id === 'r-antiga',
)
teste(
  'uma venda de Setembro usa a regra nova',
  regraEmVigor([antiga, nova], 'closer', 'premium_monthly', 'primeira', AGORA)?.id === 'r-nova',
)
teste(
  'antes de qualquer regra não há regra',
  regraEmVigor([antiga, nova], 'closer', 'premium_monthly', 'primeira', '2025-12-31T00:00:00.000Z') === null,
)
teste(
  'o pack exacto ganha ao curinga',
  regraEmVigor(
    [regra({ id: 'r-curinga', pack: PACK_TODOS, pct: 5 }), regra({ id: 'r-exacta', pct: 12 })],
    'closer',
    'premium_monthly',
    'primeira',
    AGORA,
  )?.id === 'r-exacta',
)
teste(
  'o curinga serve um pack sem regra própria',
  regraEmVigor([regra({ id: 'r-curinga', pack: PACK_TODOS, pct: 5 })], 'closer', 'elite_annual', 'primeira', AGORA)?.id ===
    'r-curinga',
)
teste(
  'regra de renovação ganha à de ambos, numa renovação',
  regraEmVigor(
    [regra({ id: 'r-ambos', pct: 10 }), regra({ id: 'r-renov', pct: 4, aplica_a: 'renovacao' })],
    'closer',
    'premium_monthly',
    'renovacao',
    AGORA,
  )?.id === 'r-renov',
)
teste(
  'regra só de renovação não paga uma primeira venda',
  regraEmVigor([regra({ id: 'r-renov', aplica_a: 'renovacao' })], 'closer', 'premium_monthly', 'primeira', AGORA) === null,
)
teste(
  'a regra de um papel não paga a outro papel',
  regraEmVigor([regra({ id: 'r-closer' })], 'setter', 'premium_monthly', 'primeira', AGORA) === null,
)

// ───────────────────────── o cálculo completo ─────────────────────────

// O EXEMPLO DE REFERÊNCIA (o que vai no relatório ao dono): Premium mensal 65,00 €, com setter a
// 10 % e closer a 20 %, e um team leader sem regra definida.
const cheio = calcularComissoes(
  venda(),
  { setter: 'u-setter', closer: 'u-closer', team_leader: 'u-tl' },
  [
    regra({ id: 'r-setter', papel: 'setter', pct: 10 }),
    regra({ id: 'r-closer', papel: 'closer', pct: 20 }),
  ],
  AGORA,
)
teste('duas linhas calculadas', cheio.linhas.length === 2)
teste('setter recebe 6,50 €', cheio.linhas.find((l) => l.papel === 'setter')?.valor_cents === 650)
teste('closer recebe 13,00 €', cheio.linhas.find((l) => l.papel === 'closer')?.valor_cents === 1300)
teste('total 19,50 €', totalCentimos(cheio.linhas) === 1950)
teste('a linha guarda a regra que a fez', cheio.linhas.every((l) => !!l.regra_id && l.pct > 0))
teste('a linha guarda a base do cálculo', cheio.linhas.every((l) => l.base_cents === 6500))

// A REGRA QUE MAIS IMPORTA: sem percentagem definida, não se paga — e diz-se porquê.
teste('team leader sem regra não gera linha', !cheio.linhas.some((l) => l.papel === 'team_leader'))
teste('team leader sem regra aparece em semRegra', cheio.semRegra.some((s) => s.papel === 'team_leader'))
teste('o motivo diz o que falta decidir', /Sem regra definida/.test(cheio.semRegra[0]?.motivo ?? ''))
teste(
  'sem NENHUMA regra não se calcula nada',
  (() => {
    const r = calcularComissoes(venda(), { closer: 'u-closer' }, [], AGORA)
    return r.linhas.length === 0 && r.semRegra.length === 1
  })(),
)

// Fronteiras.
teste(
  'venda de valor zero não gera comissões',
  (() => {
    const r = calcularComissoes(venda({ valor_cents: 0 }), { closer: 'u-closer' }, [regra({ id: 'r' })], AGORA)
    return r.linhas.length === 0 && r.semRegra.length === 0 && r.avisos.some((a) => /valor zero/.test(a))
  })(),
)
teste(
  'venda sem pack não gera comissões e pede decisão',
  (() => {
    const r = calcularComissoes(venda({ pack: null }), { closer: 'u-closer' }, [regra({ id: 'r' })], AGORA)
    return r.linhas.length === 0 && /sem pack/.test(r.semRegra[0]?.motivo ?? '')
  })(),
)
teste(
  'venda sem atribuição não gera comissões',
  (() => {
    const r = calcularComissoes(venda(), {}, [regra({ id: 'r' })], AGORA)
    return r.linhas.length === 0 && r.semRegra.length === 0 && r.avisos.some((a) => /sem atribuição/.test(a))
  })(),
)
teste(
  'papel atribuído a vazio conta como não atribuído',
  calcularComissoes(venda(), { closer: '' }, [regra({ id: 'r' })], AGORA).linhas.length === 0,
)
teste(
  'regra a 0 % não cria linha, mas também não pede decisão',
  (() => {
    const r = calcularComissoes(venda(), { closer: 'u-closer' }, [regra({ id: 'r', pct: 0 })], AGORA)
    return r.linhas.length === 0 && r.semRegra.length === 0 && r.avisos.some((a) => /0 %/.test(a))
  })(),
)
teste(
  'a mesma pessoa em dois papéis recebe pelos dois, e avisa',
  (() => {
    const r = calcularComissoes(
      venda(),
      { setter: 'u-mesma', closer: 'u-mesma' },
      [regra({ id: 'r-s', papel: 'setter', pct: 10 }), regra({ id: 'r-c', papel: 'closer', pct: 20 })],
      AGORA,
    )
    return r.linhas.length === 2 && totalCentimos(r.linhas) === 1950 && r.avisos.some((a) => /acumula/.test(a))
  })(),
)
teste(
  'uma renovação usa a percentagem de renovação',
  (() => {
    const r = calcularComissoes(
      venda({ tipo: 'renovacao' }),
      { closer: 'u-closer' },
      [regra({ id: 'r-ambos', pct: 20 }), regra({ id: 'r-renov', pct: 5, aplica_a: 'renovacao' })],
      AGORA,
    )
    return r.linhas[0]?.valor_cents === 325 && r.linhas[0]?.regra_id === 'r-renov'
  })(),
)

// ───────── e ninguém pode voltar a meter um número no código ─────────
//
// Foi assim que o MLM ficou com 20 % e 50 % escritos à mão em dois ficheiros diferentes. Se a
// percentagem voltar a ser literal no cálculo, isto tem de gritar.
{
  const src = readFileSync('lib/vendas/calculo.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  teste('o cálculo não tem percentagem por defeito', !/DEFAULT.*PCT|pct\s*[?][?]\s*\d|pct\s*\|\|\s*\d/.test(src))
  teste('o cálculo não fala com a base de dados', !/supabase|createClient/i.test(src))
}

// ───────────────────────── o plano de cada pessoa (a salvaguarda dos 50 %) ─────────────────────────
//
// Cortar rendimento a quem já cá está não se desfaz. O plano é da PESSOA e não uma data no código:
// mexer na tabela geral não pode tocar em ninguém que tenha plano próprio.

const TABELA_GERAL = [
  regra({ id: 'r-afil-nova-1a', papel: 'afiliado', pct: 30, aplica_a: 'primeira' }),
  regra({ id: 'r-afil-nova-renov', papel: 'afiliado', pct: 10, aplica_a: 'renovacao' }),
]
const PLANO_LEGADO = [
  regra({ id: 'r-afil-legado', papel: 'afiliado', pack: PACK_TODOS, pct: 50, aplica_a: 'ambos', plano: 'afiliado_legado_50' }),
]
const TODAS = [...TABELA_GERAL, ...PLANO_LEGADO]

teste(
  'afiliado NOVO recebe 30 % na primeira mensalidade',
  (() => {
    const r = calcularComissoes(venda(), { afiliado: 'u-nova' }, TODAS, AGORA, { planoPorPessoa: {} })
    return r.linhas[0]?.pct === 30 && r.linhas[0]?.valor_cents === 1950
  })(),
)
teste(
  'afiliado NOVO recebe 10 % na renovação',
  (() => {
    const r = calcularComissoes(venda({ tipo: 'renovacao' }), { afiliado: 'u-nova' }, TODAS, AGORA, {
      numeroDoPagamento: 2,
    })
    return r.linhas[0]?.pct === 10 && r.linhas[0]?.valor_cents === 650
  })(),
)
teste(
  'afiliado ANTIGO mantém 50 % numa renovação DEPOIS da mudança da tabela',
  (() => {
    const r = calcularComissoes(venda({ tipo: 'renovacao' }), { afiliado: 'u-antiga' }, TODAS, AGORA, {
      numeroDoPagamento: 2,
      planoPorPessoa: { 'u-antiga': 'afiliado_legado_50' },
    })
    return r.linhas[0]?.pct === 50 && r.linhas[0]?.valor_cents === 3250 && r.linhas[0]?.plano === 'afiliado_legado_50'
  })(),
)
teste(
  'mudar a tabela GERAL não toca em quem tem plano próprio',
  (() => {
    const tabelaMudada = [
      ...TODAS,
      regra({ id: 'r-afil-mais-baixa', papel: 'afiliado', pct: 5, aplica_a: 'renovacao', valido_de: '2026-09-20T00:00:00.000Z' }),
    ]
    const antiga = calcularComissoes(venda({ tipo: 'renovacao' }), { afiliado: 'u-antiga' }, tabelaMudada, AGORA, {
      numeroDoPagamento: 2,
      planoPorPessoa: { 'u-antiga': 'afiliado_legado_50' },
    })
    const nova = calcularComissoes(venda({ tipo: 'renovacao' }), { afiliado: 'u-nova' }, tabelaMudada, AGORA, {
      numeroDoPagamento: 2,
    })
    return antiga.linhas[0]?.pct === 50 && nova.linhas[0]?.pct === 5
  })(),
)
teste(
  'o plano da pessoa só manda no que o plano dele define — o resto vem da tabela geral',
  (() => {
    const r = calcularComissoes(
      venda(),
      { closer: 'u-antiga', afiliado: 'u-antiga' },
      [...TODAS, regra({ id: 'r-closer', papel: 'closer', pct: 20 })],
      AGORA,
      { planoPorPessoa: { 'u-antiga': 'afiliado_legado_50' } },
    )
    return (
      r.linhas.find((l) => l.papel === 'afiliado')?.pct === 50 &&
      r.linhas.find((l) => l.papel === 'closer')?.pct === 20
    )
  })(),
)
teste('sem plano gravado usa-se o plano geral', calcularComissoes(venda(), { afiliado: 'x' }, TODAS, AGORA).linhas[0]?.plano === PLANO_PADRAO)

// ───────────────────────── o residual só do 2.º pagamento em diante ─────────────────────────

teste(
  'residual NÃO paga no 1.º pagamento',
  (() => {
    const r = calcularComissoes(venda({ tipo: 'renovacao' }), { closer: 'u-c' }, [regra({ id: 'r', pct: 5, aplica_a: 'renovacao' })], AGORA, {
      numeroDoPagamento: 1,
    })
    return r.linhas.length === 0 && r.avisos.some((a) => /segundo em diante/.test(a))
  })(),
)
teste(
  'residual paga no 2.º pagamento',
  calcularComissoes(venda({ tipo: 'renovacao' }), { closer: 'u-c' }, [regra({ id: 'r', pct: 5, aplica_a: 'renovacao' })], AGORA, {
    numeroDoPagamento: 2,
  }).linhas.length === 1,
)
teste(
  'sem saber contar pagamentos não se corta o residual a ninguém',
  calcularComissoes(venda({ tipo: 'renovacao' }), { closer: 'u-c' }, [regra({ id: 'r', pct: 5, aplica_a: 'renovacao' })], AGORA)
    .linhas.length === 1,
)

// ───────────────────────── os degraus de rank ─────────────────────────
//
// O degrau sobe a percentagem DELE e não acrescenta níveis a pagar. E entra como PROPORÇÃO sobre o
// degrau base, para não furar o tecto de 15 % do MTM Funded — ver o comentário em `degrauDeRank`.

const DEGRAUS: RegraRank[] = [
  { id: 'd-0', papel: 'closer', min_vendas: 0, pct: 20, valido_de: '2026-01-01T00:00:00.000Z', valido_ate: null },
  { id: 'd-6', papel: 'closer', min_vendas: 6, pct: 25, valido_de: '2026-01-01T00:00:00.000Z', valido_ate: null },
  { id: 'd-11', papel: 'closer', min_vendas: 11, pct: 30, valido_de: '2026-01-01T00:00:00.000Z', valido_ate: null },
]

teste('5 vendas no mês → degrau base', degrauDeRank(DEGRAUS, 'closer', 5, AGORA)?.regra.id === 'd-0')
teste('6 vendas no mês → degrau dos 6', degrauDeRank(DEGRAUS, 'closer', 6, AGORA)?.regra.id === 'd-6')
teste('10 vendas no mês → ainda o degrau dos 6', degrauDeRank(DEGRAUS, 'closer', 10, AGORA)?.regra.id === 'd-6')
teste('11 vendas no mês → degrau do topo', degrauDeRank(DEGRAUS, 'closer', 11, AGORA)?.regra.id === 'd-11')
teste('o setter não tem degraus definidos', degrauDeRank(DEGRAUS, 'setter', 30, AGORA) === null)
teste('o factor do degrau do topo é ×1,5', degrauDeRank(DEGRAUS, 'closer', 12, AGORA)?.fator === 1.5)

const comDegrau = (vendasNoMes: number, pct = 20) =>
  calcularComissoes(venda(), { closer: 'u-c' }, [regra({ id: 'r-c', pct })], AGORA, {
    regrasRank: DEGRAUS,
    vendasNoMes: { 'closer:u-c': vendasNoMes },
  }).linhas[0]

teste('closer no degrau base: 20 % de 65,00 € = 13,00 €', comDegrau(3)?.valor_cents === 1300)
teste('closer na 6.ª venda do mês: 25 % = 16,25 €', comDegrau(6)?.valor_cents === 1625)
teste('closer acima de 10: 30 % = 19,50 €', comDegrau(12)?.valor_cents === 1950)
teste('o degrau aplicado fica gravado na linha', comDegrau(12)?.rank_min_vendas === 11 && comDegrau(12)?.vendas_no_mes === 12)
teste('a percentagem ANTES do degrau também fica gravada', comDegrau(12)?.pct_base === 20)
// O TECTO DO FUNDED: 7,5 % no degrau base → ×1,5 = 11,25 %, e não 30 % (que seria quatro vezes
// mais e furava os 15 % do produto inteiro).
teste('o degrau é proporcional e não fura o tecto do Funded', comDegrau(12, 7.5)?.pct === 11.25)
teste(
  'o degrau não paga a quem não tem regra no pack',
  calcularComissoes(venda(), { closer: 'u-c' }, [], AGORA, {
    regrasRank: DEGRAUS,
    vendasNoMes: { 'closer:u-c': 30 },
  }).linhas.length === 0,
)
teste(
  'o degrau NÃO se aplica ao residual',
  calcularComissoes(venda({ tipo: 'renovacao' }), { closer: 'u-c' }, [regra({ id: 'r', pct: 5, aplica_a: 'renovacao' })], AGORA, {
    numeroDoPagamento: 2,
    regrasRank: DEGRAUS,
    vendasNoMes: { 'closer:u-c': 30 },
  }).linhas[0]?.pct === 5,
)

// ───────────────────────── cêntimos partidos do mundo real ─────────────────────────
//
// O 1.º mês do Premium é 34,99 € — de propósito um valor que parte cêntimos em quase todas as
// percentagens da tabela.
teste('34,99 € × 5 % (prospector) = 1,75 € (174,95 → 175)', comissaoEmCentimos(3499, 5) === 175)
teste('34,99 € × 10 % (setter) = 3,50 € (349,9 → 350)', comissaoEmCentimos(3499, 10) === 350)
teste('34,99 € × 20 % (closer) = 7,00 € (699,8 → 700)', comissaoEmCentimos(3499, 20) === 700)
teste('34,99 € × 1,875 % (Funded prospector) = 0,66 € (65,606 → 66)', comissaoEmCentimos(3499, 1.875) === 66)
teste(
  'a soma da equipa no 1.º mês a 34,99 € dá 12,25 € e não 12,24 €',
  (() => {
    const r = calcularComissoes(
      venda({ valor_cents: 3499 }),
      { prospector: 'p', setter: 's', closer: 'c' },
      [
        regra({ id: 'r-p', papel: 'prospector', pct: 5 }),
        regra({ id: 'r-s', papel: 'setter', pct: 10 }),
        regra({ id: 'r-c', papel: 'closer', pct: 20 }),
      ],
      AGORA,
    )
    return totalCentimos(r.linhas) === 1225
  })(),
)

// ───────────────────────── a janela da devolução ─────────────────────────

teste('devolução ao dia 20 arrasta tudo', arrastaEstornoTotal('2026-09-01T00:00:00.000Z', '2026-09-21T00:00:00.000Z'))
teste('devolução ao dia 30 ainda arrasta', arrastaEstornoTotal('2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'))
teste('devolução ao dia 31 já não arrasta', !arrastaEstornoTotal('2026-09-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z'))
teste('devolução ao dia 200 só reverte a venda devolvida', !arrastaEstornoTotal('2026-01-01T00:00:00.000Z', AGORA))

if (falhas.length) {
  console.error(`vendas/calculo: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log(
  'vendas/calculo: sem regra não paga, arredonda para cima ao cêntimo, o residual só do 2.º pagamento,\n' +
    '  o degrau sobe a percentagem sem furar tectos, e quem entrou com 50 % mantém 50 % ✓',
)
