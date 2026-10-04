/**
 * O AIOS — os agentes, os SOPs e o que um comando de voz quer dizer.
 *
 * ═══ PORQUE É QUE ISTO É UM FICHEIRO PURO ══════════════════════════════════════════════════
 *
 * Porque era a única parte do antigo `public/aios/index.html` com regras a sério — decidir que
 * `«ei aios, mostra-me as métricas»` é uma coisa e `«ei aios, fala com o setter»` é outra — e
 * estava enterrada numa função de trinta linhas com `includes` encadeados, sem forma de a testar.
 *
 * Um encaminhamento de voz errado não dá erro: manda a frase ao agente errado, ou abre o separador
 * errado, e quem falou pensa que o sistema não o percebeu. Sendo puro, `agentes.check.ts` consegue
 * atirar-lhe frases reais sem microfone, sem browser e sem rede.
 */

export const AGENTES = {
  prospeccao: { nome: 'Prospeção', emoji: '🎯', cor: '#60a5fa' },
  chatbot_builder: { nome: 'Chatbot', emoji: '🤖', cor: '#a78bfa' },
  setter: { nome: 'Setter', emoji: '📞', cor: '#34d399' },
  financial_email: { nome: 'Financeiro', emoji: '💰', cor: '#f59e0b' },
  compliance: { nome: 'Compliance', emoji: '⚖️', cor: '#f87171' },
  content_creation: { nome: 'Conteúdo', emoji: '✍️', cor: '#fb923c' },
  partnerships: { nome: 'Parcerias', emoji: '🤝', cor: '#2dd4bf' },
  trading: { nome: 'Trading', emoji: '📈', cor: '#4ade80' },
  business_incubation: { nome: 'Negócios', emoji: '🚀', cor: '#e879f9' },
  ai_control: { nome: 'IA Control', emoji: '🧠', cor: '#D2A63C' },
  education: { nome: 'Educação', emoji: '🎓', cor: '#38bdf8' },
  app_creator: { nome: 'App Creator', emoji: '📱', cor: '#06b6d4' },
} as const

export type IdAgente = keyof typeof AGENTES
export const IDS_AGENTES = Object.keys(AGENTES) as IdAgente[]

export const SOPS: Record<string, { agente: IdAgente; titulo: string; descricao: string; gatilho: string; pedido: string }> = {
  onboarding: {
    agente: 'setter',
    titulo: '🎯 Onboarding Novo Membro',
    descricao: 'Sequência completa para activar novo membro',
    gatilho: 'SETTER + CHATBOT',
    pedido: 'Cria um plano de onboarding completo para um novo membro MTM. Inclui: mensagem de boas-vindas, acesso à academia, sequência de emails 7 dias, e primeira chamada.',
  },
  lead_hot: {
    agente: 'setter',
    titulo: '🔥 Lead Quente',
    descricao: 'Qualificar e marcar chamada em menos de 2h',
    gatilho: 'SETTER',
    pedido: 'Tenho um lead quente que comentou num post. Como qualificá-lo e marcar chamada em 2h? Cria script de DM e perguntas de qualificação.',
  },
  content_week: {
    agente: 'content_creation',
    titulo: '📅 Plano Semanal',
    descricao: 'Gerar 3 posts + 5 stories para a semana',
    gatilho: 'CONTEÚDO',
    pedido: 'Cria plano de conteúdo para esta semana: 3 posts (Ter/Qui/Sáb) + 5 ideias de stories. Inclui hooks, captions e CTAs com palavras-chave para comentar (o funil nativo do Instagram apanha-as).',
  },
  scanner_update: {
    agente: 'trading',
    titulo: '📈 Update Scanner',
    descricao: 'Análise XAUUSD + post educativo comunidade',
    gatilho: 'TRADING',
    pedido: 'Faz uma análise educativa do XAUUSD para a comunidade. Inclui contexto de mercado, o que o scanner GoldKiller mostraria, e post para Instagram.',
  },
  reactivation: {
    agente: 'chatbot_builder',
    titulo: '💌 Reactivação Leads',
    descricao: 'Campanha para leads frios 30d',
    gatilho: 'EMAIL + CHATBOT',
    pedido: 'Cria campanha de reactivação para leads frios (sem interacção há 30+ dias). Sequência de 3 emails + sequência de seguimento nas automações próprias (Instagram/WhatsApp).',
  },
}

export type Separador = 'chat' | 'funnel' | 'kanban' | 'activity'

