import assert from 'node:assert/strict'
import {
  TECTOS,
  TECTO_PARADO_MS,
  acompanhar,
  utilizavelComMovimento,
  TECTO_COM_HORA_MERCADO_MS,
  TECTO_SEM_HORA_MERCADO_MS,
  canonico,
  idadeMs,
  medio,
  utilizavel,
  type PrecoNosso,
} from './precos-nossos'

const AGORA = 1_790_453_306_000 // sábado, 2026-09-26 20:08:26 UTC — o dia em que isto se escreveu
const FECHO_SEXTA = 1_790_369_999_000 // sexta 20:59:59 UTC: o último tick real do forex

const p = (o: Partial<PrecoNosso>): PrecoNosso => ({ simbolo: 'XAUUSD', bid: 4286.04, ask: 4286.5, em: AGORA, emMercado: null, ...o })

// ── Um preço velho não é um preço ───────────────────────────────────────────

/**
 * O CASO QUE DEU ORIGEM A ISTO. Sábado: a tabela é reescrita a cada poucos segundos com a cotação
 * do fecho de sexta. A escrita é de agora; a cotação tem 23 horas. Se isto passasse, o motor podia
 * mexer um stop com o preço de sexta.
 */
assert.equal(
  utilizavel(p({ em: AGORA, emMercado: FECHO_SEXTA }), AGORA),
  false,
  'reescrever a cotação de sexta não a torna nova',
)

// Com hora de mercado fresca, passa.
assert.equal(utilizavel(p({ em: AGORA, emMercado: AGORA - 5_000 }), AGORA), true)
// No limite exacto ainda passa; um ms depois, não.
assert.equal(utilizavel(p({ emMercado: AGORA - TECTO_COM_HORA_MERCADO_MS }), AGORA), true)
assert.equal(utilizavel(p({ emMercado: AGORA - TECTO_COM_HORA_MERCADO_MS - 1 }), AGORA), false)

// Sem hora de mercado o tecto é MAIS CURTO: não se pode provar que a cotação é de agora.
assert.ok(
  TECTO_SEM_HORA_MERCADO_MS < TECTO_COM_HORA_MERCADO_MS,
  'quem não prova a hora do mercado merece menos confiança, não mais',
)
assert.equal(utilizavel(p({ em: AGORA - 5_000 }), AGORA), true)
assert.equal(utilizavel(p({ em: AGORA - TECTO_SEM_HORA_MERCADO_MS - 1 }), AGORA), false)

// A hora do MERCADO manda sobre a da escrita quando ambas existem.
assert.equal(idadeMs(p({ em: AGORA, emMercado: AGORA - 20_000 }), AGORA), 20_000)
assert.equal(idadeMs(p({ em: AGORA - 3_000, emMercado: null }), AGORA), 3_000)

// Preços impossíveis nunca são utilizáveis, por frescos que sejam.
for (const mau of [0, -1, Number.NaN]) {
  assert.equal(utilizavel(p({ bid: mau, emMercado: AGORA }), AGORA), false, `bid=${mau}`)
  assert.equal(utilizavel(p({ ask: mau, emMercado: AGORA }), AGORA), false, `ask=${mau}`)
}

// ── O médio é o MESMO que a ligação da MetaApi fazia ───────────────────────
// Se mudasse, a sombra deixava de ser comparável com o que o monitor antigo decidia.
assert.equal(medio(p({ bid: 100, ask: 102 })), 101)

// ── O símbolo da corretora encontra o nosso ────────────────────────────────

assert.equal(canonico('XAUUSD.s'), 'XAUUSD')
assert.equal(canonico('EURUSD.pro'), 'EURUSD')
assert.equal(canonico('US30-STD'), 'US30')
assert.equal(canonico(' xauusd '), 'XAUUSD')
assert.equal(canonico('XAUUSD'), 'XAUUSD')
// Nunca se cortam letras do próprio nome — cortar dava o preço do instrumento ERRADO.
assert.equal(canonico('BTCUSD'), 'BTCUSD')
assert.equal(canonico('NAS100'), 'NAS100')
// O mapa explícito ganha, e também apanha o nome já cortado.
const mapa = new Map([['XAUUSD.X', 'XAUUSD'], ['GOLD', 'XAUUSD']])
assert.equal(canonico('GOLD', mapa), 'XAUUSD')
assert.equal(canonico('XAUUSD.X', mapa), 'XAUUSD')
assert.equal(canonico('', mapa), '')

