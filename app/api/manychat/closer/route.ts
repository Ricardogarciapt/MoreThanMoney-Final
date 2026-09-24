import { NextRequest, NextResponse } from "next/server"
import { MIN_DEPOSIT } from '@/lib/telegram-broker-gate'
import { MTMCOPY_BOT_USERNAME } from '@/lib/mtmcopy/telegram-bot'

/**
 * O link do assistente no Telegram — UMA fonte para o nome do bot.
 *
 * Estava escrito à mão em dois sítios deste ficheiro, com o nome ANTIGO do bot. Um link de
 * Telegram errado não dá erro: dá uma página a dizer que o utilizador não existe, e o lead que
 * vinha do Instagram acaba ali.
 */
const TG_LINK = `https://t.me/${MTMCOPY_BOT_USERNAME()}?start=lead`

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

const CLOSER_SYSTEM = `És o CLOSER de vendas da MoreThanMoney a responder a uma DM (Instagram/ManyChat). Prospetar + qualificar + FECHAR — não é dar acesso grátis à toa.
Estilo: humano, caloroso, direto, curto (máx ~70 palavras, 1-3 frases), no máx 1 emoji.

ESCADA DE VENDA (segue a ordem — NÃO lideres com o grátis):
1) QUALIFICAR (1 pergunta): aprender / copiar sinais / automático + experiência.
2) DESEJO + PROVA: liga o que quer à comunidade.
3) MEMBRO PRIMEIRO: pack Membro 35€/mês como entrada.
4) ROTA INTELIGENTE (acesso completo, broker-gated): abrir conta PU Prime + depositar ${MIN_DEPOSIT}$ → app Premium + TODOS os grupos de sinais de GRAÇA enquanto saldo ≥ ${MIN_DEPOSIT}$. É o fecho forte ("em vez de mensalidade, o capital fica na tua conta").
5) FECHAR/HANDOFF: 1 passo — registar Membro em morethanmoney.pt/register OU (rota broker/copytrading) o assistente Telegram ${TG_LINK} onde abre conta + valida + ganha os grupos. Leads sérios → diz que o Ricardo fala em privado.

FACTOS REAIS (comunidade PT de educação financeira + trading; usa só estes):
- Prova: sinais acompanhados do início ao fim, medidos em PIPS e PERCENTAGEM (nunca em euros — o valor depende do lote de cada um), comunidade ativa. Nunca prometas lucro.
- Escada: Membro 35€/mês · Premium 65€/mês (1º mês 34,99€) · rota PU Prime ${MIN_DEPOSIT}$ = Premium + grupos grátis enquanto financiado.
- iPhone/app da Apple: subscrever DENTRO da app (NUNCA envies links de pagamento).

REGRA DO GRÁTIS: NÃO ofereças o trial/app grátis por defeito. A app/Premium "de graça" é a RECOMPENSA do depósito ${MIN_DEPOSIT}$ na PU Prime — usa como fecho, não como isco. Só se a pessoa recusar tudo mencionas uma entrada mais leve, puxando de volta ao Membro ou à rota dos ${MIN_DEPOSIT}$.

REGRAS ABSOLUTAS:
- Usa só os factos acima. NUNCA prometas lucros — é educação. Trata objeções (preço → valor; "é grátis?" → rota ${MIN_DEPOSIT}$ ou Membro).
- Termina SEMPRE com uma pergunta ou passo concreto que aproxima do fecho.
- Responde SEMPRE no idioma da pessoa.
- Devolve APENAS JSON válido: {"answer":"a tua resposta de DM"}`

const PERSONAL_SYSTEM = `És o Ricardo (Ricardo Subtil Garcia) a responder pessoalmente no teu Instagram @ricardogarciapt. NÃO és um bot de vendas — és tu, humano, caloroso e genuíno.
Objetivo: criar RELAÇÃO com a pessoa e, quando fizer sentido, encaminhá-la SEM PRESSÃO para o perfil da marca @morethanmoney.pt, onde está a app grátis, o trial de 3 dias e a equipa que acompanha.
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
  const TG_FUNIL = TG_LINK

  try {
    const answer = await callClaude(question, idioma, name, mode, source)
    // Escalada de lead QUENTE para o admin (supervisão): intenção de compra / falar com humano / depósito.
    // Best-effort, não bloqueia a resposta ao ManyChat.
    try {
      const { maybeEscalateLead } = await import("@/lib/mtm-sdr-escalation")
      const igUser = String(body.ig_username || body.username || "").trim() || null
      const subId = String(body.subscriber_id || body.user_id || body.id || igUser || "manychat").trim()
      void maybeEscalateLead({
        chatId: subId,
        username: igUser,
        firstName: name,
        userText: question,
        aiReply: answer,
        channel: mode === "personal_router" ? "instagram-pessoal" : "instagram",
      })
    } catch { /* escalada é opcional */ }
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
        : "Olá! 👋 Somos a MoreThanMoney — educação e trading a sério: mostramos cada sinal do início ao fim, em pips e percentagem. Diz-me: queres aprender, copiar sinais prontos ou algo automático? Assim mostro-te o caminho certo (começamos no pack Membro e há uma rota em que o Premium te sai de graça 😉)."
    return NextResponse.json({
      answer: fallback,
      engine: mode === "personal_router" ? "mtm-personal-router-fallback" : "mtm-closer-fallback",
      route: copytrading ? "copytrading" : "app",
      telegram_url: TG_FUNIL,
      error: e?.message || "erro",
    })
  }
}
