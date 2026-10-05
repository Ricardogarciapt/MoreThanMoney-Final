/**
 * A GUARDA DAS PRÉ-VISUALIZAÇÕES DE LINK NO FEED.
 *
 *   npx tsx lib/social/link-preview.check.ts
 *
 * Prova os três casos MAUS que levaram ao pedido do dono a 05/10/2026:
 *  1. um post com link ficava sem `link_url`/`link_preview` (extracção e resumo);
 *  2. um site lento atrasava ou rebentava a publicação (timeout curto, nunca lança);
 *  3. a rota aceitava `content` vazio sem média e criava posts em branco.
 */
import assert from 'node:assert/strict'
import {
  conteudoPublicavel,
  enriquecerLinkDoPost,
  extrairPrimeiroUrl,
  resumirPreview,
} from './link-preview'

// 1. Extracção do primeiro URL
assert.equal(extrairPrimeiroUrl('vê isto https://www.youtube.com/watch?v=abc, e depois www.x.pt'), 'https://www.youtube.com/watch?v=abc')
assert.equal(extrairPrimeiroUrl('olha www.morethanmoney.pt/app-mobile.'), 'https://www.morethanmoney.pt/app-mobile')
assert.equal(extrairPrimeiroUrl('sem link nenhum'), null)
assert.equal(extrairPrimeiroUrl(null), null)
assert.equal(extrairPrimeiroUrl('ftp://ficheiro.pt/x'), null, 'só http(s)')

// 1b. Resumo do preview para a forma guardada
assert.equal(resumirPreview(null), null)
assert.equal(resumirPreview({ title: 'sem url' }), null, 'sem url não há preview')
const r = resumirPreview({
  url: 'https://www.tradingview.com/x',
  title: ' ' + 'T'.repeat(500),
  description: 'D'.repeat(500),
  image: 'data:image/png;base64,AAAA',
  siteName: '',
})
assert.ok(r)
assert.equal(r.title?.length, 200, 'título cortado')
assert.equal(r.description?.length, 300, 'descrição cortada')
assert.equal(r.image, null, 'imagem data: não entra')
assert.equal(r.siteName, 'tradingview.com', 'siteName cai para o domínio')
assert.equal(resumirPreview({ url: 'https://a.pt' })?.title, 'a.pt', 'título cai para o domínio')
assert.equal(resumirPreview({ url: 'https://a.pt', image: 'https://a.pt/og.png' })?.image, 'https://a.pt/og.png')

// 2. Enriquecimento: timeout curto e nunca lança (o tsx corre em CJS: sem await de topo)
async function casosAssincronos() {
const lento = () => new Promise<never>(() => {}) // nunca responde
const t0 = Date.now()
const e1 = await enriquecerLinkDoPost('https://lento.pt/x', lento, 50)
assert.ok(Date.now() - t0 < 1_000, 'não esperou pelo site lento')
assert.deepEqual(e1, { link_url: 'https://lento.pt/x', link_preview: null })

const rebenta = async () => { throw new Error('boom') }
const e2 = await enriquecerLinkDoPost('https://rebenta.pt', rebenta)
assert.deepEqual(e2, { link_url: 'https://rebenta.pt/', link_preview: null }, 'erro do site não rebenta o post')

const bom = async (url: string) => ({ url, title: 'Título', description: 'Desc', image: 'https://ok.pt/og.jpg', siteName: 'OK' })
const e3 = await enriquecerLinkDoPost('vê https://ok.pt/post', bom)
assert.equal(e3.link_url, 'https://ok.pt/post')
assert.equal(e3.link_preview?.image, 'https://ok.pt/og.jpg')
assert.equal(e3.link_preview?.title, 'Título')

const e4 = await enriquecerLinkDoPost('sem link', bom)
assert.deepEqual(e4, { link_url: null, link_preview: null })
}

// 3. Content vazio sem média é recusado
assert.equal(conteudoPublicavel('', null), false, 'o defeito de 05/10: post vazio')
assert.equal(conteudoPublicavel('   ', undefined), false)
assert.equal(conteudoPublicavel(undefined, []), false)
assert.equal(conteudoPublicavel('', 'https://cdn/x.jpg'), true, 'só média é válido')
assert.equal(conteudoPublicavel('texto', null), true)
assert.equal(conteudoPublicavel('', ['', 'https://cdn/x.jpg']), true)

casosAssincronos().then(() => {
  console.log('OK — link-preview.check: extracção, resumo, timeout, content vazio recusado')
})
