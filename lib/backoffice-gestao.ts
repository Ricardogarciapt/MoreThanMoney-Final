import type { Capacidade } from '@/lib/backoffice-papeis'

/**
 * A ÁREA DE GESTÃO do backoffice — o registo único dos módulos.
 *
 * Cada módulo aparece UMA vez e é o mesmo componente que serve o /admin: não há cópias a divergir.
 * Onde havia dois ecrãs para a mesma coisa (WhatsApp: conversas + escrever; Agentes: painel +
 * árvore), ficam como duas vistas do MESMO módulo.
 *
 * `exige` é a capacidade que abre o módulo — o menu, a página e a API perguntam pela mesma:
 *   · `bo.dono`             → só o dono (contas, agentes, dashboard, acessos)
 *   · `bo.gestao_crm`       → acesso «Clientes & CRM» (agenda, WhatsApp, leads, formulários)
 *   · `bo.gestao_comercial` → acesso «Comercial» (tráfego, cupões)
 */
export type GrupoGestao = 'Operação' | 'Clientes & CRM' | 'Comercial' | 'Inteligência' | 'Equipa'

export type ModuloGestao = {
  slug: string
  nome: string
  descricao: string
  grupo: GrupoGestao
  exige: Capacidade
  vistas?: Array<{ id: string; nome: string }>
}

export const MODULOS_GESTAO: readonly ModuloGestao[] = [
  { slug: 'contas', nome: 'Contas & cópia', grupo: 'Operação', exige: 'bo.dono',
    descricao: 'O centro de controlo: contas (uma linha por conta), sinais, estratégias, cópia, utilizadores e o MTM Funded.' },
  { slug: 'agenda', nome: 'Agenda', grupo: 'Clientes & CRM', exige: 'bo.gestao_crm',
    descricao: 'As marcações da agenda própria (/agendar), disponibilidade e tipos de reunião.' },
  { slug: 'whatsapp', nome: 'WhatsApp', grupo: 'Clientes & CRM', exige: 'bo.gestao_crm',
    descricao: 'As conversas e o envio — com a janela das 24 h e o consentimento decididos no servidor.',
    vistas: [{ id: 'conversas', nome: 'Conversas' }, { id: 'escrever', nome: 'Escrever a alguém' }] },
  { slug: 'leads', nome: 'Leads sociais', grupo: 'Clientes & CRM', exige: 'bo.gestao_crm',
    descricao: 'Quem comentou ou escreveu no Instagram, com os envios por aprovar.' },
  { slug: 'formularios', nome: 'Formulários', grupo: 'Clientes & CRM', exige: 'bo.gestao_crm',
    descricao: 'Criar formulários de captação e ler as submissões — cada submissão entra no pipeline.' },
  { slug: 'trafego', nome: 'Tráfego', grupo: 'Comercial', exige: 'bo.gestao_comercial',
    descricao: 'Campanhas Meta (gasto, cliques, leads, CPL) ao lado do que entrou no CRM e na agenda, com diagnóstico e acções.' },
  { slug: 'cupoes', nome: 'Cupões', grupo: 'Comercial', exige: 'bo.gestao_comercial',
    descricao: 'Códigos de desconto, limites, validade e utilização.' },
  { slug: 'agentes', nome: 'Agentes IA', grupo: 'Inteligência', exige: 'bo.dono',
    descricao: 'O CEO e os sub-agentes: estado, juízos com motivo, pausar/retomar/parar.',
    vistas: [{ id: 'painel', nome: 'Painel de trabalho' }, { id: 'arvore', nome: 'Árvore e estado' }] },
  { slug: 'dashboard', nome: 'Dashboard de gestão', grupo: 'Inteligência', exige: 'bo.dono',
    descricao: 'Os 12 agentes de negócio em chat, métricas e o estado dos sistemas.' },
  { slug: 'acessos', nome: 'Acessos da equipa', grupo: 'Equipa', exige: 'bo.dono',
    descricao: 'Quem entra na Gestão e em que áreas (Clientes & CRM, Comercial), e os papéis de venda.',
    vistas: [{ id: 'gestao', nome: 'Acessos à Gestão' }, { id: 'papeis', nome: 'Papéis de venda' }] },
] as const

export const GRUPOS_GESTAO: readonly GrupoGestao[] = ['Operação', 'Clientes & CRM', 'Comercial', 'Inteligência', 'Equipa']

export function moduloGestao(slug: string): ModuloGestao | undefined {
  return MODULOS_GESTAO.find((m) => m.slug === slug)
}

/** Os módulos que estas capacidades abrem, pela ordem do registo. */
export function modulosVisiveis(capacidades: ReadonlySet<Capacidade>): ModuloGestao[] {
  return MODULOS_GESTAO.filter((m) => capacidades.has(m.exige))
}
