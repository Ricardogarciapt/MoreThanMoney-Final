import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { exigirGestao } from '@/lib/backoffice-sessao'
import { getMtmcopyBotToken } from '@/lib/mtmcopy/telegram-bot'
import { validarMenu } from '@/lib/telegram/menu-bot'
import { gravarMenu, lerMenu, publicarMenu } from '@/lib/telegram/menu-bot-servidor'

export const dynamic = 'force-dynamic'

/**
 * GESTÃO → TELEGRAM → MENU DO BOT. GET lê o menu guardado; PUT grava sem publicar; POST grava e
 * publica no Telegram (comandos, descrições, botão do menu). Os comandos extra respondem logo a
 * seguir a gravar — o webhook lê o menu a cada comando que não conhece.
 */
export async function GET(request: NextRequest) {
  const g = await exigirGestao(request, 'bo.dono')
  if (g.negado) return g.negado
  return NextResponse.json({ menu: await lerMenu(getSupabaseAdmin()) })
}

async function guardar(request: NextRequest, publicar: boolean) {
  const g = await exigirGestao(request, 'bo.dono')
  if (g.negado) return g.negado
  const v = validarMenu(await request.json().catch(() => ({})))
  if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 })
  const db = getSupabaseAdmin()
  const menu = { ...v.menu }
  let resultado = null
  if (publicar) {
    const token = getMtmcopyBotToken()
    if (!token) return NextResponse.json({ error: 'TELEGRAM_AIBOT_TOKEN não configurado' }, { status: 500 })
    resultado = await publicarMenu(token, menu)
    if (resultado.ok) menu.publicadoEm = new Date().toISOString()
  }
  const { error } = await gravarMenu(db, menu)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (resultado && !resultado.ok) {
    const falhas = resultado.resultados.filter((r) => !r.ok).map((r) => `${r.metodo}: ${r.erro}`)
    return NextResponse.json({ error: `Gravado, mas o Telegram recusou: ${falhas.join(' · ')}`, menu }, { status: 502 })
  }
  return NextResponse.json({ menu })
}

export const PUT = (request: NextRequest) => guardar(request, false)
export const POST = (request: NextRequest) => guardar(request, true)
