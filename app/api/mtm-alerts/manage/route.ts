import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/supabase"
import { modelCandidates } from "@/lib/mtm-terminal-analysis"

/**
 * Gestão da trade (IA) a pedido — está SEMPRE disponível em cada alerta.
 * Se o sinal já tem `ai_analysis` guardada, devolve-a; caso contrário gera-a
 * na hora com base nos dados do plot (entrada/SL/TPs/confirmações/estado) e
 * guarda-a de volta para reutilização. Não cria variáveis de ambiente novas.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function getSessionUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll() {
            /* read-only */
          },
        },
      }
    )
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session?.user?.id ?? null
  } catch {
    return null
  }
}

const SYSTEM_PROMPT = `És um trader institucional sénior e gestor de risco da MoreThanMoney. Recebes um sinal de um scanner MTM e dás gestão de trade ACIONÁVEL e curta ao membro, em português europeu ("tu"), formato Markdown.

Estrutura (usa exatamente estes títulos, curtos):
### 🎯 Plano
Direção, entrada, invalidação (SL) e alvos. Confirma se o setup é sólido pelas confirmações dadas.
### 🛡️ Gestão de Risco
Onde mover o stop (break-even, trailing), como escalar saídas parciais nos TPs, gestão por confirmação.
### 📌 Estado Atual
Interpreta o estado da trade fornecido (pendente/ativa/exit/loss) e o que fazer AGORA.
### ⚠️ Nota
1 linha de risco/vigilância.

Regras: sê direto e específico com números. Máx ~180 palavras. Termina com: *"⚠️ Educativo, não é aconselhamento financeiro."*`

function buildPrompt(row: Record<string, any>): string {
  const raw = (row.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload : {}) as Record<string, unknown>
  const lines: string[] = []
  lines.push(`Ativo: ${row.ticker ?? "?"}${row.exchange ? ` (${row.exchange})` : ""}`)
  if (row.timeframe) lines.push(`Timeframe: ${row.timeframe}`)
  if (row.action) lines.push(`Direção/Ação: ${row.action}`)
  if (row.price != null) lines.push(`Entrada: ${row.price}`)
  if (row.sl != null) lines.push(`Stop/Invalidação: ${row.sl}`)
  if (row.tp != null) lines.push(`Take-profit: ${row.tp}`)
  if (row.alert_name) lines.push(`Estratégia/Alerta: ${row.alert_name}`)
  if (row.trade_status) lines.push(`Estado atual da trade: ${row.trade_status}`)
  const conf = raw.confirmations
  if (conf) lines.push(`Confirmações: ${JSON.stringify(conf)}`)
  if (row.message) lines.push(`Mensagem: ${String(row.message).slice(0, 400)}`)
  return `Faz a gestão desta trade:\n\n${lines.join("\n")}`
}

async function generate(prompt: string): Promise<{ text: string; model: string } | null> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) return null
  for (const model of modelCandidates()) {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model,
        max_tokens: 700,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      }),
    })
    if (!resp.ok) {
      const body = await resp.text()
      if (resp.status === 404 || body.toLowerCase().includes("not_found") || body.toLowerCase().includes("model:")) continue
      return null
    }
    const json = await resp.json()
    const block = (json.content ?? []).find((b: { type: string }) => b.type === "text")
    const text = (block?.text ?? "").trim()
    if (text) return { text, model }
  }
  return null
}

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId()
  if (!userId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const id = String(body.id || "").trim()
  if (!id) return NextResponse.json({ error: "id em falta" }, { status: 400 })

  try {
    const admin = getSupabaseAdmin()
    const { data: row, error } = await admin
      .from("tradingview_signals")
      .select("id, ticker, exchange, timeframe, action, price, sl, tp, alert_name, message, ai_management, ai_management_state, raw_payload, trade_status")
      .eq("id", id)
      .maybeSingle()

    if (error || !row) return NextResponse.json({ error: "Sinal não encontrado" }, { status: 404 })

    // Gestão guardada para o ESTADO ATUAL da trade e sem refresh → devolve-a.
    // Re-gera quando o estado muda (ativa→BE→TP→SL) → fica sempre sincronizada.
    if (row.ai_management && row.ai_management_state === (row.trade_status ?? null) && !body.refresh) {
      return NextResponse.json({ success: true, analysis: row.ai_management, cached: true })
    }

    const result = await generate(buildPrompt(row))
    if (!result) {
      return NextResponse.json(
        { error: "Gestão IA indisponível de momento. Tenta novamente." },
        { status: 503 }
      )
    }

    // Guarda para reutilização (best-effort)
    try {
      await admin
        .from("tradingview_signals")
        .update({ ai_management: result.text, ai_management_state: row.trade_status ?? null })
        .eq("id", id)
    } catch {
      /* best-effort */
    }

    return NextResponse.json({ success: true, analysis: result.text, model: result.model, cached: false })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    )
  }
}
