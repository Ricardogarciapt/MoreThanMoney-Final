/**
 * GEMINI — 2.º da cadeia. Plano gratuito do AI Studio, com visão (lê capturas de ecrã) e modo
 * JSON nativo. Vai a seguir ao Groq porque é mais lento e porque o limite diário do grátis é
 * mais apertado — é a reserva do grátis, não o motor.
 * Chave em aistudio.google.com → `GEMINI_API_KEY` (a 04/10 NÃO existe em produção: é saltado).
 */
import type { Fornecedor, PedidoIA } from '../tipos'
import { exigirTexto, postJson, sistemaComJson, ultimoIndiceUser } from './comum'

const TIMEOUT_MS = Number(process.env.IA_TIMEOUT_MS) || 25_000

function modelo(p: PedidoIA): string {
  if (process.env.GEMINI_MODEL?.trim()) return process.env.GEMINI_MODEL.trim()
  // Nomes EXPLÍCITOS, não os aliases «-latest»: um alias muda de modelo sem avisar, e um dia a
  // resposta fica diferente sem ninguém ter mudado nada. E são os 2.5 porque foi o que a chave do
  // dono listou a 04/10/2026 (GET /v1beta/models): os 2.0 e 1.5 já NÃO existem neste projecto e
  // davam 404 — foi o primeiro erro que esta chave deu, e parecia chave inválida.
  return p.preferencia === 'rapido' ? 'gemini-2.5-flash-lite' : 'gemini-2.5-flash'
}

export const gemini: Fornecedor = {
  nome: 'gemini',
  suportaImagens: true,
  timeoutMs: TIMEOUT_MS,
  disponivel: () => Boolean(process.env.GEMINI_API_KEY?.trim()),
  async gerar(p, sinal) {
    const m = modelo(p)
    const sistema = sistemaComJson(p)
    const idxUser = ultimoIndiceUser(p.mensagens)
    const contents = p.mensagens.map((msg, i) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [
        { text: msg.content },
        ...(i === idxUser && p.imagens?.length
          ? p.imagens.map((img) => ({ inlineData: { mimeType: img.mediaType, data: img.dataBase64 } }))
          : []),
      ],
    }))
    const j = (await postJson(
      'gemini',
      `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`,
      { 'x-goog-api-key': process.env.GEMINI_API_KEY!.trim() },
      {
        ...(sistema ? { systemInstruction: { parts: [{ text: sistema }] } } : {}),
        contents,
        generationConfig: {
          maxOutputTokens: p.maxTokens ?? 1024,
          ...(p.temperatura != null ? { temperature: p.temperatura } : {}),
          ...(p.json ? { responseMimeType: 'application/json' } : {}),
        },
      },
      sinal,
    )) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
    }
    const texto = (j.candidates?.[0]?.content?.parts ?? []).map((x) => x.text ?? '').join('')
    return {
      texto: exigirTexto('gemini', texto),
      modelo: m,
      tokensEntrada: j.usageMetadata?.promptTokenCount,
      tokensSaida: j.usageMetadata?.candidatesTokenCount,
      custoCents: 0,
    }
  },
}
