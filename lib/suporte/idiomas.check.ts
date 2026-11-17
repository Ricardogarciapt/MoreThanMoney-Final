import assert from 'node:assert/strict'
import { I18N_LANGS } from '@/lib/i18n/config'
import { TEXTOS_APOIO, textosApoio, idiomaApoio } from './idiomas'
import { prometeReembolso } from './regras'

// Nenhum dos 21 idiomas fica sem um texto (nem com um texto vazio).
const chaves = Object.keys(TEXTOS_APOIO.pt)
for (const l of I18N_LANGS) {
  const t = TEXTOS_APOIO[l] as Record<string, string>
  assert.ok(t, `falta o idioma ${l}`)
  for (const k of chaves) assert.ok(typeof t[k] === 'string' && t[k].trim().length > 0, `${l}.${k} vazio`)
  // As frases fixas nunca prometem reembolso, em nenhum idioma.
  assert.equal(prometeReembolso(t.escalada) || prometeReembolso(t.guardaReembolso), false, `${l} promete reembolso`)
  // O 15 dos prazos e o Ricardo aparecem onde devem.
  assert.ok(t.esperaEquipa.includes('15'), `${l}.esperaEquipa sem 15`)
  assert.ok(t.escalada.includes('Ricard'), `${l}.escalada sem Ricardo`)
}
assert.equal(textosApoio('en-US').titulo, 'MoreThanMoney Support')
assert.equal(textosApoio('zh').titulo, TEXTOS_APOIO['zh-CN'].titulo)
assert.equal(textosApoio('xx').titulo, TEXTOS_APOIO.pt.titulo)
assert.equal(idiomaApoio(42), 'pt')
assert.equal(idiomaApoio('de-AT'), 'de')
console.log(`suporte/idiomas: ok (${I18N_LANGS.length} idiomas)`)
