import { NextRequest, NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { lerPedido } from '@/lib/mestres/painel'
import { carregarPainelMestres } from '@/lib/mestres/servidor/painel-leitura'
import { aplicarPedidoMestres } from '@/lib/mestres/servidor/painel-escrita'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * MOTOR DAS MESTRES (116) — só administradores (soAdmin verifica a sessão no servidor).
 *   GET                                                         → painel: motor, estratégias, contas, ordens, alertas
 *   POST { tipo: 'estrategia', slug, campo, valor, confirmacao } → modo | sinal_modo | t2t_modo  (desligado|sombra|live)
 *   POST { tipo: 'conta', contaChave, valor, confirmacao }       → sombra | live
 *   POST { tipo: 'kill', valor, confirmacao }                    → kill-switch (KILL / RETOMAR)
 *   POST { tipo: 'alertas_vistos', ids }
 * Palavras e guardas em lib/mestres/painel.ts; a base volta a verificar no trigger da 116.
 */
export const GET = soAdmin(async (_a: string, _req: NextRequest) => NextResponse.json(await carregarPainelMestres(), { headers: { 'Cache-Control': 'no-store' } }))

export const POST = soAdmin(async (adminId: string, req: NextRequest) => {
  const p = lerPedido(await req.json().catch(() => ({})))
  if ('erro' in p) return NextResponse.json({ error: p.erro }, { status: 400 })
  const r = await aplicarPedidoMestres(adminId, p)
  return NextResponse.json({ ok: r.ok, message: r.mensagem, detalhe: r.detalhe ?? null, ...(r.ok ? {} : { error: r.mensagem }) }, { status: r.status })
})
