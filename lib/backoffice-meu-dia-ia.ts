/**
 * «O MEU DIA» ORDENADO PELA IA (CRM Fase 3, 17/11/2026).
 *
 * A urgência de `lib/vendas/abordagem.ts` continua a ser a base: é determinística, medida, e é ela
 * que escolhe as 20 linhas. A IA (só gratuita: Groq → Gemini → Ollama) recebe essas linhas já
 * resumidas e devolve a ORDEM em que se devem atacar, com uma frase curta por cada uma.
 *
 * O QUE A IA NÃO FAZ: não escreve mensagens, não inventa números, não acrescenta nem tira linhas.
 * Uma resposta que traga ids desconhecidos, frases com valores (€, %, dígitos) ou que falhe por
 * tempo cai fora, e a página fica com a ordem da urgência — e diz que foi isso que aconteceu.
 */
import { chamarIAGratis } from '@/lib/ia/chamar'

export interface LinhaParaOrdenar {
  id: string
  titulo: string
  estado: string | null
  funil: string | null
  accao: string | null
  atrasada: boolean
  urgencia: number
  temNegocio: boolean
}

export interface OrdemIA {
  ids: string[]
  porque: Record<string, string>
  fonte: 'ia' | 'urgencia'
  fornecedor?: string
}

const SISTEMA =
  'És o assistente de vendas da MoreThanMoney (educação financeira, PT-PT, trata por «tu»). ' +
  'Recebes a lista de tarefas de hoje de um vendedor, já com a urgência calculada. ' +
  'Devolve a ordem em que as deve fazer para fechar mais e perder menos leads quentes: ' +
  'primeiro quem já respondeu ou tem reunião, depois os que estão perto de decidir, a prospeção no fim. ' +
  'Para cada tarefa escreve uma razão curta (máx. 12 palavras) em PT-PT, sem números, sem preços, sem promessas. ' +
  'Responde só JSON: {"ordem":[{"id":"…","porque":"…"}]} com TODOS os ids recebidos e nenhum outro.'

/** Frases com valores ficam de fora: a IA não pode trazer números para o ecrã de quem vende. */
function fraseLimpa(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().replace(/\s+/g, ' ')
  if (!t || t.length > 120 || /[0-9€$%]/.test(t)) return null
  return t
}

export async function ordenarComIA(linhas: LinhaParaOrdenar[]): Promise<OrdemIA> {
  const base: OrdemIA = { ids: linhas.map((l) => l.id), porque: {}, fonte: 'urgencia' }
  if (linhas.length < 2) return base

  // Ids curtos para a IA (t1, t2…): menos tokens e nada de uuids para copiar mal.
  const curto = new Map(linhas.map((l, i) => [`t${i + 1}`, l.id]))
  const entrada = linhas.map((l, i) => ({
    id: `t${i + 1}`,
    tarefa: l.titulo.slice(0, 100),
    estado: l.estado ?? 'prospeção',
    funil: l.funil ?? 'por classificar',
    passo: l.accao?.slice(0, 80) ?? null,
    atrasada: l.atrasada,
    urgencia: l.urgencia,
  }))

  try {
    const r = await chamarIAGratis({
      tarefa: 'backoffice-meu-dia',
      sistema: SISTEMA,
      mensagens: [{ role: 'user', content: JSON.stringify(entrada) }],
      json: true,
      temperatura: 0.2,
      maxTokens: 1500,
      preferencia: 'rapido',
      timeoutMs: 8000,
    })
    const o = JSON.parse(r.texto) as { ordem?: Array<{ id?: unknown; porque?: unknown }> }
    const vistos = new Set<string>()
    const ids: string[] = []
    const porque: Record<string, string> = {}
    for (const it of o.ordem ?? []) {
      const real = typeof it.id === 'string' ? curto.get(it.id) : undefined
      if (!real || vistos.has(real)) continue
      vistos.add(real)
      ids.push(real)
      const f = fraseLimpa(it.porque)
      if (f) porque[real] = f
    }
    // A IA esqueceu-se de alguma? Entra no fim, pela ordem da urgência — nunca desaparece.
    for (const l of linhas) if (!vistos.has(l.id)) ids.push(l.id)
    if (vistos.size < Math.ceil(linhas.length / 2)) return base
    return { ids, porque, fonte: 'ia', fornecedor: r.fornecedor }
  } catch {
    return base
  }
}
