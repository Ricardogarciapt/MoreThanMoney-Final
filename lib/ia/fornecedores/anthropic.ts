/**
 * ANTHROPIC — 5.º e último. PAGO e, a 04/10, SEM CRÉDITO (é o 400 «credit balance too low» que o
 * dono viu no Terminal). Fica no fim: só é chamado quando tudo o resto falhou, e o seu 400 de
 * crédito é classificado como PASSÁVEL (ver comum.ts) — por isso, se voltar a acontecer, a cadeia
 * já respondeu antes de cá chegar ou falha a dizer «anthropic: 400 credit balance».
 */
import { modeloClaude } from '@/lib/modelo-claude'
import { estimarCustoCents } from '../custos'
import type { Fornecedor } from '../tipos'
import { exigirTexto, postJson, sistemaComJson, ultimoIndiceUser } from './comum'

const TIMEOUT_MS = Number(process.env.IA_TIMEOUT_MS) || 25_000

/** Geração 5 / 4.6+ recusa `temperature` (400) — a mesma regra do Terminal, copiada para não haver import circular. */
/**
 * Prompt caching (17/11/2026, padrão `cost-aware-llm-pipeline` do ECC): o prompt de sistema dos agentes
 * (persona + ferramentas + framework) repete-se em cada mensagem e em cada volta de ferramentas. Marcado
 * com `cache_control`, as chamadas seguintes nos 5 min leem-no a 10% do preço. Duas marcas: o sistema e a
 * última mensagem (a conversa vai crescendo, por isso a volta seguinte reaproveita o prefixo todo).
 * Abaixo do mínimo do modelo (~1024 tokens) a API ignora a marca sem erro.
 */
const CACHE = { type: 'ephemeral' } as const

function comCacheNaUltima(messages: { role: string; content: unknown }[]) {
  const i = messages.length - 1
  if (i < 0) return messages
  const ultima = messages[i]
  const blocos: Record<string, unknown>[] = typeof ultima.content === 'string'
    ? [{ type: 'text', text: ultima.content }]
    : [...(ultima.content as Record<string, unknown>[])]
  if (!blocos.length) return messages
  blocos[blocos.length - 1] = { ...blocos[blocos.length - 1], cache_control: CACHE }
  return [...messages.slice(0, i), { role: ultima.role, content: blocos }]
}

function aceitaTemperatura(modelo: string): boolean {
  return !/claude-(sonnet|opus|fable|mythos)-5|claude-opus-4-[678]|claude-sonnet-4-6/.test(modelo)
}

export const anthropic: Fornecedor = {
  nome: 'anthropic',
  suportaImagens: true,
  timeoutMs: TIMEOUT_MS,
  disponivel: () => Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
  async gerar(p, sinal) {
    const m = modeloClaude()
    const idxUser = ultimoIndiceUser(p.mensagens)
    const messages = p.mensagens.map((msg, i) =>
      i === idxUser && p.imagens?.length
        ? {
            role: msg.role,
            content: [
              ...p.imagens.map((img) => ({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.dataBase64 } })),
              { type: 'text', text: msg.content },
            ],
          }
        : { role: msg.role, content: msg.content },
    )
    const sistema = sistemaComJson(p)
    const j = (await postJson(
      'anthropic',
      'https://api.anthropic.com/v1/messages',
      { 'x-api-key': process.env.ANTHROPIC_API_KEY!.trim(), 'anthropic-version': '2023-06-01' },
      {
        model: m,
        max_tokens: p.maxTokens ?? 1024,
        ...(sistema ? { system: [{ type: 'text', text: sistema, cache_control: CACHE }] } : {}),
        messages: comCacheNaUltima(messages),
        ...(p.temperatura != null && aceitaTemperatura(m) ? { temperature: p.temperatura } : {}),
      },
      sinal,
    )) as { content?: { type: string; text?: string }[]; usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    } }
    const texto = (j.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
    const novos = j.usage?.input_tokens ?? 0
    const escritos = j.usage?.cache_creation_input_tokens ?? 0
    const lidos = j.usage?.cache_read_input_tokens ?? 0
    const tokensEntrada = novos + escritos + lidos
    const tokensSaida = j.usage?.output_tokens
    // Escrever em cache custa 1,25× a entrada; ler custa 0,1×.
    const entradaEquivalente = Math.round(novos + escritos * 1.25 + lidos * 0.1)
    return {
      texto: exigirTexto('anthropic', texto),
      modelo: m,
      tokensEntrada,
      tokensSaida,
      custoCents: estimarCustoCents(m, entradaEquivalente, tokensSaida),
    }
  },
}
