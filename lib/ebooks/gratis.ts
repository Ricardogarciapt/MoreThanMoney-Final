/**
 * E-BOOKS GRÁTIS EM TROCA DE CONTACTO (21/11/2026, decisão do Ricardo).
 * «O Método Frio» vende-se a 5 € COM 7 dias de acompanhamento, ou sai grátis em troca de
 * email + WhatsApp + um formulário curto, SEM acompanhamento.
 */
export const EBOOKS_GRATIS = new Set(['o-metodo-frio'])

export const PERGUNTAS = {
  experiencia: { rotulo: 'Experiência em trading', opcoes: { nunca: 'Nunca operei', menos_1: 'Menos de 1 ano', mais_1: 'Mais de 1 ano' } },
  objetivo: { rotulo: 'O que procuras', opcoes: { do_zero: 'Aprender do zero', disciplina: 'Ganhar disciplina e regras', real: 'Passar do demo para conta real' } },
  corretora: { rotulo: 'Já tens conta numa corretora?', opcoes: { nao: 'Ainda não', demo: 'Só demo', real: 'Sim, conta real' } },
  tempo: { rotulo: 'Tempo por dia para isto', opcoes: { min15: 'Uns 15 minutos', h1: '30 a 60 minutos', mais: 'Mais de uma hora' } },
} as const
export type Pergunta = keyof typeof PERGUNTAS

export function validarRespostas(r: unknown): { ok: true; respostas: Record<Pergunta, string> } | { ok: false; erros: Record<string, string> } {
  const obj = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
  const out = {} as Record<Pergunta, string>
  const erros: Record<string, string> = {}
  for (const k of Object.keys(PERGUNTAS) as Pergunta[]) {
    const v = String(obj[k] ?? '')
    if (!(v in PERGUNTAS[k].opcoes)) erros[k] = 'Escolhe uma opção.'
    else out[k] = v
  }
  return Object.keys(erros).length ? { ok: false, erros } : { ok: true, respostas: out }
}
