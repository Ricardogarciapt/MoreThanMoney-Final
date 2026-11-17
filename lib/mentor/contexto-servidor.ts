import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import type { ContextoAluno } from "./prompt"

/** O que o Mentor sabe do aluno, lido no servidor (nunca confiado ao browser). */
export async function contextoDoAluno(userId: string): Promise<{ contexto: ContextoAluno; memoria: string; idiomaPerfil: string | null }> {
  const db = getSupabaseAdmin()
  const [{ data: perfil }, { data: mentor }, { data: tarefas }] = await Promise.all([
    db.from("profiles").select("full_name, user_type, created_at, preferred_language").eq("id", userId).maybeSingle(),
    db.from("mentor_profiles").select("objetivo, tempo_diario, fase_trading, memoria").eq("user_id", userId).maybeSingle(),
    db.from("mentor_tasks").select("title").eq("user_id", userId).eq("status", "pending").order("due_at").limit(3),
  ])
  const dias = perfil?.created_at ? Math.floor((Date.now() - new Date(perfil.created_at).getTime()) / 86_400_000) : null
  const memoria = (mentor?.memoria as string | null) || ""
  return {
    memoria,
    idiomaPerfil: (perfil?.preferred_language as string | null) || null,
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

let cacheSalas: { em: number; salas: { titulo: string; academia: string | null; quando: string | null }[] } | null = null

/** Salas ao vivo dos próximos 7 dias (cache de 10 min por instância; falha = lista vazia). */
export async function salasDaSemana() {
  if (cacheSalas && Date.now() - cacheSalas.em < 600_000) return cacheSalas.salas
  try {
    const db = getSupabaseAdmin()
    const agora = new Date()
    const { data } = await db
      .from("lms_streams")
      .select("title, scheduled_start_at, academy:lms_academies(name, slug)")
      .gte("scheduled_start_at", agora.toISOString())
      .lte("scheduled_start_at", new Date(agora.getTime() + 7 * 86_400_000).toISOString())
      .order("scheduled_start_at")
      .limit(20)
    const salas = (data || [])
      .filter((s: any) => s?.academy?.slug !== "network-marketing")
      .map((s: any) => ({
        titulo: String(s.title),
        academia: s.academy?.name ?? null,
        quando: s.scheduled_start_at
          ? new Date(s.scheduled_start_at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) + " (Lisboa)"
          : null,
      }))
    cacheSalas = { em: Date.now(), salas }
    return salas
  } catch {
    return []
  }
}
