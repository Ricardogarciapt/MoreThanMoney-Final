/**
 * AS GUARDAS DO AGENTE OPERADOR.
 *
 *   1. Nunca aprova posts da conta pessoal @ricardogarciapt, nem o que o dono já desfez.
 *   2. Não mexe num rascunho mexido há pouco; uma legenda que falha a peneira fica.
 *   3. Um envio só sai depois da janela de veto; os velhos rejeitam-se; chamadas ficam.
 *   4. Comentários velhos saem da fila; os frescos ficam.
 *   5. Configuração estranha cai em ensaio.
 *
 *   npx tsx lib/operador/regras.check.ts
 */
import assert from 'node:assert/strict'
import {
  CONTA_MARCA,
  CONTA_PESSOAL,
  JANELA_ENVIO_H,
  decidirComentario,
  decidirEnvio,
  decidirPost,
  lerConfig,
  type PostRascunho,
} from './regras'

const H = 3_600_000
const AGORA = Date.parse('2026-10-28T12:00:00Z')
const ha = (h: number) => new Date(AGORA - h * H).toISOString()
const daqui = (h: number) => new Date(AGORA + h * H).toISOString()

let n = 0
const caso = (nome: string, f: () => void) => {
  f()
  n++
  console.log(`✓ ${nome}`)
}

const post = (o: Partial<PostRascunho> = {}): PostRascunho => ({
  id: 'p1',
  ig_account_id: CONTA_MARCA,
  status: 'draft',
  caption: 'Pára de olhar para o ecrã o dia todo. Comenta SISTEMA.',
  media_urls: ['https://x/v.mp4'],
  scheduled_at: daqui(5),
  updated_at: ha(10),
  created_at: ha(10),
  ...o,
})
const vazio = new Set<string>()

caso('aprova um rascunho da marca que passa na peneira', () => {
  assert.equal(decidirPost(post(), vazio, AGORA).acao, 'aprovar')
})
caso('nunca a conta pessoal', () => {
  assert.equal(decidirPost(post({ ig_account_id: CONTA_PESSOAL }), vazio, AGORA).acao, 'deixar')
})
caso('não reaprova o que o dono desfez', () => {
  assert.equal(decidirPost(post(), new Set(['p1']), AGORA).acao, 'deixar')
})
caso('não mexe no que foi mexido há pouco', () => {
  assert.equal(decidirPost(post({ updated_at: ha(1) }), vazio, AGORA).acao, 'deixar')
})
caso('legenda com promessa, «você» ou trading sem aviso fica', () => {
  assert.equal(decidirPost(post({ caption: 'Lucro garantido todos os meses' }), vazio, AGORA).acao, 'deixar')
  assert.equal(decidirPost(post({ caption: 'Você pode mudar de vida' }), vazio, AGORA).acao, 'deixar')
  assert.equal(decidirPost(post({ caption: 'Evita os erros no Forex' }), vazio, AGORA).acao, 'deixar')
  assert.equal(decidirPost(post({ caption: 'Ganhei [NÚMERO REAL] pips' }), vazio, AGORA).acao, 'deixar')
})
caso('sem media fica', () => {
  assert.equal(decidirPost(post({ media_urls: [] }), vazio, AGORA).acao, 'deixar')
})
caso('hora passada: aprova e adia, para dar tempo a desfazer', () => {
  const d = decidirPost(post({ scheduled_at: ha(20) }), vazio, AGORA)
  assert.equal(d.acao, 'aprovar')
  assert.ok(d.novoHorario && Date.parse(d.novoHorario) > AGORA + H)
})

const envio = (o: Record<string, unknown> = {}) => ({
  id: 'e1',
  kind: 'envio:telegram_followup',
  status: 'pendente',
  created_at: ha(JANELA_ENVIO_H + 1),
  payload: { texto: 'Olá! Ainda queres testar o sistema? Responde aqui.', chat_id: '1' },
  ...o,
})
caso('envio só sai depois da janela de veto', () => {
  assert.equal(decidirEnvio(envio({ created_at: ha(1) }), AGORA).acao, 'deixar')
  assert.equal(decidirEnvio(envio(), AGORA).acao, 'aprovar')
})
caso('envio velho rejeita-se; chamadas ficam para uma pessoa', () => {
  assert.equal(decidirEnvio(envio({ created_at: ha(100) }), AGORA).acao, 'rejeitar')
  assert.equal(decidirEnvio(envio({ kind: 'envio:contacto_imediato' }), AGORA).acao, 'deixar')
})
caso('envio com promessa fica', () => {
  assert.equal(decidirEnvio(envio({ payload: { texto: 'Lucro garantido, entra já' } }), AGORA).acao, 'deixar')
})
caso('email sem destinatário fica', () => {
  assert.equal(decidirEnvio(envio({ kind: 'envio:email_recuperacao_checkout' }), AGORA).acao, 'deixar')
})

caso('comentário velho sai da fila; fresco fica', () => {
  assert.equal(decidirComentario({ id: 'c', estado: 'pronto', criado_em: ha(24 * 4) }, AGORA).acao, 'saltar')
  assert.equal(decidirComentario({ id: 'c', estado: 'pronto', criado_em: ha(5) }, AGORA).acao, 'deixar')
  assert.equal(decidirComentario({ id: 'c', estado: 'publicado', criado_em: ha(24 * 9) }, AGORA).acao, 'deixar')
})

caso('configuração estranha cai em ensaio', () => {
  assert.equal(lerConfig(null).modo, 'ensaio')
  assert.equal(lerConfig('{"modo":"ligado"}').modo, 'ligado')
  assert.equal(lerConfig({ modo: 'turbo' }).modo, 'ensaio')
  assert.equal(lerConfig({ modo: 'ligado', posts: false }).posts, false)
})

console.log(`\n${n} casos, todos verdes.`)