// Os tectos exportados são os que as constantes dizem — para ninguém os afrouxar sem dar por isso.
assert.equal(TECTOS.comHoraMercado, TECTO_COM_HORA_MERCADO_MS)
assert.equal(TECTOS.semHoraMercado, TECTO_SEM_HORA_MERCADO_MS)
assert.ok(TECTOS.comHoraMercado <= 60_000, 'mais de um minuto não é tempo real')

console.log('motor-real/precos-nossos: OK')

// ── O preço PARADO: o buraco que a hora de escrita não tapava ───────────────

/**
 * O caso real, medido no sábado 26/09 com a guarda de cima já escrita: GBPUSD, USDJPY, NAS100,
 * US30, US500, UK100 e USOIL a serem reescritos a cada poucos segundos, sem hora de mercado, com a
 * cotação do fecho de sexta. Pelo tecto de escrita passavam por frescos. Um mercado aberto mexe;
 * estes não mexiam.
 */
{
  const mesmo = p({ bid: 1.32383, ask: 1.32401, em: AGORA, emMercado: null })
  // Primeira vez que se vê: passa (a alternativa era o motor ficar cego a cada arranque).
  assert.equal(utilizavelComMovimento(mesmo, AGORA, null), true, 'a primeira leitura tem benefício da dúvida')

  // Visto pela primeira vez há 3 minutos e sempre igual → está parado, não se decide com ele.
  let mov = acompanhar(null, mesmo, AGORA - 180_000)
  mov = acompanhar(mov, mesmo, AGORA)
  assert.equal(mov.desde, AGORA - 180_000, 'valor igual não renova o «desde»')
  assert.equal(utilizavelComMovimento(mesmo, AGORA, mov), false, 'parado há 3 min com o mercado fechado')

  // Dentro do tecto de paragem ainda passa: num momento calmo um par pode não mexer uns segundos.
  const recente = acompanhar(null, mesmo, AGORA - (TECTO_PARADO_MS - 1))
  assert.equal(utilizavelComMovimento(mesmo, AGORA, recente), true)

  // Assim que MEXE, o relógio da paragem recomeça — e volta a servir.
  const mexeu = acompanhar(mov, p({ bid: 1.32390, ask: 1.32408, em: AGORA, emMercado: null }), AGORA)
  assert.equal(mexeu.desde, AGORA, 'um valor novo nasce agora')
  assert.equal(utilizavelComMovimento(p({ bid: 1.32390, ask: 1.32408, em: AGORA }), AGORA, mexeu), true)
}

/**
 * Quem TEM hora de mercado não passa pela prova do movimento: a hora é prova directa, e o ouro
 * pode legitimamente não mexer uns minutos sem que isso queira dizer que a fonte congelou.
 */
{
  const ouro = p({ bid: 4286.04, ask: 4286.5, em: AGORA, emMercado: AGORA - 10_000 })
  const paradoHaMuito = { bid: 4286.04, ask: 4286.5, desde: AGORA - 600_000 }
  assert.equal(utilizavelComMovimento(ouro, AGORA, paradoHaMuito), true, 'a hora de mercado manda')
}

// E um preço velho continua velho, mexa ou não mexa.
{
  const velho = p({ em: AGORA - 60_000, emMercado: null })
  assert.equal(utilizavelComMovimento(velho, AGORA, { bid: velho.bid, ask: velho.ask, desde: AGORA }), false)
}

assert.equal(TECTOS.parado, TECTO_PARADO_MS)
assert.ok(TECTOS.parado > TECTOS.semHoraMercado, 'o tecto de paragem é uma segunda prova, não a primeira')

console.log('motor-real/precos-nossos (parados): OK')
