import type { Capacidade } from '@/lib/backoffice-papeis'

/**
 * A ÁREA DE GESTÃO do backoffice — o registo único dos módulos.
 *
 * Cada módulo aparece UMA vez e é o mesmo componente que serve o /admin: não há cópias a divergir.
 * Onde havia dois ecrãs para a mesma coisa (WhatsApp: conversas + escrever; Agentes: painel +
 * árvore), ficam como duas vistas do MESMO módulo.
 *
 * `exige` é a capacidade que abre o módulo — o menu, a página e a API perguntam pela mesma:
 *   · `bo.dono`             → só o dono (contas, Telegram, agentes, dashboard, acessos)
 *   · `bo.gestao_crm`       → acesso «Clientes & CRM» (agenda, WhatsApp, leads, formulários)
 *   · `bo.gestao_comercial` → acesso «Comercial» (tráfego, cupões)
 *   · `bo.gestao_social`    → acesso «Social & conteúdo» (Centro Social; as Ligações só para o dono)
 */
export type GrupoGestao = 'Operação' | 'Clientes & CRM' | 'Social' | 'Comercial' | 'Inteligência' | 'Equipa'

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
  { slug: 'telegram', nome: 'Telegram', grupo: 'Operação', exige: 'bo.dono',
    descricao: 'Os bots da VPS: se os relays estão vivos, o que cada rota publicou e os teus grupos sem o bot.' },
  { slug: 'agenda', nome: 'Agenda', grupo: 'Clientes & CRM', exige: 'bo.gestao_crm',
    descricao: 'As marcações da agenda própria (/agendar), disponibilidade e tipos de reunião.' },
  { slug: 'whatsapp', nome: 'WhatsApp', grupo: 'Clientes & CRM', exige: 'bo.gestao_crm',
    descricao: 'As conversas e o envio — com a janela das 24 h e o consentimento decididos no servidor.',
    vistas: [{ id: 'conversas', nome: 'Conversas' }, { id: 'escrever', nome: 'Escrever a alguém' }] },
  { slug: 'suporte', nome: 'Ronda de suporte', grupo: 'Clientes & CRM', exige: 'bo.gestao_crm',
    descricao: 'As conversas do balão de apoio: o que o agente resolveu, o que espera pela equipa (15 min / 1 h) e o que foi escalado ao Ricardo.' },
  { slug: 'leads', nome: 'Leads sociais', grupo: 'Clientes & CRM', exige: 'bo.gestao_crm',
    descricao: 'Quem comentou ou escreveu no Instagram, com os envios por aprovar.' },
  { slug: 'conversao', nome: 'Conversão', grupo: 'Clientes & CRM', exige: 'bo.gestao_crm',
    descricao: 'Leads quentes à espera de resposta, e por origem: trabalhados, avançados, ganhos e tempo até ao 1.º contacto.' },
  { slug: 'formularios', nome: 'Formulários', grupo: 'Clientes & CRM', exige: 'bo.gestao_crm',
    descricao: 'Criar formulários de captação e ler as submissões — cada submissão entra no pipeline.' },
  { slug: 'social', nome: 'Centro Social', grupo: 'Social', exige: 'bo.gestao_social',
    descricao: 'Instagram e funis num só sítio: o que se publica, o radar de leads, os funis e automações, e as ligações à Meta (estas só para o dono).' },
  { slug: 'trafego', nome: 'Tráfego', grupo: 'Comercial', exige: 'bo.gestao_comercial',
    descricao: 'Campanhas Meta (gasto, cliques, leads, CPL) ao lado do que entrou no CRM e na agenda, com diagnóstico e acções.' },
  { slug: 'marketing', nome: 'Marketing', grupo: 'Comercial', exige: 'bo.gestao_comercial',
    descricao: 'Assistente com especialistas (estratégia, tráfego, funis, conteúdo, email, concorrência), estúdio de anúncios e copy, a marca da casa e os rascunhos a aplicar (kits de lançamento e campanhas Meta em pausa).',
    vistas: [{ id: 'assistente', nome: 'Assistente' }, { id: 'estudio', nome: 'Estúdio' }, { id: 'marca', nome: 'Marca' }, { id: 'rascunhos', nome: 'Rascunhos' }] },
  { slug: 'cupoes', nome: 'Cupões', grupo: 'Comercial', exige: 'bo.gestao_comercial',
    descricao: 'Códigos de desconto, limites, validade e utilização.' },
  { slug: 'periodos-gratis', nome: 'Trial e campanha 90 dias', grupo: 'Comercial', exige: 'bo.gestao_comercial',
    descricao: 'Quem está no trial de 3 dias ou na campanha 90 dias, a data de fim, quem já pagou e quem ficou bloqueado. Prorrogar ou cancelar.' },
  { slug: 'agentes', nome: 'Agentes IA', grupo: 'Inteligência', exige: 'bo.dono',
    descricao: 'O CEO e os sub-agentes: estado, juízos com motivo, pausar/retomar/parar, saldo e tetos de gasto, ritmos e horas, e ordens por chat.',
    vistas: [{ id: 'painel', nome: 'Painel de trabalho' }, { id: 'arvore', nome: 'Árvore e estado' }, { id: 'orcamento', nome: 'Orçamento' }, { id: 'programacao', nome: 'Programações' }, { id: 'ordens', nome: 'Ordens' }] },
  { slug: 'dashboard', nome: 'Dashboard de gestão', grupo: 'Inteligência', exige: 'bo.dono',
    descricao: 'Os 12 agentes de negócio em chat, métricas e o estado dos sistemas.' },
  { slug: 'acessos', nome: 'Acessos da equipa', grupo: 'Equipa', exige: 'bo.dono',
    descricao: 'Quem entra na Gestão e em que áreas (Clientes & CRM, Comercial), quem usa o Estúdio e os papéis de venda.',
    vistas: [{ id: 'gestao', nome: 'Acessos à Gestão' }, { id: 'estudio', nome: 'Estúdio' }, { id: 'papeis', nome: 'Papéis de venda' }] },
] as const

export const GRUPOS_GESTAO: readonly GrupoGestao[] = ['Operação', 'Clientes & CRM', 'Social', 'Comercial', 'Inteligência', 'Equipa']

export function moduloGestao(slug: string): ModuloGestao | undefined {
  return MODULOS_GESTAO.find((m) => m.slug === slug)
}

/** Os módulos que estas capacidades abrem, pela ordem do registo. */
export function modulosVisiveis(capacidades: ReadonlySet<Capacidade>): ModuloGestao[] {
  return MODULOS_GESTAO.filter((m) => capacidades.has(m.exige))
}
