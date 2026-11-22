/**
 * Técnica «rascunho duplicado» (Ricardo, 22/11/2026): «crias o reel, duplicas, a cópia vai para teste e,
 * quando o teste estiver a performar, publicas o original».
 *
 * A API do Instagram não cria rascunhos na app, por isso o «rascunho» vive aqui:
 *  1. Um reel do motor (estudio-clone) ou do @ricardogarciapt sai como reel de TESTE (trial, só a não seguidores).
 *  2. No mesmo instante guarda-se a cópia como «reserva» (status 'reserva', reserva_de = id do teste).
 *  3. De 3 em 3 horas mede-se o teste (views). Se viralizar, a reserva passa a 'approved' e sai como reel
 *     NORMAL, para os seguidores, na próxima janela. Ao fim de 7 dias sem viralizar fica 'expirado' (nada se apaga).
 *
 * «Viralizar» = views ≥ max(REELS_VIRAL_MIN, REELS_VIRAL_MULT × mediana das views dos últimos reels da conta).
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { tokenForAccount, CRIADOR_REELS_CLONE } from "@/lib/instagram/publish"

const GRAPH = "https://graph.facebook.com/v21.0"
const CHAVE = "reels_teste_reserva"
const MIN_VIEWS = Number(process.env.REELS_VIRAL_MIN || 1000)
const MULT = Number(process.env.REELS_VIRAL_MULT || 2)
const INTERVALO_MS = 3 * 3600_000
const MIN_IDADE_MS = 24 * 3600_000
const MAX_IDADE_MS = 7 * 24 * 3600_000

type Linha = Record<string, any>

/** Este reel sai como teste com reserva? (motor cinemático em qualquer conta; reels do RG já são teste). */
export function levaReserva(row: Linha, trial: string | null): boolean {
  if (row.media_type !== "REELS" || row.reserva_de) return false
  return !!trial || row.created_by === CRIADOR_REELS_CLONE
}

/** Guarda a cópia do teste como reserva. Chamado logo a seguir à publicação do teste. */
export async function guardarReserva(db: SupabaseClient, row: Linha): Promise<void> {
  const { data: ja } = await db.from("social_scheduled_posts").select("id").eq("reserva_de", row.id).limit(1)
  if (ja?.length) return
  const { error } = await db.from("social_scheduled_posts").insert({
    channel: row.channel,
    ig_account_id: row.ig_account_id,
    ig_username: row.ig_username,
    pillar: row.pillar,
    media_type: row.media_type,
    media_urls: row.media_urls,
    caption: row.caption,
    scheduled_at: row.scheduled_at,
    status: "reserva",
    created_by: row.created_by,
    reserva_de: row.id,
  })
  if (error) console.error("[teste-reserva] não guardou a reserva:", error.message)
}

async function views(mediaId: string, token: string): Promise<number | null> {
  try {
    const r = await fetch(`${GRAPH}/${mediaId}/insights?metric=views&access_token=${encodeURIComponent(token)}`)
    const j: any = await r.json()
    const v = j?.data?.[0]?.values?.[0]?.value ?? j?.data?.[0]?.total_value?.value
    return typeof v === "number" ? v : null
  } catch {
    return null
  }
}

function mediana(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Próxima janela de publicação (13:00, 15:30, 18:00, 20:30, 22:00 Lisboa ≈ UTC no inverno). */
function proximaJanela(agora = new Date()): string {
  const janelas = [[13, 0], [15, 30], [18, 0], [20, 30], [22, 0]]
  for (let d = 0; d < 2; d++) {
    for (const [h, m] of janelas) {
      const t = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate() + d, h, m))
      if (t.getTime() > agora.getTime() + 10 * 60_000) return t.toISOString()
    }
  }
  return new Date(agora.getTime() + 3600_000).toISOString()
}

/** Mede os testes e solta as reservas que viralizaram. Corre dentro do ig-publish, no máximo de 3 em 3 horas. */
export async function graduarReservas(db: SupabaseClient): Promise<Linha[] | null> {
  const { data: marca } = await db.from("site_settings").select("value").eq("key", CHAVE).maybeSingle()
  const ultima = Number((marca?.value as any)?.ultima || 0)
  if (Date.now() - ultima < INTERVALO_MS) return null
  await db.from("site_settings").upsert({ key: CHAVE, value: { ultima: Date.now() } }, { onConflict: "key" })

  const { data: reservas } = await db.from("social_scheduled_posts").select("*").eq("status", "reserva").limit(50)
  if (!reservas?.length) return []
  const ids = reservas.map((r) => r.reserva_de).filter(Boolean)
  const { data: testes } = await db.from("social_scheduled_posts").select("id, ig_account_id, published_media_id, status, updated_at").in("id", ids)
  const porId = new Map((testes || []).map((t) => [t.id, t]))

  const limiares = new Map<string, number>()
  const out: Linha[] = []
  for (const r of reservas) {
    const t = porId.get(r.reserva_de)
    if (!t || t.status !== "published" || !t.published_media_id) continue
    const idade = Date.now() - new Date(t.updated_at).getTime()
    if (idade < MIN_IDADE_MS) continue
    const token = await tokenForAccount(t.ig_account_id)
    if (!token) continue
    if (!limiares.has(t.ig_account_id)) {
      const { data: recentes } = await db.from("social_scheduled_posts").select("published_media_id")
        .eq("ig_account_id", t.ig_account_id).eq("media_type", "REELS").eq("status", "published")
        .not("published_media_id", "is", null).order("updated_at", { ascending: false }).limit(15)
      const vs = (await Promise.all((recentes || []).map((x) => views(x.published_media_id, token)))).filter((v): v is number => v !== null)
      limiares.set(t.ig_account_id, Math.max(MIN_VIEWS, MULT * mediana(vs)))
    }
    const limiar = limiares.get(t.ig_account_id)!
    const v = await views(t.published_media_id, token)
    if (v !== null && v >= limiar) {
      await db.from("social_scheduled_posts").update({
        status: "approved", scheduled_at: proximaJanela(), error: null,
        approved_by: "teste-reserva", approved_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", r.id)
      out.push({ id: r.id, teste: t.id, views: v, limiar, estado: "a publicar" })
    } else if (idade > MAX_IDADE_MS) {
      await db.from("social_scheduled_posts").update({
        status: "expirado", error: `teste não viralizou (${v ?? "sem dados"} views, limiar ${Math.round(limiar)})`, updated_at: new Date().toISOString(),
      }).eq("id", r.id)
      out.push({ id: r.id, teste: t.id, views: v, limiar, estado: "expirado" })
    } else {
      await db.from("social_scheduled_posts").update({ error: `teste: ${v ?? "sem dados"} views (limiar ${Math.round(limiar)})`, updated_at: new Date().toISOString() }).eq("id", r.id)
    }
  }
  return out
}
