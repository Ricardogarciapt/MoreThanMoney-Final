/**
 * GUARDA da escada de ranks. Isto paga a uma REDE inteira: se a conta estiver errada, está errada
 * para todos ao mesmo tempo, todos os meses.
 *
 * Os quatro casos que a escada nova (migração 130) exige, e porquê:
 *  · um nó `casa_valor_fixo` continua a receber o valor FIXO com que entrou — cortar rendimento a
 *    quem já cá está não se desfaz;
 *  · um nó novo recebe a PERCENTAGEM do volume da perna menor;
 *  · o DIFERENCIAL não deixa o total passar dos 18 % sobre o mesmo volume — é ele que põe o tecto,
 *    e sem ele a mesma subscrição pagaria a toda a linha acima (foi assim que a escada antiga
 *    prometeu mais de 100 % da receita);
 *  · o bónus único paga na PRIMEIRA vez que se alcança o rank, e nunca mais.
 *
 *   npx tsx lib/vendas/escada-ranks.check.ts
 */
import { readFileSync } from 'node:fs'
import {
  PLANO_CASA_VALOR_FIXO,
  PLANO_ESCADA_PCT,
  calcularEscadaDeRanks,
  type NoDaArvore,
  type RankDaEscada,
} from './escada-ranks'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => {
  if (!ok) falhas.push(nome)
}

// A escada como a migração 130 a semeia.
const RANKS: RankDaEscada[] = [
  { id: 0, slug: 'membro', sort_order: 0, residual_pct: 0, bonus_unico: 0, monthly_residual: 0 },
  { id: 1, slug: 'cliente_ativo', sort_order: 1, residual_pct: 0, bonus_unico: 0, monthly_residual: 0 },
  { id: 2, slug: 'distribuidor', sort_order: 2, residual_pct: 6, bonus_unico: 100, monthly_residual: 200 },
  { id: 3, slug: 'lider', sort_order: 3, residual_pct: 9, bonus_unico: 250, monthly_residual: 1000 },
  { id: 4, slug: 'gestor', sort_order: 4, residual_pct: 12, bonus_unico: 750, monthly_residual: 2500 },
  { id: 5, slug: 'diretor', sort_order: 5, residual_pct: 15, bonus_unico: 2000, monthly_residual: 7500 },
  { id: 6, slug: 'embaixador', sort_order: 6, residual_pct: 18, bonus_unico: 5000, monthly_residual: 20000 },
]

const no = (p: Partial<NoDaArvore> & { id: string }): NoDaArvore => ({
  user_id: `u-${p.id}`,
  left_child_id: null,
  right_child_id: null,
  rank_id: 0,
  plano_rank: PLANO_ESCADA_PCT,
  ...p,
})

/** Bónus já pagos a todos, para os testes de residual não trazerem bónus pelo meio. */
const bonusTodosPagos = (nos: NoDaArvore[]) =>
  Object.fromEntries(nos.map((n) => [n.user_id, RANKS.map((r) => r.id)]))

// ───────────────────────── percentagem sobre a perna menor ─────────────────────────
{
  // Um Distribuidor com 1 000 € à esquerda e 600 € à direita: paga sobre 600 €.
  const nos = [
    no({ id: 'topo', rank_id: 2, left_child_id: 'esq', right_child_id: 'dir' }),
    no({ id: 'esq' }),
    no({ id: 'dir' }),
  ]
  const r = calcularEscadaDeRanks({
    nos,
    ranks: RANKS,
    volumePorNo: { esq: 100_000, dir: 60_000 },
    bonusJaPago: bonusTodosPagos(nos),
  })
  const linha = r.linhas.find((l) => l.tipo === 'rank_residual')
  teste('paga sobre a perna MENOR', linha?.base_cents === 60_000)
  teste('6 % de 600 € = 36 €', linha?.valor_cents === 3_600)
  teste('a perna menor fica identificada', linha?.perna === 'right')
  teste('o volume total do mês vem à vista', r.volumeTotalCents === 160_000)
}
{
  // Sem perna menor não há volume para repartir: o binário exige as duas pernas.
  const nos = [no({ id: 'topo', rank_id: 6, left_child_id: 'esq' }), no({ id: 'esq' })]
  const r = calcularEscadaDeRanks({ nos, ranks: RANKS, volumePorNo: { esq: 999_999 }, bonusJaPago: bonusTodosPagos(nos) })
  teste('uma perna só não paga residual', !r.linhas.some((l) => l.tipo === 'rank_residual'))
}

