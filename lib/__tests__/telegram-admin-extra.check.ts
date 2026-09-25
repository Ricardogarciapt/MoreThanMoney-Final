/**
 * O PAINEL FUNDO — o que este teste trava.
 *
 * A regra do painel inteiro, em forma de teste: o que manda coisas para fora pede DOIS TOQUES.
 * Um relatório que se gera duas vezes não faz mal a ninguém; uma ronda de seguimentos disparada
 * duas vezes é a mesma pessoa a receber a mesma mensagem duas vezes, e isso não se desfaz. Com o
 * polegar a passar pelo ecrã de um telemóvel, a diferença entre um botão e dois é a diferença
 * entre um acidente e uma decisão.
 *
 *   npx tsx lib/__tests__/telegram-admin-extra.check.ts
 */
import assert from 'node:assert/strict'
import { CRONS_DO_PAINEL, confirmacaoCron, tecladoCrons } from '../telegram-admin-extra'

const VOLTAR = [{ text: '⬅️ Painel', callback_data: 'admin:menu' }]

// ── 1. Todo o cron que manda coisas para fora abre com uma PERGUNTA, não com a acção ──
{
  const teclado = tecladoCrons(VOLTAR)
  const botoes = teclado.inline_keyboard
    .flat()
    .map((b) => ({ text: b.text, dados: b.callback_data ?? '' }))
    .filter((b) => b.dados.startsWith('admin:cr'))
  assert.equal(botoes.length, CRONS_DO_PAINEL.length, 'todos os crons têm de ter botão')

  for (const c of CRONS_DO_PAINEL) {
    const b = botoes.find((x) => x.dados.endsWith(c.chave))
    if (!b) throw new Error(`o cron ${c.chave} não tem botão`)
    if (c.mexe) {
      assert.ok(
        b.dados.startsWith('admin:cr?'),
        `${c.chave} manda coisas para fora e o botão executa à primeira — tem de perguntar`,
      )
      assert.match(b.text, /⚠️/, `${c.chave} tem de estar marcado no próprio botão`)
    } else {
      assert.ok(b.dados.startsWith('admin:cr!'), `${c.chave} não mexe em nada e não devia pedir confirmação`)
    }
  }
}

// ── 2. A pergunta diz o que vai acontecer, e o "sim" aponta para a acção ──
{
  for (const c of CRONS_DO_PAINEL.filter((x) => x.mexe)) {
    const p = confirmacaoCron(c.chave)
    if (!p) throw new Error(`${c.chave} tem de ter ecrã de confirmação`)
    assert.match(p.texto, /Confirmas\?/)
    // Quem confirma tem de saber o que está a confirmar — o texto traz o efeito, não só o nome.
    assert.ok(p.texto.includes(c.oQueFaz.replace(/&/g, '&amp;')), `a confirmação de ${c.chave} não diz o que faz`)

    const [sim, nao] = p.teclado.inline_keyboard
    assert.equal(sim[0].callback_data, `admin:cr!${c.chave}`)
    assert.equal(nao[0].callback_data, 'admin:crons', 'o "não" tem de voltar, nunca executar')
  }
  assert.equal(confirmacaoCron('inventado'), null, 'uma chave desconhecida não pode inventar um ecrã de confirmação')
}

// ── 3. Nenhum cron do painel é de execução de ordens ──
// Ligar/desligar execução já tem o seu sítio (os interruptores, com confirmação própria). Um
// botão que dispara um monitor de posições escondido numa lista de "correr um cron" seria a
// forma de mexer em contas reais sem dar por isso.
{
  const proibidos = /price-monitor|position-monitor|master-poll|orders-sweep|mestre-publicar|nightly-tp-sl|t2t-/
  for (const c of CRONS_DO_PAINEL) {
    assert.doesNotMatch(c.rota, proibidos, `${c.rota} mexe em ordens — não pertence a esta lista`)
  }
}

// ── 4. As rotas existem mesmo ──
// Um botão que dá 404 é pior do que não ter botão: faz duvidar do painel todo.
{
  const fs = require('node:fs') as typeof import('node:fs')
  const path = require('node:path') as typeof import('node:path')
  const raiz = path.resolve(__dirname, '../../app/api/cron')
  for (const c of CRONS_DO_PAINEL) {
    assert.ok(fs.existsSync(path.join(raiz, c.rota, 'route.ts')), `a rota /api/cron/${c.rota} não existe`)
  }
}

// ── 5. O teclado acaba sempre com o caminho de volta ──
{
  const teclado = tecladoCrons(VOLTAR)
  const ultima = teclado.inline_keyboard[teclado.inline_keyboard.length - 1]
  assert.equal(ultima[0].callback_data, 'admin:menu')
}

console.log('✅ telegram-admin-extra: o que sai para fora pede dois toques e nenhum botão mexe em ordens')
