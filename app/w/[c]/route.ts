/**
 * /w/<código> — o link com rasto do funil de WhatsApp (23/11/2026, `lib/whatsapp/link-seguido.ts`).
 *
 * Redireciona logo (o clique nunca espera pela base) e grava depois, com `after()`: quem abriu, que
 * página e quando. É esse registo que dispara o seguimento «vi que já foste espreitar» e que deixa a
 * agenda ligar a marcação ao lead do WhatsApp. Código inválido → página principal, sem erro.
 */
import { NextResponse, after, type NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { COOKIE_WA, DESTINOS, SITE, lerCodigo, urlDeDestino } from '@/lib/whatsapp/link-seguido'

export const dynamic = 'force-dynamic'

const NOME_DESTINO: Record<keyof typeof DESTINOS, string> = { e: 'educacao', c: 'corretora', f: 'funded', s: 'solucoes', h: 'curioso', a: 'agenda' }

export async function GET(req: NextRequest, ctx: { params: Promise<{ c: string }> }) {
  const { c } = await ctx.params
  const lido = lerCodigo(c)
  if (!lido) return NextResponse.redirect(SITE, 302)

  const res = NextResponse.redirect(urlDeDestino(lido.destino, c, undefined, lido.canal), 302)
  res.cookies.set(COOKIE_WA, c, { maxAge: 60 * 60 * 24 * 30, path: '/', sameSite: 'lax', secure: true })

  // Pré-visualizações de links (o próprio WhatsApp abre o URL para fazer o cartão) não contam.
  const ua = req.headers.get('user-agent') || ''
  if (/WhatsApp|facebookexternalhit|bot|crawler|preview/i.test(ua)) return res

  after(async () => {
    try {
      const agora = new Date().toISOString()
      await getSupabaseAdmin()
        .from('bot_avisos_enviados')
        .upsert(
          { chave: `wa-clique:${lido.e164}:${NOME_DESTINO[lido.destino]}:${agora.slice(0, 16)}`, tipo: 'wa-clique', alvo: lido.e164 },
          { onConflict: 'chave', ignoreDuplicates: true },
        )
    } catch (e) {
      console.error('[wa-link] registo do clique falhou:', e instanceof Error ? e.message : e)
    }
  })
  return res
}
