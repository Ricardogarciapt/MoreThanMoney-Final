import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/super-admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { guardarSessao, lerPagina, lerSessao } from '@/lib/skool/cliente'

export const dynamic = 'force-dynamic'

/**
 * Sessão de dono do Skool: o ecrã /admin/skool cola aqui o cabeçalho Cookie do browser.
 * Só o super admin. Nunca devolve o cookie — só se existe, quando foi guardado e se funciona.
 */
async function estado() {
  const db = getSupabaseAdmin()
  const { data: ciclo } = await db.from('site_settings').select('value').eq('key', 'skool_ciclo').maybeSingle()
  const c = (ciclo?.value ?? {}) as { ultimaCorrida?: string; ultimoErro?: string | null }
  let sessao: { existe: boolean; atualizadaEm?: string; funciona?: boolean; conta?: string; erro?: string } = { existe: false }
  try {
    const s = await lerSessao()
    sessao = { existe: true, atualizadaEm: s.atualizadaEm }
    try {
      const { pageProps } = await lerPagina(s.grupo)
      sessao.funciona = Boolean(pageProps.self)
      sessao.conta = pageProps.self ? `${pageProps.self.firstName ?? ''} ${pageProps.self.lastName ?? ''}`.trim() : undefined
    } catch (e) {
      sessao.funciona = false
      sessao.erro = e instanceof Error ? e.message.slice(0, 200) : 'falhou'
    }
  } catch {
    // sem sessão
  }
  return { sessao, ciclo: { ultimaCorrida: c.ultimaCorrida ?? null, ultimoErro: c.ultimoErro ?? null } }
}

export async function GET(request: NextRequest) {
  const negado = await requireSuperAdmin(request)
  if (negado) return negado
  return NextResponse.json(await estado())
}

export async function POST(request: NextRequest) {
  const negado = await requireSuperAdmin(request)
  if (negado) return negado
  const corpo = (await request.json().catch(() => ({}))) as { cookie?: string }
  try {
    await guardarSessao(String(corpo.cookie ?? ''))
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : 'falhou' }, { status: 400 })
  }
  return NextResponse.json({ ok: true, ...(await estado()) })
}