// ───────────────────────── o plano da casa ─────────────────────────
{
  const nos = [
    no({ id: 'casa', rank_id: 2, plano_rank: PLANO_CASA_VALOR_FIXO, left_child_id: 'esq', right_child_id: 'dir' }),
    no({ id: 'esq' }),
    no({ id: 'dir' }),
  ]
  const r = calcularEscadaDeRanks({
    nos,
    ranks: RANKS,
    volumePorNo: { esq: 91_000, dir: 91_000 },
    bonusJaPago: bonusTodosPagos(nos),
  })
  const linha = r.linhas.find((l) => l.tipo === 'rank_residual')
  teste('um nó da casa recebe o VALOR FIXO da escada antiga (200 €)', linha?.valor_cents === 20_000)
  teste('o valor fixo não depende do volume', linha?.pct_efectiva === 0)
  teste('a linha diz que é da casa', linha?.plano === PLANO_CASA_VALOR_FIXO)
}
{
  // O mesmo nó, na escada nova, receberia 6 % de 910 € = 54,60 € em vez de 200 €. É a diferença
  // que motivou a migração 130 — e a razão de os dois da casa ficarem como estavam.
  const nos = [
    no({ id: 'novo', rank_id: 2, left_child_id: 'esq', right_child_id: 'dir' }),
    no({ id: 'esq' }),
    no({ id: 'dir' }),
  ]
  const r = calcularEscadaDeRanks({
    nos,
    ranks: RANKS,
    volumePorNo: { esq: 91_000, dir: 91_000 },
    bonusJaPago: bonusTodosPagos(nos),
  })
  teste('um nó NOVO recebe a percentagem (6 % de 910 € = 54,60 €)', r.linhas[0]?.valor_cents === 5_460)
}

// ───────────────────────── O DIFERENCIAL É O TECTO ─────────────────────────
{
  // Cinco degraus em linha (18 → 15 → 12 → 9 → 6), com a linha ranqueada DENTRO da perna que paga
  // em cada nível — é esse o caso em que o diferencial tem de morder. Sem ele, o mesmo euro da
  // folha do fundo pagava 6+9+12+15+18 = 60 %; com ele paga 18 %, a percentagem do topo, e mais
  // nada. Foi a falta disto que fez a escada antiga prometer mais de 100 % da receita.
  const nos = [
    no({ id: 'emb', rank_id: 6, left_child_id: 'dir_', right_child_id: 'irmao_emb' }),
    no({ id: 'dir_', rank_id: 5, left_child_id: 'ges', right_child_id: 'irmao_dir' }),
    no({ id: 'ges', rank_id: 4, left_child_id: 'lid', right_child_id: 'irmao_ges' }),
    no({ id: 'lid', rank_id: 3, left_child_id: 'dis', right_child_id: 'irmao_lid' }),
    no({ id: 'dis', rank_id: 2, left_child_id: 'folha', right_child_id: 'folha2' }),
    no({ id: 'folha' }),
    no({ id: 'folha2' }),
    no({ id: 'irmao_lid' }),
    no({ id: 'irmao_ges' }),
    no({ id: 'irmao_dir' }),
    no({ id: 'irmao_emb' }),
  ]
  // As pernas ficam equilibradas em cada nível, para que a perna que paga seja sempre a que contém
  // a linha ranqueada — é o pior caso para o tecto, e por isso é o que se prova.
  const volumePorNo: Record<string, number> = {
    folha: 50_000,
    folha2: 50_000,
    irmao_lid: 100_000,
    irmao_ges: 200_000,
    irmao_dir: 400_000,
    irmao_emb: 800_000,
  }
  const r = calcularEscadaDeRanks({ nos, ranks: RANKS, volumePorNo, bonusJaPago: bonusTodosPagos(nos) })
  const residuais = r.linhas.filter((l) => l.tipo === 'rank_residual')
  const pct = (slug: string) => residuais.find((l) => l.rank_slug === slug)?.pct_efectiva ?? 0

  teste('os cinco degraus recebem residual', residuais.length === 5)
  teste(
    'a SOMA dos diferenciais sobre o mesmo euro é 18 % — o degrau do topo, e nem um cêntimo mais',
    residuais.reduce((t, l) => t + l.pct_efectiva, 0) === 18,
  )
  teste('o Distribuidor recebe os 6 % inteiros (não há ninguém abaixo)', pct('distribuidor') === 6)
  teste(
    'cada degrau acima recebe só a DIFERENÇA para o de baixo (3 %)',
    pct('lider') === 3 && pct('gestor') === 3 && pct('diretor') === 3 && pct('embaixador') === 3,
  )
  teste(
    'o total pago nunca passa de 18 % do volume do mês',
    r.totalCents <= Math.round(r.volumeTotalCents * 0.18),
  )
  // Sem diferencial, este mesmo mês pagaria 60 % da linha — a conta que não fechava.
  teste('e é muito menos do que a escada sem diferencial pagaria', r.totalCents < Math.round(r.volumeTotalCents * 0.6))
}

