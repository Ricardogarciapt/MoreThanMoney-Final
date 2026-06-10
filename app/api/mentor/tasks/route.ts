import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

async function getAuthedClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await getAuthedClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

    const body = await request.json()
    const taskId = String(body.taskId || "")
    if (!taskId) return NextResponse.json({ error: "taskId é obrigatório" }, { status: 400 })

    const { data: task, error: taskErr } = await supabase
      .from("mentor_tasks")
      .select("*")
      .eq("id", taskId)
      .eq("user_id", session.user.id)
      .single()
    if (taskErr || !task) return NextResponse.json({ error: taskErr?.message || "Tarefa não encontrada" }, { status: 404 })

    const { data: updatedTask, error: updErr } = await supabase
      .from("mentor_tasks")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", taskId)
      .eq("user_id", session.user.id)
      .select("*")
      .single()
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    await supabase.from("notifications").insert({
      user_id: session.user.id,
      type: "mentor",
      title: "Passo concluído",
      message: `Concluíste: ${updatedTask.title}. Continua o plano nas próximas 72h.`,
      data: { taskId: updatedTask.id, phase: updatedTask.phase },
      read: false,
    })

    return NextResponse.json({ success: true, data: updatedTask })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

