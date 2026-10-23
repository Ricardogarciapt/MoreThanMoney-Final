/**
 * A ÁREA DO DONO no backoffice — o registo único dos módulos de gestão.
 *
 * Cada módulo aparece UMA vez e é o mesmo componente que já servia o /admin: não há cópias a
 * divergir. Onde havia dois ecrãs para a mesma coisa (WhatsApp: conversas + escrever; Agentes:
 * painel + árvore), ficam como duas vistas do MESMO módulo, e não como dois sítios.
 *
 * `antigo` é a morada no /admin que continua a funcionar — os favoritos e os links em emails não
 * morrem enquanto a migração não fecha.
 */
export type ModuloDono = {
  slug: string
  nome: string
  descricao: string
  grupo: 'Operação' | 'Clientes & CRM' | 'Comercial' | 'Inteligência'
  vistas?: Array<{ id: string; nome: string }>
  /** Morada antiga no /admin, se havia (um módulo que nasceu no backoffice não tem). */
  antigo?: string
}

export const MODULOS_DONO: readonly ModuloDono[] = [
  { slug: 'contas', nome: 'Contas & cópia', grupo: 'Operação', antigo: '/admin/centro?s=contas',
    descricao: 'O centro de controlo: contas (uma linha por conta), sinais, estratégias, cópia, utilizadores e o MTM Funded.' },
  { slug: 'agenda', nome: 'Agenda', grupo: 'Clientes & CRM', antigo: '/admin?tab=agenda',
    descricao: 'As marcações da agenda própria (/agendar), disponibilidade e tipos de reunião.' },
  { slug: 'whatsapp', nome: 'WhatsApp', grupo: 'Clientes & CRM', antigo: '/admin?tab=whatsapp',
    descricao: 'As conversas e o envio — com a janela das 24 h e o consentimento decididos no servidor.',
    vistas: [{ id: 'conversas', nome: 'Conversas' }, { id: 'escrever', nome: 'Escrever a alguém' }] },
  { slug: 'leads', nome: 'Leads sociais', grupo: 'Clientes & CRM', antigo: '/admin/social/leads',
    descricao: 'Quem comentou ou escreveu no Instagram, com os envios por aprovar.' },
  { slug: 'formularios', nome: 'Formulários', grupo: 'Clientes & CRM', antigo: '/admin/forms',
    descricao: 'Criar formulários de captação e ler as submissões.' },
  { slug: 'trafego', nome: 'Tráfego', grupo: 'Comercial',
    descricao: 'Campanhas Meta (gasto, cliques, leads, CPL) ao lado do que entrou no CRM e na agenda na mesma janela.' },
  { slug: 'cupoes', nome: 'Cupões', grupo: 'Comercial', antigo: '/admin/coupons',
    descricao: 'Códigos de desconto, limites, validade e utilização.' },
  { slug: 'agentes', nome: 'Agentes IA', grupo: 'Inteligência', antigo: '/admin?tab=agentes',
    descricao: 'O CEO e os sub-agentes: estado, juízos com motivo, pausar/retomar/parar.',
    vistas: [{ id: 'painel', nome: 'Painel de trabalho' }, { id: 'arvore', nome: 'Árvore e estado' }] },
  { slug: 'gestao', nome: 'Dashboard de gestão', grupo: 'Inteligência', antigo: '/dashboard-gestao',
    descricao: 'Os 12 agentes de negócio em chat, métricas e o estado dos sistemas.' },
] as const

export const GRUPOS_DONO = ['Operação', 'Clientes & CRM', 'Comercial', 'Inteligência'] as const

export function moduloDono(slug: string): ModuloDono | undefined {
  return MODULOS_DONO.find((m) => m.slug === slug)
}
