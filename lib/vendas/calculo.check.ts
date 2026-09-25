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
  calcularComissoes,
  centimosEmEuros,
  comissaoEmCentimos,
  regraEmVigor,
  totalCentimos,
  type RegraComissao,
} from './calculo'

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

if (falhas.length) {
  console.error(`vendas/calculo: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('vendas/calculo: sem regra não paga, arredonda para cima ao cêntimo, e o histórico não se reescreve ✓')
