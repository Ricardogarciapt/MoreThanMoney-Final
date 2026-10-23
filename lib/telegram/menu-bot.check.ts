import assert from 'node:assert/strict'
import { comandosDoMenu, menuPorOmissao, respostaDoExtra, validarMenu } from './menu-bot'

// Sem nada guardado: o menu de sempre.
assert.equal(comandosDoMenu(menuPorOmissao()).length, 9)

// Não se inventam comandos de base; esconder um tira-o do menu.
const v = validarMenu({ base: [{ command: 'status', description: 'x', visivel: false }, { command: 'inventado', description: 'y', visivel: true }] })
assert.ok(v.ok)
if (v.ok) {
  assert.equal(v.menu.base.length, 9)
  assert.equal(comandosDoMenu(v.menu).some((c) => c.command === 'status'), false)
  assert.equal(comandosDoMenu(v.menu).some((c) => c.command === 'inventado'), false)
}

// Um extra não pode roubar o nome de um comando que já existe.
assert.equal(validarMenu({ extras: [{ command: '/premium', description: 'a', resposta: 'b' }] }).ok, false)
assert.equal(validarMenu({ extras: [{ command: 'admin', description: 'a', resposta: 'b' }] }).ok, false)
assert.equal(validarMenu({ extras: [{ command: 'bootcamp', description: 'a', resposta: 'b', botoes: [{ texto: 'Ir', url: 'http://x' }] }] }).ok, false)

const e = validarMenu({ extras: [{ command: '/Bootcamp', description: 'O bootcamp', resposta: 'Entra <já>', botoes: [{ texto: 'Ir', url: 'https://morethanmoney.pt' }] }] })
assert.ok(e.ok)
if (e.ok) {
  const r = respostaDoExtra(e.menu, '/bootcamp@MoreThanMoney_aibot agora')
  assert.equal(r?.texto, 'Entra &lt;já&gt;')
  assert.deepEqual(r?.teclado, { inline_keyboard: [[{ text: 'Ir', url: 'https://morethanmoney.pt' }]] })
  assert.equal(respostaDoExtra(e.menu, '/outro'), null)
}
// Um rascunho da IA não responde nem aparece no menu.
const r = validarMenu({ extras: [{ command: 'evento', description: 'a', resposta: 'b', rascunho: true }] })
assert.ok(r.ok)
if (r.ok) {
  assert.equal(r.menu.extras[0].rascunho, true)
  assert.equal(respostaDoExtra(r.menu, '/evento'), null)
  assert.equal(comandosDoMenu(r.menu).some((c) => c.command === 'evento'), false)
}
console.log('menu-bot: ok')
