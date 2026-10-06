import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { decidirActualizacao, lerPrecoDoHtml, linkLedgerTemAfiliado } from '@/lib/marketplace/preco-loja'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'

/**
 * A cada 6 h: lê o preço actual na loja oficial de cada produto do marketplace com
 * `preco_fonte_url` (Ledger, Solana Seeker) e actualiza `preco_cents`/`moeda`.
 *
 * Tudo o que decide vive em `lib/marketplace/preco-loja.ts` (e tem guarda). Aqui só se lê a página
 * e se grava o patch decidido — que nunca leva estado, `activo` nem o link de compra. Uma leitura
 * falhada ou absurda fica registada em `preco_erro` e o preço continua o último bom.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()
  const { data, error } = await db
    .from('marketplace_produtos')
    .select('id, slug, preco_cents, moeda, preco_base_cents, preco_fonte_url, checkout_externo_url')
    .not('preco_fonte_url', 'is', null)
    .limit(100)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const resultados = []
  for (const p of data ?? []) {
    const agora = new Date().toISOString()
    let html: string | null = null
    let erro: string | undefined
    try {
      const r = await fetch(p.preco_fonte_url as string, {
        headers: { 'user-agent': UA, accept: 'text/html' },
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      })
      if (r.ok) html = await r.text()
      else erro = `HTTP ${r.status}`
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e)
    }
    const lido = html ? lerPrecoDoHtml(html, p.preco_fonte_url as string) : null
    const d = decidirActualizacao(p, lido, agora, erro)
    const { error: errUpd } = await db.from('marketplace_produtos').update(d.patch).eq('id', p.id)
    const link = String(p.checkout_externo_url ?? '')
    resultados.push({
      slug: p.slug,
      antes: { cents: p.preco_cents, moeda: p.moeda },
      lido,
      actualizou: d.actualiza && !errUpd,
      motivo: d.actualiza ? undefined : d.motivo,
      erroGravar: errUpd?.message,
      // Só aviso: o cron NÃO corrige links (nunca mexe no checkout_externo_url).
      avisoAfiliado: link.includes('shop.ledger.com') && !linkLedgerTemAfiliado(link) ? 'link Ledger sem o r do dono' : undefined,
    })
  }
  return NextResponse.json({ ok: true, lidos: resultados.length, resultados })
}
