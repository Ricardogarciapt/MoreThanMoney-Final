/**
 * OS ESPECIALISTAS DO ASSISTENTE DE MARKETING — a equipa do padrão do telegram-bot-crewai (MIT):
 * um ROUTER lê o pedido e passa-o ao especialista certo, que trabalha com ferramentas, e no fim um
 * REVISOR vê o texto antes de chegar ao dono.
 *
 * O que cada especialista sabe fazer vem dos playbooks do digital-marketing-pro (MIT, Indranil
 * Banerjee) — campaign-plan, funnel-audit, funnel-architect, budget-optimizer, launch-plan,
 * competitor-analysis, email-sequence, content-calendar — resumidos ao que serve uma marca só, em
 * Portugal, sem benchmarks de sector inventados.
 *
 * PURO (sem rede): o `escolherPorPalavras` é a rede de segurança do router quando a IA falha, e a
 * guarda `marketing.check.ts` prova-o.
 */

export type IdEspecialista = 'estratega' | 'trafego' | 'funis' | 'conteudo' | 'email' | 'concorrencia'

export interface Especialista {
  id: IdEspecialista
  nome: string
  papel: string
  /** O playbook: como trabalha, passo a passo. */
  playbook: string
  /** As ferramentas que pode usar (nomes de lib/marketing/ferramentas). */
  ferramentas: string[]
  /** Palavras que, sem IA, mandam um pedido para este especialista. */
  palavras: RegExp
}

export const ESPECIALISTAS: readonly Especialista[] = [
  {
    id: 'estratega',
    nome: 'Estratega de campanhas',
    papel: 'planeia campanhas e lançamentos de ponta a ponta',
    playbook: `Playbook (campaign-plan + launch-plan):
1. Classifica o objectivo: notoriedade, consideração ou conversão.
2. Define 1-2 segmentos de público com o que os move.
3. Escolhe a mistura de canais (Instagram orgânico com palavra-chave, Meta Ads, Telegram, WhatsApp, email, agenda) pelo orçamento e objectivo.
4. Divide o orçamento por canal e guarda 10-15% para testes.
5. Linha do tempo: pré-lançamento (T-14), lançamento (T0-T3), manter e optimizar (T+4 a T+30).
6. KPIs por canal e o que se decide em cada ponto de controlo. Sem benchmarks inventados: diz o que medir.
7. Riscos e plano B.
Quando o pedido é um PRODUTO NOVO, usa a ferramenta propor_lancamento para deixar o kit (formulário + automação + funil) pronto a aplicar.`,
    ferramentas: ['estado_do_negocio', 'pipeline_vendas', 'campanhas_meta', 'leads_por_origem', 'marca_da_casa', 'propor_lancamento', 'propor_campanha_meta'],
    palavras: /\b(plano|planear|estrat[eé]gia|lan[cç]a(r|mento)|campanha nova|produto novo|roadmap|kpi)/i,
  },
  {
    id: 'trafego',
    nome: 'Gestor de tráfego',
    papel: 'lê as campanhas Meta, diagnostica e propõe orçamento e criativos',
    playbook: `Playbook (budget-optimizer + creative-health):
1. Lê as campanhas do período com campanhas_meta (gasto, CTR, CPL, frequência) e o diagnóstico automático.
2. Compara cada campanha com a média da própria conta, não com benchmarks de sector.
3. Ordena por eficiência marginal: onde o próximo euro rende mais leads no CRM.
4. Regras: escalar no máximo 20% de cada vez; não cortar antes de ~50 cliques ou 2-3x o CPL alvo gasto; frequência >3 = fadiga.
5. Propõe as mudanças em lista (pausar, subir, descer orçamento) — quem carrega no botão é o dono, em Gestão → Tráfego.
6. Se faltar criativo, propõe uma campanha nova com propor_campanha_meta (nasce sempre em pausa).`,
    ferramentas: ['campanhas_meta', 'leads_por_origem', 'pipeline_vendas', 'marca_da_casa', 'propor_campanha_meta'],
    palavras: /\b(an[uú]ncio|ads|meta ads|facebook ads|tr[aá]fego|cpl|cpc|ctr|or[cç]amento|gasto|campanhas?)\b/i,
  },
  {
    id: 'funis',
    nome: 'Arquitecto de funis e CRM',
    papel: 'audita e desenha funis, formulários e automações ligados ao pipeline',
    playbook: `Playbook (funnel-audit + funnel-architect):
1. Mapeia o funil actual etapa a etapa com listar_funis e pipeline_vendas (lead → contactado → qualificado → marcado → apresentado → ganho).
2. Encontra a maior queda entre etapas e o custo dela.
3. Causas possíveis por gargalo: mensagem, público, fricção, tempo de resposta, oferta, seguimento.
4. Qualidade dos leads: estão a entrar as pessoas certas? (leads_por_origem)
5. Prioriza correcções por impacto e esforço; a primeira tem de ser testável numa semana.
6. Para um produto ou oferta nova, desenha o kit com propor_lancamento: palavra-chave do Instagram → resposta e seguimento → formulário → etiqueta no pipeline → marcação.`,
    ferramentas: ['listar_funis', 'pipeline_vendas', 'leads_por_origem', 'listar_automacoes', 'estado_do_negocio', 'propor_lancamento'],
    palavras: /\b(funil|funis|crm|pipeline|formul[aá]rio|lead magnet|automa[cç][aã]o|convers[aã]o|qualifica)/i,
  },
  {
    id: 'conteudo',
    nome: 'Estratega de conteúdo',
    papel: 'calendário, Reels, posts e ganchos para as redes',
    playbook: `Playbook (content-calendar + content-engine):
1. Vê o que já está na fila (fila_de_conteudo) para não repetir.
2. Fases do funil: descoberta (dor, história), consideração (método, bastidores), decisão (prova em pips com origem, oferta).
3. Ritmo da casa: Ter/Qui/Sáb + Stories diárias; Reels com gráficos animados, narrador com emoção, ganchos nos 3 primeiros segundos.
4. Cada peça termina num CTA de palavra-chave do funil.
5. Entrega em tabela: dia · formato · tema · gancho · palavra-chave.`,
    ferramentas: ['fila_de_conteudo', 'leads_por_origem', 'marca_da_casa'],
    palavras: /\b(conte[uú]do|reels?|posts?|stories|calend[aá]rio|instagram|tiktok|gancho|legenda|carrossel)/i,
  },
  {
    id: 'email',
    nome: 'Especialista de email e mensagens',
    papel: 'sequências de email, Telegram e WhatsApp com consentimento',
    playbook: `Playbook (email-sequence):
1. Define o objectivo da sequência (boas-vindas, nutrir, reactivar, pós-chamada) e a saída (marcar, comprar).
2. 3 a 7 mensagens, cada uma com assunto, pré-cabeçalho, corpo curto e um só CTA.
3. Intervalos entre mensagens e condição de paragem (respondeu, marcou, comprou).
4. Entregabilidade: sem palavras de spam, link de saída, remetente reconhecível.
5. WhatsApp só dentro das 24 h ou com consentimento registado; campanhas exigem consentimento em captacao_consentimento.`,
    ferramentas: ['leads_por_origem', 'pipeline_vendas', 'marca_da_casa'],
    palavras: /\b(e-?mails?|newsletter|sequ[eê]ncia|nutrir|reactiva|whatsapp|telegram|mensagens?)\b/i,
  },
  {
    id: 'concorrencia',
    nome: 'Analista de concorrência e posicionamento',
    papel: 'compara a casa com concorrentes e afina o posicionamento',
    playbook: `Playbook (competitor-analysis):
1. Para cada concorrente (2 a 5): posicionamento, promessa, oferta e preço, canais, criativos.
2. Marca as promessas que a casa NUNCA faria (lucro garantido, números sem origem) — são a nossa diferença.
3. Onde estamos mais fortes (ferramentas próprias, prova em pips com origem, acompanhamento) e onde estamos atrás.
4. Três acções de diferenciação, testáveis.
Se o dono não te der o que o concorrente diz, pede-lhe que cole o anúncio ou a página — não inventes o que o concorrente faz.`,
    ferramentas: ['marca_da_casa'],
    palavras: /\b(concorr|competi|posicionamento|diferencia|benchmark|comparar)/i,
  },
] as const

