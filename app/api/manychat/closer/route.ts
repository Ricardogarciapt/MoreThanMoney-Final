import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * POST /api/manychat/closer
 *
 * Closer de vendas para o ManyChat (Instagram/DM). Sempre-ligado (Vercel) — a
 * ManyChat chama este endpoint num passo "External Request" e mapeia
 * `response.answer` → campo `Claude_resposta`, depois responde com esse texto.
 *
 * Mesma "alma" do AIOS (nota mtm-sales-brain): provas reais, sem promessas de
 * lucro, regra Apple (iPhone → subscrever na app). Segurança opcional: se
 * MANYCHAT_CLOSER_SECRET estiver definido, exige header `x-mtm-secret`.
 */

const CLOSER_SYSTEM = `És o closer de vendas da MoreThanMoney a responder a uma mensagem direta no Instagram/DM.
Objetivo: acolher, criar confiança e levar a pessoa a (1) descarregar a app grátis / criar conta e (2) subir a Premium.
Estilo: humano, caloroso, direto, curto (máximo ~70 palavras, 1 a 3 frases), no máximo um emoji.

FACTOS REAIS (a MoreThanMoney é uma comunidade portuguesa de educação financeira e trading):
- Prova da comunidade: 675 trades acompanhados, 63% de win rate, +7.060€ documentados, 356 membros ativos.
- App MTM System (grátis): alertas, scanner, live sessions, ferramentas de trading.
- Produtos: App grátis · Pack Membro 35€/mês · Pack Premium 65€/mês (1º mês só 34,99€).
- 🎁 MELHOR PORTA DE ENTRADA: 14 DIAS PREMIUM GRÁTIS (sem cartão) com o código 14DayTrial. A pessoa descarrega a app, cria conta e em Mais → Definições → Resgatar código usa 14DayTrial. (No registo do site também há um trial de 3 dias, mas o código 14DayTrial dá 14 dias — usa este como oferta principal.)
- DESAFIO DO MÊS: todos os meses a comunidade oferece 3 mensalidades Premium a quem mais partilha os conceitos da MoreThanMoney, participa nas chamadas ao vivo e divulga nas redes (menciona quando fizer sentido; NUNCA prémio em troca de reviews).
- Links: registo/trial → morethanmoney.pt/register · Premium → morethanmoney.pt/upgrade · App iPhone → apps.apple.com/pt/app/id6778558643 · App Android → morethanmoney.pt/downloads/MoreThanMoney.apk · Código de trial (14 dias) → resgatar em Mais → Definições dentro da app: 14DayTrial
- COPYTRADING (copiar sinais/estratégias de forma automática — "MTM Copy" / "Tap to Trade"): se a pessoa quer COPIAR trades / algo AUTOMÁTICO / passivo, o caminho NÃO é o app trial — encaminha-a para o nosso assistente no Telegram: https://t.me/MoreThanMoney_aibot?start=lead — lá abre conta na corretora e ganha acesso aos grupos de sinais + à cópia automática. Explica em 1 frase e manda o link.

REGRAS ABSOLUTAS:
- Usa só os factos acima. NUNCA prometas lucros — é educação, não aconselhamento financeiro.
- Termina sempre com UM passo concreto (começar o trial grátis, descarregar a app, ou /upgrade) e, quando fizer sentido, uma pergunta que puxe resposta.
- Se a pessoa estiver no iPhone/app da Apple, encaminha para subscrever DENTRO da app (NUNCA envies links de pagamento). Caso contrário podes usar morethanmoney.pt/register ou /upgrade.
- Responde SEMPRE no mesmo idioma da mensagem da pessoa.
- Devolve APENAS JSON válido: {"answer":"a tua resposta de DM"}`

const PERSONAL_SYSTEM = `És o Ricardo (Ricardo Subtil Garcia) a responder pessoalmente no teu Instagram @ricardogarciapt. NÃO és um bot de vendas — és tu, humano, caloroso e genuíno.
Objetivo: criar RELAÇÃO com a pessoa e, quando fizer sentido, encaminhá-la SEM PRESSÃO para o perfil da marca @morethanmoney.pt, onde está a app grátis, o código 14DayTrial (14 dias de Premium grátis, sem cartão) e a equipa que acompanha.
Estilo: primeira pessoa ("eu"), soa a pessoa real e não a script, curto (máximo ~55 palavras, 1 a 3 frases), no máximo um emoji. Termina quase sempre com uma pergunta genuína (em que ponto está, o que a trouxe até ti).

CONTEXTO:
- És trader e fundador da MoreThanMoney (comunidade portuguesa de educação financeira e trading).
- No teu perfil pessoal preferes conversar e perceber a pessoa; se ela quiser ver o sistema/app/trial, dizes que está tudo reunido no @morethanmoney.pt.
- Há um desafio mensal da comunidade: todos os meses 3 mensalidades Premium para quem mais partilha os conceitos, participa nas chamadas e divulga nas redes — podes referi-lo de forma natural (nunca prémio por reviews).

REGRAS ABSOLUTAS:
- NUNCA prometas lucros — é educação, não aconselhamento financeiro.
- NÃO faças hard-sell. NÃO envies links de pagamento, PDFs nem freebies. O "próximo passo" é a pessoa continuar no @morethanmoney.pt ou responder-te aqui.
- Responde SEMPRE no mesmo idioma da mensagem da pessoa.
- Devolve APENAS JSON válido: {"answer":"a tua resposta"}`

