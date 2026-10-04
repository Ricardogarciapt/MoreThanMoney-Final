/**
 * DM self-hosted da More Than Money — cérebro (AI closer) + envio pela Graph API.
 *
 * Responde às DMs do Instagram diretamente (webhook /api/webhooks/instagram). É o ÚNICO nível:
 * o ManyChat, que era a rede de segurança, saiu a 04/10/2026 — se isto estiver desligado, a DM
 * fica sem resposta, e é por isso que o interruptor IG_DM_SELFHOSTED_ENABLED não deve estar a 'false'.
 */

import { MIN_DEPOSIT } from '@/lib/telegram-broker-gate'
import { escadaNumaLinha, bonusNumaLinha, NOME_DEGRAU_TOPO,
  ondeComprarTopoNumaLinha, PRECO_MEMBRO, PRECO_TOPO } from '@/lib/escada-precos'
import { chamarIA, type PedidoIA } from '@/lib/ia/chamar'

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
- Modelo MTM Marketplace: o criador traz o conteúdo, a MTM trata de promoção, tráfego, pagamentos e alojamento. O criador fica com 80%; comissão MTM de 20% só quando há venda; 0€ de entrada, sem exclusividade. Link: morethanmoney.pt/criadores.
- FILTRO ANTI-VENDEDOR (obrigatório antes de encaminhar): pede SEMPRE 1 exemplo concreto do trabalho da pessoa (link do perfil, portfólio, curso ou amostra) + a área/nicho. NÃO encaminhes para o Ricardo quem só faz spam, quer "vender-te" uma ferramenta/serviço, pede dinheiro adiantado, ou recusa mostrar conteúdo real.
- Se a pessoa mostrar conteúdo genuíno: valida com entusiasmo, confirma a área e diz que o Ricardo (@ricardogarciapt) vai falar com ela em privado para os próximos passos. (Podes oferecer o cupão CREATOR60 para ela já entrar e conhecer a plataforma por dentro.)
- Se for claramente um vendedor/spam: sê educado mas não encaminhes — explica que a MTM não compra serviços por DM e aponta o formulário em morethanmoney.pt/criadores.

Responde SÓ com a mensagem para enviar à pessoa (texto puro, sem aspas, sem JSON, sem prefixos).`

/**
 * Qualidade por omissão: é a conversa mais perto de uma venda que a casa tem. `IG_CLOSER_PREFERENCIA`
 * ('rapido' | 'qualidade') substitui o antigo `IG_CLOSER_MODEL`, que escolhia um id da Anthropic —
 * com a IA a entrar por uma porta só (Groq → Gemini → Ollama → OpenAI → Anthropic), escolher um
 * modelo de UM fornecedor deixou de querer dizer nada.
 */
function preferenciaDoCloser(): PedidoIA['preferencia'] {
  return process.env.IG_CLOSER_PREFERENCIA?.trim() === 'rapido' ? 'rapido' : 'qualidade'
}

/** A porta única da IA. Injectável para a guarda provar o caso mau sem rede. */
export type ChamarIA = typeof chamarIA

/**
 * Gera a resposta do closer para uma mensagem recebida.
 *
 * Se a cadeia INTEIRA de fornecedores falhar, LANÇA (`ErroIA`). Não devolve texto nenhum — uma
 * DM que falha fica registada como erro em `ig_dm_log` pelo webhook, e não sai nada para a pessoa.
 * O contrário (enviar «a IA está indisponível» a um lead por DM) é pior do que não responder.
 */
export async function generateDmReply(
  message: string,
  opts: { name?: string | null; lang?: string | null } = {},
  chamar: ChamarIA = chamarIA,
): Promise<string> {
  const lang = (opts.lang || "").trim() || "português de Portugal"
  const who = opts.name ? ` O primeiro nome da pessoa é ${opts.name}.` : ""
  const user = `Idioma a usar: ${lang}.${who}\nMensagem da pessoa: "${message}"`

  const r = await chamar({
    tarefa: 'ig-dm-closer',
    sistema: DM_SYSTEM,
    mensagens: [{ role: 'user', content: user }],
    maxTokens: 400,
    preferencia: preferenciaDoCloser(),
    timeoutMs: 20_000,
  })
  const text = r.texto.trim()
  // Texto vazio não é resposta: rebenta para o webhook registar o erro em vez de enviar nada/lixo.
  if (!text) throw new Error(`o closer recebeu texto vazio de ${r.fornecedor} (${r.modelo})`)
  return text
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
