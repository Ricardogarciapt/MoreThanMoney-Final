/**
 * O protocolo de ferramentas do chat do dashboard-gestão — em JSON, igual para todos os fornecedores.
 *
 * O núcleo da IA (`lib/ia/chamar.ts`) não faz tool-use nativo: a cadeia Groq → Gemini → Ollama →
 * OpenAI → Anthropic tem de servir qualquer um deles. Por isso o modelo pede ferramentas num JSON
 * explícito e o ciclo corre na rota. Está aqui, puro, para a guarda provar a leitura sem rede.
 */

/** A forma de uma ferramenta tal como o modelo a vê — nome, descrição e esquema JSON dos argumentos. */
export type FerramentaDashboard = { name: string; description: string; input_schema: Record<string, unknown> }

export const MAX_VOLTAS_FERRAMENTAS = 3

export function protocoloFerramentas(tools: FerramentaDashboard[]): string {
  const lista = tools
    .map((t) => `- ${t.name}: ${t.description}\n  argumentos (JSON Schema): ${JSON.stringify(t.input_schema)}`)
    .join("\n")
  return (
    `## Ferramentas e formato de resposta (obrigatório)\n` +
    `Tens estas ferramentas:\n${lista}\n\n` +
    `Responde SEMPRE com UM objecto JSON, sem texto fora dele, numa de duas formas:\n` +
    `1) Para usar uma ferramenta: {"ferramenta": "<nome>", "argumentos": { ... }}\n` +
    `2) Para responder à pessoa: {"resposta": "<a tua resposta completa, em Markdown>"}\n` +
    `Usa uma ferramenta quando precisares de dados reais; quando já tiveres o que precisas, responde. ` +
    `Podes usar no máximo ${MAX_VOLTAS_FERRAMENTAS} ferramentas por pergunta.`
  )
}

export type DecisaoModelo =
  | { tipo: "ferramenta"; nome: string; argumentos: Record<string, unknown> }
  | { tipo: "resposta"; texto: string }
  | { tipo: "invalida"; motivo: string }

/** Lê a decisão do modelo a partir do JSON (já garantido pelo núcleo com `json: true`). */
export function lerDecisao(texto: string): DecisaoModelo {
  let j: unknown
  try {
    j = JSON.parse(texto)
  } catch {
    return { tipo: "invalida", motivo: "a resposta não é JSON" }
  }
  if (!j || typeof j !== "object" || Array.isArray(j)) return { tipo: "invalida", motivo: "a resposta não é um objecto" }
  const o = j as Record<string, unknown>
  if (typeof o.ferramenta === "string" && o.ferramenta.trim()) {
    const args = o.argumentos && typeof o.argumentos === "object" && !Array.isArray(o.argumentos) ? (o.argumentos as Record<string, unknown>) : {}
    return { tipo: "ferramenta", nome: o.ferramenta.trim(), argumentos: args }
  }
  if (typeof o.resposta === "string") return { tipo: "resposta", texto: o.resposta }
  return { tipo: "invalida", motivo: "sem «ferramenta» nem «resposta»" }
}
