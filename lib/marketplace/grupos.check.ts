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
import {
  agruparMontra, cartoesDe, maisBarataDe, poupancaPct, slugDoGrupo, subtituloDoCartao, temPeriodicidade,
  varianteInicial, type Variante,
} from './grupos'
import { vendedorDoProduto, vendedoresDaMontra } from './regras'

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

// ══════════════ 7. O SUBTÍTULO DO CARTÃO DE GRUPO NÃO TRAZ PERIODICIDADE (196) ══════════════
{
  // Os subtítulos reais de 06/10: a principal do Pack de Scanners diz «por mês».
  const sm = { ...scMensal, subtitulo: 'Todos os scanners MTM no TradingView, por mês.' }
  const ss = { ...scSeis, subtitulo: 'Seis meses do pack de scanners, num pagamento.' }
  const sv = { ...scVit, subtitulo: 'O pack de scanners, uma vez, para sempre.' }
  const [semFrase] = agruparMontra([sm, ss, sv])
  sim('sem frase de grupo: não usa o «por mês» da principal', subtituloDoCartao(semFrase) === null)
  const FRASE = 'Todos os scanners MTM no teu TradingView: zonas, níveis e alertas.'
  const [comFrase] = agruparMontra([sm, ss, sv].map((x) => ({ ...x, grupo_subtitulo: FRASE })))
  sim('com frase de grupo: usa-a', subtituloDoCartao(comFrase) === FRASE)
  // Uma frase de grupo com período (escrita à mão, ou antiga) também não passa.
  const [frasePeriodo] = agruparMontra([sm, ss, sv].map((x) => ({ ...x, grupo_subtitulo: 'Os scanners, por mês.' })))
  sim('frase de grupo com período: não passa', subtituloDoCartao(frasePeriodo) === null)
  // Principal com subtítulo neutro (ex.: Sensei EA) serve de recurso.
  const ea1 = v('sensei-ea-anual', 'mtm-sensei-ea', 1, 29700, 'anual', true, { subtitulo: 'O Sensei a correr sozinho no teu MetaTrader 5.' } as Partial<Variante>)
  const ea2 = v('sensei-ea-vitalicio', 'mtm-sensei-ea', 2, 100000, 'unica', false, { subtitulo: 'Licença vitalícia do Sensei EA.' } as Partial<Variante>)
  sim('sem frase: a principal neutra serve', subtituloDoCartao(agruparMontra([ea1, ea2])[0]) === 'O Sensei a correr sozinho no teu MetaTrader 5.')
  // Produto sozinho fica igual.
  sim('produto sozinho: o subtítulo dele', subtituloDoCartao(agruparMontra([{ ...goldkiller, subtitulo: 'Vitalício.' }])[0]) === 'Vitalício.')
  // Em TODAS as combinações de grupo, a frase nunca traz período.
  const frases = [null, '', FRASE, 'Por mês.', '/ano', 'Licença vitalícia', 'Doze meses num pagamento só.', 'A porta de entrada.']
  let todas = true
  for (const fg of frases) for (const sp of frases) {
    const [c] = agruparMontra([{ ...sm, subtitulo: sp, grupo_subtitulo: fg }, { ...ss, grupo_subtitulo: fg }])
    if (temPeriodicidade(subtituloDoCartao(c))) todas = false
  }
  sim('nenhuma combinação devolve período num grupo', todas)
  for (const t of ['por mês', '35 €/mês', 'Mensal', 'anual', 'vitalício', '6 meses', 'uma vez, para sempre', 'pagamento único', 'ao ano'])
    sim(`detecta período: «${t}»`, temPeriodicidade(t))
  for (const t of [FRASE, 'O Sensei a correr sozinho no teu MetaTrader 5.', 'A versão rápida do Sensei, para quem fecha no dia.', 'Tudo o que o Membro tem, mais os sinais e a execução automática.'])
    sim(`frase neutra passa: «${t.slice(0, 30)}…»`, !temPeriodicidade(t))
  // As 6 frases da 196 são todas neutras e cabem na coluna.
  const sql = readFileSync(join(RAIZ, 'supabase/migrations/196_marketplace_grupo_subtitulo.sql'), 'utf8')
  const da196 = Array.from(sql.matchAll(/\('([a-z0-9-]+)',\s*'([^']+)'\)/g)).map((m) => ({ g: m[1], f: m[2] }))
  sim('a 196 escreve os 6 grupos', ['pack-scanners', 'mtm-sensei-ea', 'sensei-scalp', 'membro', 'premium', 'mtm-scanner'].every((g) => da196.some((x) => x.g === g)))
  sim('as frases da 196 não trazem período', da196.length === 6 && da196.every((x) => !temPeriodicidade(x.f)))
  // Nenhum número (preço, %, resultado) — o «5» de «MetaTrader 5» é o nome da plataforma.
  sim('as frases da 196 não trazem números', da196.every((x) => !/\d/.test(x.f.replace(/MetaTrader 5/g, ''))))
  sim('as frases da 196 cabem nos 120', da196.every((x) => x.f.length <= 120) && /between 1 and 120/.test(sql))
  const vit = readFileSync(join(RAIZ, 'components/marketplace/vitrine.tsx'), 'utf8')
  const loja = readFileSync(join(RAIZ, 'components/marketplace/loja-vendedor.tsx'), 'utf8')
  sim('a montra usa subtituloDoCartao', /subtituloDoCartao\(entrada\)/.test(vit))
  sim('a loja do vendedor usa subtituloDoCartao', /subtituloDoCartao\(/.test(loja))
  const serv = readFileSync(join(RAIZ, 'lib/marketplace/servidor.ts'), 'utf8')
  sim('a montra lê grupo_subtitulo', /grupo_subtitulo/.test(serv))
  // O slug de um grupo novo.
  sim('slug: normaliza acentos e espaços', slugDoGrupo('  Pack de Scanners Vitalício! ') === 'pack-de-scanners-vitalicio')
  sim('slug: vazio é sem grupo', slugDoGrupo('  ') === null && slugDoGrupo('—') === null)
  sim('slug: cabe na restrição da 195', /^[a-z0-9][a-z0-9-]{0,59}$/.test(slugDoGrupo('x'.repeat(80) + ' y') ?? ''))
}

// ══════════════ 8. A CONTAGEM DA TIRA BATE COM O NÚMERO DE CARTÕES ══════════════
{
  const casa = vendedorDoProduto({ dono: 'casa' })
  const ana = { id: 'edu-ana', nome: 'Ana', nota: null, ehACasa: false, avatarUrl: null }
  const daCasa = [scVit, goldkiller, scMensal, mbAnual, ledger, scSeis, mbMensal, prMensal, prAnual].map((x) => ({ ...x, dono: 'casa', vendedor: casa }))
  const daAna = [
    v('ana-curso', null, 0, 9900, 'unica', false),
    v('ana-mentoria-m', 'ana-mentoria', 1, 5000, 'mensal', true),
    v('ana-mentoria-a', 'ana-mentoria', 2, 50000, 'anual', true),
  ].map((x) => ({ ...x, dono: 'educador', educator_id: 'edu-ana', vendedor: ana }))
  const montra = [...daCasa, ...daAna]
  const tira = vendedoresDaMontra(montra)
  const nCasa = tira.find((x) => x.ehACasa)?.produtos
  const nAna = tira.find((x) => x.id === 'edu-ana')?.produtos
  sim('casa: 9 linhas contam 5 cartões', nCasa === 5)
  sim('casa: a contagem bate com os cartões da loja dela', nCasa === agruparMontra(daCasa).length)
  sim('educadora: 3 linhas contam 2 cartões', nAna === 2 && nAna === agruparMontra(daAna).length)
  sim('a soma da tira é o número de cartões da montra', tira.reduce((a, x) => a + x.produtos, 0) === agruparMontra(montra).length)
  sim('cartoesDe e agruparMontra dão os mesmos cartões', cartoesDe(montra).map((c) => c.chave).join() === agruparMontra(montra).map((c) => c.chave).join())
  const regras = readFileSync(join(RAIZ, 'lib/marketplace/regras.ts'), 'utf8')
  sim('a tira conta com cartoesDe (a mesma função da montra)', /cartoesDe\(linhas\)\.length/.test(regras))
  sim('agruparMontra passa por cartoesDe', /return cartoesDe\(produtos\)/.test(readFileSync(join(RAIZ, 'lib/marketplace/grupos.ts'), 'utf8')))
}

if (falhas.length) {
  console.error(`✗ ${falhas.length} falha(s):\n  - ${falhas.join('\n  - ')}`)
  process.exit(1)
}
console.log(`✓ variantes agrupadas: ${ok} verificações`)
