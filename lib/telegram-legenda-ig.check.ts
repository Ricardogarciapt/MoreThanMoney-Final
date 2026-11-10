import assert from 'node:assert/strict'
import { desarmarMencoes, legendaAceitavel, legendaDoPost } from './telegram-legenda-ig'

// O caso reportado: «@morethanmoney.pt» não pode deixar «@morethanmoney» solto para o Telegram ligar.
const l = legendaDoPost('', 'morethanmoney.pt')
assert.doesNotMatch(l.replace(/<a [^>]*>[^<]*<\/a>/g, ''), /@\w/, 'nenhuma menção @ fora de link')
assert.match(l, /href="https:\/\/www\.instagram\.com\/morethanmoney\.pt\/"/)

assert.equal(desarmarMencoes('vê @ricardogarciapt.'), 'vê <a href="https://www.instagram.com/ricardogarciapt/">instagram.com/ricardogarciapt</a>.')
assert.equal(desarmarMencoes('mail a@b.pt'), 'mail a@b.pt', 'emails ficam')
assert.equal(desarmarMencoes('<b>x</b> & y'), '&lt;b&gt;x&lt;/b&gt; &amp; y')

// PT-BR do post reportado é recusado → legenda neutra
const br = 'Quer descobrir como analisar seus pips e melhorar seu trading? Junte-se ao nosso grupo no Telegram!'
assert.equal(legendaAceitavel(br), false)
assert.doesNotMatch(legendaDoPost(br, 'morethanmoney.pt'), /seus|Junte-se/)
assert.equal(legendaAceitavel('Mede o teu dia em pips, não em euros. Comenta PIPS 👇'), true)
assert.match(legendaDoPost('Mede o teu dia em pips, não em euros.', 'morethanmoney.pt'), /consultoria financeira/)
assert.equal(legendaAceitavel('Lucro garantido todos os dias'), false)
assert.ok(legendaDoPost('x '.repeat(900), 'morethanmoney.pt').length < 1024)
console.log('telegram-legenda-ig: ok')
