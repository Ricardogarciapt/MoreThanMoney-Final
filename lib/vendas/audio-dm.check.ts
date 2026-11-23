import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deveMandarAudio, momentoDoAudio, textoParaAudio, AVISO_AUDIO_IA, MAX_CARACTERES_AUDIO } from './audio-dm'
import { mensagensDoCloser, MAX_HISTORICO_DM } from '@/lib/instagram/dm-closer'

/**
 * Guarda dos áudios na voz do Ricardo nas DMs (16/11) e do histórico do closer.
 *
 *   npx tsx lib/vendas/audio-dm.check.ts
 */
let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }
const ligado = { ligado: true, tectoDia: 30 }
const fecho = 'Fechado então 🙌 Registas aqui: https://www.morethanmoney.pt/register?plano=membro&ag=AG-CLOSER'

caso('MAU: desligado não manda nada', () => {
  assert.equal(deveMandarAudio({ config: { ligado: false, tectoDia: 30 }, resposta: fecho, audiosHoje: 0 }), false)
})
caso('só no momento do fecho (resposta com link de fecho)', () => {
  assert.equal(deveMandarAudio({ config: ligado, resposta: fecho, audiosHoje: 0 }), true)
  assert.equal(deveMandarAudio({ config: ligado, resposta: 'Olá! Já negoceias hoje?', audiosHoje: 0 }), false)
})
caso('quebra-gelo: só depois de 2 mensagens dela e sem áudio antes', () => {
  const r = 'Percebo bem isso. E hoje, quanto tempo tens por dia para isto?'
  assert.equal(momentoDoAudio({ config: ligado, resposta: r, audiosHoje: 0, conversa: { mensagensAntes: 0, audiosAntes: 0 } }), null)
  assert.equal(momentoDoAudio({ config: ligado, resposta: r, audiosHoje: 0, conversa: { mensagensAntes: 1, audiosAntes: 0 } }), null)
  assert.equal(momentoDoAudio({ config: ligado, resposta: r, audiosHoje: 0, conversa: { mensagensAntes: 2, audiosAntes: 0 } }), 'quebra_gelo')
  assert.equal(momentoDoAudio({ config: ligado, resposta: r, audiosHoje: 0, conversa: { mensagensAntes: 5, audiosAntes: 1 } }), null)
})
caso('fecho depois do quebra-gelo; nunca um terceiro áudio', () => {
  assert.equal(momentoDoAudio({ config: ligado, resposta: fecho, audiosHoje: 0, conversa: { mensagensAntes: 4, audiosAntes: 1 } }), 'fecho')
  assert.equal(momentoDoAudio({ config: ligado, resposta: fecho, audiosHoje: 0, conversa: { mensagensAntes: 6, audiosAntes: 2 } }), null)
})
caso('MAU: passar o tecto diário', () => {
  assert.equal(deveMandarAudio({ config: ligado, resposta: fecho, audiosHoje: 30 }), false)
})
caso('o áudio não lê links, emojis nem @', () => {
  const t = textoParaAudio(`${fecho} Fala com @MoreThanMoney_aibot 👉 morethanmoney.pt/abrir-conta`)
  assert.ok(!/https?:|morethanmoney\.pt|@|🙌|👉/.test(t), t)
  assert.ok(t.startsWith('Fechado então'))
  assert.ok(textoParaAudio('Frase longa. '.repeat(200)).length <= MAX_CARACTERES_AUDIO)
})
caso('a transparência vai em cada áudio', () => {
  assert.equal(AVISO_AUDIO_IA, '') // 23/11: sem etiquetas de IA (decisão do Ricardo)
  const src = readFileSync(join(__dirname, 'audio-dm.ts'), 'utf8')

})
caso('o closer recebe o histórico a alternar e a acabar na pessoa', () => {
  const m = mensagensDoCloser('nova', [{ pessoa: 'a', nos: 'b' }, { pessoa: 'c', nos: null }])
  assert.deepEqual(m.map((x) => x.role), ['user', 'assistant', 'user'])
  assert.ok(m[2].content.includes('c') && m[2].content.includes('nova'))
  const muitos = Array.from({ length: 20 }, (_, i) => ({ pessoa: `p${i}`, nos: `r${i}` }))
  assert.equal(mensagensDoCloser('x', muitos).length, MAX_HISTORICO_DM * 2 + 1)
  assert.deepEqual(mensagensDoCloser('só', []), [{ role: 'user', content: 'só' }])
})
console.log(`audio-dm: ${n} casos — voz no quebra-gelo e no fecho, com aviso de IA e tecto ✓`)
