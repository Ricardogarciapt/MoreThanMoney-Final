import { NextRequest, NextResponse } from "next/server"
import { verifyAgentAccess } from "@/lib/agent-site-api"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

/**
 * O QUE OS ALUNOS DIZEM AO MENTOR — para a gestão (educação, onboarding, follow-up, upgrade,
 * testemunhos). Auth: sessão de admin ou Bearer AGENT_SITE_API_KEY (os agentes do AIOS lêem daqui).
 *
 *  GET ?dias=30 → contagens por tipo, temas mais repetidos (pauta da reunião de educação) e as
 *                 listas por tratar: quem precisa de uma pessoa, quem está em risco, quem quer
 *                 subir de plano e quem ACEITOU partilhar a história.
 *  POST {acao:'tratar', id, por?} → marca um sinal como tratado.
 *
 * Testemunhos: `consentiu=true` é só autorização para a equipa CONTACTAR o aluno. Publicar exige
 * a autorização escrita do costume (texto final + nome/foto aprovados por ele).
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Sinal = { id: string; user_id: string; tipo: string; tema: string | null; resumo: string | null; consentiu: boolean | null; idioma: string | null; tratado: boolean; created_at: string }

export async function GET(req: NextRequest) {
  const a = await verifyAgentAccess(req)
  if ("error" in a) return NextResponse.json({ ok: false, erro: a.error }, { status: a.status })
  const db = getSupabaseAdmin()
  const dias = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("dias")) || 30))
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString()

  const [{ data: sinais, error }, { count: alunosAtivos }, { count: mensagens }] = await Promise.all([
    db.from("mentor_sinais").select("id, user_id, tipo, tema, resumo, consentiu, idioma, tratado, created_at").gte("created_at", desde).order("created_at", { ascending: false }).limit(2000),
    db.from("mentor_profiles").select("user_id", { count: "exact", head: true }).gte("ultima_conversa_em", desde),
    db.from("mentor_mensagens").select("id", { count: "exact", head: true }).gte("created_at", desde).eq("role", "user"),
  ])
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  const lista = (sinais || []) as Sinal[]

  const porTipo: Record<string, number> = {}
  const temas = new Map<string, number>()
  const idiomas: Record<string, number> = {}
  for (const s of lista) {
    porTipo[s.tipo] = (porTipo[s.tipo] || 0) + 1
    if (s.idioma) idiomas[s.idioma] = (idiomas[s.idioma] || 0) + 1
    if (s.tipo === "duvida_educativa" && s.tema) {
      const k = s.tema.toLowerCase().trim()
      temas.set(k, (temas.get(k) || 0) + 1)
    }
  }

  // Nomes para quem vai fazer o follow-up (só o necessário: nome e email).
  const ids = [...new Set(lista.filter((s) => !s.tratado).map((s) => s.user_id))].slice(0, 300)
  const { data: perfis } = ids.length ? await db.from("profiles").select("id, full_name, email").in("id", ids) : { data: [] }
  const quem = new Map((perfis || []).map((p: { id: string; full_name: string | null; email: string | null }) => [p.id, { nome: p.full_name, email: p.email }]))
  const porTratar = (tipos: string[], filtro: (s: Sinal) => boolean = () => true) =>
    lista.filter((s) => !s.tratado && tipos.includes(s.tipo) && filtro(s)).slice(0, 50).map((s) => ({ ...s, aluno: quem.get(s.user_id) || null }))

  return NextResponse.json({
    ok: true,
    dias,
    alunosAtivos: alunosAtivos ?? 0,
    mensagensDeAlunos: mensagens ?? 0,
    porTipo,
    idiomas,
    pautaEducacao: [...temas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([tema, n]) => ({ tema, n })),
    acompanhamento: porTratar(["pedido_humano", "emocao", "risco", "bloqueio"]),
    upgrade: porTratar(["interesse_upgrade"]),
    testemunhos: porTratar(["testemunho_possivel", "resultado"], (s) => s.tipo === "resultado" || s.consentiu === true),
    feedbackProduto: porTratar(["feedback_produto"]),
  })
}

export async function POST(req: NextRequest) {
  const a = await verifyAgentAccess(req)
  if ("error" in a) return NextResponse.json({ ok: false, erro: a.error }, { status: a.status })
  const body = (await req.json().catch(() => ({}))) as { acao?: string; id?: string; por?: string }
  if (body.acao !== "tratar" || !body.id) return NextResponse.json({ ok: false, erro: "acao/id em falta" }, { status: 400 })
  const { error } = await getSupabaseAdmin().from("mentor_sinais").update({ tratado: true, tratado_por: body.por || "admin" }).eq("id", body.id)
  return NextResponse.json(error ? { ok: false, erro: error.message } : { ok: true })
}
