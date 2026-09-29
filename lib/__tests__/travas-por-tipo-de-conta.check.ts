/**
 * AS TRAVAS POR TIPO DE CONTA — a guarda.
 *
 * O que esta guarda protege, por ordem de dano:
 *
 *  1. QUE O BLOQUEIO NUNCA IMPEÇA UMA SAÍDA. É a razão de existir do ficheiro todo: uma conta
 *     travada que não recebe o fecho do que tem aberto fica exposta sem gestão. Aqui prova-se que a
 *     trava só tem uma pergunta («podes ABRIR?») e que os caminhos de saída dos motores não a
 *     chamam — os dois lados da prova estão no fim deste ficheiro.
 *  2. OS LIMIARES POR TIPO. Financiada 3 %/6 %; real 30 % e SL ≤ 95 % da banca, SEM drawdown global
 *     nem margem mínima (são regra de prop firm, e o dono foi explícito). Desafio e torneio sem
 *     nada: quem os governa é o programa.
 *  3. O CASO MAU: 2,9 % passa, 3,0 % (exactos) já não. Uma noção de «atingido» diferente da de
 *     `avaliarConta` dava um ecrã verde com um motor a recusar.
 *  4. NÃO TRAVAR POR FALTA DE DADOS — sem equity, sem base ou com o jsonb corrompido, a trava não
 *     dispara; e uma configuração corrompida cai nos valores do dono em vez de se desligar.
 *  5. QUE A REPOSIÇÃO NÃO TOQUE NO `saldo_inicial`: a base da global é outra coluna, senão repor um
 *     contador falsificava a linha de água da conta em todos os ecrãs.
 *
 *   npx tsx lib/__tests__/travas-por-tipo-de-conta.check.ts
 */
import assert from 'node:assert/strict'
import {
  LIMITES_POR_TIPO, ehPropFirm, lerLimitesPorTipo, slAcimaDaBanca, textoDaFolga, tipoDeConta,
  travaDaConta, travaDoTipo, type EstadoDaBanca,
} from '../travas-por-tipo-de-conta'

let n = 0
const teste = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }

console.log('\nTRAVAS POR TIPO DE CONTA\n')

const PADRAO = lerLimitesPorTipo(null)

/** Uma conta de 10 000 que abriu o dia nos 10 000. */
const banca = (x: Partial<EstadoDaBanca> = {}): EstadoDaBanca => ({
  saldo: 10_000, equity: 10_000, saldoInicial: 10_000, ancoraDia: 10_000, motor: 'sim', ...x,
})

// ── 1 · os limiares que o dono ditou ────────────────────────────────────────

teste('financiada: 3 % diária e 6 % global', () => {
  assert.equal(LIMITES_POR_TIPO.financiada.perdaDiariaPct, 3)
  assert.equal(LIMITES_POR_TIPO.financiada.perdaGlobalPct, 6)
})

teste('real: 30 % diária, SL ≤ 95 % da banca', () => {
  assert.equal(LIMITES_POR_TIPO.real.perdaDiariaPct, 30)
  assert.equal(LIMITES_POR_TIPO.real.slMaxPctDaBanca, 95)
})

teste('real NÃO tem drawdown global nem margem mínima (é regra de prop firm)', () => {
  assert.equal(LIMITES_POR_TIPO.real.perdaGlobalPct, null)
  assert.equal(LIMITES_POR_TIPO.real.margemLivreMinPct, null)
  assert.equal(ehPropFirm('real'), false)
  assert.equal(ehPropFirm('financiada'), true)
})

teste('desafio e torneio não têm travas destas — quem os governa é o programa', () => {
  for (const t of ['desafio', 'torneio', 'provider'] as const) {
    assert.equal(travaDaConta(t, PADRAO, banca({ equity: 1000 })).temTrava, false)
    assert.equal(travaDaConta(t, PADRAO, banca({ equity: 1000 })).podeAbrir, true)
  }
})

