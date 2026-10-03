/**
 * GUARDAS DA HORA DA CORRETORA — e sobretudo do caminho que NÃO se seguiu.
 * Correr: npx tsx lib/precos-entrada/desvio.check.ts
 */
import assert from 'node:assert/strict'
import { DESVIO_MAX_MS, Desvio, MEDICOES_MAX, QUANTUM_MS, ancoraValida, desvioPlausivel, quantizar } from './desvio'

const H = 3_600_000
const AGORA = 1_790_700_000_000

// ── Quantizar ───────────────────────────────────────────────────────────────
// O `em` do EA tem resolução de um SEGUNDO (TimeGMT()*1000) e entre leituras passam ~50 ms: a
// medição traz sempre uns segundos de ruído, e é isso que o quantum de 15 min absorve.
assert.equal(quantizar(3 * H + 1_200), 3 * H, 'segundos de ruído não fazem um desvio diferente')
assert.equal(quantizar(3 * H - 1_200), 3 * H)
assert.equal(quantizar(2 * H + 30 * 60_000), 2.5 * H, 'meias horas existem (Índia, Irão)')
assert.equal(quantizar(0), 0)

assert.equal(desvioPlausivel(3 * H), true)
assert.equal(desvioPlausivel(-3 * H), true)
assert.equal(desvioPlausivel(0), true)
assert.equal(desvioPlausivel(DESVIO_MAX_MS + QUANTUM_MS), false, 'não há fuso além de ±14 h')
assert.equal(desvioPlausivel(3 * H + 1), false, 'um desvio que não é múltiplo de 15 min é lixo')
assert.equal(desvioPlausivel(Number.NaN), false)
assert.equal(desvioPlausivel('3h'), false)
assert.equal(desvioPlausivel(undefined), false)

// ── A âncora ────────────────────────────────────────────────────────────────
// `em` vem do MESMO relógio que o nosso: não batendo, o EA parou de escrever ou o campo é lixo.
assert.equal(ancoraValida(AGORA, AGORA), true)
assert.equal(ancoraValida(AGORA - 3_000, AGORA), true)
assert.equal(ancoraValida(AGORA - 60_000, AGORA), false, 'ficheiro parado não serve de âncora')
assert.equal(ancoraValida(AGORA + 60_000, AGORA), false)
assert.equal(ancoraValida(0, AGORA), false)
assert.equal(ancoraValida(null, AGORA), false)
assert.equal(ancoraValida('agora', AGORA), false)

// ── A medição ───────────────────────────────────────────────────────────────
// O caso real: MT5 do Mac a carimbar +3 h (GMT+3).
const d = new Desvio()
assert.equal(d.valor, null, 'sem medições não há estimativa — e sem estimativa não se manda nada')
for (let i = 0; i < 5; i++) d.medir(AGORA + 3 * H - i * 40, AGORA - i * 40)
assert.equal(d.valor, 3 * H, 'três horas, medidas e não configuradas')
assert.equal(d.quantas, 5)

// Uma medição absurda (ficheiro estranho) é ignorada à entrada…
const sozinha = new Desvio()
assert.equal(sozinha.medir(AGORA + 40 * H, AGORA), false, 'fora de ±14 h nem entra')
assert.equal(sozinha.valor, null)
// …e uma medição só esquisita não move a mediana.
for (let i = 0; i < 4; i++) d.medir(AGORA + 3 * H, AGORA)
d.medir(AGORA + 5 * H, AGORA)
assert.equal(d.valor, 3 * H, 'a mediana aguenta um outlier')

// A janela não cresce sem fim, e a mudança de hora acaba por passar.
const dst = new Desvio()
for (let i = 0; i < MEDICOES_MAX; i++) dst.medir(AGORA + 3 * H, AGORA)
for (let i = 0; i < MEDICOES_MAX; i++) dst.medir(AGORA + 2 * H, AGORA)
assert.equal(dst.quantas, MEDICOES_MAX)
assert.equal(dst.valor, 2 * H, 'mudança de hora de verão: a estimativa segue o mercado vivo')

/**
 * ═══ O CAMINHO QUE NÃO SE SEGUIU, e a razão de tudo isto ═════════════════════════════════════
 *
 * Sábado, corretora a +3 h, mercado fechado há 6 h. A conta ingénua — «desvio = tick mais recente
 * menos em» — dá −3 h, e ao aplicá-la a cotação do FECHO DE SEXTA fica com a hora de agora: passa a
 * guarda do futuro, passa a do velho, e o motor mexe um stop com o preço de sexta.
 *
 * Aqui não há medição nenhuma, porque nenhum tick mudou. A estimativa é a de quando o mercado ainda
 * mexia (+3 h), e com ela a cotação de sexta continua a ter 6 horas — e é recusada. Cego, não
 * enganado.
 */
const fimDeSemana = new Desvio()
for (let i = 0; i < 5; i++) fimDeSemana.medir(AGORA - 6 * H + 3 * H - i * 50, AGORA - 6 * H - i * 50) // sexta, mercado vivo
const tickDoFecho = AGORA - 6 * H + 3 * H // o `t` congelado no ficheiro, em hora da corretora
// Nenhum tick muda ao sábado: não se mede nada, e a estimativa NÃO decai.
assert.equal(fimDeSemana.valor, 3 * H, 'sem ticks novos a estimativa fica quieta')
const idade = AGORA - (tickDoFecho - (fimDeSemana.valor as number))
assert.equal(idade, 6 * H, 'a cotação do fecho continua a ter 6 horas — e vai ser recusada por velha')
// E a conta ingénua, para ficar escrito o que ela fazia:
const ingenua = quantizar(tickDoFecho - AGORA)
assert.equal(AGORA - (tickDoFecho - ingenua), 0, 'a conta ingénua dava-lhe a hora de agora (era o bug)')

console.log('desvio: ok')