async function callClaude(
  question: string,
  idioma: string | null,
  name: string | null,
  mode: string | null,
  source: string | null,
): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) throw new Error("ANTHROPIC_API_KEY em falta")
  const model =
    process.env.MANYCHAT_CLOSER_MODEL?.trim() ||
    process.env.ANTHROPIC_MODEL?.trim() ||
    "claude-3-5-haiku-20241022"

  const system = (mode || "").trim().toLowerCase() === "personal_router" ? PERSONAL_SYSTEM : CLOSER_SYSTEM
  const lang = (idioma || "").trim() || "português de Portugal"
  const who = name ? ` O primeiro nome da pessoa é ${name}.` : ""
  const src = (source || "").trim().toLowerCase() === "comment"
    ? "\nContexto: a pessoa COMENTOU numa publicação (não é uma DM privada). Agradece/reage ao comentário de forma natural e leva a conversa para a DM."
    : ""
  const user = `Idioma a usar: ${lang}.${who}${src}\nMensagem da pessoa: "${question}"`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    const text: string = (data?.content || [])
      .filter((p: any) => p?.type === "text")
      .map((p: any) => p.text)
      .join("")
      .trim()
    // Tenta extrair {"answer":"..."}; se falhar, usa o texto direto.
    try {
      const m = text.match(/\{[\s\S]*\}/)
      if (m) {
        const j = JSON.parse(m[0])
        if (typeof j?.answer === "string" && j.answer.trim()) return j.answer.trim()
      }
    } catch { /* usa texto direto */ }
    return text
  } finally {
    clearTimeout(timer)
  }
}

export async function POST(request: NextRequest) {
  // Segurança opcional por segredo partilhado.
  const secret = process.env.MANYCHAT_CLOSER_SECRET?.trim()
  if (secret && request.headers.get("x-mtm-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let body: any = {}
  try { body = await request.json() } catch { /* corpo vazio */ }
  const question = String(body.question || body.last_input_text || body.text || "").trim()
  if (!question) {
    return NextResponse.json({ error: "pergunta vazia" }, { status: 400 })
  }
  const idioma = body.idioma || body.lang || null
  const name = body.name || body.first_name || null
  const mode = body.mode || body.persona || null
  const source = body.source || body.trigger || null

  // Deteta intenção de COPYTRADING (copiar/automático) → funil Telegram broker-gate.
  const copytrading =
    /copy\s*trad|copytrading|autom[aá]tic|copiar (os |as )?(trades|sinais|opera)|mtm\s*copy|piloto autom|passiv|tap\s*to\s*trade/i.test(
      question,
    )
  const TG_FUNIL = "https://t.me/MoreThanMoney_aibot?start=lead"

  try {
    const answer = await callClaude(question, idioma, name, mode, source)
    return NextResponse.json({
      answer,
      idioma: idioma || "pt",
      engine: mode === "personal_router" ? "mtm-personal-router" : "mtm-closer",
      route: copytrading ? "copytrading" : "app",
      telegram_url: TG_FUNIL,
    })
  } catch (e: any) {
    // Fallback seguro para a ManyChat nunca ficar sem resposta.
    const fallback = copytrading
      ? `Boa escolha! Para copiares os nossos sinais/estratégias (copytrading), fala com o nosso assistente aqui 👉 ${TG_FUNIL} — ele guia-te para abrires conta e teres acesso.`
      : mode === "personal_router"
        ? "Olá! 👋 Aqui é o Ricardo (não é bot). Obrigado pela mensagem! Conta-me em duas linhas o que te trouxe — trading, o meu percurso, uma dúvida — e falo contigo. E se quiseres ver a app e o sistema, tenho tudo reunido no @morethanmoney.pt."
        : "Olá! 👋 Somos a MoreThanMoney — educação e trading com provas reais (675 trades, 63% win rate, +7.060€). Descarrega a app e ativa 14 dias de Premium GRÁTIS com o código 14DayTrial (sem cartão). Estás no iPhone ou Android?"
    return NextResponse.json({
      answer: fallback,
      engine: mode === "personal_router" ? "mtm-personal-router-fallback" : "mtm-closer-fallback",
      route: copytrading ? "copytrading" : "app",
      telegram_url: TG_FUNIL,
      error: e?.message || "erro",
    })
  }
}
