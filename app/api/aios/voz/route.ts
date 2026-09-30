import { NextResponse, type NextRequest } from 'next/server'
import { falar } from '@/lib/voz'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * A VOZ DO AIOS — do lado do servidor, e é esse o ponto.
 *
 * ═══ O QUE ISTO SUBSTITUI ══════════════════════════════════════════════════════════════════
 *
 * O AIOS antigo chamava `https://api.fish.audio/v1/tts` DIRECTAMENTE DO BROWSER, com a chave
 * escrita em claro na linha 318 de `public/aios/index.html`:
 *
 *     const FISH_API_KEY='9381ae2b…';
 *
 * Isso significa três coisas, e nenhuma delas é boa: a chave está no repositório e no histórico do
 * git desde Junho; é entregue ao browser de qualquer pessoa que abra a página; e quem a apanhar
 * gasta a conta Fish da casa sem ter de entrar no site. A página está fechada a admins, o que
 * limita o estrago — mas «só os admins têm a chave» não é o mesmo que «a chave não sai daqui».
 *
 * Aqui a chave nunca sai do servidor: vem de `FISH_API_KEY` (que já existe na Vercel) e é usada
 * por `lib/voz`, a mesma biblioteca que dobra as sessões. O browser recebe áudio, não credenciais.
 *
 * ═══ PORQUE É QUE CONTINUA FECHADA A ADMINS ════════════════════════════════════════════════
 *
 * Porque uma rota de TTS aberta é uma conta de terceiros a pagar o que qualquer pessoa lhe mandar
 * sintetizar. O AIOS é um ecrã de administração; a voz dele também é.
 */

const LIMITE_CARACTERES = 600

async function ehAdmin(): Promise<boolean> {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => { /* rota só de leitura */ } } },
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false
    const { data } = await getSupabaseAdmin().from('profiles').select('user_type, is_active').eq('id', user.id).maybeSingle()
    return data?.user_type === 'admin' && data?.is_active === true
  } catch {
    // Na dúvida, fecha. O contrário é uma chave de terceiros a pagar por um erro de leitura nosso.
    return false
  }
}

export async function POST(request: NextRequest) {
  if (!(await ehAdmin())) {
    return NextResponse.json({ error: 'sem acesso' }, { status: 403 })
  }

  const corpo = (await request.json().catch(() => ({}))) as { texto?: unknown }
  const texto = String(corpo.texto ?? '').trim().slice(0, LIMITE_CARACTERES)
  if (!texto) return NextResponse.json({ error: 'sem texto' }, { status: 400 })

  const r = await falar(texto, { cache: getSupabaseAdmin(), formato: 'mp3', latencia: 'balanced' })
  if (!r.ok) {
    // O motivo vai para o registo, não para o browser: «FISH_API_KEY não está definida» é
    // informação sobre a nossa infra-estrutura e não ajuda quem está do outro lado.
    console.error('[aios/voz] a voz não saiu:', r.motivo ?? r)
    return NextResponse.json({ error: 'a voz não está disponível' }, { status: 503 })
  }

  return new NextResponse(new Uint8Array(r.buffer), {
    headers: {
      'content-type': r.contentType,
      'cache-control': 'no-store',
      'content-length': String(r.buffer.length),
    },
  })
}
