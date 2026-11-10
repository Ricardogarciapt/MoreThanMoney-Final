/**
 * Guarda do português de Portugal: `npx tsx lib/pt-pt.check.ts`.
 * Prova, sem rede, que as trocas comuns saem certas e que o que já é PT-PT fica intacto.
 */
import assert from 'node:assert/strict'
import { corrigirPtPt, verificarPtPt, corrigirObjectoPtPt, parecePortugues, regrasPtPtParaPrompt } from './pt-pt'

const c = (t: string) => corrigirPtPt(t).texto
const sinal = (t: string, tipo: string) => verificarPtPt(t).some((b) => b.tipo === tipo)

// vocabulário
assert.equal(c('Abre no teu celular'), 'Abre no teu telemóvel')
assert.equal(c('CELULAR'), 'TELEMÓVEL')
assert.equal(c('Olha para a tela'), 'Olha para o ecrã')
assert.equal(c('Na tela do gráfico'), 'No ecrã do gráfico')
assert.equal(c('Baixa o app e entra'), 'Baixa a app e entra')
assert.equal(c('Um aplicativo grátis'), 'Uma aplicação grátis')
assert.equal(c('Faz o teu cadastro'), 'Faz o teu registo')
assert.equal(c('Fala com a equipe'), 'Fala com a equipa')
assert.equal(c('Compartilha com quem precisa'), 'Partilha com quem precisa')
assert.equal(c('Isto é pra ti'), 'Isto é para ti')
assert.equal(c('Bónus para iniciantes'), 'Bónus para principiantes')
assert.equal(c('Oi! Tudo bem?'), 'Olá! Tudo bem?')
assert.equal(c('De fato, funciona'), 'De facto, funciona')
// imperativo de «você» no início da frase
assert.equal(c('Comente SCANNER e recebe o guia'), 'Comenta SCANNER e recebe o guia')
assert.equal(c('Gostaste? Salve este post.'), 'Gostaste? Guarda este post.')
assert.equal(c('👉 Clique no link da bio'), '👉 Clica no link da bio')
assert.equal(c('Um clique chega'), 'Um clique chega') // substantivo, a meio da frase
// gerúndio
assert.equal(c('Estás perdendo dinheiro'), 'Estás a perder dinheiro')
assert.equal(c('O ouro continua subindo'), 'O ouro continua a subir')
assert.equal(c('ESTÁS PERDENDO'), 'ESTÁS A PERDER')
assert.equal(c('tô vendo isto'), 'estou a ver isto')
assert.equal(c('está lindo'), 'está lindo')
assert.equal(c('Fazendo isto, ganhas tempo'), 'Fazendo isto, ganhas tempo') // gerúndio adverbial é PT-PT
assert.equal(c('quando está quando'), 'quando está quando')
// acentos
assert.equal(c('Um prêmio econômico e um bônus'), 'Um prémio económico e um bónus')
assert.equal(c('Têm ênfase no risco'), 'Têm ênfase no risco')
// o que já é PT-PT fica igual
const ptpt = 'Arrisca no máximo um por cento da conta. O stop não é derrota: é gestão de risco. Comenta SCANNER 👇'
assert.equal(c(ptpt), ptpt)
assert.equal(verificarPtPt(ptpt).length, 0)
// nomes da casa não mudam
const nomes = 'GoldKiller, Sensei EA, MTM Auto, She Is Studio, Tap to Trade, DEFY e Aurum Flow'
assert.equal(c(nomes), nomes)
// o que pede reescrita
assert.ok(sinal('Você precisa de método', 'tratamento'))
assert.ok(sinal('A gente ensina', 'tratamento'))
assert.ok(sinal('Me diz o que achas', 'construcao'))
assert.ok(sinal('Um bilhão de pessoas', 'vocabulario'))
assert.ok(sinal('ESTÁS PERDENDO', 'gerundio')) // gancho partido em blocos, juntado depois
assert.ok(!sinal('Se arriscas, perdes', 'construcao')) // «Se» condicional não conta
assert.ok(!sinal('está lindo', 'gerundio'))
// objectos inteiros
const { valor, trocas } = corrigirObjectoPtPt({ cenas: [{ texto: 'Olha a tela' }], legenda: 'Comente já' })
assert.deepEqual(valor, { cenas: [{ texto: 'Olha o ecrã' }], legenda: 'Comenta já' })
assert.equal(trocas.length, 2)
// detecção de língua
assert.ok(parecePortugues('Não percas isto, é para ti'))
assert.ok(!parecePortugues('Weekly results: win rate on every card'))
// o glossário não tem algarismos (entra no bloco do framework)
assert.ok(!/\d/.test(regrasPtPtParaPrompt()))

console.log('pt-pt: ok')
