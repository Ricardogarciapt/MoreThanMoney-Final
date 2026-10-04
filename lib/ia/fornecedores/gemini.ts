/**
 * GEMINI — 2.º da cadeia. Plano gratuito do AI Studio, com visão (lê capturas de ecrã) e modo
 * JSON nativo. Vai a seguir ao Groq porque é mais lento e porque o limite diário do grátis é
 * mais apertado — é a reserva do grátis, não o motor.
 * Chave em aistudio.google.com → `GEMINI_API_KEY` (em produção desde 04/10; formato `AQ.…`, válida).
 *
 * Quando o nome do modelo morre, o Google escreve o substituto no próprio erro («no longer
 * available to new users. Please update your code to use models/gemini-3.8-flash»). Este
 * fornecedor lê essa frase e repete uma vez com o nome sugerido — ver `descoberta.ts`.
 */
import type { Fornecedor, PedidoIA } from '../tipos'
import { exigirTexto, postJson, sistemaComJson, ultimoIndiceUser } from './comum'
import { ehErroDeModelo, erroComDescoberta, modeloSugeridoNoErro } from './descoberta'

const TIMEOUT_MS = Number(process.env.IA_TIMEOUT_MS) || 25_000

/** Modelo descoberto em runtime, por processo (ver nota no Groq). */
let descoberto: string | null = null
export function _esquecerDescobertaParaTestes(): void {
  descoberto = null
}

function modeloConfigurado(): string {
  if (process.env.GEMINI_MODEL?.trim()) return process.env.GEMINI_MODEL.trim()
  // Nome EXPLÍCITO, não um alias «-latest»: um alias muda de modelo sem avisar. E é o 3.8 porque
  // foi o ÚNICO que respondeu com a chave do dono a 04/10/2026: os 2.0/1.5 dão 404, e os 2.5
  // aparecem em GET /v1beta/models mas devolvem «no longer available to new users — use
  // gemini-3.8-flash». A lista de modelos NÃO é a lista do que a chave pode usar.
  return 'gemini-3.8-flash'
}

async function pedir(m: string, p: PedidoIA, sinal: AbortSignal) {
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
        // O 3.8 é um modelo que PENSA antes de responder e os tokens do pensamento contam para
        // este tecto: com 16 gastou-os todos a pensar e devolveu texto vazio (visto a 04/10).
        // Um chão de 512 garante que sobra espaço para a resposta.
        maxOutputTokens: Math.max(p.maxTokens ?? 1024, 512),
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
}

export const gemini: Fornecedor = {
  nome: 'gemini',
  suportaImagens: true,
  timeoutMs: TIMEOUT_MS,
  disponivel: () => Boolean(process.env.GEMINI_API_KEY?.trim()),
  async gerar(p, sinal) {
    const primeiro = descoberto ?? modeloConfigurado()
    try {
      return await pedir(primeiro, p, sinal)
    } catch (e) {
      if (!ehErroDeModelo(e)) throw e
      // O Google não tem uma lista do que a chave PODE usar (a lista traz modelos fechados a
      // novos utilizadores), mas o erro diz o substituto. Sem sugestão, não se inventa.
      const sugerido = modeloSugeridoNoErro(e.message)
      if (!sugerido || sugerido === primeiro) throw erroComDescoberta(e, 'o erro não sugeriu um modelo substituto')
      const r = await pedir(sugerido, p, sinal)
      descoberto = sugerido
      return { ...r, modelo: `${sugerido} (descoberto: ${primeiro} já não está disponível)` }
    }
  },
}
