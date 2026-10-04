/**
 * GROQ — 1.º da cadeia. Plano gratuito, API compatível com OpenAI, e é o mais rápido de todos
 * (é por isso que vai à frente: a página do Terminal e o chat do Mentor esperam por ele).
 * Chave em console.groq.com → `GROQ_API_KEY` (já existe em produção).
 */
import type { Fornecedor, PedidoIA } from '../tipos'
import { exigirTexto, mensagensEstiloOpenAI, postJson } from './comum'

const TIMEOUT_MS = Number(process.env.IA_TIMEOUT_MS) || 25_000

function modelo(p: PedidoIA): string {
  if (process.env.GROQ_MODEL?.trim()) return process.env.GROQ_MODEL.trim()
  return p.preferencia === 'rapido' ? 'llama-3.1-8b-instant' : 'llama-3.3-70b-versatile'
}

export const groq: Fornecedor = {
  nome: 'groq',
  suportaImagens: false,
  timeoutMs: TIMEOUT_MS,
  disponivel: () => Boolean(process.env.GROQ_API_KEY?.trim()),
  async gerar(p, sinal) {
    const m = modelo(p)
    const j = (await postJson(
      'groq',
      'https://api.groq.com/openai/v1/chat/completions',
      { Authorization: `Bearer ${process.env.GROQ_API_KEY!.trim()}` },
      {
        model: m,
        messages: mensagensEstiloOpenAI(p),
        max_tokens: p.maxTokens ?? 1024,
        ...(p.temperatura != null ? { temperature: p.temperatura } : {}),
        ...(p.json ? { response_format: { type: 'json_object' } } : {}),
      },
      sinal,
    )) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } }
    return {
      texto: exigirTexto('groq', j.choices?.[0]?.message?.content),
      modelo: m,
      tokensEntrada: j.usage?.prompt_tokens,
      tokensSaida: j.usage?.completion_tokens,
      custoCents: 0,
    }
  },
}
