/**
 * E-BOOKS GRÁTIS EM TROCA DE CONTACTO (21/11/2026, decisão do Ricardo).
 * «O Método Frio» vende-se a 5 € COM 7 dias de acompanhamento, ou sai grátis em troca de
 * email + WhatsApp + um formulário curto, SEM acompanhamento.
 */
export const EBOOKS_GRATIS = new Set(['o-metodo-frio', 'a-decisao-que-adias'])

/** Livros que SÓ existem grátis (sem versão paga nem produto no marketplace): oferta dos webinars. */
export const EBOOKS_SO_GRATIS = new Set(['a-decisao-que-adias'])

export const PERGUNTAS = {
  experiencia: { rotulo: 'Experiência em trading', opcoes: { nunca: 'Nunca operei', menos_1: 'Menos de 1 ano', mais_1: 'Mais de 1 ano' } },
  objetivo: { rotulo: 'O que procuras', opcoes: { do_zero: 'Aprender do zero', disciplina: 'Ganhar disciplina e regras', real: 'Passar do demo para conta real' } },
  corretora: { rotulo: 'Já tens conta numa corretora?', opcoes: { nao: 'Ainda não', demo: 'Só demo', real: 'Sim, conta real' } },
  tempo: { rotulo: 'Tempo por dia para isto', opcoes: { min15: 'Uns 15 minutos', h1: '30 a 60 minutos', mais: 'Mais de uma hora' } },
} as const
export type Pergunta = keyof typeof PERGUNTAS

// «A Decisão Que Adias» (Liliana Salgueiro, webinars de desenvolvimento pessoal): perguntas próprias.
export const PERGUNTAS_MENTE = {
  momento: { rotulo: 'Em que momento estás', opcoes: { travada: 'Sei o que mudar e não avanço', recomeco: 'A recomeçar algo novo', negocio: 'A construir o meu negócio', curiosa: 'Só a explorar' } },
  adias: { rotulo: 'O que mais adias', opcoes: { mostrar: 'Mostrar o meu trabalho', decidir: 'Tomar uma decisão grande', rotina: 'Criar uma rotina', pedir: 'Pedir ajuda ou dinheiro' } },
  webinar: { rotulo: 'Estiveste num webinar da Liliana?', opcoes: { sim: 'Sim', nao: 'Ainda não' } },
  tempo: { rotulo: 'Tempo por dia para isto', opcoes: { min15: 'Uns 15 minutos', h1: '30 a 60 minutos', mais: 'Mais de uma hora' } },
} as const
type Perguntas = Record<string, { rotulo: string; opcoes: Record<string, string> }>
export function perguntasDe(slug: string): Perguntas {
  return (slug.startsWith('a-decisao-que-adias') ? PERGUNTAS_MENTE : PERGUNTAS) as Perguntas
}

export function validarRespostas(r: unknown, slug = 'o-metodo-frio'): { ok: true; respostas: Record<string, string> } | { ok: false; erros: Record<string, string> } {
  const obj = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
  const P = perguntasDe(slug)
  const out = {} as Record<string, string>
  const erros: Record<string, string> = {}
  for (const k of Object.keys(P)) {
    const v = String(obj[k] ?? '')
    if (!(v in P[k].opcoes)) erros[k] = 'Escolhe uma opção.'
    else out[k] = v
  }
  return Object.keys(erros).length ? { ok: false, erros } : { ok: true, respostas: out }
}
