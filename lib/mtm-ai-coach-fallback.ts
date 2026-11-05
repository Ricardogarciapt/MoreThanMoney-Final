/**
 * Respostas locais quando não há API externa ou quando falha.
 * Garante o assistente sempre útil para MTM (onboarding, fast-start, mentor, aprendizagem).
 */
function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
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

  if (m.includes("risco") || m.includes("stop") || m.includes("perda")) {
    return `Gestão de risco por operação (antes de entrar):
1. Escolhe um valor fixo que aceitas perder numa só operação. Se não é um valor que não te tire o sono, é demasiado.
2. Define o stop-loss antes de entrar, e não o mudes depois de a operação estar aberta.
3. Calcula o tamanho da posição a partir desse valor e do stop, não ao contrário.
4. Regista cada operação no diário: motivo, risco definido, resultado e o que farias diferente.

O objetivo do mês é consistência, não uma operação perfeita. Se quiseres, diz-me o teu capital e o instrumento que usas e vemos juntos o cálculo.

Isto é educação, não consultoria financeira personalizada. Investir envolve risco de perda.`
  }

  if (m.includes("72h") || m.includes("72 h") || m.includes("primeiras 72")) {
    return `Primeiras 72 horas (execução):
1. H0–6h: agenda a sessão de onboarding e define o teu objetivo de aprendizagem.
2. Dia 1: completa o passo 1 do Fast Start e percorre o Feed, o Chat e o Ao Vivo.
3. Dia 1–2: configura uma conta demo ou liga a tua conta na corretora (Abrir Conta).
4. Dia 2–3: assiste a uma sessão ao vivo e escreve 3 apontamentos do que aprendeste.
5. Dia 3: define a regra de risco por operação e regista-a no diário.
6. Dia 4–5: escreve o teu plano da primeira semana e começa a segui-lo.

Usa Onboarding, Fast Start e a tab Mentor na app-mobile para marcar progresso.`
  }

  if (m.includes("sessao") || m.includes("ao vivo") || m.includes("live") || m.includes("mentor")) {
    return `Sessão ao vivo com o mentor (aprender, não copiar):
• Antes: escreve uma pergunta concreta sobre um tema que queres perceber (ex.: como ler o contexto antes de entrar).
• Durante: anota a lógica por trás de cada decisão, não só o resultado.
• Depois: resume em 3 linhas o que aprendeste e o que vais experimentar em conta demo.

Não entres em operações reais só porque alguém as fez na sessão. Cada decisão é tua, com o teu risco definido.`
  }

  if (m.includes("diario") || m.includes("revisao") || m.includes("semana") || m.includes("resultado")) {
    return `Revisão semanal dos resultados:
1. Pips e percentagens da semana, não só o último trade.
2. Erros: operações fora do plano, stops movidos, entradas por impulso.
3. Ajustes: escolhe no máximo uma coisa a mudar na semana seguinte.
4. Regista tudo no diário e compara com a semana anterior.

Uma semana sem revisão não conta como progresso. Faz a revisão sempre no mesmo dia e hora.`
  }

  if (m.includes("hoje") || m.includes("30 minutos") || m.includes("30 min") || m.includes("plano")) {
    return `Plano para hoje com 30 minutos:
1. 10 min — Percorre a app: Ao Vivo, Scanner e Abrir Conta. Confirma o que já está feito.
2. 10 min — Estuda um tema da comunidade e escreve 3 apontamentos.
3. 10 min — Atualiza o diário: a regra de risco por operação e o teu próximo passo.

Se ainda não tens conta na corretora, esse é o passo prioritário de hoje.`
  }

  if (journey || mentor) {
    return `Sou o assistente MTM ligado ao onboarding, Fast Start e Mentor na app.

Posso ajudar com:
• Plano 72h e rotina diária
• Gestão de risco por operação
• Sessões ao vivo e como tirar partido delas
• Revisão semanal dos resultados
• DCA / portfólio quando estás na tab Portfólio

Escreve por exemplo: "plano para hoje com 30 minutos", "como defino o risco por operação" ou "checklist 72h".`
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
• Plano 72h e rotina de aprendizagem
• Gestão de risco por operação
• Sessões ao vivo e revisão semanal
• Trading / DCA (visão geral; sem conselho financeiro personalizado)

Pergunta de forma concreta, por exemplo: "plano para hoje com 30 minutos" ou "como defino o risco por operação".`
}
