/**
 * CHAMADAS NO GOOGLE MEET — a parte pura (sem rede): os tipos de chamada, o pedido à IA e a leitura
 * do que a IA devolve. A rota `/api/backoffice/chamada/resumo` usa isto; a guarda está em
 * `backoffice-chamada.check.ts`.
 *
 * O áudio nunca chega aqui: o browser grava em blocos, cada bloco vira texto em `/api/backoffice/voz`
 * e desaparece. Só a transcrição (e depois o resumo) existe.
 */

export const TIPOS_CHAMADA = {
  equipa: 'Reunião de equipa',
  apresentacao: 'Apresentação',
  onboarding: 'Onboarding',
  followup: 'Follow-up',
  apoio: 'Apoio 1:1',
} as const
export type TipoChamada = keyof typeof TIPOS_CHAMADA

/** Transcrição máxima enviada à IA (~1 h de conversa). O resto corta-se pelo meio, com aviso. */
export const MAX_TRANSCRICAO = 60_000

export type TarefaProposta = { titulo: string; prazo: string | null }
export type ResumoChamada = {
  resumo: string
  objecoes: string[]
  proximos_passos: string[]
  tarefas: TarefaProposta[]
}

export function ehTipoChamada(v: unknown): v is TipoChamada {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(TIPOS_CHAMADA, v)
}

/** Corta uma transcrição longa guardando o início e o fim (onde ficam acordos e próximos passos). */
export function encurtarTranscricao(t: string): { texto: string; cortada: boolean } {
  const limpo = t.trim()
  if (limpo.length <= MAX_TRANSCRICAO) return { texto: limpo, cortada: false }
  const metade = Math.floor((MAX_TRANSCRICAO - 8) / 2)
  return { texto: `${limpo.slice(0, metade)}\n[…]\n${limpo.slice(-metade)}`, cortada: true }
}

export function sistemaDoResumo(tipo: TipoChamada, hojeISO: string): string {
  return [
    `És o assistente de vendas da MoreThanMoney. Recebes a transcrição de uma chamada do tipo «${TIPOS_CHAMADA[tipo]}».`,
    `Hoje é ${hojeISO}. Escreve em português de Portugal, tratamento por «tu», sem inventar nada que não esteja na transcrição.`,
    'Responde SÓ com JSON neste formato:',
    '{"resumo":"3 a 6 frases","objecoes":["…"],"proximos_passos":["…"],"tarefas":[{"titulo":"…","prazo":"AAAA-MM-DD ou null"}]}',
    'objecoes: dúvidas ou resistências do cliente (vazio se não houve). tarefas: só o que alguém da MTM se comprometeu a fazer, no máximo 5.',
    'Nunca prometas retornos nem cites números de desempenho que não tenham sido ditos.',
  ].join('\n')
}

const DATA = /^\d{4}-\d{2}-\d{2}$/
function dataValida(v: unknown): string | null {
  if (typeof v !== 'string' || !DATA.test(v)) return null
  const d = new Date(`${v}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null
}
function textos(v: unknown, max: number, tam: number): string[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.replace(/\s+/g, ' ').trim().slice(0, tam))
    .filter(Boolean)
    .slice(0, max)
}

/** Lê o JSON da IA. Nunca lança: JSON partido devolve null e a rota diz que falhou. */
export function interpretarResumo(bruto: string): ResumoChamada | null {
  const ini = bruto.indexOf('{')
  const fim = bruto.lastIndexOf('}')
  if (ini < 0 || fim <= ini) return null
  let o: Record<string, unknown>
  try {
    o = JSON.parse(bruto.slice(ini, fim + 1)) as Record<string, unknown>
  } catch {
    return null
  }
  const resumo = typeof o.resumo === 'string' ? o.resumo.trim().slice(0, 1200) : ''
  if (!resumo) return null
  const tarefas = Array.isArray(o.tarefas)
    ? (o.tarefas as unknown[])
        .map((t) => {
          const r = (t ?? {}) as Record<string, unknown>
          const titulo = typeof r.titulo === 'string' ? r.titulo.replace(/\s+/g, ' ').trim().slice(0, 200) : ''
          return titulo ? { titulo, prazo: dataValida(r.prazo) } : null
        })
        .filter((t): t is TarefaProposta => t !== null)
        .slice(0, 5)
    : []
  return { resumo, objecoes: textos(o.objecoes, 6, 200), proximos_passos: textos(o.proximos_passos, 6, 200), tarefas }
}

/** A nota que fica no negócio (campo `nota`, máx. 2000). A nota antiga fica por baixo, cortada. */
export function notaDaChamada(tipo: TipoChamada, diaISO: string, r: ResumoChamada, notaAntiga: string | null): string {
  const partes = [`📞 ${TIPOS_CHAMADA[tipo]} · ${diaISO}`, r.resumo]
  if (r.objecoes.length) partes.push(`Objeções: ${r.objecoes.join('; ')}`)
  if (r.proximos_passos.length) partes.push(`Próximos passos: ${r.proximos_passos.join('; ')}`)
  const nova = partes.join('\n')
  const antiga = (notaAntiga ?? '').trim()
  return (antiga ? `${nova}\n\n— antes —\n${antiga}` : nova).slice(0, 2000)
}