export function especialistaPorId(id: string): Especialista | undefined {
  return ESPECIALISTAS.find((e) => e.id === id)
}

/** O router sem IA: a primeira família de palavras que bate. Sem nenhuma, o estratega. */
export function escolherPorPalavras(pedido: string): IdEspecialista {
  // A ordem importa: «anúncio para o funil» é tráfego; «funil do produto novo» é funis.
  const ordem: IdEspecialista[] = ['trafego', 'funis', 'email', 'conteudo', 'concorrencia', 'estratega']
  for (const id of ordem) if (especialistaPorId(id)!.palavras.test(pedido)) return id
  return 'estratega'
}

export const ROUTER_SISTEMA = `És o router do assistente de marketing da MoreThanMoney. Lês o pedido do dono e escolhes UM especialista:
${ESPECIALISTAS.map((e) => `- ${e.id}: ${e.nome} — ${e.papel}`).join('\n')}
Responde só com JSON: {"especialista":"<id>","motivo":"<uma frase>"}`

export const REVISOR_SISTEMA = `És o revisor de conformidade da MoreThanMoney (CMVM, RGPD, política de anúncios financeiros da Meta). Recebes a resposta de um especialista ao dono.
Corrige SÓ o que viola as regras abaixo, mantendo tudo o resto igual (estrutura, tabelas, Markdown). Se estiver tudo bem, devolve-a tal e qual.
Responde só com JSON: {"resposta":"<a resposta final em Markdown>","correcoes":["<o que mudaste, uma linha cada>"]}`
