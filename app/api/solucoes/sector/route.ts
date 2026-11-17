import { NextRequest, NextResponse } from 'next/server'
import { chamarIAGratis } from '@/lib/ia/chamar'
import { fetchLinkPreview } from '@/lib/link-preview-fetch'
import { LIMITE_SECTOR_IP_HORA, normalizarSector, promptSector, sectorGenerico, validarNegocio } from '@/lib/site-solucoes/sector-livre'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Limite por IP em memória: chega para travar abuso numa instância, sem tabela nova.
const pedidos = new Map<string, number[]>()

/**
 * POST «O meu negócio não está na lista» (simulador do /solucoes). Público e sem gravar nada:
 * lê o título e a descrição do site indicado (se houver), pede à IA grátis o sector e devolve-o
 * já validado. Se a IA falhar, devolve um sector genérico com o nome que a pessoa escreveu.
 */
export async function POST(req: NextRequest) {
  let corpo: { negocio?: unknown; site?: unknown } = {}
  try {
    corpo = await req.json()
  } catch {
    return NextResponse.json({ ok: false, erro: 'Pedido inválido.' }, { status: 400 })
  }
  const v = validarNegocio(corpo)
  if (!v.ok) return NextResponse.json({ ok: false, erro: v.erro }, { status: 400 })

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'sem-ip'
  const agora = Date.now()
  const lista = (pedidos.get(ip) ?? []).filter((t) => agora - t < 3600_000)
  if (lista.length >= LIMITE_SECTOR_IP_HORA) {
    return NextResponse.json({ ok: true, sector: sectorGenerico(v.negocio), ia: false })
  }
  lista.push(agora)
  pedidos.set(ip, lista)

  let resumo: string | null = null
  if (v.site) {
    const prev = await Promise.race([fetchLinkPreview(v.site).catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 5000))])
    if (prev) resumo = [prev.title, prev.description].filter(Boolean).join('. ').slice(0, 500) || null
  }

  try {
    const { sistema, mensagem } = promptSector(v.negocio, resumo)
    const r = await chamarIAGratis({
      sistema,
      mensagens: [{ role: 'user', content: mensagem }],
      json: true,
      maxTokens: 700,
      temperatura: 0.4,
      tarefa: 'solucoes-sector',
      preferencia: 'qualidade',
      timeoutMs: 12_000,
    })
    const sector = normalizarSector(r.texto, v.negocio)
    if (sector) return NextResponse.json({ ok: true, sector, ia: true, site: Boolean(resumo) })
  } catch (e) {
    console.error('[solucoes/sector] IA indisponível:', e instanceof Error ? e.message : e)
  }
  return NextResponse.json({ ok: true, sector: sectorGenerico(v.negocio), ia: false })
}