teste('um tipo desconhecido não recebe limites inventados', () => {
  const v = travaDaConta('qualquer-coisa', PADRAO, banca({ equity: 1 }))
  assert.equal(v.tipo, 'desconhecido')
  assert.equal(v.temTrava, false)
  assert.equal(v.podeAbrir, true)
})

teste('tipoDeConta normaliza e não deixa passar «desconhecido» como tipo real', () => {
  assert.equal(tipoDeConta(' Financiada '), 'financiada')
  assert.equal(tipoDeConta('desconhecido'), 'desconhecido')
  assert.equal(tipoDeConta(null), 'desconhecido')
})

// ── 2 · o caso mau: 2,9 % contra 3,1 % ──────────────────────────────────────

teste('financiada a 2,9 % do dia: ABRE', () => {
  const v = travaDaConta('financiada', PADRAO, banca({ equity: 9710, saldo: 9710 }))
  assert.equal(v.diaria?.usadoPct, 2.9)
  assert.equal(v.diaria?.excedido, false)
  assert.equal(v.podeAbrir, true)
  assert.equal(v.motivo, null)
})

teste('financiada a 3,1 % do dia: NÃO abre, e o motivo diz o número', () => {
  const v = travaDaConta('financiada', PADRAO, banca({ equity: 9690, saldo: 9690 }))
  assert.equal(v.diaria?.excedido, true)
  assert.equal(v.podeAbrir, false)
  assert.match(String(v.motivo), /3,?10 %|3\.10 %/)
  assert.match(String(v.motivo), /saídas/)
})

teste('a 3,00 % EXACTOS já está atingido (igual a avaliarConta)', () => {
  const v = travaDaConta('financiada', PADRAO, banca({ equity: 9700, saldo: 9700 }))
  assert.equal(v.diaria?.excedido, true)
  assert.equal(v.podeAbrir, false)
})

teste('um cêntimo acima dos 3 % ainda abre', () => {
  assert.equal(travaDaConta('financiada', PADRAO, banca({ equity: 9700.01 })).podeAbrir, true)
})

teste('real a 29 % abre; a 30 % não', () => {
  assert.equal(travaDaConta('real', PADRAO, banca({ equity: 7100 })).podeAbrir, true)
  assert.equal(travaDaConta('real', PADRAO, banca({ equity: 7000 })).podeAbrir, false)
})

teste('real a −10 % acumulados continua a abrir: não tem drawdown global', () => {
  // Perdeu 10 % desde o início, mas hoje o dia abriu nos 9 000 e ainda não perdeu 30 % do dia.
  const v = travaDaConta('real', PADRAO, banca({ equity: 9000, ancoraDia: 9000 }))
  assert.equal(v.global, null)
  assert.equal(v.podeAbrir, true)
})

teste('financiada a −6 % acumulados: a global trava mesmo com o dia limpo', () => {
  const v = travaDaConta('financiada', PADRAO, banca({ equity: 9400, ancoraDia: 9400 }))
  assert.equal(v.diaria?.excedido, false)
  assert.equal(v.global?.excedido, true)
  assert.equal(v.podeAbrir, false)
})

teste('as duas travas juntas dão DOIS motivos, não um', () => {
  const v = travaDaConta('financiada', PADRAO, banca({ equity: 9000 }))
  assert.equal(v.motivos.length, 2)
})

// ── 3 · bases diferentes de propósito ───────────────────────────────────────

teste('a diária mede-se à âncora do dia, não ao saldo inicial', () => {
  // Conta em lucro acumulado (11 000) que hoje abriu nos 11 000 e já perdeu 3,2 % HOJE.
  const v = travaDaConta('financiada', PADRAO, banca({ saldoInicial: 10_000, ancoraDia: 11_000, equity: 10_648 }))
  assert.equal(v.diaria?.excedido, true)
  // …e a global não se queixa: contra os 10 000 iniciais ela está em lucro.
  assert.equal(v.global?.excedido, false)
})

teste('sem âncora do dia a diária cai para o saldo inicial (e não desaparece)', () => {
  const v = travaDaConta('financiada', PADRAO, banca({ ancoraDia: null, equity: 9600 }))
  assert.equal(v.diaria?.base, 10_000)
  assert.equal(v.diaria?.excedido, true)
})

