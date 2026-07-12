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
  // Nota: percentagem de variação de novos membros vs semana anterior é OMITIDA de propósito.
  let block = `📊 **Comunidade (dados agregados)**
• Membros activos: **${m.community.totalActive}**
• Novos membros (7 dias): **${m.community.newMembersThisWeek}**
• Mensagens no chat (7 dias): **${m.engagement.chatMessagesThisWeek}**
• Marcações futuras: **${m.engagement.upcomingBookings}**`

  if (m.trading) {
    const t = m.trading
    block += `\n\n🎯 **Trading (últimas 24h)**
• TPs atingidos: **${t.tpHits24h}** _(Premium ${t.perChannel.premium} · Sensei ${t.perChannel.sensei} · Forex ${t.perChannel.forex})_`
    if (t.newSenseiIdeas24h > 0) block += `\n• Novas ideias Sensei: **${t.newSenseiIdeas24h}**`
  }

  const liveProviders = m.providers.filter((p) => p.gainPct != null)
  if (liveProviders.length) {
    block += `\n\n🤖 **Estratégias MTMcopy (desempenho)**`
    for (const p of liveProviders) {
      const win = p.winRatePct != null ? ` · win ${Math.round(p.winRatePct)}%` : ''
      block += `\n• ${p.label}: **${fmtSignedPct(p.gainPct)}**${win}`
    }
  }

  if (m.alerts) {
    const a = m.alerts
    const win = a.winRatePct != null ? ` · win rate **${a.winRatePct}%**` : ''
    block += `\n\n🔔 **Alertas MTM (7 dias)**
• Pendentes ${a.pending} · Ativas ${a.active} · Wins **${a.wins}** · Loss **${a.loss}**${win}`
  }

  if (m.dca) {
    const cTotal = m.dca.cryptoStrongBuys + m.dca.cryptoBuys
    const eTotal = m.dca.etfStrongBuys + m.dca.etfBuys
    block += `\n\n📈 Oportunidades DCA hoje: **${cTotal}** crypto · **${eTotal}** ETF`
  }

  return block
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
  const openaiKey = process.env.OPENAI_API_KEY?.trim()
  if (!openaiKey) {
    return metrics.isSunday ? fallbackSunday(metrics) : fallbackDaily(metrics)
  }

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

  const prompt = `És o assistente oficial MoreThanMoney (PT-PT, tom "tu", próximo, inspirador, moralizador mas respeitoso).

Gera um briefing ${mode} para publicar no chat #Geral da app.

DADOS AGREGADOS (podes usar — são anónimos):
${metricsJson}

REGRAS RGPD / COMPLIANCE:
- NUNCA menciones nomes, emails ou dados pessoais de membros
- Só usa totais e tendências agregadas
- Conteúdo educativo — NÃO é consultoria financeira
- Sem garantias de retorno ou promessas de ganhos
- Tom motivacional: disciplina, comunidade, longo prazo, mindset
- NUNCA mostres a percentagem de variação de novos membros vs semana anterior (não a tens nos dados — não a inventes)

ESTRUTURA DO POST (markdown, usa emojis moderados):
1. Cabeçalho visual com título (como "☀️ BOM DIA" ou "🌟 BOA SEMANA")
2. Data
3. Parágrafo de abertura caloroso (2-3 frases)
4. Secção "O que esperar hoje" ou "Reflexão da semana" (adaptativo ao dia da semana)
5. Secção métricas comunidade (usa os números fornecidos; SEM percentagem de variação de novos membros)
6. Secção "🎯 Trading (últimas 24h)": TPs atingidos no total e por canal (Premium/Sensei/Forex) a partir de "trading"
7. Secção "🤖 Estratégias MTMcopy": desempenho em % (gainPct) e win rate de cada estratégia em "providers" (se houver)
8. Secção "🔔 Alertas MTM (7 dias)": desempenho dos alertas em "alerts" — pendentes, ativas, wins, loss e win rate (se houver)
8. Secção DCA se houver oportunidades (crypto/ETF)
9. 2-3 bullets de acção / foco
8. Notícias ou contexto macro: menciona temas gerais do mercado (ouro, índices, crypto) de forma genérica e educativa — sem preços inventados
9. Disclaimer curto educativo
10. Fecho "Together We Go Further"

Responde em JSON válido:
{
  "pushTitle": "título curto notificação push (max 50 chars)",
  "pushBody": "corpo push (max 120 chars)",
  "chatPost": "texto completo do post chat"
}`

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_BRIEFING_MODEL || process.env.OPENAI_DCA_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 900,
        temperature: 0.55,
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
