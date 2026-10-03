import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-api-helpers"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { correrRadarProspecao, lerListaPrioritaria } from "@/lib/prospecao/correr-radar"
import { carregarPerfil } from "@/lib/prospecao/perfil-lead"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * A prospeção no Telegram, para o painel.
 *
 * Devolve três coisas: a lista priorizada de quem já nos tocou e não está no funil, o mapa dos
 * grupos, e o diagnóstico de cobertura (que responde à pergunta «a lista está vazia porque não há
 * ninguém, ou porque o bot está cego?»).
 *
 * Não há aqui nenhum endpoint de envio, e é de propósito: um bot do Telegram não pode escrever a
 * quem nunca lhe escreveu, e o MTProto corre na conta pessoal do dono. O que este painel produz é
 * uma decisão, não um disparo.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req)
  if (guard) return guard

  const db = getSupabaseAdmin()
  const chave = req.nextUrl.searchParams.get("perfil")

  // Um perfil concreto: «este quem é, e qual é o próximo passo?»
  if (chave) {
    const perfil = await carregarPerfil(db, chave)
    return perfil
      ? NextResponse.json({ ok: true, perfil })
      : NextResponse.json({ ok: false, erro: "Não encontrei ninguém com essa chave." }, { status: 404 })
  }

  const [lista, { data: grupos }, { data: contactos }] = await Promise.all([
    lerListaPrioritaria(db, 30),
    db.from("prospecao_grupos").select("*").order("nosso", { ascending: false }).order("membros", { ascending: false, nullsFirst: false }).limit(80),
    db.from("prospecao_contactos").select("estado"),
  ])

  const porEstado: Record<string, number> = {}
  for (const c of (contactos ?? []) as Array<{ estado: string }>) {
    porEstado[c.estado] = (porEstado[c.estado] ?? 0) + 1
  }

  return NextResponse.json({
    ok: true,
    lista,
    grupos: grupos ?? [],
    porEstado,
    // O mapa só fica completo com a chave do serviço de diálogos. Dizê-lo no painel evita que se
    // leia uma lista incompleta como se fosse a realidade toda.
    mtprotoLigado: !!process.env.TELEGRAM_DIALOGOS_SECRET?.trim(),
  })
}

/** Marcar um contacto (já falei / não serve), ou correr a arrumação agora. */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req)
  if (guard) return guard

  const corpo = (await req.json().catch(() => ({}))) as {
    tgUserId?: string
    estado?: string
    nota?: string
    correr?: boolean
  }
  const db = getSupabaseAdmin()

  if (corpo.correr) {
    return NextResponse.json({ ok: true, ...(await correrRadarProspecao(db)) })
  }

  if (corpo.tgUserId && corpo.estado) {
    // A allowlist não é cerimónia: `estado` tem um CHECK na base e um valor inventado faria a
    // escrita rebentar com um erro de Postgres em vez de uma resposta que se percebe.
    if (!["novo", "abordado", "ignorado", "no_funil"].includes(corpo.estado)) {
      return NextResponse.json({ ok: false, erro: "Estado desconhecido." }, { status: 400 })
    }
    await db
      .from("prospecao_contactos")
      .update({ estado: corpo.estado, nota: corpo.nota ?? null, updated_at: new Date().toISOString() })
      .eq("tg_user_id", corpo.tgUserId)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, erro: "Nada para fazer." }, { status: 400 })
}
