import { NextRequest, NextResponse, after } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { chamarIAGratis, mensagemIndisponivel } from "@/lib/ia/chamar"
import { normalizeLang } from "@/lib/i18n/config"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { juntarMemoria, montarSistema, separarNotas, type ContextoAluno } from "@/lib/mentor/prompt"

/**
 * MENTOR MTM — o agente pessoal de cada aluno (revisão de 17/11, ver `lib/mentor/prompt.ts`).
 *
 *  · Só IA GRÁTIS (`chamarIAGratis`: Groq → Gemini → Ollama). Se todas falharem, o aluno vê uma
 *    frase honesta; nunca cai num fornecedor pago. Custo zero para a MTM, por decisão do dono.
 *  · O contexto do aluno vem do SERVIDOR (perfil, plano, memória, tarefas), não do browser.
 *  · A conversa fica guardada em `mentor_mensagens` (o Mentor lembra-se; o aluno pode apagar) e
 *    os sinais das notas escondidas vão para `mentor_sinais` (educação, follow-up, upgrade,
 *    testemunhos). Guardar nunca atrasa nem impede a resposta.
 *
 * O cliente continua a receber SSE `text`/`done`/`error` como antes.
 */

type MensagemCliente = { role: "user" | "assistant"; content: string }

async function getAuthedClient() {
  const cookieStore = await cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
      },
    },
  })
}

async function contextoDoAluno(userId: string): Promise<{ contexto: ContextoAluno; memoria: string }> {
  const db = getSupabaseAdmin()
  const [{ data: perfil }, { data: mentor }, { data: tarefas }] = await Promise.all([
    db.from("profiles").select("full_name, user_type, created_at").eq("id", userId).maybeSingle(),
    db.from("mentor_profiles").select("objetivo, tempo_diario, fase_trading, memoria").eq("user_id", userId).maybeSingle(),
    db.from("mentor_tasks").select("title").eq("user_id", userId).eq("status", "pending").order("due_at").limit(3),
  ])
  const dias = perfil?.created_at ? Math.floor((Date.now() - new Date(perfil.created_at).getTime()) / 86_400_000) : null
  const memoria = (mentor?.memoria as string | null) || ""
  return {
    memoria,
    contexto: {
      primeiroNome: (perfil?.full_name as string | null)?.trim().split(/\s+/)[0] || null,
      plano: (perfil?.user_type as string | null) || null,
      diasDesdeEntrada: dias,
      objetivo: mentor?.objetivo ?? null,
      tempoDiario: mentor?.tempo_diario ?? null,
      faseTrading: mentor?.fase_trading ?? null,
      memoria,
      tarefasPendentes: (tarefas || []).map((t) => t.title as string),
    },
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await getAuthedClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    const userId = session.user.id

    const body = await request.json()
    // `mentorContext` (ranks/PE/CV) de clientes antigos é ignorado: o contexto vem do servidor.
    const { messages, idioma, porBotao } = body as { idioma?: string; porBotao?: boolean; messages: MensagemCliente[] }
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Mensagens inválidas" }, { status: 400 })
    }
    // Só as últimas 20 trocas seguem para a IA (os gratuitos têm janela curta); a memória cobre o resto.
    const conversa = messages
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
    const ultima = conversa[conversa.length - 1]
    if (!ultima || ultima.role !== "user") return NextResponse.json({ error: "Mensagens inválidas" }, { status: 400 })

    const langApp = normalizeLang(idioma)
    const { contexto, memoria } = await contextoDoAluno(userId).catch(() => ({ contexto: {} as ContextoAluno, memoria: "" }))
    const sistema = montarSistema({ langApp, ultimaPorBotao: Boolean(porBotao), contexto })

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const r = await chamarIAGratis({
            tarefa: "mentor",
            sistema,
            mensagens: conversa,
            maxTokens: 900,
            temperatura: 0.7,
            preferencia: "qualidade",
          })
          const { resposta, notas } = separarNotas(r.texto)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", text: resposta })}\n\n`))
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", fornecedor: r.fornecedor, emReserva: r.emReserva })}\n\n`))
          controller.close()
          // Guardar DEPOIS de entregar (`after` mantém a função viva na Vercel): a base de dados
          // nunca atrasa nem impede a resposta.
          after(() =>
            guardar(userId, ultima.content, resposta, notas, memoria, r.fornecedor, Boolean(porBotao)).catch((e) =>
              console.error("[mentor] guardar falhou:", e?.message || e)
            )
          )
        } catch (err) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: mensagemIndisponivel(err) })}\n\n`))
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    })
  } catch (error) {
    console.error("Erro no Mentor AI Chat:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}

async function guardar(
  userId: string,
  pergunta: string,
  resposta: string,
  notas: ReturnType<typeof separarNotas>["notas"],
  memoria: string,
  fornecedor: string,
  porBotao: boolean
) {
  const db = getSupabaseAdmin()
  const lingua = notas?.lingua || null
  const { data: msgs } = await db
    .from("mentor_mensagens")
    .insert([
      { user_id: userId, role: "user", content: pergunta, idioma: lingua, por_botao: porBotao },
      { user_id: userId, role: "assistant", content: resposta, idioma: lingua, fornecedor },
    ])
    .select("id, role")
  const idPergunta = msgs?.find((m) => m.role === "user")?.id ?? null

  const updates: Record<string, unknown> = { ultima_conversa_em: new Date().toISOString() }
  if (lingua) updates.idioma = lingua
  if (notas?.lembrar) updates.memoria = juntarMemoria(memoria, notas.lembrar)
  await db.from("mentor_profiles").upsert({ user_id: userId, ...updates }, { onConflict: "user_id" })

  if (notas?.sinais.length) {
    await db.from("mentor_sinais").insert(
      notas.sinais.map((s) => ({
        user_id: userId,
        mensagem_id: idPergunta,
        tipo: s.tipo,
        tema: s.tema,
        resumo: s.resumo,
        consentiu: s.consentiu ?? null,
        idioma: lingua,
      }))
    )
  }
}
