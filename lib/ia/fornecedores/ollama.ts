/**
 * OLLAMA — 3.º da cadeia. Custo zero por chamada porque é nosso (ou a nuvem do ollama.com), mas
 * em CPU é LENTO — por isso vai depois dos dois grátis rápidos e tem tecto de 60 s.
 *
 * Só entra na cadeia se `OLLAMA_URL` estiver definido: a 04/10 existe `OLLAMA_API_KEY` em
 * produção mas NENHUM `OLLAMA_URL`, e não se assume para onde a chave aponta (pode ser a API da
 * nuvem ollama.com, pode ser um servidor nosso que ainda não existe — o VPS de streaming não o
 * tem e está saturado). Decisão do dono; o código espera por ela.
 *
 *   OLLAMA_URL    — ex.: https://ollama.com ou http://<ip-do-servidor>:11434
 *   OLLAMA_TOKEN  — Bearer, se o servidor pedir (aceita-se também OLLAMA_API_KEY)
 *   OLLAMA_MODEL  — default llama3.2:3b
 */
import type { Fornecedor } from '../tipos'
import { exigirTexto, mensagensEstiloOpenAI, postJson } from './comum'

const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 60_000

export const ollama: Fornecedor = {
  nome: 'ollama',
  suportaImagens: false,
  timeoutMs: TIMEOUT_MS,
  disponivel: () => Boolean(process.env.OLLAMA_URL?.trim()),
  async gerar(p, sinal) {
    const base = process.env.OLLAMA_URL!.trim().replace(/\/+$/, '')
    const token = (process.env.OLLAMA_TOKEN || process.env.OLLAMA_API_KEY || '').trim()
    const m = process.env.OLLAMA_MODEL?.trim() || 'llama3.2:3b'
    const j = (await postJson(
      'ollama',
      `${base}/api/chat`,
      token ? { Authorization: `Bearer ${token}` } : {},
      {
        model: m,
        messages: mensagensEstiloOpenAI(p),
        stream: false,
        ...(p.json ? { format: 'json' } : {}),
        options: {
          num_predict: p.maxTokens ?? 1024,
          ...(p.temperatura != null ? { temperature: p.temperatura } : {}),
        },
      },
      sinal,
    )) as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number }
    return {
      texto: exigirTexto('ollama', j.message?.content),
      modelo: m,
      tokensEntrada: j.prompt_eval_count,
      tokensSaida: j.eval_count,
      custoCents: 0,
    }
  },
}
