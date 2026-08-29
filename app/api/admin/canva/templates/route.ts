import { NextRequest, NextResponse } from "next/server"
import { requireAdmin, getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { getAccessToken } from "@/lib/canva-connect"
import { IG_ACCOUNTS } from "@/lib/instagram/publish"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

/**
 * Que templates existem no Canva, e qual serve cada conta.
 *
 * Sem isto, mapear templates era copiar ids à mão do endereço do Canva para uma variável de
 * ambiente — e um id errado só se descobre quando sai um post com o desenho da conta errada.
 *
 * Lê o que a conta tem MESMO (brand templates + pastas) e deixa escolher de uma lista.
 */

const BASE = "https://api.canva.com/rest/v1"
const CHAVE = "canva_templates"

async function canva(caminho: string, token: string): Promise<{ ok: boolean; dados: Record<string, unknown> }> {
  try {
    const r = await fetch(`${BASE}${caminho}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
    return { ok: r.ok, dados: (await r.json().catch(() => ({}))) as Record<string, unknown> }
  } catch {
    return { ok: false, dados: {} }
  }
}

export async function GET(req: NextRequest) {
  const guarda = await requireAdmin(req)
  if (guarda) return guarda

  const token = await getAccessToken()
  if (!token) return NextResponse.json({ ok: false, erro: "Canva não está ligado" }, { status: 400 })

  const db = getSupabaseAdmin()
  const { data } = await db.from("site_settings").select("value").eq("key", CHAVE).maybeSingle()
  const mapa = ((typeof data?.value === "string" ? JSON.parse(data.value) : data?.value) ?? {}) as Record<string, Record<string, string>>

  const bt = await canva("/brand-templates?limit=100", token)
  const pastas = await canva("/folders/root/items?limit=100", token)

  /**
   * As pastas vêm junto porque é lá que os designs estão organizados por conta. Um design NÃO
   * serve para autofill — só um Brand Template serve — mas mostrar as pastas diz de imediato se
   * o que existe são designs (e portanto falta convertê-los) ou se já são templates.
   */
  const itens = (pastas.dados.items ?? []) as Array<Record<string, unknown>>

  return NextResponse.json({
    ok: true,
    contas: IG_ACCOUNTS.map((a) => ({ id: a.id, username: a.username })),
    mapa,
    templates: ((bt.dados.items ?? []) as Array<Record<string, unknown>>).map((t) => ({
      id: t.id,
      titulo: t.title ?? "(sem título)",
    })),
    pastas: itens
      .filter((i) => i.type === "folder")
      .map((i) => ({ nome: (i.folder as { name?: string })?.name ?? "", id: (i.folder as { id?: string })?.id ?? "" })),
    // Dizer o que a API respondeu evita a pergunta "porque é que a lista está vazia?".
    diagnostico: {
      brandTemplates: bt.ok ? "ok" : "sem permissão ou plano sem Brand Templates",
      pastas: pastas.ok ? "ok" : "sem permissão para ler pastas",
    },
  })
}

export async function POST(req: NextRequest) {
  const guarda = await requireAdmin(req)
  if (guarda) return guarda

  const { conta, formato, templateId } = (await req.json().catch(() => ({}))) as {
    conta?: string
    formato?: string
    templateId?: string
  }
  if (!conta || !formato) return NextResponse.json({ ok: false, erro: "Falta a conta ou o formato" }, { status: 400 })

  const db = getSupabaseAdmin()
  const { data } = await db.from("site_settings").select("value").eq("key", CHAVE).maybeSingle()
  const mapa = ((typeof data?.value === "string" ? JSON.parse(data.value) : data?.value) ?? {}) as Record<string, Record<string, string>>

  mapa[conta] = mapa[conta] ?? {}
  // Vazio APAGA em vez de guardar "": um id vazio passaria na verificação e falhava no Canva.
  if (templateId?.trim()) mapa[conta][formato] = templateId.trim()
  else delete mapa[conta][formato]

  await db.from("site_settings").upsert(
    { key: CHAVE, value: mapa, description: "Template do Canva por conta e formato.", updated_at: new Date().toISOString() },
    { onConflict: "key" },
  )
  return NextResponse.json({ ok: true, mapa })
}
