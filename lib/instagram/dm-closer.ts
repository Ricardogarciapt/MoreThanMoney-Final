/**
 * DM self-hosted da More Than Money — cérebro (AI closer) + envio pela Graph API.
 *
 * 1º nível: responde às DMs do Instagram diretamente (webhook /api/webhooks/instagram).
 * ManyChat fica como FAILSAFE (se este nível estiver off ou falhar).
 */

import { MIN_DEPOSIT } from '@/lib/telegram-broker-gate'
import { escadaNumaLinha, bonusNumaLinha, NOME_DEGRAU_TOPO,
  ondeComprarTopoNumaLinha, PRECO_MEMBRO, PRECO_TOPO } from '@/lib/escada-precos'
import { modeloClaude } from '@/lib/modelo-claude'

const DM_SYSTEM = `És um CLOSER humano da More Than Money (MTM · morethanmoney.pt), a falar por DM do Instagram do Ricardo Garcia. O teu trabalho é PROSPETAR e QUALIFICAR o lead e levá-lo a concretizar uma VENDA — não é dar acesso grátis à toa.

REGRAS DE ESTILO:
- Português de Portugal, tom próximo (é uma DM). Curto: 2-5 frases. Máx 1 pergunta + 1 call-to-action por mensagem. 1-2 emojis. Soa humano.
- Nunca prometas lucros, nunca cites valores em euros e nunca inventes dados. É educação financeira + trading, comunidade PT. Se falares de resultados, fala em PIPS e PERCENTAGEM, e diz que o valor em dinheiro depende do lote de cada um.

ESCADA DE VENDA (segue a ordem — NÃO lideres com o grátis):
1) QUALIFICAR: percebe o que a pessoa quer (aprender / sinais para copiar / automático) e a experiência. 1 pergunta.
2) DESEJO + PROVA: liga o que ela quer à comunidade e à prova real.
3) MEMBRO PRIMEIRO: apresenta o pack **Membro (${PRECO_MEMBRO})** como a entrada para começar já com a comunidade e sinais base.
4) ROTA INTELIGENTE (acesso completo): o acesso a TODOS os grupos de sinais + app Premium é broker-gated. A rota mais inteligente → abrir conta PU Prime + depositar ${MIN_DEPOSIT}$ → e AÍ a app Premium + grupos ficam de GRAÇA enquanto mantiver saldo ≥ ${MIN_DEPOSIT}$ ("em vez de mensalidade, o teu capital fica na tua conta"). É o fecho forte.
5) FECHAR / HANDOFF: um passo concreto — registar em morethanmoney.pt/register (Membro) OU seguir para o Telegram @MoreThanMoney_aibot para a rota PU Prime + validação. Leads quentes/sérios: diz que o Ricardo fala em privado para fechar.

REGRA DO GRÁTIS: NÃO ofereças subscrição grátis por defeito. A app/Premium "de graça" é a RECOMPENSA do depósito ${MIN_DEPOSIT}$ na PU Prime (usa como fecho, não como isco). Só se a pessoa recusar tudo é que podes mencionar o teste/entrada mais leve — e mesmo aí puxa para o Membro ou para a rota dos ${MIN_DEPOSIT}$.

ESCADA E BÓNUS (os números certos; não os cites de memória):
- ${escadaNumaLinha()}
- ${bonusNumaLinha()}
- O **${NOME_DEGRAU_TOPO} ${PRECO_TOPO}** é o topo: é para quem sobe, nunca a abertura. ${ondeComprarTopoNumaLinha()}

O QUE A MTM OFERECE (com naturalidade): scanners, sinais, cópia automática (MTM Copy), academia/lives, app. Provas reais no site.

RECRUTAMENTO DE CRIADORES/EDUCADORES (ativa quando a pessoa fala em CRIAR, ser CRIADOR/EDUCADOR, UGC, "quero vender o meu conteúdo/curso", ou vem do carrossel «Traz o teu conteúdo. Nós vendemos por ti.»):
- Modelo MTM Marketplace: o criador traz o conteúdo, a MTM trata de promoção, tráfego, pagamentos e alojamento. O criador fica com 90–95%; comissão MTM de 5–10% só quando há venda; 0€ de entrada, sem exclusividade. Link: morethanmoney.pt/criadores.
- FILTRO ANTI-VENDEDOR (obrigatório antes de encaminhar): pede SEMPRE 1 exemplo concreto do trabalho da pessoa (link do perfil, portfólio, curso ou amostra) + a área/nicho. NÃO encaminhes para o Ricardo quem só faz spam, quer "vender-te" uma ferramenta/serviço, pede dinheiro adiantado, ou recusa mostrar conteúdo real.
- Se a pessoa mostrar conteúdo genuíno: valida com entusiasmo, confirma a área e diz que o Ricardo (@ricardogarciapt) vai falar com ela em privado para os próximos passos. (Podes oferecer o cupão CREATOR60 para ela já entrar e conhecer a plataforma por dentro.)
- Se for claramente um vendedor/spam: sê educado mas não encaminhes — explica que a MTM não compra serviços por DM e aponta o formulário em morethanmoney.pt/criadores.

Responde SÓ com a mensagem para enviar à pessoa (texto puro, sem aspas, sem JSON, sem prefixos).`