teste('a reposição move `baseGlobal` e NUNCA o saldo inicial', () => {
  // Conta a −6 % e reposta: a base da global passa a ser a equity do momento da reposição.
  const reposta = travaDaConta('financiada', PADRAO, banca({ equity: 9400, ancoraDia: 9400, baseGlobal: 9400 }))
  assert.equal(reposta.global?.excedido, false)
  assert.equal(reposta.podeAbrir, true)
  // A linha de água continua a dizer a verdade: −6 % contra os 10 000 de partida.
  assert.equal(reposta.linha.pct, -6)
  assert.equal(reposta.linha.proveniencia, 'simulado')
})

teste('a proveniência da linha de água vem do motor e é sempre declarada', () => {
  assert.equal(travaDaConta('real', PADRAO, banca({ motor: 'mt5' })).linha.proveniencia, 'real')
  assert.equal(travaDaConta('real', PADRAO, banca({ motor: 'sim' })).linha.proveniencia, 'simulado')
})

// ── 4 · não travar por falta de dados ───────────────────────────────────────

teste('sem equity nem saldo NÃO trava (uma avaria não é prudência)', () => {
  const v = travaDaConta('financiada', PADRAO, banca({ equity: null, saldo: null }))
  assert.equal(v.diaria, null)
  assert.equal(v.global, null)
  assert.equal(v.podeAbrir, true)
})

teste('sem saldo inicial e sem âncora não há base: não trava', () => {
  const v = travaDaConta('financiada', PADRAO, banca({ saldoInicial: null, ancoraDia: null, equity: 1 }))
  assert.equal(v.podeAbrir, true)
})

teste('margem livre só trava quando há limite configurado E valor medido', () => {
  const comMargem = lerLimitesPorTipo({ financiada: { margemLivreMinPct: 10 } })
  assert.equal(travaDoTipo(comMargem.financiada, banca({ margemLivre: 500 })).podeAbrir, false)
  assert.equal(travaDoTipo(comMargem.financiada, banca({ margemLivre: 2000 })).podeAbrir, true)
  // sem valor de margem: não trava
  assert.equal(travaDoTipo(comMargem.financiada, banca({ margemLivre: null })).podeAbrir, true)
  // O PADRÃO das financiadas passou a ter limite (20%, dado pelo dono a 29/09), por isso é a
  // conta REAL que serve de caso «sem limite» — nas reais a margem mínima não se aplica, por
  // decisão dele: é regra de prop firm.
  assert.equal(travaDoTipo(PADRAO.real, banca({ margemLivre: 1 })).podeAbrir, true)
  // E o padrão das financiadas trava mesmo: 1 € de margem livre numa conta de 1 000 é 0,1%.
  assert.equal(travaDoTipo(PADRAO.financiada, banca({ margemLivre: 1 })).podeAbrir, false)
  assert.equal(PADRAO.financiada.margemLivreMinPct, 20)
  assert.equal(PADRAO.real.margemLivreMinPct, null)
})

// ── 5 · configuração ────────────────────────────────────────────────────────

teste('a configuração manda: 5 %/12 % em vez de 3 %/6 %', () => {
  const c = lerLimitesPorTipo({ financiada: { perdaDiariaPct: 5, perdaGlobalPct: 12 } })
  assert.equal(c.financiada.perdaDiariaPct, 5)
  assert.equal(c.financiada.perdaGlobalPct, 12)
  assert.equal(travaDoTipo(c.financiada, banca({ equity: 9600 })).podeAbrir, true)
})

teste('`null` explícito desliga essa regra; um campo ausente mantém o valor do dono', () => {
  const c = lerLimitesPorTipo({ financiada: { perdaGlobalPct: null } })
  assert.equal(c.financiada.perdaGlobalPct, null)
  assert.equal(c.financiada.perdaDiariaPct, 3)
})

