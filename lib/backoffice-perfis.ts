/**
 * PERFIS — o atalho de «que pessoa é esta» na gestão de utilizadores.
 *
 * Um perfil é um papel com nome e descrição humana, para que quem atribui veja o que a pessoa vai
 * ver ANTES de confirmar. Não cria permissões novas: o mapa continua em `lib/backoffice-papeis.ts`
 * e este ficheiro só o apresenta. Se um perfil um dia precisar de mais do que um papel, acrescenta-se
 * aqui a lista `papel` — a regra de quem vê o quê não muda de sítio.
 *
 * PURO, como o resto do modelo de permissões: testável com `npx tsx lib/backoffice-perfis.check.ts`.
 */

import { capacidadesDoPapel, PAPEL_NOME, type Capacidade, type Papel } from '@/lib/backoffice-papeis'

export interface Perfil {
  id: Papel
  nome: string
  descricao: string
}

/** Os quatro perfis de venda do dia-a-dia. Afiliado fica de fora de propósito: é gerido à parte. */
export const PERFIS: readonly Perfil[] = [
  {
    id: 'setter',
    nome: PAPEL_NOME.setter,
    descricao: 'Marca reuniões e trabalha os negócios que lhe são atribuídos e a fila «falar com uma pessoa».',
  },
  {
    id: 'closer',
    nome: PAPEL_NOME.closer,
    descricao: 'Fecha os negócios que lhe são atribuídos. Vê o pipeline e as suas tarefas.',
  },
  {
    id: 'prospector',
    nome: PAPEL_NOME.prospector,
    descricao: 'Traz nomes novos. Vê apenas os contactos e tarefas que são seus, sem pipeline da equipa.',
  },
  {
    id: 'team_leader',
    nome: PAPEL_NOME.team_leader,
    descricao: 'Vê a equipa: pipeline, leads, tarefas e extracto dos liderados, além do seu. Não é atribuição automática de closer.',
  },
]

/** Nome em português de cada capacidade, para a lista «o que pode fazer» de cada perfil. */
export const CAPACIDADE_NOME: Partial<Record<Capacidade, string>> = {
  'bo.entrar': 'Entrar no backoffice',
  'bo.extracto_proprio': 'Ver o seu extracto',
  'bo.extracto_equipa': 'Ver o extracto da equipa',
  'bo.material': 'Materiais e links de divulgação',
  'bo.leads_proprias': 'Os seus contactos e leads',
  'bo.leads_equipa': 'Leads da equipa',
  'bo.pipeline_proprio': 'Pipeline (negócios atribuídos)',
  'bo.pipeline_equipa': 'Pipeline da equipa',
  'bo.tarefas_proprias': 'As suas tarefas',
  'bo.tarefas_equipa': 'Tarefas da equipa',
  'bo.equipa_ver': 'Ver a composição da equipa',
}

/** As capacidades com nome que um perfil dá, pela ordem do mapa. Vazio se o perfil não existir. */
export function capacidadesDoPerfil(id: Papel): string[] {
  return capacidadesDoPapel(id)
    .map((c) => CAPACIDADE_NOME[c])
    .filter((n): n is string => typeof n === 'string')
}

export function perfilPorId(id: string): Perfil | undefined {
  return PERFIS.find((p) => p.id === id)
}
