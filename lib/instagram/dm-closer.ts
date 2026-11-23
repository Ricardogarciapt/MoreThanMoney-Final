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
import { blocoFramework } from '@/lib/framework-mtm'
import { regrasDeFechoParaPrompt } from '@/lib/vendas/regras-fecho'
import { LINK_AGENDAR_FECHO_ALTO_VALOR } from '@/lib/agenda/link'
import { caminhosNumaLinha, TRIAL_CONDICAO } from '@/lib/escada-caminhos'

const DM_SYSTEM = `És o CLOSER da equipa da More Than Money (MTM · morethanmoney.pt), a falar por DM do Instagram do Ricardo Garcia. O teu trabalho é QUALIFICAR o lead e FECHAR a venda na própria conversa, de forma ética — não é dar acesso grátis à toa. Escreves como uma pessoa da equipa, com naturalidade; se te perguntarem se és uma IA ou um robô, dizes a verdade (és o assistente da equipa do Ricardo) e ofereces falar com ele.

REGRAS DE ESTILO:
- Português de Portugal, tom próximo (é uma DM). Curto: 2-5 frases. Máx 1 pergunta + 1 call-to-action por mensagem. 1-2 emojis. Soa humano.
- Nunca prometas lucros, nunca cites valores em euros e nunca inventes dados. É educação financeira + trading, comunidade PT. Se falares de resultados, fala em PIPS e PERCENTAGEM, e diz que o valor em dinheiro depende do lote de cada um.

PRIMEIRA MENSAGEM = QUEBRA-GELO (política de 22/11): se não há histórico, NÃO faças pitch nem mandes links. Abre de forma pessoal, ligada ao que a pessoa escreveu (o comentário, o reel, a palavra que comentou, a pergunta), agradece e faz UMA pergunta leve sobre ela (o que a trouxe, o que quer mudar). A venda começa na segunda troca.

COMO FECHAR (segue a ordem; usa o histórico da conversa para não repetir perguntas):
1) QUALIFICAR: o que a pessoa quer (aprender / sinais para copiar / automático), a experiência e se tem capital próprio que pode arriscar. 1 pergunta de cada vez.
2) DESEJO + PROVA: liga o que ela quer à comunidade e à prova real (pips e percentagem, com origem).
3) FECHAR NA CONVERSA: escolhe o destino pelas regras abaixo e manda UM link: Rota Corretora → morethanmoney.pt/abrir-conta e depois o Telegram @MoreThanMoney_aibot para validar o UID; Membro/Premium → morethanmoney.pt/register; anual → o link do topo. Antes do link, confirma preço e o que recebe.
4) ALTO VALOR OU PEDIDO DE PESSOA: não fechas — marcas a chamada de fecho com o Ricardo.

${regrasDeFechoParaPrompt(LINK_AGENDAR_FECHO_ALTO_VALOR)}

OFERTA DE ENTRADA (política de 22/11, substitui a antiga «regra do grátis»): depois de qualificar, a porta de entrada concreta para quem quer APRENDER é o Premium com ${TRIAL_CONDICAO} → morethanmoney.pt/register?plan=premium (se não quiser pôr cartão: Membro ${PRECO_MEMBRO}). Para quem ainda está a começar e prefere ler primeiro, o e-book «O Método Frio» (grátis em troca do email) → morethanmoney.pt/ebooks/o-metodo-frio. Quem tem capital próprio e quer operar a sério vai pela Rota Corretora (PU Prime regulada; o capital fica do cliente; o Premium vem incluído). Quem está interessado mas com dúvidas: convida para uma apresentação de 15 min por Google Meet em morethanmoney.pt/agendar. Nunca mais do que um destes por mensagem.
${caminhosNumaLinha()}
NUNCA linguagem de rede/recrutamento (nada de «oportunidade de negócio», «downline», «equipa que te paga»), nunca promessas de lucro.

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
/** Uma troca anterior da mesma conversa (o que a pessoa escreveu e o que lhe respondemos). */
export interface TrocaDm { pessoa: string; nos?: string | null }

/** Quantas trocas anteriores entram no prompt. Chega para não repetir perguntas, sem gastar tokens. */
export const MAX_HISTORICO_DM = 6

/**
 * As mensagens para a IA: o histórico (mais antigo primeiro) e a mensagem nova. Sem histórico, o
 * closer recomeçava a qualificação a cada DM — não se fecha uma venda a quem se pergunta três
 * vezes a mesma coisa.
 */
export function mensagensDoCloser(user: string, historico: TrocaDm[] = []): PedidoIA['mensagens'] {
  const out: PedidoIA['mensagens'] = []
  for (const t of historico.slice(-MAX_HISTORICO_DM)) {
    if (!t.pessoa?.trim()) continue
    out.push({ role: 'user', content: t.pessoa.slice(0, 600) })
    if (t.nos?.trim()) out.push({ role: 'assistant', content: t.nos.slice(0, 900) })
  }
  // A conversa tem de alternar e acabar na pessoa: uma troca sem resposta nossa junta-se à seguinte.
  const limpo: PedidoIA['mensagens'] = []
  for (const m of out) {
    const ultimo = limpo[limpo.length - 1]
    if (ultimo && ultimo.role === m.role) ultimo.content = `${ultimo.content}\n${m.content}`
    else limpo.push({ ...m })
  }
  if (limpo.length && limpo[limpo.length - 1].role === 'user') {
    limpo[limpo.length - 1].content = `${limpo[limpo.length - 1].content}\n${user}`
  } else {
    limpo.push({ role: 'user', content: user })
  }
  return limpo
}

export async function generateDmReply(
  message: string,
  opts: { name?: string | null; lang?: string | null; historico?: TrocaDm[] } = {},
  chamar: ChamarIA = chamarIA,
): Promise<string> {
  const lang = (opts.lang || "").trim() || "português de Portugal"
  const who = opts.name ? ` O primeiro nome da pessoa é ${opts.name}.` : ""
  const user = `Idioma a usar: ${lang}.${who}\nMensagem da pessoa: "${message}"`

  const r = await chamar({
    tarefa: 'ig-dm-closer',
    sistema: `${DM_SYSTEM}\n\n${blocoFramework('closer')}`,
    mensagens: mensagensDoCloser(user, opts.historico),
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

/**
 * Tokens guardados no /admin/social (`site_settings.instagram_tokens`) — 20/11/2026.
 *
 * O closer só lia variáveis de ambiente, e essas estão VAZIAS desde que os tokens passaram para a
 * base (ver lib/instagram/publish.ts). Resultado: mesmo que uma DM chegasse, o closer ficava
 * «sem token IG» em silêncio. Agora a base manda e o ambiente fica de reserva, como na publicação.
 * `carregarTokensIG()` tem de correr antes de pedir candidatos (o webhook chama-o à entrada).
 */
let tokensBase: Record<string, string> = {}
let tokensBaseEm = 0
export async function carregarTokensIG(): Promise<void> {
  if (Date.now() - tokensBaseEm < 60_000) return
  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin-client")
    const { data } = await getSupabaseAdmin().from("site_settings").select("value").eq("key", "instagram_tokens").maybeSingle()
    const v = data?.value
    const obj = (typeof v === "string" ? JSON.parse(v) : v) as Record<string, string> | null
    tokensBase = obj && typeof obj === "object" ? obj : {}
  } catch {
    /* sem base, fica o ambiente */
  }
  tokensBaseEm = Date.now()
}

function personalToken(): string | null {
  return (
    tokensBase.INSTAGRAM_TOKEN_RICARDO?.trim() ||
    process.env.INSTAGRAM_TOKEN_RICARDO?.trim() ||
    process.env.INSTAGRAM_TOKEN_PERSONAL?.trim() ||
    null
  )
}
function brandToken(): string | null {
  return tokensBase.INSTAGRAM_TOKEN?.trim() || process.env.INSTAGRAM_TOKEN?.trim() || null
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
  await carregarTokensIG()
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
