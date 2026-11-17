import assert from 'node:assert/strict'
import { traducaoValida } from './auto-validar'
import { comLegendasYouTube } from './youtube-legendas'

// Marcadores têm de sobreviver tal e qual.
assert.equal(traducaoValida('Faltam {n} dias', 'Noch {n} Tage'), true)
assert.equal(traducaoValida('Faltam {n} dias', 'Noch {anzahl} Tage'), false)
assert.equal(traducaoValida('Erro: {erro}', 'Fehler'), false)
// Nomes de produto/scanner nunca se traduzem.
assert.equal(traducaoValida('Abre o MTM Auto', 'Öffne MTM Auto'), true)
assert.equal(traducaoValida('Scanner GoldKiller', 'Scanner Ouro Assassino'), false)
// Vazio, não-texto e respostas desproporcionadas recusam-se.
assert.equal(traducaoValida('Guardar', ''), false)
assert.equal(traducaoValida('Guardar', 42), false)
assert.equal(traducaoValida('Guardar', 'x'.repeat(200)), false)

// Legendas do YouTube: PT não mexe; outras línguas ligam CC no idioma; links de fora ficam iguais.
const yt = 'https://www.youtube.com/embed/abcdefghijk?autoplay=1'
assert.equal(comLegendasYouTube(yt, 'pt'), yt)
const de = new URL(comLegendasYouTube(yt, 'de'))
assert.equal(de.searchParams.get('cc_load_policy'), '1')
assert.equal(de.searchParams.get('cc_lang_pref'), 'de')
assert.equal(de.searchParams.get('autoplay'), '1')
assert.equal(new URL(comLegendasYouTube('https://www.youtube-nocookie.com/embed/x', 'zh-CN')).searchParams.get('hl'), 'zh-Hans')
assert.equal(comLegendasYouTube('https://live.restream.io/x.m3u8', 'de'), 'https://live.restream.io/x.m3u8')

console.log('auto-validar.check: ok')
