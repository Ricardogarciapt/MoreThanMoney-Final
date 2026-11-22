import { NextRequest, NextResponse, after } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { chamarIAGratis, mensagemIndisponivel } from "@/lib/ia/chamar"
import { normalizeLang } from "@/lib/i18n/config"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { juntarMemoria, montarSistema, separarNotas, type ContextoAluno } from "@/lib/mentor/prompt"
import { contextoDoAluno, salasDaSemana } from "@/lib/mentor/contexto-servidor"
import { avisoOcupado } from "@/lib/mentor/ocupado"
import { detetarLingua, limparRaciocinio, respostaNaLingua } from "@/lib/mentor/lingua"

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
    const [{ contexto, memoria }, salas] = await Promise.all([
      contextoDoAluno(userId).catch(() => ({ contexto: {} as ContextoAluno, memoria: "", idiomaPerfil: null })),
      salasDaSemana(),
    ])
    const linguaDetetada = porBotao ? null : detetarLingua(ultima.content)
    const sistema = montarSistema({ langApp, ultimaPorBotao: Boolean(porBotao), contexto, salas, linguaDetetada })

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const pedir = (s: string) =>
            chamarIAGratis({ tarefa: "mentor", sistema: s, mensagens: conversa, maxTokens: 900, temperatura: 0.7, preferencia: "qualidade" })
          let r = await pedir(sistema)
          let limpo = limparRaciocinio(r.texto)
          // 22/11: uma segunda tentativa quando a resposta sai noutra língua ou é raciocínio do modelo.
          const falhaLingua = linguaDetetada && !respostaNaLingua(separarNotas(limpo.texto).resposta, linguaDetetada)
          if (limpo.pareceRaciocinio || falhaLingua) {
            const r2 = await pedir(`${sistema}\n\nIMPORTANT: your previous attempt was rejected${falhaLingua ? " because it was not in the student's language" : " because it showed your reasoning"}. Answer again, directly to the student.`).catch(() => null)
            const l2 = r2 ? limparRaciocinio(r2.texto) : null
            if (r2 && l2 && !l2.pareceRaciocinio) {
              r = r2
              limpo = l2
            }
          }
          const { resposta, notas } = separarNotas(limpo.texto)
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
          // 19/11: o membro NUNCA vê a lista de fornecedores (aparecia «org_…», quotas e URLs).
          // Vê uma frase calma na língua dele; o detalhe vai para os logs e para o Telegram do dono.
          console.error("[mentor] IA indisponível:", mensagemIndisponivel(err))
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: avisoOcupado(langApp) })}\n\n`))
          controller.close()
          after(() => avisarDonoUmaVezPorHora(mensagemIndisponivel(err)))
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

/** Um aviso por hora por instância, para o Telegram do dono não encher se a falha durar. */
let ultimoAvisoEm = 0
async function avisarDonoUmaVezPorHora(detalhe: string) {
  if (Date.now() - ultimoAvisoEm < 3_600_000) return
  ultimoAvisoEm = Date.now()
  const { avisarDono } = await import("@/lib/suporte/servidor")
  await avisarDono(`⚠️ Mentor AI sem resposta: todos os fornecedores grátis falharam.\n\n${detalhe.slice(0, 900)}\n\nPainel: https://www.morethanmoney.pt/admin/mentor`)
}
