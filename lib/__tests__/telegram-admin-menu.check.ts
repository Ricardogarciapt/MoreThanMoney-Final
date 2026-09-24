/**
 * O PAINEL DE ADMIN DO BOT — quem entra e o que pede confirmação.
 *
 * O que este teste trava é o buraco de 24/09: `/admin` gravava `telegram_admin_chat_id` a quem
 * escrevesse o comando, e o primeiro estranho a experimentá-lo ficava com o painel, com os
 * pedidos de acesso e com o texto livre a ir para a IA do site.
 *
 *   npx tsx lib/__tests__/telegram-admin-menu.check.ts
 */
import assert from 'node:assert/strict'
import {
  adminPanelKeyboard,
  confirmacaoExec,
  ehChatDeAdmin,
  registarChatDeAdmin,
  tecladoExecucao,
  textoExecucao,
  NOMES_EXEC,
} from '../telegram-admin-menu'

process.env.TELEGRAM_ADMIN_CHAT_ID = '111'

/** Um Supabase de mentira: só sabe responder ao `site_settings` e contar o que lhe escreveram. */
function baseFalsa(gravado: string | null) {
  const escritas: Array<Record<string, unknown>> = []
  const db = {
    from() {
      return {
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data: gravado ? { value: { chat_id: gravado } } : null }) }
            },
          }
        },
        upsert: async (linha: Record<string, unknown>) => {
          escritas.push(linha)
          return { error: null }
        },
      }
    },
  }
  return { db: db as never, escritas }
}

;(async () => {
  // ── Quem é admin ──
  {
    const { db } = baseFalsa('222')
    assert.equal(await ehChatDeAdmin(db, '111'), true, 'o chat do ambiente é admin')
    // 24/09: o gravado deixou de ser admin — ver o caso dedicado mais abaixo.
    assert.equal(await ehChatDeAdmin(db, '222'), false, 'o chat gravado NÃO é admin')
    assert.equal(await ehChatDeAdmin(db, '999'), false, 'um estranho não é admin')
    assert.equal(await ehChatDeAdmin(db, null), false)
  }
  // Sem nada gravado (base nova), o ambiente abre a porta ao dono — e só a ele.
  {
    const { db } = baseFalsa(null)
    assert.equal(await ehChatDeAdmin(db, '111'), true)
    assert.equal(await ehChatDeAdmin(db, '999'), false)
  }

  // 24/09 — SÓ O DONO. Um chat gravado em site_settings já NÃO dá acesso: o valor é escrito pelo
  // sistema, e um valor escrito não pode decidir quem manda. Foi por aí que o buraco do /admin
  // passou meses aberto; fechá-lo no upsert não chegava, porque uma linha mexida à mão na base
  // voltava a abri-lo.
  {
    const { db } = baseFalsa('999')
    assert.equal(await ehChatDeAdmin(db, '999'), false, 'o gravado não manda — só o ambiente')
    assert.equal(await ehChatDeAdmin(db, '111'), true, 'e o dono continua a entrar')
  }

  // ── O /admin já não se auto-regista ──
  {
    const { db, escritas } = baseFalsa(null)
    assert.equal(await registarChatDeAdmin(db, '999'), false, 'um estranho não se regista como aprovador')
    assert.equal(escritas.length, 0, 'e nada é escrito na base')
    assert.equal(await registarChatDeAdmin(db, '111'), true, 'o dono regista-se')
    assert.equal(escritas.length, 1)
    assert.equal((escritas[0] as { key: string }).key, 'telegram_admin_chat_id')
  }

  // ── O painel ──
  const painel = adminPanelKeyboard()
  const acoes = painel.inline_keyboard.flat().map((b) => (b as { callback_data?: string }).callback_data)
  for (const esperada of ['admin:sys', 'admin:contas', 'admin:sinais', 'admin:exec', 'admin:sm', 'admin:funil', 'admin:subs']) {
    assert.ok(acoes.includes(esperada), `falta o botão ${esperada}`)
  }
  // Nada de apagar por botão.
  const textos = painel.inline_keyboard.flat().map((b) => b.text.toLowerCase()).join(' ')
  assert.ok(!/apagar|eliminar|remover/.test(textos), 'o painel não pode ter botões que apaguem')

  /**
   * Os atalhos têm de apontar para páginas que existem.
   *
   * O painel antigo tinha um botão para `/admin/telegram-sources`, que não existe: abria um 404.
   * Esta lista é a de `app/admin/` — quando uma página mudar de sítio, este teste avisa antes de
   * o botão o fazer.
   */
  const { readdirSync } = await import('node:fs')
  const paginas = new Set(
    readdirSync(new URL('../../app/admin', import.meta.url), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => `/admin/${d.name}`),
  )
  paginas.add('/admin')
  for (const url of [
    '/admin', '/admin/mtmcopy', '/admin/mtmauto-copia', '/admin?tab=mtmfunded',
    '/admin/sales-machine', '/admin/social', '/admin?tab=users', '/admin/coupons',
  ]) {
    assert.ok(paginas.has(url.split('?')[0]), `o atalho ${url} aponta para uma página que não existe`)
  }

  // ── Execução: o primeiro toque PERGUNTA ──
  const estado = { sensei: true, premium: false, forex: true }
  const teclado = tecladoExecucao(estado)
  const botoes = teclado.inline_keyboard.flat().filter((b) => (b as { callback_data?: string }).callback_data?.startsWith('admin:ex'))
  assert.equal(botoes.length, 3)
  for (const b of botoes) {
    const cb = (b as { callback_data: string }).callback_data
    assert.ok(cb.startsWith('admin:ex?'), 'o toque na lista só pode perguntar, nunca executar')
    assert.ok(cb.length <= 64, 'o callback_data do Telegram tem 64 bytes')
  }
  assert.ok(textoExecucao(estado).includes('🟢 Sensei (gestão)'))
  assert.ok(textoExecucao(estado).includes('🔴 Premium'))

  // A confirmação é que leva o toque que executa.
  const c = confirmacaoExec('premium', true)
  const confirmar = c.teclado.inline_keyboard.flat().map((b) => (b as { callback_data?: string }).callback_data)
  assert.ok(confirmar.includes('admin:ex!premium'))
  assert.ok(confirmar.includes('admin:exec'), 'há sempre caminho de volta sem fazer nada')
  assert.ok(c.texto.includes('Confirmas?'))

  // Um interruptor sem nome na tabela não vai ao botão, mas o sistema continua a tê-lo.
  assert.equal(Object.keys(tecladoExecucao({ inventado: true } as Record<string, boolean>).inline_keyboard).length, 1, 'só a linha de voltar')
  assert.ok(Object.keys(NOMES_EXEC).includes('funded_copier'))

  console.log('painel de admin do bot: 20 ok')
})()
