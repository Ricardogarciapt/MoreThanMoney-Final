/**
 * Respostas locais quando não há API externa ou quando falha.
 * Garante o assistente sempre útil para MTM (onboarding, fast-start, mentor, ranks).
 */
function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

export function buildLocalMtmCoachReply(
  message: string,
  ctx?: {
    mentor_mode?: boolean
    onboarding_focus?: boolean
    tab?: string
    pathname?: string
    include_dca?: boolean
  }
): string {
  const m = norm(message)
  const mentor = ctx?.mentor_mode || ctx?.tab === "mentor"
  const journey = ctx?.onboarding_focus || mentor || m.includes("onboarding") || m.includes("fast start")

  if (m.includes("rising star") || (m.includes("rising") && m.includes("star"))) {
    return `Rising Star (MTM) — objetivo de equipa:
• 2 PE na perna esquerda e 2 PE na perna direita (PE = pessoas efetivas qualificadas segundo as regras do teu plano de compensação).

Plano diário simples (7 dias):
1. Manhã (15 min): lista de 10 contactos + 3 mensagens de abertura (DM).
2. Meio-dia: 1 convite para ver apresentação / call (3-way com mentor quando possível).
3. Fim do dia: regista resultados e follow-up a quem não respondeu.

Dica: volume + processo. Usa o painel Fast Start e o Mentor Automático na app para marcar passos.

Isto é orientação geral; confirma sempre os critérios oficiais PE no teu backoffice / documentação da rede.`
  }

  if (m.includes("bronze star") || (m.includes("bronze") && m.includes("star"))) {
    return `Bronze Star (MTM) — objetivo típico:
• 2 PE esquerda + 2 PE direita
• Volume de grupo (CV): 700 na perna esquerda e 700 na perna direita (conforme a tua definição de CV no plano).

Como trabalhar isto na prática:
1. Mantém o ritmo de prospecção diária (contactos + follow-up).
2. Acompanha duplicação: ajuda quem entrou a fazer o mesmo processo.
3. Revisa semanalmente PE por perna e CV acumulado no teu relatório.

Valores e definições exatas de PE/CV devem ser validados no material oficial da tua linha.

Para detalhes do dia a dia, pergunta também: "plano 72h" ou "leads e follow-up".`
  }

  if (m.includes("72h") || m.includes("72 h") || m.includes("primeiras 72")) {
    return `Primeiras 72 horas (execução):
1. H0–6h: agenda onboarding / alinha foco (trading vs negócio).
2. Dia 1: completa passo 1 do Fast Start + entra na comunidade de apoio.
3. Dia 2–3: 3-way com mentor + regista 10 leads mínimos.
4. Dia 3–4: 3 follow-ups estruturados (data, próximo passo).
5. Todo o tempo: 1 bloco curto de formação + 1 ação de outreach.

Usa Onboarding, Fast Start e a tab Mentor na app-mobile para marcar progresso — fica tudo ligado ao mesmo fluxo.`
  }

  if (m.includes("3-way") || m.includes("3 way") || m.includes("tres vias") || m.includes("três vias")) {
    return `Chamada 3-way (tu + prospecto + mentor):
• O mentor credibiliza e fecha o processo; tu apresentas e fazes a ponte.
• Antes da call: confirma horário, envia link e 1 frase do que vão ver.
• Na call: mentor lidera perguntas, tu reforças a tua história e próximo passo.
• Depois: follow-up em 24h com resumo e link/material.

Pede ao teu mentor de linha horários fixos para 3-way — consistência aumenta conversões.`
  }

  if (m.includes("lead") || m.includes("follow-up") || m.includes("follow up") || m.includes("convers")) {
    return `Leads e conversões (processo simples):
1. Lista quente: 40+ nomes (rede, IG, LinkedIn, contactos antigos).
2. Diário: 10 reach-outs, 3 follow-ups, 1 convite para ver info/call.
3. Script: curiosidade → qualificação → convite para ferramenta/call (usa os scripts do painel de execução na página Fast Start).
4. Registo: nome, data, próximo passo — evita leads mortos.

Quanto mais registas, mais o mentor automático e o Fast Start refletem o teu ritmo real.`
  }

  if (journey || mentor) {
    return `Sou o assistente MTM ligado ao onboarding, Fast Start e Mentor na app.

Posso ajudar com:
• Rising Star e Bronze Star (metas de PE e CV)
• Plano 72h e rotina diária
• 3-way, leads e follow-up
• DCA / portfólio quando estás na tab Portfólio

Escreve por exemplo: "plano rising star", "bronze 700 cv" ou "checklist 72h".`
  }

  if (m.includes("dca") || m.includes("portfolio") || ctx?.include_dca) {
    return `Para DCA e portfólio: na tab Portfólio o assistente pode cruzar com os teus planos DCA quando existirem dados.

Resumo rápido DCA:
• Compra montantes fixos em intervalos regulares para suavizar preço médio.
• Combina com gestão de risco (não investir o que precisas a curto prazo).

Se quiseres algo específico, diz o ativo e o teu horizonte temporal.`
  }

  return `Olá! Sou o assistente MoreThanMoney.

Posso orientar-te em:
• Onboarding e Fast Start (passos e hábitos)
• Mentor automático (72h, ranks Rising / Bronze)
• Negócio: leads, 3-way, follow-up
• Trading / DCA (visão geral; sem conselho financeiro personalizado)

Pergunta de forma concreta, por exemplo: "Como chego a Rising Star?" ou "plano para hoje com 30 minutos".`
}
