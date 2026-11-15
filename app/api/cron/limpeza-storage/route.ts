import { NextRequest, NextResponse } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

/**
 * CRON diário: limpa o Storage do Supabase (5/11/2026 — estava a 1,13 GB num plano de 1 GB).
 *
 * A escolha do que sai está toda na função SQL `limpeza_storage_candidatos` (migração 233):
 * áudio da dobragem das lives com mais de 60 dias, média de posts já publicados no Instagram
 * que nada mais usa, e ficheiros soltos com mais de 60 dias. Capas e imagens das aulas
 * (lms-assets) nunca entram.
 *
 * Apaga pela API do Storage, em lotes, e no fim limpa os links de áudio das legendas antigas
 * para que nenhuma página aponte para um mp3 que já não existe.
 *
 * `?seco=1` só conta, não apaga.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const DIAS = 60
const LOTE = 500
const RONDAS_MAX = 30

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const supabase = getSupabaseAdmin()
  const seco = request.nextUrl.searchParams.get("seco") === "1"
  const porMotivo: Record<string, { ficheiros: number; mb: number }> = {}
  const erros: string[] = []
  let total = 0

  for (let ronda = 0; ronda < RONDAS_MAX; ronda++) {
    const { data, error } = await supabase.rpc("limpeza_storage_candidatos", {
      p_dias: DIAS,
      p_dias_publicado: 7,
      p_limite: seco ? 20000 : LOTE,
    })
    if (error) {
      erros.push(`candidatos: ${error.message}`)
      break
    }
    const linhas = (data ?? []) as Array<{ bucket: string; path: string; motivo: string; bytes: number }>
    if (linhas.length === 0) break

    for (const l of linhas) {
      const m = (porMotivo[l.motivo] ??= { ficheiros: 0, mb: 0 })
      m.ficheiros++
      m.mb += Number(l.bytes) / 1_048_576
    }
    if (seco) break

    const porBucket = new Map<string, string[]>()
    for (const l of linhas) {
      const lista = porBucket.get(l.bucket) ?? []
      lista.push(l.path)
      porBucket.set(l.bucket, lista)
    }
    let apagadosNestaRonda = 0
    for (const [bucket, paths] of porBucket) {
      const { data: feitos, error: e } = await supabase.storage.from(bucket).remove(paths)
      if (e) erros.push(`${bucket}: ${e.message}`)
      apagadosNestaRonda += feitos?.length ?? 0
    }
    total += apagadosNestaRonda
    // Se nada saiu nesta ronda, a próxima devolvia os mesmos ficheiros: parar.
    if (apagadosNestaRonda === 0) break
  }

  // Links de áudio das legendas antigas: o mp3 já saiu (ou sai nesta corrida).
  let legendas: string | number = "seco"
  if (!seco) {
    const corte = new Date(Date.now() - DIAS * 86_400_000).toISOString()
    const { error, count } = await supabase
      .from("lms_stream_captions")
      .update({ audio: null }, { count: "exact" })
      .lt("created_at", corte)
      .not("audio", "is", null)
    legendas = error ? `erro: ${error.message}` : (count ?? 0)
  }

  for (const m of Object.values(porMotivo)) m.mb = Math.round(m.mb * 10) / 10
  return NextResponse.json({ ok: erros.length === 0, seco, apagados: total, porMotivo, legendasSemAudio: legendas, erros })
}
