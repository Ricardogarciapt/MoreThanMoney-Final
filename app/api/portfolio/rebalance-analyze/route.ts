import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { modeloClaude } from '@/lib/modelo-claude'

const ANTHROPIC_VERSION = "2023-06-01"

function visionModel(): string {
  return modeloClaude(process.env.ANTHROPIC_VISION_MODEL)
}

function textModel(): string {
  return modeloClaude()
}

/** Modelo preferido para análise completa de portefólio (maior qualidade JSON + raciocínio). */
function portfolioAnalysisModel(): string {
  // Mantém a cadeia das duas variáveis; o que deixa de ser escrito à mão é o recurso.
  return modeloClaude(process.env.ANTHROPIC_PORTFOLIO_MODEL || process.env.ANTHROPIC_VISION_MODEL)
}

type ImagePart = { media_type: string; data: string }

type PositionInput = {
  symbol: string
  name?: string
  quantity: number
  avg_price: number
  asset_type?: "crypto" | "etf" | "stock" | "other"
}

function parseJsonFromAssistant(raw: string): unknown {
  const t = raw.trim()
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t)
  const body = fence ? fence[1].trim() : t
  return JSON.parse(body)
}

async function fetchFearGreed(): Promise<{ value: number; classification: string } | null> {
  try {
    const r = await fetch("https://api.alternative.me/fng/?limit=1", { next: { revalidate: 3600 } })
    if (!r.ok) return null
    const j = (await r.json()) as { data?: { value?: string; value_classification?: string }[] }
    const d = j?.data?.[0]
    if (!d?.value) return null
    return { value: Number(d.value), classification: String(d.value_classification || "") }
  } catch {
    return null
  }
}

async function callAnthropicJson(args: {
  system: string
  userText: string
  images?: ImagePart[]
  maxTokens: number
  /** Força modelo (ex.: análise completa de portefólio em texto). */
  modelOverride?: string
}): Promise<{ text: string } | { error: string; status: number }> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) {
    return { error: "Serviço de IA não configurado (ANTHROPIC_API_KEY).", status: 503 }
  }

  const model =
    args.modelOverride ||
    (args.images?.length ? visionModel() : textModel())

  const userContent: unknown[] = []
  if (args.images?.length) {
    for (const img of args.images.slice(0, 6)) {
      const media =
        img.media_type === "image/png" || img.media_type === "image/jpeg" || img.media_type === "image/webp"
          ? img.media_type
          : "image/jpeg"
      userContent.push({
        type: "image",
        source: { type: "base64", media_type: media, data: img.data },
      })
    }
  }
  userContent.push({ type: "text", text: args.userText })

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: args.maxTokens,
      system: args.system,
      messages: [{ role: "user", content: userContent }],
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error("[rebalance-analyze] Anthropic error:", res.status, errText)
    return { error: "Falha ao contactar o modelo de IA.", status: 502 }
  }

  const data = (await res.json()) as { content?: { type: string; text?: string }[] }
  const text = data.content?.find((b) => b.type === "text")?.text?.trim() || ""
  if (!text) return { error: "Resposta vazia do modelo.", status: 502 }
  return { text }
}

