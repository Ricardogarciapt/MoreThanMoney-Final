/**
 * Guarda das variantes agrupadas (195).
 *
 *   npx tsx lib/marketplace/grupos.check.ts
 *
 * Prova que: um grupo aparece UMA vez na montra; o «desde» é o mínimo real; a compra leva o id da
 * variante escolhida; um produto sem grupo fica igual; a poupança mostrada sai dos preços reais.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { agruparMontra, maisBarataDe, poupancaPct, varianteInicial, type Variante } from './grupos'

let ok = 0
const falhas: string[] = []
const sim = (nome: string, cond: unknown) => {
  if (cond) ok++
  else falhas.push(nome)
}
const RAIZ = join(__dirname, '..', '..')

const v = (
  id: string, grupo: string | null, ordem: number, cents: number,
  per: string, rec: boolean, extra: Partial<Variante> = {},
): Variante & { titulo: string } => ({
  id, slug: id, titulo: id, grupo, variante_ordem: ordem, variante_nome: id,
  recorrente: rec, periodicidade: per,
  preco: { cents, baseCents: cents, moeda: 'eur' },
  ...extra,
})

// Os preços reais de 06/10 (marketplace_produtos).
const scMensal = v('scanners-mensal', 'pack-scanners', 1, 3500, 'mensal', true)
const scSeis = v('scanners-semestral', 'pack-scanners', 2, 16500, 'unica', false)
const scVit = v('scanners-vitalicio', 'pack-scanners', 3, 75000, 'unica', false)
const mbMensal = v('membro-mensal', 'membro', 1, 3500, 'mensal', true)
const mbAnual = v('membro-anual', 'membro', 2, 33600, 'anual', true)
const prMensal = v('premium-mensal', 'premium', 1, 6500, 'mensal', true)
const prAnual = v('premium-anual', 'premium', 2, 62400, 'anual', true)
const goldkiller = v('goldkiller-vitalicio', null, 0, 5000, 'unica', false)
const ledger = v('ledger-nano-x', null, 0, 9900, 'unica', false)

// ══════════════ 1. UM GRUPO APARECE UMA VEZ ══════════════
{
  // A ordem da rota (destaques/data) põe a vitalícia antes da principal: o cartão tem de ficar no
  // lugar da PRINCIPAL e não duplicar.
  const montra = agruparMontra([scVit, goldkiller, scMensal, mbAnual, ledger, scSeis, mbMensal, prMensal, prAnual])
  const chaves = montra.map((e) => e.chave)
  sim('cada grupo aparece uma vez', chaves.filter((c) => c === 'grupo:pack-scanners').length === 1 && chaves.filter((c) => c === 'grupo:membro').length === 1)
  sim('9 linhas → 5 cartões', montra.length === 5)
  sim('o grupo fica no lugar da variante principal', chaves.indexOf('grupo:pack-scanners') === 1 && chaves.indexOf('grupo:membro') === 3)
  const pack = montra.find((e) => e.chave === 'grupo:pack-scanners')!
  sim('a principal é a de ordem mais baixa', pack.principal.id === 'scanners-mensal')
  sim('as variantes vêm pela ordem do selector', pack.variantes.map((x) => x.id).join() === 'scanners-mensal,scanners-semestral,scanners-vitalicio')
  // Variante principal invisível (retirada): o grupo continua a aparecer, com a próxima.
  const semPrincipal = agruparMontra([scSeis, scVit])
  sim('sem a principal visível, a seguinte toma o lugar', semPrincipal.length === 1 && semPrincipal[0].principal.id === 'scanners-semestral')
}

// ══════════════ 2. O «DESDE» É O MÍNIMO REAL ══════════════
{
  const [pack] = agruparMontra([scVit, scSeis, scMensal])
  sim('desde 35 € no Pack de Scanners', pack.maisBarata.preco.cents === 3500)
  sim('é o mínimo de todas as variantes', pack.maisBarata.preco.cents === Math.min(...pack.variantes.map((x) => x.preco.cents)))
  // Com campanha numa variante, o «desde» segue o preço EFECTIVO, não o de tabela.
  const vitCampanha = { ...scVit, preco: { cents: 2000, baseCents: 75000, moeda: 'eur' } }
  sim('o «desde» segue o preço efectivo (campanha)', maisBarataDe([scMensal, vitCampanha]).id === 'scanners-vitalicio')
}

// ══════════════ 3. A COMPRA LEVA O ID DA VARIANTE ESCOLHIDA ══════════════
{
  sim('entrar pelo slug da anual abre a anual', varianteInicial([mbMensal, mbAnual], 'membro-anual')?.id === 'membro-anual')
  sim('slug desconhecido abre a principal', varianteInicial([mbAnual, mbMensal], 'outra')?.id === 'membro-mensal')
  const ficha = readFileSync(join(RAIZ, 'components/marketplace/ficha-produto.tsx'), 'utf8')
  sim('a ficha compra com o id do `produto`', /produtoId: produto\.id/.test(ficha))
  sim('e o `produto` é a variante escolhida', /variantes\.find\(\(v\) => v\.slug === escolhido\)/.test(ficha))
  sim('a loja oficial é a da variante escolhida', /lojaExternaDe\(p\)/.test(ficha) && /const p = produto/.test(ficha))
  sim('a ficha pede as variantes à rota', /variantes=1/.test(ficha))
  const vitrine = readFileSync(join(RAIZ, 'components/marketplace/vitrine.tsx'), 'utf8')
  sim('o cartão agrupado leva à ficha (não compra às cegas)', /agrupado \? \(\s*<Link/.test(vitrine))
}

// ══════════════ 4. UM PRODUTO SEM GRUPO FICA IGUAL ══════════════
{
  const montra = agruparMontra([goldkiller, ledger])
  sim('sem grupo: um cartão por produto, pela mesma ordem', montra.map((e) => e.principal.id).join() === 'goldkiller-vitalicio,ledger-nano-x')
  sim('sem grupo: uma variante, que é ele próprio', montra.every((e) => e.variantes.length === 1 && e.principal === e.maisBarata))
  sim('sem grupo: a chave é o id', montra[0].chave === 'goldkiller-vitalicio')
  sim('grupo em branco conta como sem grupo', agruparMontra([{ ...goldkiller, grupo: '  ' }]).length === 1)
  sim('sem grupo: sem poupança', poupancaPct(goldkiller, [goldkiller]) === null)
}

// ══════════════ 5. A POUPANÇA BATE CERTO COM OS PREÇOS ══════════════
{
  // Membro: 35 €/mês × 12 = 420 €; anual 336 € → poupa 84 € = 20%.
  sim('Membro anual: 20%', poupancaPct(mbAnual, [mbMensal, mbAnual]) === 20)
  // Premium: 65 × 12 = 780; anual 624 → 156/780 = 20%.
  sim('Premium anual: 20%', poupancaPct(prAnual, [prMensal, prAnual]) === 20)
  sim('a mensal não «poupa» face a si própria', poupancaPct(mbMensal, [mbMensal, mbAnual]) === null)
  // Pagamentos únicos (6 meses, vitalício) não têm comparação mensal que não seja inventada.
  sim('6 meses pago de uma vez: sem poupança', poupancaPct(scSeis, [scMensal, scSeis, scVit]) === null)
  sim('vitalício: sem poupança', poupancaPct(scVit, [scMensal, scSeis, scVit]) === null)
  // Arredonda para BAIXO: 33.333…% anuncia-se como 33%.
  const a = v('a', 'g', 2, 8000, 'anual', true)
  const m = v('m', 'g', 1, 1000, 'mensal', true)
  sim('arredonda para baixo (33,3% → 33%)', poupancaPct(a, [m, a]) === 33)
  // Uma anual mais cara do que 12 mensais não anuncia poupança nenhuma.
  sim('anual mais cara: sem poupança', poupancaPct(v('b', 'g', 2, 13000, 'anual', true), [m]) === null)
  // Moedas diferentes não se comparam.
  sim('moedas diferentes: sem poupança', poupancaPct({ ...a, preco: { ...a.preco, moeda: 'usd' } }, [m]) === null)
  // Com campanha, a poupança usa o preço EFECTIVO (o que se paga).
  const aCamp = { ...mbAnual, preco: { cents: 16800, baseCents: 33600, moeda: 'eur' } }
  sim('com campanha, usa o preço efectivo (60%)', poupancaPct(aCamp, [mbMensal, aCamp]) === 60)
}

// ══════════════ 6. A MIGRAÇÃO ══════════════
{
  const sql = readFileSync(join(RAIZ, 'supabase/migrations/195_marketplace_grupos_de_variantes.sql'), 'utf8')
  for (const s of ['scanners-mensal', 'scanners-vitalicio', 'sensei-ea-anual', 'sensei-ea-vitalicio', 'sensei-scalp-anual', 'membro-mensal', 'membro-anual', 'premium-mensal', 'premium-anual', 'mtm-scanner-mensal']) {
    sim(`a 195 agrupa ${s}`, sql.includes(`'${s}'`))
  }
  sim('a 195 não agrupa o GoldKiller (uma só linha)', !sql.includes("'goldkiller-vitalicio'"))
  const serv = readFileSync(join(RAIZ, 'lib/marketplace/servidor.ts'), 'utf8')
  sim('a montra lê grupo, variante_nome e variante_ordem', /grupo, variante_nome, variante_ordem/.test(serv))
}

if (falhas.length) {
  console.error(`✗ ${falhas.length} falha(s):\n  - ${falhas.join('\n  - ')}`)
  process.exit(1)
}
console.log(`✓ variantes agrupadas: ${ok} verificações`)
