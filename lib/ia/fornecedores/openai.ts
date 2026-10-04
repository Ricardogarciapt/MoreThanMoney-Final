/**
 * OPENAI — 4.º da cadeia. PAGO: só entra se houver chave, e só é chamado quando os três grátis
 * falharam. gpt-4o-mini por omissão (barato e com visão); `OPENAI_MODEL` para mudar.
 */
import { estimarCustoCents } from '../custos'
import type { Fornecedor } from '../tipos'
import { exigirTexto, mensagensEstiloOpenAI, postJson } from './comum'

const TIMEOUT_MS = Number(process.env.IA_TIMEOUT_MS) || 25_000

export const openai: Fornecedor = {
  nome: 'openai',
  suportaImagens: true,
  timeoutMs: TIMEOUT_MS,
  disponivel: () => Boolean(process.env.OPENAI_API_KEY?.trim()),
  async gerar(p, sinal) {
    const m = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'
    const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
    const j = (await postJson(
      'openai',
      `${base}/chat/completions`,
      { Authorization: `Bearer ${process.env.OPENAI_API_KEY!.trim()}` },
      {
        model: m,
        messages: mensagensEstiloOpenAI(p),
        max_tokens: p.maxTokens ?? 1024,
        ...(p.temperatura != null ? { temperature: p.temperatura } : {}),
        ...(p.json ? { response_format: { type: 'json_object' } } : {}),
      },
      sinal,
    )) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } }
    const tokensEntrada = j.usage?.prompt_tokens
    const tokensSaida = j.usage?.completion_tokens
    return {
      texto: exigirTexto('openai', j.choices?.[0]?.message?.content),
      modelo: m,
      tokensEntrada,
      tokensSaida,
      custoCents: estimarCustoCents(m, tokensEntrada, tokensSaida),
    }
  },
}
