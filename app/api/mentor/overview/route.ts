import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { MENTOR_72H_TASKS } from "@/lib/mentor-plan"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

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

export async function GET() {
  try {
    const supabase = await getAuthedClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

    const userId = session.user.id
    const now = new Date()

    const { data: profileExisting } = await supabase
      .from("mentor_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()

    let profile = profileExisting
    if (!profile) {
      const { data: created, error: profileErr } = await supabase
        .from("mentor_profiles")
        .insert({
          user_id: userId,
          phase: "onboarding",
        })
        .select("*")
        .single()
      if (profileErr || !created) return NextResponse.json({ error: profileErr?.message || "Erro ao criar perfil mentor" }, { status: 500 })
      profile = created
    }

    // Seed de tarefas 72h (idempotente por unique user_id+code)
    const tasksPayload = MENTOR_72H_TASKS.map((t) => ({
      user_id: userId,
      code: t.code,
      title: t.title,
      description: t.description,
      phase: t.phase,
      due_at: new Date(now.getTime() + t.dueHours * 3600 * 1000).toISOString(),
      xp_reward: t.xpReward,
      source: "system",
    }))
    await supabase.from("mentor_tasks").upsert(tasksPayload, { onConflict: "user_id,code", ignoreDuplicates: true })

    // Até 17/11 o plano era de network marketing («Registar 10 leads», «Plano Rising Star»…): 41 alunos
    // ainda tinham esses títulos guardados. As tarefas de sistema seguem SEMPRE o texto actual do plano.
    const { data: antigas } = await supabase
      .from("mentor_tasks")
      .select("id, code, title, description")
      .eq("user_id", userId)
      .eq("source", "system")
    for (const t of antigas || []) {
      const seed = MENTOR_72H_TASKS.find((s) => s.code === t.code)
      if (seed && (t.title !== seed.title || t.description !== seed.description)) {
        await supabase.from("mentor_tasks").update({ title: seed.title, description: seed.description }).eq("id", t.id)
      }
    }

    // A conversa guardada (o Mentor lembra-se de ti entre sessões e aparelhos).
    const { data: historico } = await supabase
      .from("mentor_mensagens")
      .select("id, role, content, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(40)

    const { data: tasks, error: tasksErr } = await supabase
      .from("mentor_tasks")
      .select("*")
      .eq("user_id", userId)
      .order("due_at", { ascending: true })

    if (tasksErr) return NextResponse.json({ error: tasksErr.message }, { status: 500 })

    const completed = (tasks || []).filter((t) => t.status === "completed").length
    const total = (tasks || []).length || 1
    const progressPercent = Math.round((completed * 100) / total)

    return NextResponse.json({
      success: true,
      data: {
        profile,
        tasks: tasks || [],
        progressPercent,
        historico: (historico || []).reverse(),
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await getAuthedClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

    const body = await request.json()
    const updates: Record<string, unknown> = {}
    // As respostas do arranque do Mentor. Os campos de rank/PE/CV saíram (17/11): eram de network marketing.
    const allowed = ["phase", "objetivo", "tempo_diario", "fase_trading"] as const
    for (const field of allowed) {
      if (typeof body[field] === "string") updates[field] = body[field].slice(0, 200)
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("mentor_profiles")
      .upsert({ user_id: session.user.id, ...updates }, { onConflict: "user_id" })
      .select("*")
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}


/** O aluno apaga a conversa e o que o Mentor guardou dele (RGPD: direito ao apagamento). */
export async function DELETE() {
  try {
    const supabase = await getAuthedClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    const userId = session.user.id
    const { error } = await supabase.from("mentor_mensagens").delete().eq("user_id", userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await supabase.from("mentor_profiles").update({ memoria: null }).eq("user_id", userId)
    // Os sinais derivados das conversas também saem (só o servidor lhes chega).
    await getSupabaseAdmin().from("mentor_sinais").delete().eq("user_id", userId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}
