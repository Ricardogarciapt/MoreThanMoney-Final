import type { MorningBriefingMetrics } from './morning-briefing-metrics'

export type MorningBriefingContent = {
  pushTitle: string
  pushBody: string
  chatPost: string
}

function fmtSignedPct(v: number | null): string {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${Math.round(v * 10) / 10}%`
}

function buildMetricsBlock(m: MorningBriefingMetrics): string {
  // Leitura HUMANA dos dados (não uma tabela de números). No máximo um número de
  // destaque por tema, integrado na frase. Percentagem de variação de novos membros: OMITIDA.
  const lines: string[] = []

  // Comunidade — em prosa, calorosa
  const novos = m.community.newMembersThisWeek
  const chatVibe =
    m.engagement.chatMessagesThisWeek > 80
      ? 'O chat andou bem animado esta semana'
      : m.engagement.chatMessagesThisWeek > 0
        ? 'O chat teve boa conversa'
        : 'Há espaço para mais conversa no chat'
  const bookings = m.engagement.upcomingBookings > 0 ? ' e há sessões já marcadas nos próximos dias' : ''
  lines.push(
    `👥 Continuamos a crescer juntos — somos **${m.community.totalActive}** na comunidade${
      novos > 0 ? `, com mais **${novos}** a entrarem esta semana` : ''
    }. ${chatVibe}${bookings}.`,
  )

  // Trading — só o essencial, em tom leve
  if (m.trading && m.trading.tpHits24h > 0) {
    lines.push(
      `🎯 Nas últimas 24h fecharam **${m.trading.tpHits24h}** alvos com lucro nos canais — bom ritmo para quem seguiu o plano.`,
    )
  } else if (m.trading) {
    lines.push('🎯 Dia mais calmo no trading — às vezes o melhor trade é esperar pelo setup certo.')
  }

  // Estratégias/alertas — nota qualitativa, sem despejar percentagens de todas
  const liveProviders = m.providers.filter((p) => p.gainPct != null)
  const bestProvider = liveProviders
    .filter((p) => (p.gainPct ?? 0) > 0)
    .sort((a, b) => (b.gainPct ?? 0) - (a.gainPct ?? 0))[0]
  if (bestProvider) {
    lines.push(`🤖 As estratégias de cópia continuam a trabalhar — destaque para **${bestProvider.label}** (${fmtSignedPct(bestProvider.gainPct)}).`)
  }
  if (m.alerts && (m.alerts.wins > 0 || m.alerts.active > 0)) {
    lines.push(
      `🔔 Nos alertas, a semana ${m.alerts.wins >= m.alerts.loss ? 'correu bem' : 'exigiu disciplina'}${
        m.alerts.active > 0 ? ` e há sinais a acompanhar` : ''
      }.`,
    )
  }

  // DCA — só se houver, em linguagem simples
  if (m.dca) {
    const cTotal = m.dca.cryptoStrongBuys + m.dca.cryptoBuys
    const eTotal = m.dca.etfStrongBuys + m.dca.etfBuys
    if (cTotal + eTotal > 0) {
      lines.push(`📈 Há boas zonas de reforço (DCA) hoje — vale a pena espreitar em /portfolios antes de agires.`)
    }
  }

  return lines.join('\n\n')
}

function fallbackDaily(m: MorningBriefingMetrics): MorningBriefingContent {
  const greeting = m.weekdayLabel === 'segunda-feira' ? 'Boa semana' : 'Bom dia'
  const chatPost = `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  ☀️ ${greeting.toUpperCase()}, COMUNIDADE MTM  ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

${m.dateLabel}

Hoje é dia de **consistência**: pequenas acções diárias constroem liberdade a longo prazo.

${buildMetricsBlock(m)}

💡 **Foco do dia**
• Revê o teu plano DCA em /portfolios
• Participa no chat — partilha dúvidas e aprendizagens
• Protege o teu tempo: 15 minutos de mercado bem usados valem mais que horas de ansiedade

⚠️ _Conteúdo educativo e motivacional. Métricas agregadas da comunidade — sem dados pessoais._

🌟 Together We Go Further`

  return {
    pushTitle: '☀️ Bom dia, comunidade MTM!',
    pushBody: `Briefing de ${m.weekdayLabel}: o que esperar hoje. Abre #Geral.`,
    chatPost,
  }
}

function fallbackSunday(m: MorningBriefingMetrics): MorningBriefingContent {
  const chatPost = `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  🌟 BOA SEMANA, COMUNIDADE MTM  ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

${m.dateLabel}

Domingo é para **recarregar** e alinhar intenções. A semana que passou ficou para trás; esta é nova.

${buildMetricsBlock(m)}

🔥 **Reflexão da semana**
A comunidade MTM ${m.community.newMembersThisWeek > 0 ? 'cresceu' : 'manteve-se presente'} — cada passo conta. Tu fazes parte disto.

🎯 **Para esta semana**
• Define UMA meta concreta (aprender, reforçar DCA, marcar onboarding)
• Apoia alguém no chat — liderança começa pelo exemplo
• Cuida do corpo e da mente: performance sustentável > sprint esgotado

⚠️ _Métricas agregadas e anónimas (RGPD). Conteúdo educativo — não constitui consultoria financeira._

🌟 Together We Go Further`

  return {
    pushTitle: '🌟 Boa semana, comunidade MTM!',
    pushBody: 'Resumo da semana + energia para os próximos 7 dias. Abre #Geral.',
    chatPost,
  }
}