teste('um valor absurdo cai no valor do dono — aqui o lado seguro é CONTINUAR a travar', () => {
  for (const mau of [0, -1, 500, 'muito', null === undefined ? 1 : NaN]) {
    const c = lerLimitesPorTipo({ financiada: { perdaDiariaPct: mau } })
    assert.equal(c.financiada.perdaDiariaPct, 3, `${String(mau)}`)
  }
})

teste('a configuração pode vir como STRING JSON (já aconteceu nesta casa)', () => {
  const c = lerLimitesPorTipo(JSON.stringify({ real: { perdaDiariaPct: 20 } }))
  assert.equal(c.real.perdaDiariaPct, 20)
  assert.equal(c.real.slMaxPctDaBanca, 95)
})

teste('jsonb corrompido → os valores do dono, com a trava de pé', () => {
  for (const mau of ['{{{', 42, [], 'null']) {
    assert.equal(lerLimitesPorTipo(mau).financiada.perdaDiariaPct, 3)
  }
})

// ── 6 · o SL contra a banca ─────────────────────────────────────────────────

teste('SL a 94 % da banca passa; a 96 % não', () => {
  assert.equal(slAcimaDaBanca(95, { riscoUsd: 940, banca: 1000 }), null)
  assert.ok(slAcimaDaBanca(95, { riscoUsd: 960, banca: 1000 }))
})

teste('95 % exactos ainda passam (o limite é o máximo, não a linha de corte)', () => {
  assert.equal(slAcimaDaBanca(95, { riscoUsd: 950, banca: 1000 }), null)
})

teste('sem SL (risco desconhecido) esta trava não se pronuncia', () => {
  assert.equal(slAcimaDaBanca(95, { riscoUsd: null, banca: 1000 }), null)
  assert.equal(slAcimaDaBanca(95, { riscoUsd: 0, banca: 1000 }), null)
})

teste('sem banca conhecida não trava; e sem limite configurado nunca trava', () => {
  assert.equal(slAcimaDaBanca(95, { riscoUsd: 5000, banca: null }), null)
  assert.equal(slAcimaDaBanca(95, { riscoUsd: 5000, banca: 0 }), null)
  assert.equal(slAcimaDaBanca(null, { riscoUsd: 5000, banca: 1000 }), null)
})

teste('a financiada não tem tecto de SL por omissão (tem os 3 %/6 %)', () => {
  assert.equal(slAcimaDaBanca(PADRAO.financiada.slMaxPctDaBanca, { riscoUsd: 9999, banca: 10_000 }), null)
})

// ── 7 · A PROVA: o bloqueio não impede saídas ───────────────────────────────

teste('a trava só responde a UMA pergunta: «podes abrir?»', () => {
  const v = travaDaConta('financiada', PADRAO, banca({ equity: 9000 }))
  // Não existe — nem pode existir — um campo que diga «não podes fechar».
  const campos = Object.keys(v)
  assert.equal(campos.includes('podeAbrir'), true)
  assert.equal(campos.some((k) => /fechar|sair|saida|saída|gerir/i.test(k)), false)
})

/**
 * O outro lado da prova: os motores só chamam estas funções nos caminhos de ABERTURA.
 *
 * Lê-se o código dos dois motores e confirma-se que as funções de FECHO não têm, no corpo, nenhuma
 * chamada às travas. É a única forma de o provar sem base de dados — e é exactamente o defeito que
 * se quer impedir de voltar: basta alguém mover a chamada duas linhas acima, para dentro de
 * `fecharPosicao`, e uma conta travada deixa de conseguir fechar o que tem aberto.
 */
