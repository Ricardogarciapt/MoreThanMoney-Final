/**
 * A GUARDA DOS FACTOS DA CASA.
 *
 *   npx tsx lib/factos-da-casa.check.ts
 *
 * O que isto protege não dá erro nenhum — dá uma resposta errada a quem está a decidir:
 *
 *  · uma área a aparecer no bot com «a abrir» quando está pronta;
 *  · o nome da plataforma de terceiros a sair numa mensagem;
 *  · um euro de lucro citado como prova;
 *  · o preço com campanha a ficar congelado quando a campanha mudar;
 *  · uma área nova em `lib/pilares.ts` que o bot nunca chega a conhecer.
 */
import { TRIAL_DAYS } from './trial-access'
import { AREAS } from './pilares'
import {
  AGENTES_POR_PILAR,
  BOOTCAMP_CAMPANHA_PCT,
  BOOTCAMP_HORAS,
  BOOTCAMP_HORAS_ERRADAS,
  BOOTCAMP_PRECO_EUR,
  FACELESS,
  PORTEFOLIOS,
  REGRAS_DA_CASA,
  SEPARADOR_AULAS,
  bootcampPrecoComCampanha,
  contextoDaCasa,
  factosDaCasa,
  totalSubAgentes,
} from './factos-da-casa'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }

const texto = contextoDaCasa()
/**
 * As proibições testam-se nos FACTOS, não no texto inteiro.
 *
 * O bloco das regras cita as frases proibidas para as proibir («NUNCA digas "a abrir"»). Testar o
 * texto todo dava uma falha garantida e a tentação de amansar o regex — que é como uma guarda
 * deixa de guardar.
 */
const factos = factosDaCasa()

// ── O QUE NUNCA PODE SAIR ───────────────────────────────────────────────────
{
  // A plataforma de terceiros não se nomeia. O teste é pelo nome, porque é o nome que escapa.
  teste('a plataforma de terceiros não é nomeada', !/skool/i.test(texto))
  // «a abrir» / «em breve»: a casa já não tem áreas por abrir.
  teste('nenhuma área aparece como a abrir', !/a abrir|em breve|em prepara[çc][ãa]o/i.test(factos))
  /**
   * Lucro em euros. O teste é estreito de propósito: o texto TEM de poder dizer «310 €» (um preço)
   * e «263,50 €» (outro preço) — o que não pode é um ganho em euros, do género «+7.060€».
   */
  teste('nenhum ganho citado em euros', !/\+\s*\d[\d .,]*\s*(€|EUR)/i.test(factos))
  teste('nenhuma promessa de percentagem em prazo', !/\+\d+%\s*(em|nos|em apenas)\s*\d+\s*(dias|meses|semanas)/i.test(factos))
}

// ── OS FACTOS DE 01/10/2026 ─────────────────────────────────────────────────
{
  teste('os dois pilares públicos estão lá', texto.includes('/mtmmarkets') && texto.includes('/contentbussiness'))
  teste('todas as áreas de pilares.ts chegam ao bot', AREAS.every((a) => texto.includes(a.titulo)))
  teste('o número de áreas é contado, não escrito', texto.includes(`As ${AREAS.length} áreas`))

  teste('o Bootcamp são 30 horas', texto.includes(`${BOOTCAMP_HORAS} horas`))
  /**
   * As 50 horas TÊM de aparecer — mas só desmentidas. «São 30» deixa as duas versões a coexistir
   * na cabeça do modelo; «são 30 e não as 50» é o que a corrige.
   */
  teste('as 50 horas aparecem desmentidas',
    texto.includes(`e não as ${BOOTCAMP_HORAS_ERRADAS}`))
  teste('o certificado leva as 38 perguntas e os 70%', /38 perguntas/.test(texto) && /70%/.test(texto))

  /**
   * O preço com campanha é CALCULADO. Se alguém o escrever à mão, este teste continua a passar —
   * o que não passa é a conta estar errada, que é o caso que custa dinheiro a quem compra.
   */
  teste('310 € com 15% dá 263,50 €', bootcampPrecoComCampanha() === 263.5)
  teste('o preço pago aparece no texto', texto.includes('263,50 €'))
  teste('a campanha e o preço de tabela estão declarados',
    texto.includes(`${BOOTCAMP_CAMPANHA_PCT}%`) && texto.includes(`${BOOTCAMP_PRECO_EUR} €`))

  teste('a academia nova entrou com quem a dá',
    texto.includes(FACELESS.educadora) && texto.includes(FACELESS.academia) && texto.includes('127 €'))

  teste('as duas carteiras estão lá', PORTEFOLIOS.every((p) => texto.includes(p.nome)))
  teste('o cripto aparece negativo', texto.includes('-36,4%'))
  // Milhares no MESMO formato dos dois lados da seta, e nos dois portefólios.
  teste('os milhares têm todos o mesmo formato',
    texto.includes('7 230 $ → 4 598 $') && texto.includes('7 700 $ → 10 743 $'))
  teste('o ETF aparece com sinal', texto.includes('+39,5%'))
  teste('as posições somam 100%', texto.includes('11 posições') && texto.includes('9 posições'))
  teste('o DCA das sextas está declarado', /sextas/.test(texto))

  teste('a equipa é um CEO e seis sub-agentes', totalSubAgentes() === 6 && texto.includes('um CEO e 6 sub-agentes'))
  teste('os três pilares da equipa estão lá',
    Object.keys(AGENTES_POR_PILAR).every((p) => texto.includes(p)))
  teste('a regra de vida está escrita', /receita menos gasto/.test(texto) && /48 horas/.test(texto))
  teste('o link de atribuição está escrito', texto.includes('?ag=AG-'))

  teste('o separador chama-se Aulas', texto.includes(SEPARADOR_AULAS) && texto.includes('Ao vivo'))
}

// ── A ORDEM: FACTOS PRIMEIRO, REGRAS DEPOIS ─────────────────────────────────
{
  /**
   * Proibir sem substituir não chega — foi assim que o «NUNCA cites euros» de 27/08 sobreviveu
   * um dia. As regras TÊM de vir depois dos factos, e os factos sozinhos não trazem regras.
   */
  teste('as regras vêm depois dos factos', texto.indexOf('REGRAS QUE NÃO SE VIOLAM') > texto.indexOf('O QUE A MORETHANMONEY É HOJE'))
  teste('os factos sozinhos não trazem regras', !factosDaCasa().includes('REGRAS QUE NÃO SE VIOLAM'))
  teste('as regras falam de pips', /PIPS/.test(REGRAS_DA_CASA))
  teste('as regras mandam dizer que não sabe', /não sabes/.test(REGRAS_DA_CASA))
  teste('as regras fixam o português de Portugal', /Portugal/.test(REGRAS_DA_CASA))
}

// ── O TRIAL SÃO TRÊS DIAS ───────────────────────────────────────────────────
{
  /**
   * Uma passagem de 01/10 leu o nome do cupão (`14DayTrial`) e concluiu catorze dias. É plausível
   * e é falso — a duração está em `TRIAL_DAYS` e os emails de onboarding dizem três em todos os
   * idiomas. O bot chegou a prometer a leads reais uma condição que a casa não dá.
   */
  teste('o trial são 3 dias, não os do nome do cupão', TRIAL_DAYS === 3)
}

if (falhas.length) {
  console.error(`factos-da-casa: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('factos-da-casa: o bot conhece a casa de 01/10, e nada do que não pode dizer ✓')
