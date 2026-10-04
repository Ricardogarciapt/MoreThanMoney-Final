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
        ...(sistema ? { system: sistema } : {}),
        messages,
        ...(p.temperatura != null && aceitaTemperatura(m) ? { temperature: p.temperatura } : {}),
      },
      sinal,
    )) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } }
    const texto = (j.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
    const tokensEntrada = j.usage?.input_tokens
    const tokensSaida = j.usage?.output_tokens
    return {
      texto: exigirTexto('anthropic', texto),
      modelo: m,
      tokensEntrada,
      tokensSaida,
      custoCents: estimarCustoCents(m, tokensEntrada, tokensSaida),
    }
  },
}