export async function POST(request: NextRequest) {
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
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          },
        },
      }
    )

    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const body = (await request.json()) as {
      mode?: "import" | "analyze" | "analyze_portfolio_ai"
      positions?: PositionInput[]
      csvText?: string
      imageParts?: ImagePart[]
      monthlyBudgetEur?: number
      mtmSnapshot?: { symbol: string; name: string; entry_price?: number; current_price?: number; category?: string }[]
      notes?: string
      /** Modo PortfolioAI (HTML): análise completa num único JSON */
      portfolioType?: "crypto" | "etf" | "mixed"
      inputKind?: "manual" | "csv" | "image"
      dcaCapitalUsd?: number
      dcaFrequency?: "weekly" | "biweekly" | "monthly"
      manualAssets?: { ticker: string; qty: number; avgPrice: number; name?: string }[]
    }

    const mode = body.mode === "analyze_portfolio_ai"
      ? "analyze_portfolio_ai"
      : body.mode === "analyze"
        ? "analyze"
        : "import"

    if (mode === "analyze_portfolio_ai") {
      const portfolioType = body.portfolioType || "crypto"
      const inputKind = body.inputKind || "manual"
      const dcaCapitalUsd =
        typeof body.dcaCapitalUsd === "number" && Number.isFinite(body.dcaCapitalUsd) ? body.dcaCapitalUsd : 0
      const dcaFrequency = body.dcaFrequency || "monthly"
      const csv = typeof body.csvText === "string" ? body.csvText.slice(0, 400_000) : ""
      const images = Array.isArray(body.imageParts) ? body.imageParts : []
      const manual = Array.isArray(body.manualAssets) ? body.manualAssets : []

      for (const im of images) {
        if (typeof im?.data !== "string" || im.data.length > 6_000_000) {
          return NextResponse.json({ error: "Imagem inválida ou demasiado grande." }, { status: 400 })
        }
      }

      if (inputKind === "manual") {
        const ok = manual.filter(
          (a) =>
            a &&
            typeof a.ticker === "string" &&
            a.ticker.trim() &&
            typeof a.qty === "number" &&
            a.qty > 0
        )
        if (ok.length === 0) {
          return NextResponse.json({ error: "Adiciona pelo menos um ativo (ticker + quantidade)." }, { status: 400 })
        }
      } else if (inputKind === "csv") {
        if (!csv.trim()) {
          return NextResponse.json({ error: "Envia o conteúdo CSV." }, { status: 400 })
        }
      } else if (inputKind === "image") {
        if (images.length === 0) {
          return NextResponse.json({ error: "Envia pelo menos uma imagem." }, { status: 400 })
        }
      }

      const fg = await fetchFearGreed()

      const system = `És um especialista em análise de portfólios (cripto, ETFs e mistos) para utilizadores da MoreThanMoney em Portugal.
Escreve conteúdo para humanos em português europeu (pt-PT). Sê objetivo e prudente: não garantas retornos; não é aconselhamento financeiro personalizado.
Estima preços atuais razoáveis quando necessário (conhecimento até à tua data de corte). Calcula totais e alocações de forma coerente.

Responde APENAS com JSON válido UTF-8, sem markdown, sem texto fora do JSON, neste formato exato:
{
  "assets": [
    {"ticker":"ETH","name":"Ethereum","qty":0.08,"avgPrice":4471,"currentPrice":1977,"type":"crypto"}
  ],
  "totalValue": 0,
  "totalPnL": 0,
  "totalPnLPct": 0,
  "allocations": [
    {"ticker":"ETH","currentPct":0,"targetPct":0,"action":"buy","dcaAmount":0,"reasoning":"texto curto em pt-PT"}
  ],
  "aiAnalysis": "3 a 5 parágrafos em pt-PT: mercado, posições principais, DCA/rebalanceamento, riscos, horizonte.",
  "riskScore": 5,
  "diversificationScore": 5
}
Regras:
- action em allocations: apenas "buy", "sell", "hold", "reduce" (inglês minúsculo).
- type em assets: "crypto" | "etf" | "stock" | "other".
- Se faltar preço médio num ativo manual, estima de forma conservadora e explica brevemente em aiAnalysis.
- Os campos fearGreedIndex e marketSentiment serão preenchidos pelo servidor; podes omiti-los ou usar null.`

      let userBlock = ""
      if (inputKind === "manual") {
        userBlock = `Ativos (entrada manual):\n${JSON.stringify(
          manual.map((a) => ({
            ticker: String(a.ticker).toUpperCase().trim(),
            qty: a.qty,
            avgPrice: a.avgPrice,
            name: a.name,
          })),
          null,
          2
        )}`
      } else if (inputKind === "csv") {
        userBlock = `Dados CSV (exportação de corretora, até 3000 chars iniciais):\n${csv.slice(0, 3000)}${csv.length > 3000 ? "\n... [truncado]" : ""}`
      } else {
        userBlock = `Extrai todos os ativos visíveis nas imagens (ticker, quantidades, preços médios e atuais se existirem). Depois produz o JSON completo pedido.`
      }

      const contextExtra = body.mtmSnapshot?.length
        ? `\n\nContexto opcional (portefólio MTM Pro do site — referência):\n${JSON.stringify(body.mtmSnapshot.slice(0, 25), null, 2)}`
        : ""

      const userText = `${userBlock}

Tipo de portefólio declarado: ${portfolioType}
Capital disponível para DCA (USD): ${dcaCapitalUsd}
Frequência DCA: ${dcaFrequency}
${body.notes ? `Notas do utilizador: ${body.notes}` : ""}
${contextExtra}

Distribui allocations[].dcaAmount (USD) de forma coerente com o capital DCA e a frequência (valores por período conforme a frequência indicada).

Índice Fear & Greed real (API): valor=${fg?.value ?? "desconhecido"}, classificação=${fg?.classification ?? "n/a"} — incorpora isto na narrativa em aiAnalysis; o JSON final será harmonizado no servidor.`

      const useVision = inputKind === "image" && images.length > 0
      const ai = await callAnthropicJson({
        system,
        userText,
        images: useVision ? images : undefined,
        maxTokens: 8192,
        modelOverride: useVision ? undefined : portfolioAnalysisModel(),
      })
      if ("error" in ai) {
        return NextResponse.json({ error: ai.error }, { status: ai.status })
      }
      try {
        const parsed = parseJsonFromAssistant(ai.text) as Record<string, unknown>
        const out = { ...parsed }
        if (fg) {
          out.fearGreedIndex = fg.value
          out.marketSentiment = fg.classification
        }
        return NextResponse.json({ success: true, portfolioAi: out })
      } catch (e) {
        console.error("[rebalance-analyze] analyze_portfolio_ai parse", e)
        return NextResponse.json(
          { error: "Não foi possível interpretar a resposta da IA.", raw: ai.text.slice(0, 2500) },
          { status: 422 }
        )
      }
    }

    if (mode === "import") {
      const csv = typeof body.csvText === "string" ? body.csvText.slice(0, 400_000) : ""
      const images = Array.isArray(body.imageParts) ? body.imageParts : []
      for (const im of images) {
        if (typeof im?.data !== "string" || im.data.length > 6_000_000) {
          return NextResponse.json({ error: "Imagem inválida ou demasiado grande." }, { status: 400 })
        }
      }
      if (!csv.trim() && images.length === 0) {
        return NextResponse.json({ error: "Envia CSV ou pelo menos uma imagem." }, { status: 400 })
      }

      const system = `És um assistente financeiro da MoreThanMoney. Extrai posições de portefólio a partir de CSV ou capturas de ecrã (Binance, Coinbase, Trading 212, DEGIRO, Revolut, IBKR, etc.).
Responde APENAS com JSON válido UTF-8, sem markdown, no formato:
{"positions":[{"symbol":"BTC","name":"Bitcoin","quantity":0.25,"avg_price":62000,"asset_type":"crypto"}]}
asset_type: "crypto" | "etf" | "stock" | "other"
avg_price = preço médio de compra na moeda do extrato (assume USD se não indicado).
Se não conseguires ler um campo, omite a linha ou usa estimativas conservadoras e indica em "warnings_pt" array no mesmo JSON.
Inclui opcionalmente "warnings_pt": string[] no JSON.`

      const userText = [
        csv.trim() ? `--- CSV ---\n${csv}` : "",
        images.length ? `Analisa ${images.length} imagem(ns) em anexo e extrai as posições.` : "",
      ]
        .filter(Boolean)
        .join("\n\n")

      const ai = await callAnthropicJson({
        system,
        userText,
        images: images.length ? images : undefined,
        maxTokens: 4096,
      })
      if ("error" in ai) {
        return NextResponse.json({ error: ai.error }, { status: ai.status })
      }
      try {
        const parsed = parseJsonFromAssistant(ai.text) as {
          positions?: PositionInput[]
          warnings_pt?: string[]
        }
        const positions = Array.isArray(parsed.positions) ? parsed.positions : []
        return NextResponse.json({
          success: true,
          positions: positions.filter(
            (p) =>
              p &&
              typeof p.symbol === "string" &&
              typeof p.quantity === "number" &&
              typeof p.avg_price === "number" &&
              p.quantity > 0 &&
              p.avg_price > 0
          ),
          warnings_pt: parsed.warnings_pt,
        })
      } catch (e) {
        console.error("[rebalance-analyze] import parse", e)
        return NextResponse.json(
          { error: "Não foi possível interpretar a resposta da IA.", raw: ai.text.slice(0, 2000) },
          { status: 422 }
        )
      }
    }

    // analyze
    const positions = Array.isArray(body.positions) ? body.positions : []
    if (positions.length === 0) {
      return NextResponse.json({ error: "Sem posições para analisar." }, { status: 400 })
    }

    const fg = await fetchFearGreed()
    const budget =
      typeof body.monthlyBudgetEur === "number" && Number.isFinite(body.monthlyBudgetEur)
        ? body.monthlyBudgetEur
        : null

    const system = `És um analista de portefólio da MoreThanMoney (Portugal). Escreve em português europeu (pt-PT), tom profissional e prudente.
Não garantas retornos. Não é aconselhamento financeiro personalizado — inclui sempre aviso de que a decisão é do utilizador.
Objetivo: ajudar quem falhou o plano DCA a racionalizar recuperação do preço médio e possível reequilíbrio.

Responde APENAS com JSON válido (sem markdown), formato:
{
  "resumo_pt": "string",
  "indicador_mercado": { "fear_greed_valor": number|null, "fear_greed_label": string|null, "nota_pt": "string" },
  "metricas": { "risco_1_10": number, "diversificacao_1_10": number },
  "alocacao": { "atual_pct_por_tipo": { "crypto"?: number, "etf"?: number, "stock"?: number, "other"?: number }, "sugestao_qualitativa_pt": "string" },
  "por_ativo": [
    {
      "symbol": "string",
      "nome": "string",
      "acao": "comprar" | "vender" | "manter" | "reduzir",
      "sugestao_dca_mensal_eur": number|null,
      "nota_curta_pt": "string"
    }
  ],
  "plano_recuperacao_pm_medio_pt": "string (parágrafos curtos)",
  "avisos_pt": ["string"],
  "csv_sugestao": [["symbol","acao","sugestao_dca_mensal_eur","nota"]]
}
sugestao_dca_mensal_eur deve somar aproximadamente o orçamento mensal indicado pelo utilizador (se existir), distribuindo por prioridade (recuperar PM onde faz sentido).`

    const userPayload = {
      fear_greed: fg,
      monthly_budget_eur: budget,
      user_notes: body.notes || null,
      positions: positions.slice(0, 80),
      mtm_reference_snapshot: body.mtmSnapshot?.slice(0, 40) || null,
    }

    const ai = await callAnthropicJson({
      system,
      userText: `Analisa o portefólio e devolve o JSON pedido.\n\nDados:\n${JSON.stringify(userPayload, null, 2)}`,
      maxTokens: 8192,
    })
    if ("error" in ai) {
      return NextResponse.json({ error: ai.error }, { status: ai.status })
    }
    try {
      const analysis = parseJsonFromAssistant(ai.text)
      return NextResponse.json({ success: true, analysis })
    } catch (e) {
      console.error("[rebalance-analyze] analyze parse", e)
      return NextResponse.json(
        {
          error: "Não foi possível interpretar a análise.",
          fallback_text_pt: ai.text,
        },
        { status: 422 }
      )
    }
  } catch (error: unknown) {
    console.error("[rebalance-analyze]", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}
