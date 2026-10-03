/**
 * Guarda do RITMO do setter. Corre com `npx tsx lib/instagram/setter-limites.check.ts`.
 *
 * Separada da guarda da persona de propósito: esta importa `setter.ts`, que arrasta o cliente da
 * base de dados. Nenhuma função exercitada aqui o usa, mas o `import` é o suficiente para esta
 * guarda deixar de ser puro papel e caneta — e misturá-la com a outra fazia a guarda da persona
 * passar a depender de um `.env` para correr.
 *
 * O que protege: o tecto por corrida e o que conta para ele. Se o tecto contasse os comentários
 * IGNORADOS, uma volta com trinta corações contava trinta acções e o setter parava antes de chegar
 * às duas pessoas que tinham escrito uma pergunta a sério.
 */

import { resumoVazio, contar, chegouAoTecto, type Resultado } from './setter'
import { LIMITES } from './setter-persona'

let falhas = 0
function ok(condicao: boolean, o_que: string) {
  if (condicao) console.log(`  ok   ${o_que}`)
  else {
    console.error(`  FALHA ${o_que}`)
    falhas++
  }
}

const DESLIGADO = { redigir: false, enviar_publica: false, enviar_dm: false }

console.log('\nResumo vazio')
const vazio = resumoVazio(DESLIGADO)
ok(vazio.vistos === 0 && vazio.rascunhos === 0, 'começa tudo a zero')
ok(!chegouAoTecto(vazio), 'um resumo vazio não está no tecto')
ok(vazio.ligado.redigir === false, 'o resumo guarda o estado do interruptor — e ele vem desligado')

console.log('\nO que conta para o tecto')
const r = resumoVazio(DESLIGADO)
for (let i = 0; i < 200; i++) contar(r, 'ignorado')
ok(r.vistos === 200 && r.ignorados === 200, 'ignorados contam-se como vistos')
ok(
  !chegouAoTecto(r),
  'duzentos comentários ignorados NÃO chegam ao tecto — o tecto é de acções, não de leituras',
)
for (let i = 0; i < 50; i++) contar(r, 'ja_tratado')
ok(!chegouAoTecto(r), 'comentários já tratados também não gastam tecto')

console.log('\nO tecto fecha')
const a = resumoVazio(DESLIGADO)
for (let i = 0; i < LIMITES.NOSSO_TECTO_POR_CORRIDA - 1; i++) contar(a, 'rascunho')
ok(!chegouAoTecto(a), `com ${LIMITES.NOSSO_TECTO_POR_CORRIDA - 1} rascunhos ainda há espaço`)
contar(a, 'rascunho')
ok(chegouAoTecto(a), `com ${LIMITES.NOSSO_TECTO_POR_CORRIDA} rascunhos o tecto fecha`)

/** As três acções somam para o MESMO tecto: é o esforço total da conta que se mede, não o tipo. */
const b = resumoVazio(DESLIGADO)
const mistura: Resultado[] = ['rascunho', 'publica_enviada', 'dm_enviada']
for (let i = 0; i < LIMITES.NOSSO_TECTO_POR_CORRIDA; i++) contar(b, mistura[i % 3])
ok(chegouAoTecto(b), 'rascunhos, públicas e DMs somam para o mesmo tecto')

/** Um encerramento não é uma acção de venda: é registar um não. Não pode gastar orçamento. */
const c = resumoVazio(DESLIGADO)
for (let i = 0; i < 100; i++) contar(c, 'encerrado')
ok(
  !chegouAoTecto(c) && c.encerrados === 100,
  'registar cem «não» não consome o tecto — parar de registar nãos seria o pior sítio para parar',
)

console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} falha(s).`)
process.exit(falhas === 0 ? 0 : 1)
