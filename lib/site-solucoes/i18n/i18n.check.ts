/**
 * Guarda dos idiomas do /solucoes: npx tsx lib/site-solucoes/i18n/i18n.check.ts
 * Falha se algum texto PT (conteúdo, demos ou componentes) não tiver tradução em EN, DE, FR e IT,
 * ou se uma tradução perder uma {marca}. Uma demo nova só entra com as quatro línguas.
 */
import assert from 'node:assert/strict'
import { comIdioma, criarTradutor, escolherIdioma } from './base'
import { DICIONARIOS } from './dicionarios'
import { textosParaTraduzir } from './textos'

const todos = textosParaTraduzir()
assert.ok(todos.length > 300, 'a recolha de textos encontrou poucos textos')
for (const [l, dic] of Object.entries(DICIONARIOS)) {
  const falta = todos.filter((x) => !dic[x]?.trim())
  assert.equal(falta.length, 0, `${l}: faltam ${falta.length} traduções, p. ex. ${JSON.stringify(falta.slice(0, 5))} (lista: npx tsx lib/site-solucoes/i18n/falta.ts ${l})`)
  for (const x of todos) {
    for (const m of x.match(/\{\w+\}/g) ?? []) assert.ok(dic[x].includes(m), `${l}: «${x}» perdeu ${m}`)
  }
}

// Escolha do idioma
assert.equal(escolherIdioma({}), 'pt', 'sem sinal (robôs) fica PT')
assert.equal(escolherIdioma({ pedido: 'de' }), 'de')
assert.equal(escolherIdioma({ pedido: 'xx', cookie: 'fr' }), 'fr')
assert.equal(escolherIdioma({ cookie: 'es', aceita: 'it-IT,it;q=0.9' }), 'it', 'cookie de idioma que não temos cai para o browser')
assert.equal(escolherIdioma({ aceita: 'de-CH,de;q=0.9,en;q=0.8' }), 'de')
assert.equal(escolherIdioma({ aceita: 'en;q=0.5,fr;q=0.9' }), 'fr', 'respeita o q=')
assert.equal(escolherIdioma({ aceita: 'pt-BR' }), 'pt')
assert.equal(escolherIdioma({ aceita: 'nl-BE,nl;q=0.9', pais: 'BE' }), 'fr', 'língua que não temos → país')
assert.equal(escolherIdioma({ aceita: 'es-ES', pais: 'ES' }), 'en', 'sem país conhecido → inglês')

// Tradutor
const de = criarTradutor('de', DICIONARIOS.de)
assert.notEqual(de.t('Marcar diagnóstico'), 'Marcar diagnóstico')
assert.equal(de.t('texto que não existe'), 'texto que não existe', 'sem tradução cai para PT')
assert.equal(comIdioma('/solucoes/demos', 'de'), '/solucoes/demos?lang=de')
assert.equal(comIdioma('/solucoes?x=1#casos', 'fr'), '/solucoes?x=1&lang=fr#casos')
assert.equal(comIdioma('/solucoes', 'pt'), '/solucoes')

console.log(`ok · ${todos.length} textos em 4 idiomas`)
