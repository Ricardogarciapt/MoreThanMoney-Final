/**
 * O PREÇO DA LOJA OFICIAL — lido pelo servidor, para os produtos de terceiros (categoria «Produtos»).
 *
 * O cron `/api/cron/marketplace-precos` abre a `preco_fonte_url` de cada produto, tira daqui o
 * preço, e só o grava se passar em `decidirActualizacao`. Tudo o que decide está neste ficheiro,
 * sem rede nem base de dados, para a guarda (`preco-loja.check.ts`) o poder provar com o HTML real
 * gravado em `fixtures/`.
 *
 * ── DE ONDE VEM O PREÇO (06/10/2026) ──────────────────────────────────────────────────────
 *
 * Ledger (shop.ledger.com): JSON-LD schema.org `Product` com `offers[].price/priceCurrency`, no HTML
 *   do servidor. Uma página de produto traz UM `Product` por variante (cor); escolhe-se o da variante
 *   do caminho (`/products/ledger-flex/graphite`). O HTML do servidor vem em USD; com `?country=PT`
 *   vem em EUR (o mesmo valor que o browser mostra a quem está em Portugal: 99 € no Nano X).
 * Solana Mobile (store.solanamobile.com): `__NEXT_DATA__` → `pageProps.seekerPrice`
 *   `{ price, compareAtPrice }`, sem moeda (a loja mostra USD também na versão /eu). Sem moeda lida,
 *   fica a que o produto já tem.
 *
 * ── O QUE NUNCA SE FAZ ────────────────────────────────────────────────────────────────────
 *
 * O cron só escreve as colunas de `COLUNAS_QUE_O_CRON_ESCREVE`. Nunca muda o estado, o `activo` nem
 * o link de compra (`checkout_externo_url`, que leva o código de afiliado).
 */

/** O código de afiliado Ledger do dono. Vai em TODOS os links de compra Ledger. */
export const LEDGER_AFILIADO_R = '0de5eaac7911'
/** Etiqueta opcional do link Ledger: diz de onde veio a venda. */
export const LEDGER_TRACKER = 'mtm-marketplace'

/** Variação máxima aceite entre duas leituras (60%). Acima disto é página errada, não promoção. */
export const VARIACAO_MAXIMA = 0.6

export type PrecoLido = {
  cents: number
  /** Minúsculas ('eur', 'usd'). Nulo = a página não diz; fica a moeda do produto. */
  moeda: string | null
  /** O «antes» de uma promoção, se a página o mostrar. */
  baseCents: number | null
  fonte: 'jsonld' | 'next-preco' | 'meta'
}

export const COLUNAS_QUE_O_CRON_ESCREVE = [
  'preco_cents', 'moeda', 'preco_base_cents', 'preco_lido_em', 'preco_erro', 'preco_erro_em',
] as const

// ── Link de afiliado ──────────────────────────────────────────────────────────────────────

/**
 * O link de compra Ledger com o código do dono: o caminho do produto + `r` + `tracker`.
 * Um `r` que já lá esteja (de outra pessoa) é SUBSTITUÍDO — nunca fica outro código.
 */
export function linkAfiliadoLedger(url: string): string {
  const u = new URL(url)
  if (u.hostname !== 'shop.ledger.com') throw new Error(`não é um link da Ledger: ${url}`)
  u.searchParams.delete('country')
  u.searchParams.set('r', LEDGER_AFILIADO_R)
  u.searchParams.set('tracker', LEDGER_TRACKER)
  return u.toString()
}

/** Um link de compra Ledger está bem se for https da shop.ledger.com e levar o `r` do dono. */
export function linkLedgerTemAfiliado(url: string | null | undefined): boolean {
  try {
    const u = new URL(String(url ?? ''))
    return u.protocol === 'https:' && u.hostname === 'shop.ledger.com' && u.searchParams.get('r') === LEDGER_AFILIADO_R
  } catch {
    return false
  }
}

/** A página de onde se lê o preço de um produto Ledger: o caminho do produto, em EUR (`country=PT`). */
export function fontePrecoLedger(urlProduto: string): string {
  const u = new URL(urlProduto)
  u.search = ''
  u.searchParams.set('country', 'PT')
  return u.toString()
}

// ── O parser ──────────────────────────────────────────────────────────────────────────────

function paraCents(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.').trim())
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100)
}

