/**
 * GUARDA das entradas no grupo — com os corpos que o Telegram manda a sério.
 *
 * Isto existe porque o defeito que se está a corrigir era exactamente deste tipo: código de leitura
 * de updates, escrito uma vez, nunca revisto, errado em silêncio durante meses — 62 pessoas num
 * grupo e zero no pipeline. Um teste que reproduza o update real é a única coisa que trava a
 * repetição.
 *
 * Prende quatro coisas:
 *  1. a entrada por LINK DE CONVITE é lida (era a que faltava, e é a que não deixa mensagem);
 *  2. o que NÃO é entrada nem saída não é lido como tal (promoções, silenciamentos, bots);
 *  3. o `stage` do lead de grupo não é nenhum dos que o follow-up por DM vai buscar — o bot não
 *     pode iniciar DM, e um estado errado punha o cron a tentar para sempre;
 *  4. nada no caminho das entradas manda DM a quem entrou.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  STAGES_QUE_RECEBEM_DM,
  STAGE_MEMBRO_DE_GRUPO,
  lerChatMember,
  lerMensagemDeMembros,
  origemDoGrupo,
} from './telegram-grupo-membros'

const GRUPO = { id: -1004352255256, title: 'MTM System', type: 'supergroup' }
const PESSOA = { id: 777001, is_bot: false, first_name: 'Jossiney', last_name: 'Sousa', username: 'jossiney' }

// ── 1. A entrada por convite: o caso do print do dono ───────────────────────

const porConvite = lerChatMember({
  chat: GRUPO,
  from: PESSOA,
  old_chat_member: { status: 'left', user: PESSOA },
  new_chat_member: { status: 'member', user: PESSOA },
  invite_link: { invite_link: 'https://t.me/+abc', creator: { id: 1 } },
})
assert.ok(porConvite, 'a entrada por link de convite continua invisível — é o defeito todo')
assert.equal(porConvite!.motivo, 'entrou')
assert.equal(porConvite!.via, 'convite')
assert.equal(porConvite!.grupoId, '-1004352255256')
assert.equal(porConvite!.tgUserId, '777001')
assert.equal(porConvite!.nome, 'Jossiney Sousa')
assert.equal(porConvite!.username, 'jossiney')
assert.equal(porConvite!.tituloGrupo, 'MTM System')

// Adicionado por outra pessoa: entra igual, mas a via diz-nos que não veio de um link nosso.
const adicionado = lerChatMember({
  chat: GRUPO,
  old_chat_member: { status: 'left', user: PESSOA },
  new_chat_member: { status: 'member', user: PESSOA },
})
assert.equal(adicionado?.via, 'adicionado')

// Saída.
const saiu = lerChatMember({
  chat: GRUPO,
  old_chat_member: { status: 'member', user: PESSOA },
  new_chat_member: { status: 'left', user: PESSOA },
})
assert.equal(saiu?.motivo, 'saiu')

// Expulso conta como saída — para o registo, sair e ser posto fora é a mesma ausência.
assert.equal(
  lerChatMember({
    chat: GRUPO,
    old_chat_member: { status: 'member', user: PESSOA },
    new_chat_member: { status: 'kicked', user: PESSOA },
  })?.motivo,
  'saiu',
)

// ── 2. O que não é entrada nem saída ────────────────────────────────────────

// Promoção a administrador: já estava dentro. Lido como entrada, o bot acolhia pela segunda vez
// alguém que anda no grupo há meses.
assert.equal(
  lerChatMember({
    chat: GRUPO,
    old_chat_member: { status: 'member', user: PESSOA },
    new_chat_member: { status: 'administrator', user: PESSOA },
  }),
  null,
)
// Silenciada mas ainda dentro: não saiu.
assert.equal(
  lerChatMember({
    chat: GRUPO,
    old_chat_member: { status: 'member', user: PESSOA },
    new_chat_member: { status: 'restricted', is_member: true, user: PESSOA },
  }),
  null,
)
// Silenciada E fora: saiu de verdade.
assert.equal(
  lerChatMember({
    chat: GRUPO,
    old_chat_member: { status: 'member', user: PESSOA },
    new_chat_member: { status: 'restricted', is_member: false, user: PESSOA },
  })?.motivo,
  'saiu',
)
// Um bot a entrar não é um lead.
assert.equal(
  lerChatMember({
    chat: GRUPO,
    old_chat_member: { status: 'left', user: { id: 9, is_bot: true } },
    new_chat_member: { status: 'member', user: { id: 9, is_bot: true } },
  }),
  null,
)
// Corpos incompletos não podem rebentar o webhook — um throw aqui dava 500 a TODOS os updates.
assert.equal(lerChatMember(null), null)
assert.equal(lerChatMember({}), null)
assert.equal(lerChatMember({ chat: GRUPO }), null)
assert.equal(lerChatMember({ chat: GRUPO, new_chat_member: { status: 'member' } }), null)

// ── 3. A mensagem de serviço continua a ser lida ────────────────────────────

const daMensagem = lerMensagemDeMembros({ chat: GRUPO, new_chat_members: [PESSOA, { id: 5, is_bot: true }] })
assert.equal(daMensagem.length, 1, 'o bot da lista entrou como lead')
assert.equal(daMensagem[0].motivo, 'entrou')
assert.equal(daMensagem[0].via, 'mensagem')

const saiuMsg = lerMensagemDeMembros({ chat: GRUPO, left_chat_member: PESSOA })
assert.equal(saiuMsg.length, 1)
assert.equal(saiuMsg[0].motivo, 'saiu')

assert.deepEqual(lerMensagemDeMembros(null), [])
assert.deepEqual(lerMensagemDeMembros({ chat: GRUPO }), [])

// Os dois caminhos descrevem a MESMA pessoa com a mesma chave — é isso que deixa a tabela
// desduplicar quando os dois updates chegam para a mesma entrada.
assert.equal(daMensagem[0].tgUserId, porConvite!.tgUserId)
assert.equal(daMensagem[0].grupoId, porConvite!.grupoId)

// ── 4. O estado do lead não pode pôr o bot a tentar mandar DM ───────────────

assert.ok(
  !(STAGES_QUE_RECEBEM_DM as readonly string[]).includes(STAGE_MEMBRO_DE_GRUPO),
  'o lead de grupo caiu na lista do follow-up por DM — o bot não pode iniciar DM e o cron tentaria para sempre',
)
// E a lista dos que recebem DM tem de continuar a descrever o cron. Se ele mudar e esta lista não,
// a prova de cima passa a não provar nada.
const followup = readFileSync(new URL('./telegram-lead-followup.ts', import.meta.url), 'utf8')
for (const s of STAGES_QUE_RECEBEM_DM) {
  assert.ok(followup.includes(`'${s}'`), `o follow-up já não conhece o estado ${s} — actualiza STAGES_QUE_RECEBEM_DM`)
}

// A ingestão diária tem de levar este estado ao pipeline. Ela trata qualquer estado desconhecido
// como `lead` e só ignora `granted` — o que não pode acontecer é isto ser `granted`.
assert.notEqual(STAGE_MEMBRO_DE_GRUPO, 'granted', 'quem entra no grupo ficaria fora do pipeline')

assert.equal(origemDoGrupo('MTM System'), 'grupo MTM System')
assert.equal(origemDoGrupo(null), 'grupo Telegram')

// ── 5. Nada no caminho das entradas manda DM a quem entrou ─────────────────
//
// A API do Telegram responde 403 a uma DM para quem nunca escreveu ao bot. O acolhimento é NO
// GRUPO, com botão. Esta varredura falha se alguém escrever o caminho que não existe.
const entradas = readFileSync(new URL('./telegram-grupo-entradas.ts', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')
assert.ok(
  !/chat_id:\s*(mudanca\.)?tgUserId/.test(entradas),
  'alguém está a mandar mensagem para o id da PESSOA — o bot não pode iniciar uma DM',
)
assert.ok(entradas.includes('grupoId'), 'o acolhimento deixou de ser no grupo')

console.log('telegram-grupo-membros: a entrada por convite é lida, uma promoção não é entrada, e o lead de grupo não põe o bot a tentar DM ✓')
