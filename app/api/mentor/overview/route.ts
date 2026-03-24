import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { MENTOR_72H_TASKS } from "@/lib/mentor-plan"

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
          target_rank: "rising_star",
          current_rank: "starter",
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
        rankGoals: {
          rising_star: "2 PE Left, 2 PE Right",
          bronze_star: "2 PE Left, 2 PE Right + 700 CV em cada perna",
        },
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
    const allowed = ["phase", "target_rank", "current_rank", "pe_left", "pe_right", "cv_left", "cv_right"] as const
    for (const field of allowed) {
      if (body[field] !== undefined) updates[field] = body[field]
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("mentor_profiles")
      .update(updates)
      .eq("user_id", session.user.id)
      .select("*")
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