/** «Ledger Flex™ - Graphite» / «graphite» / «ledger-stax™-+-recovery-key» → a mesma chave. */
function chave(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function blocosJsonLd(html: string): unknown[] {
  const out: unknown[] = []
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  for (let m = re.exec(html); m; m = re.exec(html)) {
    try {
      const j = JSON.parse(m[1])
      if (Array.isArray(j)) out.push(...j)
      else if (j && typeof j === 'object' && Array.isArray((j as { '@graph'?: unknown[] })['@graph'])) out.push(...(j as { '@graph': unknown[] })['@graph'])
      else out.push(j)
    } catch { /* bloco partido: ignora-se, os outros contam */ }
  }
  return out
}

type ProdutoLd = { '@type'?: unknown; name?: unknown; offers?: unknown }

function ofertaDe(p: ProdutoLd): { cents: number; moeda: string | null } | null {
  const ofs = Array.isArray(p.offers) ? p.offers : p.offers ? [p.offers] : []
  for (const o of ofs as Record<string, unknown>[]) {
    const cents = paraCents(o?.price ?? o?.lowPrice)
    if (cents) {
      const moeda = typeof o.priceCurrency === 'string' && /^[A-Za-z]{3}$/.test(o.priceCurrency) ? o.priceCurrency.toLowerCase() : null
      return { cents, moeda }
    }
  }
  return null
}

/**
 * Tira o preço do HTML de uma página de produto. `url` é a página lida — serve para escolher a
 * variante quando há várias. Devolve `null` se não houver preço fiável (e então o cron não mexe).
 */
export function lerPrecoDoHtml(html: string, url: string): PrecoLido | null {
  // 1. JSON-LD schema.org Product/Offer.
  const produtos = blocosJsonLd(html).filter((b): b is ProdutoLd => {
    const t = (b as ProdutoLd)?.['@type']
    return t === 'Product' || (Array.isArray(t) && t.includes('Product'))
  })
  if (produtos.length > 0) {
    let escolhido: ProdutoLd | undefined
    if (produtos.length === 1) escolhido = produtos[0]
    else {
      // Várias variantes na mesma página: a do caminho (/products/<produto>/<variante>).
      let variante = ''
      try {
        const partes = new URL(url).pathname.split('/').filter(Boolean)
        const i = partes.indexOf('products')
        variante = i >= 0 && partes[i + 2] ? chave(decodeURIComponent(partes[i + 2])) : ''
      } catch { /* url inválida: sem variante */ }
      if (!variante) escolhido = produtos[0]
      else {
        escolhido = produtos.find((p) => {
          const nome = String(p.name ?? '')
          const sufixo = nome.includes(' - ') ? nome.slice(nome.lastIndexOf(' - ') + 3) : nome
          return chave(sufixo) === variante
        })
        // Variante pedida e não encontrada: preferir não ler a ler a de outra cor.
        if (!escolhido) return null
      }
    }
    const of = escolhido ? ofertaDe(escolhido) : null
    if (of) return { cents: of.cents, moeda: of.moeda, baseCents: null, fonte: 'jsonld' }
  }

  // 2. __NEXT_DATA__ com um objecto { price, compareAtPrice } (Solana Mobile: seekerPrice).
  const nd = /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(html)
  if (nd) {
    try {
      const props = (JSON.parse(nd[1]) as { props?: { pageProps?: Record<string, unknown> } }).props?.pageProps ?? {}
      for (const v of Object.values(props)) {
        if (v && typeof v === 'object' && 'price' in v && 'compareAtPrice' in v) {
          const o = v as { price: unknown; compareAtPrice: unknown; currency?: unknown; currencyCode?: unknown }
          const cents = paraCents(o.price)
          if (cents) {
            const base = paraCents(o.compareAtPrice)
            const m = o.currencyCode ?? o.currency
            return {
              cents,
              moeda: typeof m === 'string' && /^[A-Za-z]{3}$/.test(m) ? m.toLowerCase() : null,
              baseCents: base && base > cents ? base : null,
              fonte: 'next-preco',
            }
          }
        }
      }
    } catch { /* segue para o meta */ }
  }

  // 3. <meta property="product:price:amount"> / og:price:amount.
  const meta = (prop: string) =>
    new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i').exec(html)?.[1] ??
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, 'i').exec(html)?.[1]
  const amount = meta('product:price:amount') ?? meta('og:price:amount')
  const cents = paraCents(amount)
  if (cents) {
    const m = meta('product:price:currency') ?? meta('og:price:currency')
    return { cents, moeda: m && /^[A-Za-z]{3}$/.test(m) ? m.toLowerCase() : null, baseCents: null, fonte: 'meta' }
  }
  return null
}

// ── A decisão ─────────────────────────────────────────────────────────────────────────────

export type EstadoPreco = { preco_cents: number; moeda: string | null; preco_base_cents?: number | null }

export type Decisao =
  | { actualiza: true; patch: Record<string, unknown> }
  | { actualiza: false; motivo: string; patch: Record<string, unknown> }

/**
 * O que gravar depois de uma leitura. Uma falha (sem preço, 0, moeda diferente, variação acima de
 * 60%) NUNCA toca no preço: o patch só leva o erro e a hora. O patch nunca leva colunas fora de
 * `COLUNAS_QUE_O_CRON_ESCREVE`.
 */
export function decidirActualizacao(
  actual: EstadoPreco,
  lido: PrecoLido | null,
  agoraIso: string,
  erroDeLeitura?: string,
): Decisao {
  const falha = (motivo: string): Decisao => ({
    actualiza: false,
    motivo,
    patch: { preco_erro: motivo.slice(0, 300), preco_erro_em: agoraIso },
  })
  if (!lido) return falha(erroDeLeitura ? `leitura falhou: ${erroDeLeitura}` : 'preço não encontrado na página')
  if (!Number.isFinite(lido.cents) || lido.cents <= 0) return falha(`preço absurdo: ${lido.cents}`)
  const moedaActual = String(actual.moeda ?? '').toLowerCase() || null
  if (lido.moeda && moedaActual && lido.moeda !== moedaActual) {
    return falha(`moeda mudou de ${moedaActual} para ${lido.moeda}`)
  }
  const anterior = Math.round(Number(actual.preco_cents) || 0)
  if (anterior > 0) {
    const variacao = Math.abs(lido.cents - anterior) / anterior
    if (variacao > VARIACAO_MAXIMA) {
      return falha(`variação de ${Math.round(variacao * 100)}% (${anterior} → ${lido.cents}) acima de ${VARIACAO_MAXIMA * 100}%`)
    }
  }
  return {
    actualiza: true,
    patch: {
      preco_cents: lido.cents,
      moeda: lido.moeda ?? moedaActual ?? 'eur',
      preco_base_cents: lido.baseCents && lido.baseCents > lido.cents ? lido.baseCents : null,
      preco_lido_em: agoraIso,
      preco_erro: null,
      preco_erro_em: null,
    },
  }
}
