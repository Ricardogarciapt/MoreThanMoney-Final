/**
 * QUANDO O NOME DO MODELO MORRE, DESCOBRE-SE O QUE A CHAVE TEM — em vez de adivinhar outro.
 *
 * ═══ O QUE ACONTECEU A 04/10/2026 ═════════════════════════════════════════════════════════
 *
 * O site mostrou ao dono «A IA está indisponível… groq (404 The model `llama-3.3-70b-versatile`
 * does not exist or you do not have access to it); gemini (404 This model models/gemini-2.5-flash
 * is no longer available to new users. Please update your code to use models/gemini-3.8-flash)».
 *
 * Os dois fornecedores GRÁTIS tinham chave válida e modelos a funcionar — só os NOMES escritos no
 * código é que tinham ficado velhos. E um nome velho é o pior tipo de avaria: não é a chave, não é o
 * crédito, não é a rede; é uma string que estava certa no dia em que foi escrita. Nenhuma guarda
 * local apanha isto, porque o catálogo de modelos vive no fornecedor e muda sem avisar.
 *
 * Pior: a chave do Groq em produção está marcada de forma a não ser exportável pela CLI, por isso
 * nem eu consigo listar os modelos dela daqui. Quem consegue é o CÓDIGO em produção, com a chave que
 * já tem. Logo é ele que descobre.
 *
 * ═══ A REGRA ═══════════════════════════════════════════════════════════════════════════════
 *
 *  1. Tenta o nome configurado. Se responder, acabou.
 *  2. Se o erro for DE MODELO (404, ou «does not exist / not found / no longer available /
 *     decommissioned / deprecated» no texto) — e SÓ nesse caso —, descobre uma alternativa:
 *       · Groq: pergunta ao fornecedor a lista (`GET /models`) e escolhe pela ordem de preferência
 *         abaixo, excluindo o que não é conversa (whisper, tts, guard, embeddings…);
 *       · Gemini: o próprio erro diz o substituto («use models/gemini-3.8-flash»); usa-se esse.
 *  3. Repete UMA vez com o modelo descoberto, e guarda-o em memória para os pedidos seguintes
 *     deste processo não voltarem a pagar a volta. Uma só repetição: se o descoberto também falhar,
 *     o erro passa ao fornecedor seguinte da cadeia, como qualquer outro.
 *  4. Um 401/402/429/5xx NÃO dispara descoberta: a chave, o crédito ou o serviço é que falharam, e
 *     trocar de modelo não cura isso — só esconderia a causa atrás de uma segunda chamada.
 */
import { ErroFornecedor } from '../tipos'
import { resumirErro } from './comum'

/** Texto que denuncia um NOME de modelo morto — e não a chave, o crédito ou o serviço. */
const TEXTO_DE_MODELO_MORTO =
  /model[^.]*?(does not exist|not found|no longer available|decommissioned|deprecated|is not supported|has been retired)|unknown model|no such model|not have access to it/i

export function ehErroDeModelo(err: unknown): err is ErroFornecedor {
  if (!(err instanceof ErroFornecedor)) return false
  if (err.status === 404) return true
  // Alguns fornecedores devolvem 400 com a frase; a frase manda, o status não.
  return TEXTO_DE_MODELO_MORTO.test(err.message)
}

/**
 * O substituto que o próprio erro sugere. O Gemini escreve «use models/gemini-3.8-flash»; a OpenAI
 * às vezes «use gpt-4o-mini instead». Devolve `null` quando a frase não traz nome nenhum — e aí não
 * se inventa.
 */
export function modeloSugeridoNoErro(mensagem: string): string | null {
  const m =
    /use\s+(?:models\/)?([a-z0-9][a-z0-9._:\/-]*[a-z0-9])/i.exec(mensagem) ??
    /(?:models\/)([a-z0-9][a-z0-9._:\/-]*[a-z0-9])\s+(?:instead|for the latest)/i.exec(mensagem)
  return m?.[1] ?? null
}

/** O que NÃO serve para conversa, mesmo que a lista o traga. */
const NAO_E_CONVERSA = /whisper|tts|speech|audio|guard|moderation|safeguard|embed|rerank|compound|orpheus|playai|vision-only|image/i

/**
 * Escolhe, da lista que o fornecedor devolveu, o modelo de conversa que mais se aproxima do que
 * se queria. A ordem é de propósito: primeiro a mesma família que estava configurada (o
 * comportamento muda menos), depois os de uso geral conhecidos, e por fim qualquer um que fale.
 */
export function escolherModeloDaLista(ids: readonly string[], preferido: string, rapido: boolean): string | null {
  const conversa = ids.filter((id) => id && !NAO_E_CONVERSA.test(id))
  if (!conversa.length) return null

  const familia = preferido.replace(/[-_.]?\d.*$/, '').toLowerCase() // «llama-3.3-70b-versatile» → «llama»
  // Pares [pequeno, grande] por família. Em «rápido» o pequeno vai à frente; em «qualidade» o
  // grande. É por PARES e não por uma lista única, porque a primeira versão disto virava só o
  // primeiro par e, em qualidade, o gpt-oss-20b ficava à frente do 120b — a guarda apanhou-o.
  const pares: [RegExp, RegExp][] = [
    [new RegExp(`^${familia}.*(instant|8b|mini|lite|small)`, 'i'), new RegExp(`^${familia}.*(versatile|70b|large|pro)`, 'i')],
    [/llama-3\.[0-9]+-.*instant/i, /llama-3\.[0-9]+-.*versatile/i],
    [/gpt-oss-20b/i, /gpt-oss-120b/i],
  ]
  const soltos: RegExp[] = [new RegExp(`^${familia}`, 'i'), /meta-llama\/llama-4/i, /qwen/i, /gemma/i, /mixtral|mistral/i, /deepseek/i]
  const pesos: RegExp[] = [...pares.flatMap(([pequeno, grande]) => (rapido ? [pequeno, grande] : [grande, pequeno])), ...soltos]
  for (const re of pesos) {
    const hit = conversa.find((id) => re.test(id))
    if (hit) return hit
  }
  return conversa[0]
}

/** `GET` JSON com o AbortSignal da cadeia; devolve `null` se o fornecedor não responder (não rebenta). */
export async function getJsonOuNull(url: string, headers: Record<string, string>, sinal: AbortSignal): Promise<unknown | null> {
  try {
    const res = await fetch(url, { method: 'GET', headers, signal: sinal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/** Para o relatório: o erro original mais o que se tentou a seguir, numa frase. */
export function erroComDescoberta(original: ErroFornecedor, nota: string): ErroFornecedor {
  return new ErroFornecedor(original.fornecedor, `${original.message} · ${nota}`, original.passavel, original.status)
}

export { resumirErro }