export type AccaoDeVoz =
  | { tipo: 'agente'; id: IdAgente }
  | { tipo: 'separador'; nome: Separador; dizer?: string }
  | { tipo: 'recarregar'; o_que: 'metricas' | 'n8n'; dizer: string }
  | { tipo: 'perguntar'; texto: string }
  | { tipo: 'nada' }

/** Tira acentos, para «métricas» e «metricas» darem no mesmo. Quem fala não escreve acentos. */
function semAcentos(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const PALAVRAS_DE_AGENTE: Array<[string, IdAgente]> = [
  ['prospecao', 'prospeccao'],
  ['prospeccao', 'prospeccao'],
  ['chatbot', 'chatbot_builder'],
  ['setter', 'setter'],
  ['financeiro', 'financial_email'],
  ['compliance', 'compliance'],
  ['conteudo', 'content_creation'],
  ['parcerias', 'partnerships'],
  ['trading', 'trading'],
  ['negocios', 'business_incubation'],
  ['ia control', 'ai_control'],
  ['educacao', 'education'],
  ['app', 'app_creator'],
]

/** Quanto tempo de fala é preciso para valer a pena mandar ao agente, em caracteres. */
const CURTO_DE_MAIS = 5

/**
 * O QUE UMA FRASE FALADA QUER DIZER.
 *
 * Duas entradas possíveis, e a diferença importa:
 *
 *  · com «ei aios» ou «jarvis» à frente é um COMANDO — mostra-me isto, muda para aquele;
 *  · sem a palavra de acordar, é conversa: vai inteira para o agente activo, desde que seja
 *    comprida que chegue para não ser ruído do microfone.
 *
 * A ordem das verificações não é arbitrária: os separadores e as recargas vêm ANTES dos nomes de
 * agente, porque «mostra-me o conteúdo» é um pedido de separador e «fala com o conteúdo» é um
 * pedido de agente — e as duas frases contêm a mesma palavra. Ao contrário, dizer «kanban» abria
 * o agente de Conteúdo em vez do quadro.
 */
export function lerComandoDeVoz(falado: string): AccaoDeVoz {
  const bruto = falado.trim()
  const t = semAcentos(bruto)
  const acordou = t.includes('ei aios') || t.includes('ei, aios') || t.includes('jarvis')

  if (!acordou) {
    return bruto.length > 10 ? { tipo: 'perguntar', texto: bruto } : { tipo: 'nada' }
  }

  const cmd = t.replace(/ei,? aios|jarvis/g, '').replace(/[.,!?]/g, '').trim()

  if (cmd.includes('metrica') || cmd.includes('relatorio')) {
    return { tipo: 'recarregar', o_que: 'metricas', dizer: 'A carregar as métricas do sistema MTM.' }
  }
  if (cmd.includes('marcac') || cmd.includes('booking') || cmd.includes('agenda')) {
    return { tipo: 'separador', nome: 'activity', dizer: 'A mostrar as marcações recentes.' }
  }
  if (cmd.includes('n8n') || cmd.includes('automac')) {
    return { tipo: 'recarregar', o_que: 'n8n', dizer: 'A verificar o estado do n8n.' }
  }
  if (cmd.includes('funil')) return { tipo: 'separador', nome: 'funnel' }
  if (cmd.includes('kanban') || cmd.includes('quadro')) return { tipo: 'separador', nome: 'kanban' }

  for (const [palavra, id] of PALAVRAS_DE_AGENTE) {
    if (cmd.includes(palavra)) return { tipo: 'agente', id }
  }

  return cmd.length > CURTO_DE_MAIS ? { tipo: 'perguntar', texto: cmd } : { tipo: 'nada' }
}

/**
 * O texto que sai de uma resposta em stream do chat.
 *
 * O formato é SSE e vem em três sabores conforme o modelo — `choices[0].delta.content` (OpenAI),
 * `content` e `text`. Aceitam-se os três, como o original fazia: um deles falhar em silêncio dava
 * uma resposta vazia num ecrã que parecia estar a funcionar.
 */
export function pedacoDoStream(linha: string): string {
  if (!linha.startsWith('data: ')) return ''
  const dados = linha.slice(6).trim()
  if (!dados || dados === '[DONE]') return ''
  try {
    const j = JSON.parse(dados) as {
      choices?: Array<{ delta?: { content?: string } }>
      content?: string
      text?: string
    }
    return j.choices?.[0]?.delta?.content ?? j.content ?? j.text ?? ''
  } catch {
    return ''
  }
}
