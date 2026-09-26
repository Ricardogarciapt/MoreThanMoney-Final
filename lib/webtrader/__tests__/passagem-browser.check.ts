import assert from 'node:assert/strict'
import { CAMPO_TOKEN_FRAGMENTO, tokenDoFragmento, urlDaPassagem } from '../sessao-app'

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abc-DEF_123'

// ── Ler o token do fragmento ───────────────────────────────────────────────

assert.equal(tokenDoFragmento(`#${CAMPO_TOKEN_FRAGMENTO}=${JWT}`), JWT)
assert.equal(tokenDoFragmento(`${CAMPO_TOKEN_FRAGMENTO}=${JWT}`), JWT, 'com ou sem o cardinal')
assert.equal(tokenDoFragmento(`#outra=x&${CAMPO_TOKEN_FRAGMENTO}=${JWT}`), JWT)
assert.equal(tokenDoFragmento(`#${CAMPO_TOKEN_FRAGMENTO}=${encodeURIComponent(JWT)}`), JWT)

/**
 * A AUSÊNCIA É O CAMINHO NORMAL. Quase todas as visitas a esta página não trazem token — dentro da
 * app o token vem pela casca, e no browser só vem quando a app MTM Auto manda cá a pessoa. Por isso
 * nada disto pode ser tratado como erro: devolve-se `null` e segue-se para o ecrã de entrada normal.
 */
for (const nada of ['', '#', null, undefined, '#outra=coisa', `#${CAMPO_TOKEN_FRAGMENTO}=`, `#${CAMPO_TOKEN_FRAGMENTO}=   `]) {
  assert.equal(tokenDoFragmento(nada), null, `«${String(nada)}» não traz token`)
}

/**
 * O que não tem forma de JWT não chega sequer a ser enviado ao servidor. Não é validação de
 * segurança — a assinatura só o servidor a pode verificar, e fingir o contrário no browser daria
 * uma falsa garantia. É só não atirar disparates à rede.
 */
for (const mau of ['#mtmauto=abc', '#mtmauto=a.b', '#mtmauto=<script>alert(1)</script>', '#mtmauto=a.b.c.d e']) {
  assert.equal(tokenDoFragmento(mau), null, `«${mau}» não tem forma de JWT`)
}
// Um fragmento repetido fica com o ÚLTIMO, como o browser faz com a query.
assert.equal(tokenDoFragmento(`#${CAMPO_TOKEN_FRAGMENTO}=abc&${CAMPO_TOKEN_FRAGMENTO}=${JWT}`), JWT)

// ── Construir o URL da passagem ────────────────────────────────────────────

const u = new URL(urlDaPassagem('https://www.morethanmoney.pt', JWT))
assert.equal(u.origin + u.pathname, 'https://www.morethanmoney.pt/webtrader/app')

/**
 * A REGRA QUE DÁ SENTIDO A ISTO TUDO: o token vai no FRAGMENTO e NUNCA na query.
 * A query é enviada ao servidor, entra nos logs de acesso e viaja no Referer; o fragmento não faz
 * nenhuma das três. Se algum dia alguém trocar isto, é este assert que apanha.
 */
assert.equal(u.search, '', 'a query não pode levar o token')
assert.ok(u.hash.includes(JWT), 'o token viaja no fragmento')
assert.ok(!urlDaPassagem('https://www.morethanmoney.pt', JWT).split('#')[0].includes(JWT))

// A barra a mais na base não duplica.
assert.ok(urlDaPassagem('https://www.morethanmoney.pt/', JWT).startsWith('https://www.morethanmoney.pt/webtrader/app'))

// O destino viaja na query — não é segredo, e a página precisa dele para reencaminhar.
const comDestino = new URL(urlDaPassagem('https://www.morethanmoney.pt', JWT, '?conta=123'))
assert.equal(comDestino.search, '?conta=123')
assert.ok(comDestino.hash.includes(JWT))
assert.equal(new URL(urlDaPassagem('https://www.morethanmoney.pt', JWT, 'conta=123')).search, '?conta=123')
assert.equal(new URL(urlDaPassagem('https://www.morethanmoney.pt', JWT, '?')).search, '')

// Ida e volta: o que se constrói é o que se lê.
assert.equal(tokenDoFragmento(new URL(urlDaPassagem('https://www.morethanmoney.pt', JWT, '?x=1')).hash), JWT)

console.log('webtrader/passagem-browser: OK')
