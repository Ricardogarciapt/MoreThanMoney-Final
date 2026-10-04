/**
 * GEMINI — 2.º da cadeia. Plano gratuito do AI Studio, com visão (lê capturas de ecrã) e modo
 * JSON nativo. Vai a seguir ao Groq porque é mais lento e porque o limite diário do grátis é
 * mais apertado — é a reserva do grátis, não o motor.
 * Chave em aistudio.google.com → `GEMINI_API_KEY` (em produção desde 04/10; formato `AQ.…`, válida).
 *
 * Duas curas em runtime, e só duas:
 *  · Nome MORTO (404): o Google escreve o substituto no próprio erro («no longer available to new
 *    users. Please update your code to use models/gemini-3.8-flash»); repete-se uma vez com esse
 *    nome — ver `descoberta.ts`.
 *  · Quota DIÁRIA esgotada (429 «PerDay … retry in 10h»): a quota do grátis é de 20 pedidos/dia
 *    POR MODELO, por isso roda-se para o modelo seguinte da lista `ROTACAO` — ver
 *    `rotacao-quota.ts`. Um 429 por MINUTO não roda.
 */
import type { Fornecedor, GeracaoFornecedor, PedidoIA } from '../tipos'
import { ErroFornecedor } from '../tipos'
import { exigirTexto, postJson, sistemaComJson, ultimoIndiceUser } from './comum'
import { ehErroDeModelo, erroComDescoberta, modeloSugeridoNoErro } from './descoberta'
import { MAX_MODELOS_POR_PEDIDO, MarcasDeQuota, candidatos, ehErroDeQuotaDiaria, ehErroDeSaturacao, horasDeEspera } from './rotacao-quota'

const TIMEOUT_MS = Number(process.env.IA_TIMEOUT_MS) || 25_000

/**
 * A rotação quando a quota diária do configurado estoura. Nomes confirmados em
 * `GET /v1beta/models` a 04/10/2026 e todos a responder com a chave do dono nesse dia. Do mais
 * capaz para o mais leve, para a qualidade cair o menos possível. Os 2.5 estão fechados a novos
 * utilizadores (404 «no longer available») e por isso NÃO entram.
 */
const ROTACAO: readonly string[] = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemma-4-26b-a4b-it',
]

/** Modelo descoberto em runtime, por processo (ver nota no Groq). */
let descoberto: string | null = null
/** Nomes que deram 404 neste processo: saem da rotação, não vale a pena voltar a tentá-los. */
const mortos = new Set<string>()
/** Modelos com a quota diária esgotada e até quando. */
let marcas = new MarcasDeQuota()

export function _esquecerDescobertaParaTestes(): void {
  descoberto = null
  mortos.clear()
  marcas.esquecer()
}
/** A guarda injecta um relógio para fazer as marcas expirar sem esperar 10 horas. */
export function _definirRelogioParaTestes(agora: () => number): void {
  marcas = new MarcasDeQuota(agora)
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
  async gerar(p, sinal): Promise<GeracaoFornecedor> {
    const fila = candidatos(descoberto ?? modeloConfigurado(), ROTACAO, mortos, marcas)
    if (!fila.length) {
      throw new ErroFornecedor('gemini', `429 quota diária esgotada em todos os modelos da rotação (${[descoberto ?? modeloConfigurado(), ...ROTACAO].join(', ')})`, true, 429)
    }
    const esgotadosAgora: string[] = []
    const saturadosAgora: string[] = []
    let ultimo: ErroFornecedor | null = null

    for (let tentados = 0; fila.length && tentados < MAX_MODELOS_POR_PEDIDO; tentados++) {
      const m = fila.shift()!
      try {
        const r = await pedir(m, p, sinal)
        if (esgotadosAgora.length || saturadosAgora.length) {
          // Diz no livro que rodou e porquê — é assim que se vê que o 3.8 anda a esgotar-se.
          const motivos = [
            esgotadosAgora.length ? `${esgotadosAgora.join(', ')} com a quota diária esgotada` : '',
            saturadosAgora.length ? `${saturadosAgora.join(', ')} saturado` : '',
          ].filter(Boolean)
          return { ...r, modelo: `${m} (rodado: ${motivos.join('; ')})` }
        }
        return r
      } catch (e) {
        if (ehErroDeQuotaDiaria(e)) {
          // Tecto do dia neste modelo: marca-se até à hora que o erro diz e passa-se ao seguinte.
          marcas.marcar(m, horasDeEspera(e.message))
          esgotadosAgora.push(m)
          ultimo = e
          continue
        }
        if (ehErroDeSaturacao(e)) {
          // Saturação deste modelo (503 «high demand»): roda sem marcar — é um pico, não um tecto.
          saturadosAgora.push(m)
          ultimo = e
          continue
        }
        if (ehErroDeModelo(e)) {
          // Nome morto: sai da rotação deste processo. O Google não tem uma lista do que a chave
          // PODE usar (a lista traz modelos fechados a novos utilizadores), mas o erro diz o
          // substituto; repete-se UMA vez com ele. Sem sugestão, não se inventa — e não se roda:
          // rodar é para quota, não para nomes.
          mortos.add(m)
          const sugerido = modeloSugeridoNoErro(e.message)
          if (!sugerido || sugerido === m || mortos.has(sugerido)) throw erroComDescoberta(e, 'o erro não sugeriu um modelo substituto')
          const r = await pedir(sugerido, p, sinal)
          descoberto = sugerido
          return { ...r, modelo: `${sugerido} (descoberto: ${m} já não está disponível)` }
        }
        // Ritmo por minuto, chave, servidor, timeout: trocar de modelo não cura — passa ao
        // fornecedor seguinte como qualquer outro erro.
        throw e
      }
    }

    // Só se chega aqui com quota esgotada ou saturação em tudo o que se tentou.
    const tentados = [...esgotadosAgora.map((x) => `${x} (quota diária)`), ...saturadosAgora.map((x) => `${x} (saturado)`)].join(', ')
    const nota = fila.length
      ? `rodou por ${tentados}; não se tenta um ${MAX_MODELOS_POR_PEDIDO + 1}.º modelo no mesmo pedido`
      : `rodou por ${tentados} e a rotação acabou`
    throw erroComDescoberta(ultimo!, nota)
  },
}
