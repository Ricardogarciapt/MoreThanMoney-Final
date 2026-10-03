import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-api-helpers"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { andar, bracosDeEnsaio, funilPorId } from "@/lib/funis-motor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Ensaiar um funil — percorrê-lo com uma pessoa real, sem lhe tocar.
 *
 * É o que torna seguro ligar um funil. Vê-se o caminho passo a passo, com os dados de quem
 * escolheres: que mensagens sairiam, por que lado da condição a pessoa cai, onde pararia. Nada
 * é enviado, nada é etiquetado, nenhum endereço de fora é chamado.
 *
 * Sem pessoa, corre com um lead qualquer — porque um ensaio com dados inventados descreve um
 * caminho inventado, e é o caminho REAL que se quer ver antes de ligar.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req)
  if (guard) return guard

  const { funilId, pessoa } = (await req.json().catch(() => ({}))) as { funilId?: string; pessoa?: string }
  if (!funilId) return NextResponse.json({ ok: false, erro: "Falta o funil" }, { status: 400 })

  const funil = await funilPorId(funilId)
  if (!funil) return NextResponse.json({ ok: false, erro: "Funil desconhecido" }, { status: 404 })

  let quem = (pessoa ?? "").trim()
  let nome = ""
  if (!quem) {
    const { data } = await getSupabaseAdmin()
      .from("telegram_leads")
      .select("chat_id, first_name")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data?.chat_id) {
      quem = `telegram:${data.chat_id}`
      nome = String(data.first_name ?? "")
    }
  }
  // Sem ninguém na base ainda se ensaia: o caminho das condições fica o do "não sei", que é
  // exactamente o que aconteceria a alguém acabado de chegar.
  if (!quem) quem = "telegram:0"

  const r = await andar(funil, { pessoa: quem, dados: { nome } }, bracosDeEnsaio, { ensaio: true })

  return NextResponse.json({
    ok: true,
    pessoa: quem,
    passos: r.passos,
    terminou: r.terminou,
    parouEm: r.parouEm,
  })
}
