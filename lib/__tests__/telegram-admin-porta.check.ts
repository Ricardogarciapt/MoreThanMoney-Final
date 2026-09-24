/**
 * A PORTA — o que este teste trava.
 *
 * O painel do bot passou a decidir dinheiro. Três invariantes deixam de poder partir-se em
 * silêncio, e são estes:
 *
 *  1. a confirmação diz sempre o que NÃO vai acontecer (é onde fica escrito que o bot não move
 *     dinheiro) e o «sim» leva sempre a um `!`, nunca a um `?` — um botão que pergunta duas vezes
 *     é um botão que nunca faz, e um que faz à primeira é um acidente;
 *  2. a tabela da auditoria é a MESMA do Centro de Controlo — se alguém a renomear num dos lados,
 *     as acções do telemóvel desaparecem da lista sem ninguém dar por isso;
 *  3. quem escreve passa pelo envelope `comRegisto`, e sem registo não age.
 *
 *   npx tsx lib/__tests__/telegram-admin-porta.check.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PREFIXO_ACCAO, TABELA_AUDITORIA, pedirConfirmacao, portaAberta, escaparHtml } from '../telegram-admin-porta'

const RAIZ = join(__dirname, '..', '..')
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8')

let ok = 0
const falhas: string[] = []
const sim = (nome: string, cond: unknown) => {
  if (cond) ok++
  else falhas.push(nome)
}

// ── 1. a pergunta ──────────────────────────────────────────────────────────
{
  const c = pedirConfirmacao({
    titulo: 'Aprovar 500 USD',
    vaiAcontecer: ['O pedido fica aprovado.'],
    naoVaiAcontecer: ['Não transfere dinheiro nenhum.'],
    fazer: 'admin:lv!a:abc',
    voltar: 'admin:lev',
  })
  sim('a pergunta diz o título', c.texto.includes('Aprovar 500 USD'))
  sim('a pergunta diz o que NÃO acontece', c.texto.includes('Não transfere dinheiro nenhum'))
  sim('o sim leva ao ! (faz)', c.teclado.inline_keyboard[0][0].callback_data === 'admin:lv!a:abc')
  sim('o não volta atrás', c.teclado.inline_keyboard[1][0].callback_data === 'admin:lev')
  sim('há exactamente dois botões', c.teclado.inline_keyboard.flat().length === 2)
  // O `?` no botão do «sim» significava perguntar outra vez: o toque nunca chegava a fazer nada.
  sim('o sim nunca é um ?', !String(c.teclado.inline_keyboard[0][0].callback_data).includes('?'))
}

// ── 2. escapar HTML (um nome com < parte a mensagem toda) ──────────────────
sim('escapa &, < e >', escaparHtml('a & b <c>') === 'a &amp; b &lt;c&gt;')

// ── 3. a porta ─────────────────────────────────────────────────────────────
sim('porta aberta reconhece-se', portaAberta({ chatId: '1', adminId: 'u', adminEmail: 'a@b' }))
sim('porta fechada reconhece-se', !portaAberta({ fechada: 'não' }))

// ── 4. uma tabela de auditoria só ──────────────────────────────────────────
{
  const centro = ler('lib/admin-centro/servidor/outros.ts')
  const m = centro.match(/export const TABELA_AUDITORIA = '([^']+)'/)
  sim('o Centro declara a tabela', !!m)
  assert.equal(TABELA_AUDITORIA, m?.[1], 'a auditoria do bot e a do Centro têm de ser a MESMA tabela')
  ok++
}

// ── 5. tudo o que escreve passa pelo envelope, e sem registo não age ───────
{
  const porta = ler('lib/telegram-admin-porta.ts')
  sim('a intenção escreve-se antes (ok: false)', /insert\(\{[\s\S]{0,400}ok: false/.test(porta))
  sim('sem registo não corre a acção', porta.includes('if (!registo)') && porta.indexOf('if (!registo)') < porta.indexOf('await accao()'))
  sim('as acções do bot marcam-se', PREFIXO_ACCAO === 'telegram:')

  for (const f of ['lib/telegram-admin-dinheiro.ts', 'lib/telegram-admin-vendas.ts']) {
    const t = ler(f)
    // `grantBrokerAccess`, `rejeitarPedidoDeAcesso` e o envio da oferta nunca podem ser chamados
    // fora do envelope: é o envelope que garante o registo antes e depois.
    for (const chamada of ['grantBrokerAccess(', 'rejeitarPedidoDeAcesso(', 'sendMessage`']) {
      const i = t.indexOf(chamada)
      if (i < 0) continue
      const envelope = t.lastIndexOf('comRegisto(', i)
      sim(`${f}: ${chamada} está dentro de comRegisto`, envelope >= 0 && envelope < i)
    }
  }
  // O levantamento não usa `comRegisto`: usa o executor auditado do /admin, que faz o mesmo.
  const dinheiro = ler('lib/telegram-admin-dinheiro.ts')
  sim('o levantamento passa pelo executor auditado', dinheiro.includes('executarComAuditoria({'))
  sim('o levantamento não escreve na tabela à mão', !/from\('mtm_funded_withdrawals'\)\s*\n?\s*\.update\(/.test(dinheiro))
}

// ── 6. o bot não move dinheiro ─────────────────────────────────────────────
{
  /*
   * Não é uma metáfora: é uma regra que se pode verificar. Se algum dia aparecer aqui uma chamada
   * a um pagamento, uma transferência ou um payout, este teste tem de ser o primeiro a gritar.
   */
  const proibidos = /stripe\.(transfers|payouts)|createPayout|createTransfer|\bwithdrawFunds\b|metaapi.*withdraw/i
  for (const f of ['lib/telegram-admin-dinheiro.ts', 'lib/telegram-admin-porta.ts', 'lib/telegram-admin-vendas.ts', 'lib/telegram-admin-menu.ts']) {
    sim(`${f}: não move dinheiro`, !proibidos.test(ler(f)))
  }
}

if (falhas.length) {
  console.error(`telegram-admin-porta: ${ok} ok, ${falhas.length} falharam`)
  for (const f of falhas) console.error('  ✗', f)
  process.exit(1)
}
console.log(`telegram-admin-porta: ${ok} ok, 0 falharam`)