{
  // Dois nós do MESMO rank em linha: o de cima não recebe nada por aquela perna (0 % de diferença) —
  // e diz-se porquê, em vez de aparecer uma linha de 0 €.
  const nos = [
    no({ id: 'cima', rank_id: 3, left_child_id: 'baixo', right_child_id: 'd' }),
    no({ id: 'baixo', rank_id: 3, left_child_id: 'e1', right_child_id: 'e2' }),
    no({ id: 'e1' }),
    no({ id: 'e2' }),
    no({ id: 'd' }),
  ]
  const r = calcularEscadaDeRanks({
    nos,
    ranks: RANKS,
    volumePorNo: { e1: 50_000, e2: 50_000, d: 100_000 },
    bonusJaPago: bonusTodosPagos(nos),
  })
  teste('mesmo rank em linha: o de cima não duplica', !r.linhas.some((l) => l.user_id === 'u-cima' && l.tipo === 'rank_residual'))
  teste('e o motivo fica escrito', r.avisos.some((a) => /já há 9 % pagos abaixo/.test(a)))
}

// ───────────────────────── o bónus único ─────────────────────────
{
  const nos = [no({ id: 'a', rank_id: 3, left_child_id: 'e', right_child_id: 'd' }), no({ id: 'e' }), no({ id: 'd' })]
  const volumePorNo = { e: 10_000, d: 10_000 }

  const primeira = calcularEscadaDeRanks({ nos, ranks: RANKS, volumePorNo })
  const bonus = primeira.linhas.find((l) => l.tipo === 'rank_bonus')
  teste('ao alcançar Líder paga-se o bónus único (250 €)', bonus?.valor_cents === 25_000)

  const segunda = calcularEscadaDeRanks({ nos, ranks: RANKS, volumePorNo, bonusJaPago: { 'u-a': [3] } })
  teste('no mês seguinte o bónus NÃO se repete', !segunda.linhas.some((l) => l.tipo === 'rank_bonus'))
  teste('mas o residual continua a pagar', segunda.linhas.some((l) => l.tipo === 'rank_residual'))

  // Desceu e voltou a subir: o bónus do rank que já pagou não volta a pagar.
  const terceira = calcularEscadaDeRanks({ nos, ranks: RANKS, volumePorNo, bonusJaPago: { 'u-a': [3, 2] } })
  teste('descer e voltar a subir não paga outra vez', !terceira.linhas.some((l) => l.tipo === 'rank_bonus'))

  // Subiu de degrau: esse é um rank novo, e tem o seu bónus.
  const nosGestor = [{ ...nos[0], rank_id: 4 }, nos[1], nos[2]]
  const quarta = calcularEscadaDeRanks({ nos: nosGestor, ranks: RANKS, volumePorNo, bonusJaPago: { 'u-a': [3] } })
  teste('subir de degrau paga o bónus do degrau novo (750 €)', quarta.linhas.find((l) => l.tipo === 'rank_bonus')?.valor_cents === 75_000)
}