/** Gera a resposta do closer para uma mensagem recebida. */
export async function generateDmReply(
  message: string,
  opts: { name?: string | null; lang?: string | null } = {},
): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) throw new Error("ANTHROPIC_API_KEY em falta")
  // O recurso estava escrito à mão, e já foi um id morto (`claude-3-5-haiku-20241022`): com as
  // duas variáveis por preencher, o closer respondia erro a toda a gente — em silêncio, porque
  // uma DM que falha não reclama. Trocar o id por outro id à mão só adia o mesmo dia. O
  // `modeloClaude` é que sabe quais são os mortos, e ignora-os mesmo quando é a CONFIGURAÇÃO a
  // pedi-los — que é o caso que um recurso à mão nunca chega a apanhar.
  const model = modeloClaude(process.env.MANYCHAT_CLOSER_MODEL)
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

/**
 * IDs das contas IG. Aceita VÁRIOS ids por conta (o webhook de mensagens pode
 * mandar o id IG-scoped OU o business id — já vimos a marca aparecer como
 * 17841474872672009 e 621570614380294). Env sobrepõe/estende (lista separada por vírgulas).
 */
const BRAND_IG_IDS = [
  process.env.INSTAGRAM_BUSINESS_ID,
  "17841474872672009", // @morethanmoney.pt (IG-scoped)
  "621570614380294",   // @morethanmoney.pt (visto no app)
  ...(process.env.INSTAGRAM_BRAND_IDS || "").split(","),
].map((s) => (s || "").trim()).filter(Boolean)

const PERSONAL_IG_IDS = [
  process.env.INSTAGRAM_PERSONAL_ID,
  "17841405656956716", // @ricardogarciapt
  ...(process.env.INSTAGRAM_PERSONAL_IDS || "").split(","),
].map((s) => (s || "").trim()).filter(Boolean)

function personalToken(): string | null {
  return process.env.INSTAGRAM_TOKEN_RICARDO?.trim() || process.env.INSTAGRAM_TOKEN_PERSONAL?.trim() || null
}
function brandToken(): string | null {
  return process.env.INSTAGRAM_TOKEN?.trim() || null
}

/** Escolhe o token IG certo para a conta que recebeu a mensagem (marca vs pessoal). */
export function tokenForIgAccount(igAccountId: string | null): string | null {
  return candidateTokensForIgAccount(igAccountId)[0] || null
}

/**
 * Tokens candidatos, POR ORDEM de tentativa. Devolvemos o mais provável primeiro
 * e o(s) outro(s) como fallback — se o id não bater certo (ou vier num formato que
 * não conhecemos), o webhook tenta o próximo token em vez de falhar a resposta.
 * Isto garante que @ricardogarciapt responde mesmo que o entry.id não coincida.
 */
export function candidateTokensForIgAccount(igAccountId: string | null): string[] {
  const p = personalToken()
  const b = brandToken()
  const id = (igAccountId || "").trim()
  const isPersonal = !!id && PERSONAL_IG_IDS.includes(id)
  const isBrand = !!id && BRAND_IG_IDS.includes(id)
  let order: (string | null)[]
  if (isPersonal) order = [p, b]
  else if (isBrand) order = [b, p]
  // Conta desconhecida → tenta a marca primeiro, depois a pessoal (nunca fica sem resposta).
  else order = [b, p]
  // dedup + remove nulls
  return order.filter((t, i): t is string => !!t && order.indexOf(t) === i)
}

/** Envia uma DM pela Graph API (janela de 24h; resposta imediata cai sempre dentro). */
export async function sendInstagramDm(
  igAccountId: string,
  recipientId: string,
  text: string,
  token: string,
): Promise<{ ok: boolean; error?: string; authError?: boolean }> {
  try {
    // Endpoint "me/messages" resolve a conta pelo próprio token — evita erros quando
    // o entry.id não é exatamente o id que o token espera.
    const res = await fetch(`https://graph.facebook.com/v21.0/me/messages`, {
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
      const code = data?.error?.code
      // 190=token inválido, 200/10/3=permissão/escopo, 100 subcode 2534014=conta não corresponde.
      const authError = [190, 200, 10, 3, 100].includes(Number(code)) || res.status === 401 || res.status === 403
      return { ok: false, error: data?.error?.message || `HTTP ${res.status}`, authError }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "erro" }
  }
}

/**
 * Envia tentando os tokens candidatos por ordem (pessoal→marca ou vice-versa).
 * Se o 1º token for rejeitado por auth/permissão, tenta o seguinte. Assim a resposta
 * sai pela conta certa mesmo que o routing por id não seja exato.
 */
export async function sendInstagramDmResilient(
  igAccountId: string,
  recipientId: string,
  text: string,
): Promise<{ ok: boolean; error?: string; usedFallback?: boolean }> {
  const candidates = candidateTokensForIgAccount(igAccountId)
  if (candidates.length === 0) return { ok: false, error: "sem token IG configurado" }
  let lastErr: string | undefined
  for (let i = 0; i < candidates.length; i++) {
    const r = await sendInstagramDm(igAccountId, recipientId, text, candidates[i])
    if (r.ok) return { ok: true, usedFallback: i > 0 }
    lastErr = r.error
    // Só vale a pena tentar o próximo token se o erro foi de auth/permissão.
    if (!r.authError) break
  }
  return { ok: false, error: lastErr }
}
