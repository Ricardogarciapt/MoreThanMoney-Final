import { NextRequest, NextResponse } from 'next/server'
import { excedeLimite, hashIp, validarPedido, type EntradaFormulario } from '@/lib/pedido-contacto'
import { contarRecentes, registarPedidoDeContacto } from '@/lib/pedido-contacto-registo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST «Quero que me liguem». Público (sem sessão), por isso:
 *  · honeypot preenchido → 200 «ok» sem gravar nada (o robô não aprende que foi apanhado);
 *  · limite por IP (5/hora) e por telefone (3/dia) → 429;
 *  · sem caixa de consentimento marcada → 400, nada gravado.
 */
export async function POST(req: NextRequest) {
  let corpo: EntradaFormulario = {}
  try {
    corpo = (await req.json()) as EntradaFormulario
  } catch {
    return NextResponse.json({ ok: false, erro: 'pedido inválido' }, { status: 400 })
  }

  const origemUrl = req.headers.get('referer')
  const v = validarPedido(corpo, origemUrl)
  if (!v.ok) {
    if (v.descartar) return NextResponse.json({ ok: true })
    return NextResponse.json({ ok: false, erros: v.erros }, { status: 400 })
  }

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || ''
  const ipHash = ip ? hashIp(ip, process.env.PEDIDO_CONTACTO_SAL || process.env.CRON_SECRET || '') : null
  try {
    const recentes = await contarRecentes({ ipHash, telefone: v.pedido.telefone })
    if (excedeLimite(recentes)) {
      return NextResponse.json({ ok: false, erro: 'Já recebemos o teu pedido. Vamos contactar-te em breve.' }, { status: 429 })
    }
    const r = await registarPedidoDeContacto({ pedido: v.pedido, linhas: v.linhas, fonte: 'site', ipHash })
    if (!r.ok) return NextResponse.json({ ok: false, erro: 'Não foi possível guardar. Tenta outra vez.' }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[pedido-contacto] erro:', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false, erro: 'Não foi possível guardar. Tenta outra vez.' }, { status: 500 })
  }
}