export async function generateMorningBriefing(
  metrics: MorningBriefingMetrics,
): Promise<MorningBriefingContent> {
  // ASR/LLM grátis: prefere Groq (llama) se houver key; senão OpenAI; senão fallback.
  const groqKey = process.env.GROQ_API_KEY?.trim()
  const openaiKey = process.env.OPENAI_API_KEY?.trim()
  const provider = groqKey ? 'groq' : openaiKey ? 'openai' : null
  if (!provider) {
    return metrics.isSunday ? fallbackSunday(metrics) : fallbackDaily(metrics)
  }
  const apiUrl =
    provider === 'groq'
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions'
  const apiKey = (provider === 'groq' ? groqKey : openaiKey) as string
  const model =
    provider === 'groq'
      ? process.env.GROQ_BRIEFING_MODEL || 'llama-3.3-70b-versatile'
      : process.env.OPENAI_BRIEFING_MODEL || process.env.OPENAI_DCA_MODEL || 'gpt-4o-mini'

  const mode = metrics.isSunday
    ? 'domingo (resumo semanal + desejo de boa semana)'
    : 'dia útil (bom dia + briefing do dia)'
  const metricsJson = JSON.stringify(
    {
      date: metrics.dateLabel,
      weekday: metrics.weekdayLabel,
      community: {
        totalActive: metrics.community.totalActive,
        newMembersThisWeek: metrics.community.newMembersThisWeek,
      },
      engagement: metrics.engagement,
      trading: metrics.trading,
      providers: metrics.providers.filter((p) => p.gainPct != null),
      alerts: metrics.alerts,
      dca: metrics.dca,
    },
    null,
    2,
  )

  const prompt = `És o assistente oficial MoreThanMoney (PT-PT, tom "tu", próximo, humano, inspirador).

Gera um briefing ${mode} para publicar no chat #Geral da app.

DADOS AGREGADOS DE HOJE (contexto — anónimos):
${metricsJson}

>>> REGRA MAIS IMPORTANTE — NÃO SEJAS "MATEMÁTICO":
- Conta os dados como contarias a um amigo ao pequeno-almoço, NÃO como uma folha de Excel.
- Transforma os números numa LEITURA leve e motivadora. Ex.: em vez de "TPs: 5 (Premium 2 · Sensei 2 · Forex 1)", escreve "o trading teve um bom dia, com vários alvos a fechar com lucro".
- No MÁXIMO um número de destaque por tema, integrado naturalmente na frase (ex.: "somos já 675 na comunidade"). Nada de listas de bullets cheias de números e percentagens.
- NÃO faças "secções de métricas" nem tabelas. Integra tudo em 2-4 frases fluidas.
- Se um dado for pequeno/zero, ignora-o em vez de o expor.

RGPD / COMPLIANCE:
- Nunca nomes, emails ou dados pessoais. Só o retrato agregado.
- Conteúdo educativo — NÃO é consultoria financeira; sem promessas de ganhos.
- Nunca inventes preços, percentagens ou variações que não estejam nos dados.

TOM: disciplina, comunidade, longo prazo, mindset. Caloroso, não corporativo.

ESTRUTURA (markdown, emojis com moderação):
1. Cabeçalho curto ("☀️ BOM DIA" / "🌟 BOA SEMANA") + data
2. 2-3 frases de abertura calorosas
3. Um parágrafo leve que "lê" o pulso da comunidade e do trading de hoje (aqui entram os dados, EM PROSA — segue a regra acima)
4. 2-3 bullets de FOCO prático do dia (ações concretas, não números)
5. Uma frase de contexto de mercado genérica e educativa (ouro/índices/crypto), sem preços
6. Disclaimer curto + fecho "Together We Go Further"

Responde em JSON válido:
{
  "pushTitle": "título curto push (max 50 chars)",
  "pushBody": "corpo push (max 120 chars)",
  "chatPost": "texto completo do post chat"
}`

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 900,
        temperature: 0.6,
        response_format: { type: 'json_object' },
      }),
    })

    if (!res.ok) {
      return metrics.isSunday ? fallbackSunday(metrics) : fallbackDaily(metrics)
    }

    const data = await res.json()
    const raw = data?.choices?.[0]?.message?.content?.trim()
    if (!raw) {
      return metrics.isSunday ? fallbackSunday(metrics) : fallbackDaily(metrics)
    }

    const parsed = JSON.parse(raw) as Partial<MorningBriefingContent>
    if (!parsed.chatPost || !parsed.pushTitle || !parsed.pushBody) {
      return metrics.isSunday ? fallbackSunday(metrics) : fallbackDaily(metrics)
    }

    return {
      pushTitle: parsed.pushTitle.slice(0, 60),
      pushBody: parsed.pushBody.slice(0, 140),
      chatPost: parsed.chatPost,
    }
  } catch {
    return metrics.isSunday ? fallbackSunday(metrics) : fallbackDaily(metrics)
  }
}
