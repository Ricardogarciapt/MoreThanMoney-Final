import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin, isValidUUID, requireAdmin } from "@/lib/admin-api-helpers"
import { sortLmsAcademiesByOfficialOrder } from "@/lib/lms-academies"
import { caminhoNoStorage, decidirCapa } from "@/lib/lms/capa-academia"

const supabase = getSupabaseAdmin()

/**
 * O URL da capa aponta para um ficheiro que EXISTE?
 *
 * Um `<img src>` para um 404 não dá erro em sítio nenhum — dá um rectângulo vazio na secção da
 * academia, e descobre-se quando um cliente pergunta. Para as capas que vivem no nosso storage
 * dá-se um salto a confirmar antes de gravar: `createSignedUrl` só assina objectos que existem.
 *
 * Imagens de fora (ou um caminho local) não têm caminho nosso para confirmar, e por isso passam —
 * recusá-las aqui era inventar uma regra que nunca existiu.
 */
async function capaExiste(url: string | null): Promise<{ existe: boolean; motivo?: string }> {
  const alvo = caminhoNoStorage(url)
  if (!alvo) return { existe: true }

  const { error } = await supabase.storage.from(alvo.bucket).createSignedUrl(alvo.path, 60)
  if (error) {
    console.warn("[academies] capa aponta para ficheiro inexistente", alvo, error.message)
    return {
      existe: false,
      motivo: "A imagem indicada já não existe no storage. Carrega o ficheiro outra vez.",
    }
  }
  return { existe: true }
}

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const { data, error } = await supabase.from("lms_academies").select("*")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const sorted = sortLmsAcademiesByOfficialOrder(data || [])
  return NextResponse.json({ success: true, data: sorted })
}

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const body = await request.json()
    const name = String(body.name || "").trim()
    const description = String(body.description || "").trim()
    const slug = String(body.slug || name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")).trim()

    if (!name || !slug) {
      return NextResponse.json({ error: "name e slug são obrigatórios" }, { status: 400 })
    }

    // A capa é opcional ao criar, mas se vier tem de ser real: criar a academia e ignorar uma capa
    // inválida deixava-a nascer sem capa com o admin convencido do contrário.
    const decisao = decidirCapa({ capaAtual: null, capaEscolhida: body.cover_url, uploadFalhou: Boolean(body.upload_falhou) })
    if (decisao.motivo) return NextResponse.json({ error: decisao.motivo }, { status: 400 })

    const confirmada = await capaExiste(decisao.valor)
    if (!confirmada.existe) return NextResponse.json({ error: confirmada.motivo }, { status: 400 })

    const { data, error } = await supabase
      .from("lms_academies")
      .insert({ name, slug, description: description || null, cover_url: decisao.valor })
      .select("*")
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const body = await request.json()
    const id = String(body.id || "").trim()
    if (!isValidUUID(id)) return NextResponse.json({ error: "id deve ser um UUID válido." }, { status: 400 })

    const { data: atual, error: lerErro } = await supabase
      .from("lms_academies")
      .select("id, cover_url")
      .eq("id", id)
      .maybeSingle()

    if (lerErro) return NextResponse.json({ error: lerErro.message }, { status: 500 })
    if (!atual) return NextResponse.json({ error: "Academia não encontrada." }, { status: 404 })

    const patch: Record<string, unknown> = {}

    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      const name = String(body.name || "").trim()
      // Nome em branco apagava o nome da academia na lista toda. Não se grava vazio por acidente.
      if (!name) return NextResponse.json({ error: "O nome não pode ficar em branco." }, { status: 400 })
      patch.name = name
    }

    if (Object.prototype.hasOwnProperty.call(body, "description")) {
      const desc = String(body.description ?? "").trim()
      patch.description = desc || null
    }

    if (Object.prototype.hasOwnProperty.call(body, "cover_url") || body.upload_falhou) {
      const decisao = decidirCapa({
        capaAtual: atual.cover_url,
        capaEscolhida: body.cover_url,
        uploadFalhou: Boolean(body.upload_falhou),
      })

      // Upload falhado ou URL inválido: RECUSA com motivo. Nunca «fica como estava» em silêncio,
      // que é o que faz o admin sair convencido de que trocou a capa.
      if (decisao.motivo) return NextResponse.json({ error: decisao.motivo }, { status: 400 })

      if (decisao.gravar) {
        const confirmada = await capaExiste(decisao.valor)
        if (!confirmada.existe) return NextResponse.json({ error: confirmada.motivo }, { status: 400 })
        patch.cover_url = decisao.valor
      }
    }

    // Nada mudou: devolve-se a academia como está em vez de um UPDATE vazio (que o PostgREST
    // responde sem linhas e dá a parecer que a academia desapareceu).
    if (Object.keys(patch).length === 0) {
      const { data } = await supabase.from("lms_academies").select("*").eq("id", id).single()
      return NextResponse.json({ success: true, data, unchanged: true })
    }

    const { data, error } = await supabase
      .from("lms_academies")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}
