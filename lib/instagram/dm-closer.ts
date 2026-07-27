/**
 * DM self-hosted da More Than Money — cérebro (AI closer) + envio pela Graph API.
 *
 * 1º nível: responde às DMs do Instagram diretamente (webhook /api/webhooks/instagram).
 * ManyChat fica como FAILSAFE (se este nível estiver off ou falhar).
 */

const DM_SYSTEM = `És o assistente de vendas e onboarding da More Than Money (MTM · morethanmoney.pt), a falar por DM do Instagram do Ricardo Garcia.

OBJETIVO: transformar interesse em ação — oferecer uma subscrição GRÁTIS da MTM, levar a pessoa a registar-se e ensiná-la a usar. Caloroso, humano, direto. Nada de robótico.

REGRAS DE ESTILO:
- Português de Portugal, tom próximo (é uma DM, não um email). Curto: 2-5 frases.
- No máximo 1 pergunta e 1 call-to-action por mensagem.
- Emojis com moderação (1-2). Nunca "spam".
- Nunca inventes números, promessas de lucro garantido, nem dados que não sabes. Sê honesto.

OFERTA E ONBOARDING (usa SEMPRE que a pessoa mostra interesse, pede a oferta dos 35€, ou quer experimentar):
- Oferece a subscrição GRÁTIS, sem cartão. USA O CUPÃO na resposta:
  • Por defeito (quem pediu a oferta dos 35€ ou quer começar) → cupão **MEMBER30** = Membro grátis 1 mês. É a versão GRÁTIS do plano de 35€.
  • Para criadores/UGC/parceiros → cupão **CREATOR60** = Premium + VIP grátis 60 dias.
- Passos a dar na mensagem: 1) ir a morethanmoney.pt/register; 2) criar conta (email + password); 3) no campo CUPÃO meter o código (MEMBER30). Sem cartão.
- Depois de registar: entrar em morethanmoney.pt/mtmcopy para ligar a cópia automática das estratégias, e explorar scanners/sinais no scanner-access.
- Oferece-te para ajudar passo a passo se tiverem dúvidas.
- Menciona sempre o código do cupão em MAIÚSCULAS para ser fácil de copiar.

O QUE A MTM OFERECE (fala com naturalidade, sem despejar tudo): scanners de trading, sinais, cópia automática (MTM Copy), academia/lives, e uma app. Provas reais existem no site.

Responde SÓ com a mensagem para enviar à pessoa (texto puro, sem aspas, sem JSON, sem prefixos).`

/** Gera a resposta do closer para uma mensagem recebida. */
export async function generateDmReply(
  message: string,
  opts: { name?: string | null; lang?: string | null } = {},
): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) throw new Error("ANTHROPIC_API_KEY em falta")
  const model =
    process.env.MANYCHAT_CLOSER_MODEL?.trim() ||
    process.env.ANTHROPIC_MODEL?.trim() ||
    "claude-3-5-haiku-20241022"
  const lang = (opts.lang || "").trim() || "português de Portugal"
  const who = opts.name ? ` O primeiro nome da pessoa é ${opts.name}.` : ""
  const user = `Idioma a usar: ${lang}.${who}\nMensagem da pessoa: "${message}"`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 400, system: DM_SYSTEM, messages: [{ role: "user", content: user }] }),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    const text: string = (data?.content || [])
      .filter((p: { type?: string }) => p?.type === "text")
      .map((p: { text?: string }) => p.text || "")
      .join("")
      .trim()
    return text
  } finally {
    clearTimeout(timer)
  }
}

/** IDs das contas IG (públicos). Env sobrepõe-se se definido. */
const BRAND_IG_ID = process.env.INSTAGRAM_BUSINESS_ID?.trim() || "17841474872672009" // @morethanmoney.pt
const PERSONAL_IG_ID = process.env.INSTAGRAM_PERSONAL_ID?.trim() || "17841405656956716" // @ricardogarciapt

/** Escolhe o token IG certo para a conta que recebeu a mensagem (marca vs pessoal). */
export function tokenForIgAccount(igAccountId: string | null): string | null {
  const personalToken = process.env.INSTAGRAM_TOKEN_RICARDO?.trim() || process.env.INSTAGRAM_TOKEN_PERSONAL?.trim() || null
  const brandToken = process.env.INSTAGRAM_TOKEN?.trim() || null
  if (igAccountId && igAccountId === PERSONAL_IG_ID) return personalToken || brandToken
  if (igAccountId && igAccountId === BRAND_IG_ID) return brandToken
  // conta desconhecida → tenta a marca (default)
  void BRAND_IG_ID
  return brandToken
}

/** Envia uma DM pela Graph API (janela de 24h; resposta imediata cai sempre dentro). */
export async function sendInstagramDm(
  igAccountId: string,
  recipientId: string,
  text: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${igAccountId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: text.slice(0, 990) },
        access_token: token,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data?.error) {
      return { ok: false, error: data?.error?.message || `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "erro" }
  }
}