teste('o motor do WebTrader não chama a trava em nenhum caminho de saída', () => {
  const fs = require('node:fs') as typeof import('node:fs')
  const path = require('node:path') as typeof import('node:path')
  const raiz = path.resolve(__dirname, '..', '..')
  const src = fs.readFileSync(path.join(raiz, 'lib/mtmfunded/simulado/execucao.ts'), 'utf8')

  // O corpo de cada função exportada, até à próxima `export ` no início de linha.
  const corpoDe = (nome: string): string => {
    const i = src.indexOf(`export async function ${nome}(`)
    assert.notEqual(i, -1, `${nome} não existe em execucao.ts`)
    const resto = src.slice(i + 10)
    const fim = resto.search(/\nexport (async )?function /)
    return fim === -1 ? resto : resto.slice(0, fim)
  }

  const TRAVA = /exigirTravaDoTipo|travaDaConta|slAcimaDaBanca/
  // Nascem posições/ordens: TÊM de travar.
  for (const abre of ['abrirPosicao', 'criarPendente']) {
    assert.match(corpoDe(abre), TRAVA, `${abre} tem de chamar a trava`)
  }
  // Saem posições ou gere-se o que já está aberto: NUNCA travam.
  for (const sai of ['fecharPosicao', 'modificarPosicao', 'modificarGestao', 'fecharLote', 'cancelarPendente', 'cancelarTodas', 'fecharTodasDoSimbolo']) {
    assert.doesNotMatch(corpoDe(sai), TRAVA, `${sai} NÃO pode chamar a trava — uma conta travada tem de conseguir sair`)
  }
})

teste('o motor da cópia só trava dentro de `bloqueioAbertura`', () => {
  const fs = require('node:fs') as typeof import('node:fs')
  const path = require('node:path') as typeof import('node:path')
  const raiz = path.resolve(__dirname, '..', '..')
  const src = fs.readFileSync(path.join(raiz, 'lib/mestres/servidor/ganchos.ts'), 'utf8')
  const i = src.indexOf('async bloqueioAbertura(')
  assert.notEqual(i, -1)
  const fim = src.indexOf('async registar(', i)
  assert.ok(fim > i)
  const dentro = src.slice(i, fim)
  const fora = src.slice(0, i) + src.slice(fim)
  assert.match(dentro, /travaDaContaDestino/, 'a trava tem de ser lida na guarda de abertura')
  assert.doesNotMatch(fora, /travaDaContaDestino\(/, 'e em mais sítio nenhum do gancho — `registar` gere saídas')
})

/**
 * A decisão que separa esta trava de uma trava decorativa: as contas de ANÁLISE são governadas.
 *
 * 15 das 16 contas `financiada` e 9 das 12 `real` têm `analise: true`. Excluí-las por omissão fazia
 * os 3 %/6 % não se aplicarem praticamente a conta nenhuma — e era o tipo de decisão que passa
 * despercebida numa revisão. Fica aqui para quem a mudar ter de mudar também este teste.
 */
teste('por omissão a trava aplica-se às contas de análise (só a conta real da casa sai)', () => {
  const fs = require('node:fs') as typeof import('node:fs')
  const path = require('node:path') as typeof import('node:path')
  const raiz = path.resolve(__dirname, '..', '..')
  const src = fs.readFileSync(path.join(raiz, 'lib/mtmfunded/simulado/travas-tipo.ts'), 'utf8')
  const i = src.indexOf('export async function foraDoAmbito(')
  assert.notEqual(i, -1)
  const corpo = src.slice(i, src.indexOf('\n}', i))
  // A conta real da casa sai sempre; a de análise só sai com o interruptor ligado.
  assert.match(corpo, /ehContaRealDaCasa/)
  assert.match(corpo, /analise && \(await configuracao\(\)\)\.excluirAnalise/)
  const migracao = fs.readFileSync(path.join(raiz, 'supabase/migrations/156_travas_por_tipo_de_conta.sql'), 'utf8')
  assert.match(migracao, /"excluirAnalise":\s*false/, 'a migração tem de nascer com a trava a aplicar-se')
})

// ── 8 · o texto do ecrã ─────────────────────────────────────────────────────

teste('a folga escreve-se em dinheiro, e sem medida é «—»', () => {
  const v = travaDaConta('financiada', PADRAO, banca({ equity: 9800 }))
  assert.match(textoDaFolga(v.diaria), /100\.00 USD até ao limite de 3 %/)
  assert.equal(textoDaFolga(null), '—')
  assert.match(textoDaFolga(travaDaConta('financiada', PADRAO, banca({ equity: 9600 })).diaria), /atingido/)
})

console.log(`\n${n} testes ok\n`)
