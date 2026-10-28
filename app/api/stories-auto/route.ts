import { NextRequest, NextResponse } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { chamarIA } from "@/lib/ia/chamar"
import { CONTA_MARCA } from "@/lib/operador/regras"
import {
  SISTEMA_GUIAO,
  anguloDaSemana,
  horasDosStories,
  montarGuiao,
  pedidoGuiao,
  semanaDeLisboa,
  type GuiaoSemana,
} from "@/lib/stories-auto/guiao"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const CHAVE = "stories_auto"

type Registo = { semanas: Record<string, { guiao: GuiaoSemana; estado: "pronto" | "agendado"; videos?: string[] }> }

async function ler(db: ReturnType<typeof getSupabaseAdmin>): Promise<Registo> {
  const { data } = await db.from("site_settings").select("value").eq("key", CHAVE).maybeSingle()
  const v = (data?.value ?? {}) as Partial<Registo>
  return { semanas: v.semanas ?? {} }
}

async function gravar(db: ReturnType<typeof getSupabaseAdmin>, r: Registo) {
  // Só as últimas 8 semanas: o resto já saiu e está em social_scheduled_posts.
  const chaves = Object.keys(r.semanas).sort().slice(-8)
  const semanas = Object.fromEntries(chaves.map((k) => [k, r.semanas[k]]))
  await db.from("site_settings").upsert({ key: CHAVE, value: { semanas }, updated_at: new Date().toISOString() }, { onConflict: "key" })
}

/**
 * A porta do Mac para os stories semanais com storytelling (pedido do Ricardo a 28/10).
 * Bearer CRON_SECRET. O Mac narra (Fish), desenha com video/stories-mtm e envia os vídeos.
 *
 * GET                                            → o guião desta semana (escreve-o se ainda não houver)
 * POST { acao: "upload-url" }                    → endereço assinado para enviar um mp4 ao Supabase
 * POST { acao: "agendar", semana, videos: [3] }  → agenda os 3 stories às 19:00 de Lisboa
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const db = getSupabaseAdmin()
  const r = await ler(db)
  const semana = semanaDeLisboa()
  const ja = r.semanas[semana]
  if (ja) return NextResponse.json({ ok: true, semana, estado: ja.estado, guiao: ja.guiao })

  const angulo = anguloDaSemana(semana)
  let evitar: string[] = []
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const resp = await chamarIA({
      tarefa: "stories-auto",
      json: true,
      maxTokens: 2048,
      preferencia: "qualidade",
      sistema: SISTEMA_GUIAO,
      mensagens: [{ role: "user", content: pedidoGuiao(angulo) + (evitar.length ? `\nA tentativa anterior foi recusada por: ${evitar.join("; ")}.` : "") }],
    })
    let bruto: unknown
    try {
      bruto = JSON.parse(resp.texto ?? "")
    } catch {
      evitar = ["não devolveu JSON válido"]
      continue
    }
    const { guiao, problemas } = montarGuiao(semana, angulo, bruto)
    if (guiao) {
      r.semanas[semana] = { guiao, estado: "pronto" }
      await gravar(db, r)
      return NextResponse.json({ ok: true, semana, estado: "pronto", guiao })
    }
    evitar = problemas
  }
  return NextResponse.json({ ok: false, erro: `guião fora das regras: ${evitar.join("; ")}` }, { status: 502 })
}

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const db = getSupabaseAdmin()
  const corpo = (await req.json().catch(() => ({}))) as { acao?: string; semana?: string; videos?: string[] }

  if (corpo.acao === "upload-url") {
    const caminho = `stories-auto/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.mp4`
    const bucket = db.storage.from("uploads")
    const { data, error } = await bucket.createSignedUploadUrl(caminho)
    if (error || !data) return NextResponse.json({ ok: false, erro: error?.message ?? "sem endereço" }, { status: 500 })
    return NextResponse.json({ ok: true, signedUrl: data.signedUrl, publicUrl: bucket.getPublicUrl(caminho).data.publicUrl })
  }

  if (corpo.acao === "agendar") {
    const r = await ler(db)
    const s = corpo.semana ? r.semanas[corpo.semana] : undefined
    if (!s) return NextResponse.json({ ok: false, erro: "semana sem guião" }, { status: 400 })
    if (s.estado === "agendado") return NextResponse.json({ ok: true, jaAgendado: true })
    const videos = (corpo.videos ?? []).filter((v) => typeof v === "string" && v.startsWith("https://"))
    if (videos.length !== 3) return NextResponse.json({ ok: false, erro: "precisa de 3 vídeos" }, { status: 400 })
    const horas = horasDosStories()
    const agora = new Date().toISOString()
    const { error } = await db.from("social_scheduled_posts").insert(
      videos.map((v, i) => ({
        channel: "instagram",
        ig_account_id: CONTA_MARCA,
        ig_username: "morethanmoney.pt",
        pillar: "stories-historia",
        media_type: "STORIES",
        media_urls: [v],
        caption: `Storytelling MTM ${corpo.semana} ${i + 1}/3`,
        scheduled_at: horas[i],
        status: "approved",
        approved_by: "Ricardo (automação semanal, 28/10)",
        approved_at: agora,
        created_by: "mac:stories-auto",
      })),
    )
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
    r.semanas[corpo.semana!] = { ...s, estado: "agendado", videos }
    await gravar(db, r)
    return NextResponse.json({ ok: true, horas })
  }

  return NextResponse.json({ ok: false, erro: "acao desconhecida" }, { status: 400 })
}