// ───────────────────────── fronteiras ─────────────────────────
teste('árvore vazia não paga nada', calcularEscadaDeRanks({ nos: [], ranks: RANKS, volumePorNo: {} }).linhas.length === 0)
{
  const nos = [no({ id: 'a', rank_id: 0, left_child_id: 'e', right_child_id: 'd' }), no({ id: 'e' }), no({ id: 'd' })]
  const r = calcularEscadaDeRanks({ nos, ranks: RANKS, volumePorNo: { e: 100_000, d: 100_000 } })
  teste('sem rank não há residual nem bónus', r.linhas.length === 0)
}
{
  const nos = [no({ id: 'a', rank_id: 2, left_child_id: 'e', right_child_id: 'd' }), no({ id: 'e' }), no({ id: 'd' })]
  const r = calcularEscadaDeRanks({ nos, ranks: RANKS, volumePorNo: {}, bonusJaPago: bonusTodosPagos(nos) })
  teste('mês sem volume não paga residual', r.linhas.length === 0 && r.totalCents === 0)
}
{
  // Um ciclo (linha corrompida) não pode pendurar o fecho do mês.
  const nos = [no({ id: 'a', rank_id: 2, left_child_id: 'b', right_child_id: 'c' }), no({ id: 'b', left_child_id: 'a' }), no({ id: 'c' })]
  const r = calcularEscadaDeRanks({ nos, ranks: RANKS, volumePorNo: { b: 1000, c: 1000 }, bonusJaPago: bonusTodosPagos(nos) })
  teste('um ciclo na árvore avisa e não pendura', r.avisos.some((a) => /Ciclo/.test(a)))
}
{
  // Arredondamento: 6 % de 333,33 € = 19,9998 € → 20,00 € (meio-para-cima, como no resto do livro).
  const nos = [no({ id: 'a', rank_id: 2, left_child_id: 'e', right_child_id: 'd' }), no({ id: 'e' }), no({ id: 'd' })]
  const r = calcularEscadaDeRanks({ nos, ranks: RANKS, volumePorNo: { e: 33_333, d: 40_000 }, bonusJaPago: bonusTodosPagos(nos) })
  teste('o cêntimo do residual arredonda para cima', r.linhas[0]?.valor_cents === 2_000)
}

// ───────── e as duas escadas não podem voltar a pagar as duas ─────────
//
// O residual por EVENTO (lib/mlm-renewal-commission.ts) é da escada antiga; a percentagem é paga
// pelo fecho do mês. Se a porta do evento voltar a pagar a todos, o residual sai a dobrar — e
// ninguém dá por isso enquanto não olhar para o extracto de alguém.
{
  const src = readFileSync('lib/mlm-renewal-commission.ts', 'utf8')
  const limpo = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  teste('o residual por evento só paga os nós da casa', /casa_valor_fixo/.test(limpo))
  teste('e o gate está na condição que cria a comissão', /ehDaCasa\s*&&/.test(limpo))
}
// E o volume do fecho não pode contar vendas que a equipa já pagou.
{
  const src = readFileSync('lib/vendas/fecho-ranks.ts', 'utf8')
  const limpo = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  teste('o volume exclui as vendas com equipa atribuída', /negociosComEquipa/.test(limpo))
  teste('o fecho simula por defeito', /simulacao\s*!==\s*false/.test(limpo))
}

if (falhas.length) {
  console.error(`vendas/escada-ranks: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('vendas/escada-ranks: paga a perna menor, o diferencial trava nos 18 %, a casa mantém o fixo, e o bónus paga uma vez ✓')
