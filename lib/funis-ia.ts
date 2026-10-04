/**
 * O bloco de IA dos funis — o passo que pensa.
 *
 * Fica à parte do motor porque o motor tem de poder correr sem ele: um ensaio percorre o funil
 * todo sem gastar uma única chamada, e um funil sem blocos de IA nunca carrega este ficheiro.
 *
 * ── As regras que não se desligam ────────────────────────────────────────────────────────────
 * O objetivo é escrito por quem desenha o funil, mas as regras duras estão AQUI e não lá: nunca
 * prometer lucro, nunca inventar números de desempenho. Se estivessem no objetivo, bastava alguém
 * as apagar sem dar por isso — e uma promessa falsa a correr sozinha num funil é o tipo de erro
 * que só se descobre quando já foi dita a trezentas pessoas.
 */

import { chamarIA, mensagemIndisponivel } from '@/lib/ia/chamar'

export interface PedidoIA {
  objetivo: string
  modo: 'responder' | 'classificar' | 'ambos'
  /** Os caminhos possíveis, pela ordem das setas que saem do bloco. */
  ramos: string[]
  /** O que a pessoa escreveu. */
  doCliente: string
  /** O que dizer se o modelo falhar. */
  reserva: string
}

export interface RespostaIA {
  texto: string | null
  /** Índice do ramo escolhido, ou null quando não havia escolha a fazer. */
  ramo: number | null
}

const VOZ =
  'Falas em nome da MoreThanMoney, comunidade portuguesa de trading. Português de Portugal, ' +
  'tratamento por "tu", curto — duas ou três frases.\n\n' +
  'REGRAS QUE NÃO SE NEGOCEIAM:\n' +
  '· NUNCA prometas lucro nem sugiras que se ganha dinheiro garantido.\n' +
  '· NUNCA inventes números de desempenho, percentagens ou resultados. Não os tens.\n' +
  '· Não dás conselho de investimento personalizado.\n' +
  '· Se não souberes, dizes que não sabes e encaminhas para uma pessoa.'

/**
 * Pela porta única da IA (Groq → Gemini → Ollama → OpenAI → Anthropic). Quando a cadeia inteira
 * falha, a pessoa recebe a RESERVA — o texto que quem desenhou o funil escreveu para esse caso.
 * Não é IA a fingir: é o plano B declarado no bloco. Ficar em silêncio seria pior.
 */
export async function pensar(p: PedidoIA): Promise<RespostaIA> {
  const querRamo = p.modo !== 'responder' && p.ramos.length > 0
  const sistema =
    `${VOZ}\n\nO que tens de fazer neste passo: ${p.objetivo}\n\n` +
    (querRamo
      ? `Depois de leres o que a pessoa disse, escolhes UM destes caminhos:\n` +
        p.ramos.map((r, i) => `${i}. ${r}`).join('\n') +
        `\n\nDevolves APENAS JSON, sem texto à volta:\n` +
        (p.modo === 'classificar'
          ? `{"ramo": <número>}`
          : `{"ramo": <número>, "texto": "<a tua resposta>"}`)
      : 'Devolves apenas a tua resposta, em texto simples.')

  try {
    const r = await chamarIA({
      tarefa: 'funis-ia',
      sistema,
      mensagens: [{ role: 'user', content: (p.doCliente || '(a pessoa ainda não disse nada)').slice(0, 2000) }],
      maxTokens: 500,
      // Com ramo a escolher, o núcleo garante JSON (ou passa ao fornecedor seguinte).
      json: querRamo,
      preferencia: 'rapido',
    })
    const bruto = r.texto.trim()

    if (!querRamo) return { texto: bruto || p.reserva || null, ramo: null }

    try {
      const o = JSON.parse(bruto) as { ramo?: number; texto?: string }
      const i = Number(o.ramo)
      return {
        texto: p.modo === 'classificar' ? null : o.texto ?? p.reserva ?? null,
        // Um índice fora da lista segue o primeiro caminho: é o normal, e é melhor do que parar.
        ramo: Number.isFinite(i) && i >= 0 && i < p.ramos.length ? i : 0,
      }
    } catch {
      // Não devolveu JSON: aproveita-se o texto como resposta e segue-se o primeiro caminho.
      return { texto: p.modo === 'classificar' ? null : bruto || p.reserva || null, ramo: 0 }
    }
  } catch (e) {
    console.warn('[funis-ia]', mensagemIndisponivel(e))
    return { texto: p.reserva || null, ramo: 0 }
  }
}
