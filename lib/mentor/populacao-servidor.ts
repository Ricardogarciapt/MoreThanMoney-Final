import { chamarIAGratis } from "@/lib/ia/chamar"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { correrPersona, gerarPersonas, type Avaliacao, type ChamadaIA, type Persona } from "./populacao"

const T = "mentor_teste_populacao"

/** Só IA grátis. Se a quota grátis acabar, a persona fica 'falhou' e o lote segue noutra noite. */
const ia: ChamadaIA = async (p) => {
  const r = await chamarIAGratis({
    tarefa: "mentor-teste-populacao",
    sistema: p.sistema,
    mensagens: p.mensagens,
    json: p.json,
    preferencia: p.preferencia,
    maxTokens: p.json ? 500 : 700,
    temperatura: p.json ? 0.2 : 0.8,
  })
  return { texto: r.texto, fornecedor: r.fornecedor }
}

export async function gerarLote(lote: string, total: number) {
  const db = getSupabaseAdmin()
  const personas = gerarPersonas(total)
  for (let i = 0; i < personas.length; i += 200) {
    const { error } = await db.from(T).insert(personas.slice(i, i + 200).map((persona) => ({ lote, persona })))
    if (error) throw new Error(error.message)
  }
  return personas.length
}

export async function correrPendentes(n: number, voltas = 2) {
  const db = getSupabaseAdmin()
  const { data: pendentes } = await db.from(T).select("id, persona").eq("estado", "pendente").order("created_at").limit(n)
  let feitas = 0
  for (const linha of pendentes || []) {
    try {
      const r = await correrPersona(linha.persona as Persona, ia, voltas)
      await db.from(T).update({ estado: "feito", conversa: r.conversa, avaliacao: r.avaliacao, feito_em: new Date().toISOString() }).eq("id", linha.id)
      feitas++
    } catch (e) {
      // Quota grátis esgotada: pára aqui e volta à próxima corrida (a persona continua pendente).
      await db.from(T).update({ erro: String((e as Error)?.message || e).slice(0, 500) }).eq("id", linha.id)
      break
    }
  }
  return { feitas, pedidas: (pendentes || []).length }
}

export async function lerLote(lote: string) {
  const db = getSupabaseAdmin()
  const linhas: { persona: Persona; avaliacao: Avaliacao | null; estado: string }[] = []
  for (let de = 0; ; de += 1000) {
    const { data } = await db.from(T).select("persona, avaliacao, estado").eq("lote", lote).range(de, de + 999)
    if (!data?.length) break
    linhas.push(...(data as typeof linhas))
    if (data.length < 1000) break
  }
  return linhas
}
