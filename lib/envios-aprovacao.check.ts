import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { followupAindaValido, podeSair, transicaoValida, ehKindDeEnvio, KIND_ENVIO } from './envios-aprovacao'

/**
 * Guardas da regra de conformidade de 06/10: o que a máquina INICIA espera por aprovação; o que
 * responde a quem escreveu sai sozinho. Corre com `npx tsx lib/envios-aprovacao.check.ts`.
 *
 * Duas camadas: a decisão pura (`podeSair`) e o CÓDIGO dos caminhos de envio — uma regra certa
 * que ninguém chama não trava nada, por isso a guarda lê os ficheiros.
 */
let n = 0
function caso(nome: string, f: () => void) {
  f()
  n++
  console.log(`  ok  ${nome}`)
}

// ── 1. DM ao comentador: sai sozinha dentro de 48 h; fora disso é recusada (F4, 06/10) ──────────
caso('DM ao comentador sai sozinha dentro de 48 h, sem aprovação', () => {
  for (const h of [0, 0.1, 5, 47.9, 48]) {
    assert.equal(podeSair({ tipo: 'dm_ao_comentador', horasDesdeComentario: h }).pode, true, `não saiu às ${h} h`)
    assert.equal(podeSair({ tipo: 'dm_ao_comentador', estado: 'pendente', horasDesdeComentario: h }).pode, true)
  }
})
caso('MAU: DM ao comentador fora das 48 h é recusada', () => {
  for (const h of [48.01, 72, 24 * 7, null, undefined, Number.NaN]) {
    assert.equal(podeSair({ tipo: 'dm_ao_comentador', estado: 'pendente', horasDesdeComentario: h as number }).pode, false, `saiu com ${h} h`)
  }
})
caso('MAU: DM já enviada, expirada ou descartada não sai outra vez (a private reply é única)', () => {
  for (const estado of ['enviado', 'expirado', 'descartado', 'encerrado']) {
    assert.equal(podeSair({ tipo: 'dm_ao_comentador', estado, horasDesdeComentario: 1 }).pode, false, estado)
  }
})

// ── 2. Follow-up sem aprovação não sai ──────────────────────────────────────────────────────────
caso('follow-up do bot SEM aprovação não sai', () => {
  for (const estado of ['pendente', null, undefined, 'rejeitado', 'obsoleto']) {
    assert.equal(podeSair({ tipo: 'followup_bot', estado }).pode, false)
  }
  assert.equal(podeSair({ tipo: 'followup_bot', estado: 'aprovado' }).pode, true)
})
caso('email de recuperação SEM aprovação não sai', () => {
  assert.equal(podeSair({ tipo: 'email_recuperacao', estado: 'pendente' }).pode, false)
  assert.equal(podeSair({ tipo: 'email_recuperacao' }).pode, false)
})

// ── 3. Resposta a mensagem recebida sai ─────────────────────────────────────────────────────────
caso('resposta a quem ESCREVEU sai sem aprovação', () => {
  assert.equal(podeSair({ tipo: 'resposta_a_mensagem' }).pode, true)
  assert.equal(podeSair({ tipo: 'resposta_publica_a_comentario' }).pode, true)
})

// ── Transições e validade ───────────────────────────────────────────────────────────────────────
caso('só se aprova/rejeita o que está pendente', () => {
  assert.equal(transicaoValida('pendente', 'aprovado'), true)
  assert.equal(transicaoValida('rejeitado', 'aprovado'), false, 'um rejeitado ressuscitou')
  assert.equal(transicaoValida('enviado', 'aprovado'), false)
  assert.equal(transicaoValida(null, 'aprovado'), false)
})
caso('um follow-up aprovado fica obsoleto se o lead respondeu ou converteu', () => {
  assert.equal(followupAindaValido({ countNaCriacao: 1, countAgora: 1, convertido: false }), true)
  assert.equal(followupAindaValido({ countNaCriacao: 1, countAgora: 0, convertido: false }), false, 'o lead respondeu (reset a 0)')
  assert.equal(followupAindaValido({ countNaCriacao: 1, countAgora: 2, convertido: false }), false, 'outro toque já saiu')
  assert.equal(followupAindaValido({ countNaCriacao: 0, countAgora: 0, convertido: true }), false)
})
caso('tarefas internas do AIOS não são envios', () => {
  assert.equal(ehKindDeEnvio('task'), false)
  assert.equal(ehKindDeEnvio(KIND_ENVIO.FOLLOWUP_TELEGRAM), true)
})

// ── 4. O CÓDIGO dos caminhos respeita a regra ───────────────────────────────────────────────────
const raiz = join(__dirname, '..')
const ler = (p: string) => readFileSync(join(raiz, p), 'utf8')

caso('o setter pergunta a podeSair (dm_ao_comentador, com as horas) ANTES de cada DM', () => {
  const src = ler('lib/instagram/setter.ts')
  let desde = 0
  let dms = 0
  for (;;) {
    const i = src.indexOf('private_replies`', desde)
    if (i < 0) break
    dms++
    const antes = src.slice(Math.max(0, i - 2500), i)
    assert.ok(/podeSair\(\{ tipo: 'dm_ao_comentador'[^}]*horasDesdeComentario/.test(antes), `DM na posição ${i} sai sem podeSair com as horas`)
    desde = i + 1
  }
  assert.ok(dms >= 2, 'esperava o envio imediato e o reenvio')
})
caso('o reenvio marca expirado passadas as 48 h', () => {
  const src = ler('lib/instagram/setter.ts')
  assert.match(src, /dmExpirada\(horas\)[\s\S]{0,200}estado: 'expirado'/)
})
caso('o follow-up do Telegram não envia — só cria rascunhos', () => {
  const src = ler('lib/telegram-lead-followup.ts')
  for (const proibido of ['enviarTelegramPorAgente', 'sendTelegramChannelMessage', 'sendMessage', 'api.telegram.org']) {
    assert.ok(!src.includes(proibido), `o follow-up voltou a enviar sozinho (${proibido})`)
  }
  assert.ok(src.includes('criarEnvioPorAprovar'))
})
caso('a fila só envia depois de podeSair', () => {
  const src = ler('lib/envios-fila.ts')
  const corpo = src.slice(src.indexOf('export async function enviarEnvioAprovado'))
  const iPode = corpo.indexOf('podeSair(')
  assert.ok(iPode > 0)
  for (const rede of ['enviarTelegramPorAgente', 'sendMail']) {
    assert.ok(corpo.indexOf(rede) > iPode, `${rede} antes de podeSair`)
  }
})
console.log(`envios-aprovacao: ${n} casos — o que a máquina inicia espera; o que responde sai ✓`)
