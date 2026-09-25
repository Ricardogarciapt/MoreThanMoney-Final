import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { chatMessageShortId, extractFirstUrlFromText } from '@/lib/chat-short-link'
import { getSiteOrigin } from '@/lib/site-url'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  const { id: rawId } = await context.params
  const shortId = rawId.replace(/[^a-f0-9]/gi, '').slice(0, 8).toLowerCase()

  if (shortId.length < 6) {
    return NextResponse.redirect(new URL('/app-mobile?tab=chat', getSiteOrigin()))
  }

  const supabase = getSupabaseAdmin()
  const { data: rows, error } = await supabase
    .from('chat_messages')
    .select('id, image_url, link_url, content, channel_slug, is_deleted')
    .ilike('id', `${shortId}%`)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) {
    console.error('[chat-short-link] lookup error:', error.message)
    return NextResponse.redirect(new URL('/app-mobile?tab=chat', getSiteOrigin()))
  }

  const match =
    rows?.find((row) => chatMessageShortId(row.id) === shortId) ?? rows?.[0] ?? null

  const destination =
    match?.image_url ||
    match?.link_url ||
    extractFirstUrlFromText(match?.content || '') ||
    null

  if (destination) {
    return NextResponse.redirect(destination, {
      status: 302,
      headers: { 'Cache-Control': 'public, max-age=300' },
    })
  }

  // Link partilhado sem media → abre o chat NA mensagem partilhada, não no fundo do canal.
  const fallback = match?.channel_slug
    ? `/app-mobile?tab=chat&channel=${encodeURIComponent(match.channel_slug)}&msg=${encodeURIComponent(match.id)}`
    : '/app-mobile?tab=chat'

  return NextResponse.redirect(new URL(fallback, getSiteOrigin()))
}
