import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { identificar, linhaDeTokens, trocarCodigo } from '@/lib/redes/oauth'
import { lerState, SITE } from '@/lib/redes/regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Volta do OAuth de cada rede. Não há sessão aqui: quem prova o pedido é o `state` assinado que
 * o /admin/redes gerou para um admin. Guarda os tokens em `redes_contas` e devolve ao painel.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ rede: string }> }) {
  const { rede: redeUrl } = await ctx.params
  const q = req.nextUrl.searchParams
  const voltar = (msg: string, ok = false) =>
    NextResponse.redirect(`${SITE}/admin/redes?${ok ? 'ok' : 'erro'}=${encodeURIComponent(msg)}`)

  if (q.get('error')) return voltar(`${redeUrl}: ${q.get('error_description') || q.get('error')}`)
  const segredo = process.env.CRON_SECRET?.trim()
  const st = segredo ? lerState(q.get('state') || '', segredo) : null
  if (!st || st.rede !== redeUrl) return voltar('ligação expirada ou inválida: tenta outra vez')
  const code = q.get('code')
  if (!code) return voltar('a rede não devolveu código')

  try {
    const t = await trocarCodigo(st.rede, code)
    const quem = await identificar(st.rede, st.marca, t.access)
    const linha = linhaDeTokens(t)
    const { error } = await getSupabaseAdmin().from('redes_contas').upsert(
      {
        rede: st.rede, marca: st.marca, nome: quem.nome, conta_externa_id: quem.id, ...linha,
        ativa: true, nota: quem.nota ?? null, atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'rede,marca' },
    )
    if (error) throw new Error(error.message)
    return voltar(`${quem.nome} ligada`, true)
  } catch (e) {
    return voltar(e instanceof Error ? e.message : 'falhou a ligação')
  }
}
