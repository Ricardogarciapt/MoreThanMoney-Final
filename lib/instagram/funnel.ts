/**
 * Funil IG — PROSPECTOR + SETTER (comment → DM). Warm/hot only.
 *
 * PROSPECTOR: varre os comentários dos posts/reels e deteta INTENÇÃO por palavra-chave
 *   (as CTAs dos reels: MUNDO, EU VOU, DISCIPLINA, PREMIUM, SINAIS, APP...).
 * SETTER: tenta uma DM PRIVADA (Graph `private_replies`) com a oferta + link; se o scope de DM
 *   faltar (app sem `instagram_manage_messages`, ManyChat Essential), cai para RESPOSTA PÚBLICA
 *   QUE JÁ LEVA O LINK. Regista o lead em `ig_leads`.
 * CLOSER (modelo ESSENTIAL, sem ManyChat): o fecho NÃO é no IG — o link leva ao funil do Telegram
 *   (`MoreThanMoney_aibot?start=lead` → lead-funnel + broker-gate) ou ao `/register` (trial
 *   self-serve). Toda a conversa/close é nativa (Telegram/site), não precisa de ManyChat nem de
 *   webhook de mensagens do IG. (/api/manychat/closer fica só para quando o ManyChat existir.)
 */
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { IG_ACCOUNTS, isAutoPublishBlocked, tokenForAccount } from "./publish"
import {
  lerInterruptor, tratarComentario, resumoVazio, contar, chegouAoTecto,
  type ResumoDoSetter,
} from "./setter"

const GRAPH = "https://graph.facebook.com/v21.0"
const DAYS_BACK = Number(process.env.IG_FUNNEL_DAYS) || 7 // janela de private_reply = 7 dias
const MAX_MEDIA = Number(process.env.IG_FUNNEL_MAX_MEDIA) || 40
const MAX_DM_PER_ACCOUNT = Number(process.env.IG_FUNNEL_MAX_PER_ACCOUNT) || 30

const REGISTER = "https://www.morethanmoney.pt/register"
const TELEGRAM = "https://t.me/MoreThanMoney_aibot?start=lead"
const CRIADORES = "https://www.morethanmoney.pt/criadores"
const FUNDED = "https://www.morethanmoney.pt/mtmfunded"
const SORTEIO = "https://www.morethanmoney.pt/sorteio"

interface Intent {
  key: string
  kw: string[]
  dm: (handle: string) => string
  pub: (handle: string) => string
}

// Ordem importa: copytrading primeiro (mais específico). Regra da marca: trial = 3 dias.
const INTENTS: Intent[] = [
  {
    key: "copytrading",
    kw: ["SINAIS", "SINAL", "COPY", "COPYTRADING", "COPIAR", "GRUPO", "GRUPOS"],
    dm: (h) => `Boa${h}! 🙌 Para os sinais + copytrading, fala com o nosso assistente aqui 👉 ${TELEGRAM} — ele guia-te a abrir conta e ter acesso. 🚀`,
    // Sem DM (app sem scope de mensagens): a resposta PÚBLICA leva já o link → o lead auto-serve-se.
    pub: (h) => `Boa${h}! 🔥 Sinais + copytrading é aqui no nosso Telegram 👉 ${TELEGRAM} (abre conta e tens acesso). 🚀`,
  },
  {
    // RECRUTAMENTO DE CRIADORES (carrossel «TRAZ O TEU CONTEÚDO. NÓS VENDEMOS POR TI.»).
    // Antes do 'trial' porque "QUERO CRIAR" deve cair aqui, não no trial. Filtro anti-vendedor:
    // a resposta PEDE 1 exemplo do conteúdo/portfólio ANTES de encaminhar para o Ricardo — quem só
    // quer fazer spam/vender cursos genéricos não passa esta porta. Qualificação fina no dm-closer.
    key: "educator",
    kw: ["CRIAR", "CRIADOR", "CRIADORA", "CRIADORES", "EDUCADOR", "EDUCADORA", "CREATE", "CREATOR", "EDUCATOR", "UGC"],
    dm: (h) =>
      `Boa${h}! 🙌 Que bom quereres criar com a MTM. Vê o modelo (ficas com 90%, 0€ de entrada) e candidata-te 👉 ${CRIADORES}. ` +
      `Para avançar, responde-me aqui com 1 exemplo do teu conteúdo (link do perfil/portfólio) + a tua área — se encaixar, o Ricardo (@ricardogarciapt) fala contigo em privado. 🚀`,
    pub: (h) =>
      `Boa${h}! 🔥 Candidaturas de criadores abertas 👉 ${CRIADORES}. ` +
      `Manda-nos DM com 1 exemplo do teu conteúdo + a tua área e o Ricardo (@ricardogarciapt) fala contigo. 🙌`,
  },
  {
    /**
     * O SORTEIO DE LANÇAMENTO — à frente de todas, e só enquanto durar.
     *
     * Vem antes da `funded` de propósito, porque partilha com ela a palavra DESAFIO. Enquanto o
     * sorteio corre, quem escreve DESAFIO está a responder ao post do sorteio — mandá-lo para a
     * página dos desafios pagos seria responder a uma pergunta que ele não fez.
     *
     * As três palavras são as três portas da experiência, e cada uma leva o seu link:
     *
     * · FUNDED  → variante A, a porta larga: o comentário basta.
     * · DESAFIO → variante B, a porta estreita: o link pede o email.
     * · MUDANCA → variante C, a amplificação: o link dá o código de referência.
     *
     * SEM ACENTO em MUDANCA, e é deliberado: ninguém escreve cedilha num comentário de
     * telemóvel, e a palavra no flyer é a que a pessoa copia. Ambas as grafias ficam na lista,
     * porque quem escrever com cedilha também merece resposta.
     *
     * Quando as campanhas fecharem, esta entrada sai — e a `funded` volta a ficar com DESAFIO.
     */
    key: "sorteio",
    kw: ["FUNDED", "DESAFIO", "MUDANCA", "MUDANÇA", "SORTEIO", "PARTICIPAR"],
    dm: (h) =>
      `Boa${h}! 🎯 Estás dentro do sorteio de lançamento da MTM Funded — 5 contas de 5.000 USD, ` +
      `3 mensalidades de Membro, 1 Premium e 1 mentoria VIP.\n\n` +
      `Confirma a tua entrada e vê quantos bilhetes tens aqui 👉 ${SORTEIO}\n\n` +
      `Sorteio a 15 de Outubro. Participação gratuita, sem compra de nada. 🍀`,
    pub: (h) =>
      `Boa${h}! 🎯 Entrada registada — confirma e vê os teus bilhetes aqui 👉 ${SORTEIO} 🍀`,
  },
  {
    /**
     * MTM FUNDED — antes do 'trial' de propósito.
     *
     * Sem esta entrada, um comentário «QUERO O DESAFIO» caía no trial e a pessoa recebia o
     * link do Premium em vez do que pediu. Quem escreve DESAFIO está a falar de uma coisa
     * concreta, e mandá-la para outra porta é perder o lead que mais perto estava de comprar.
     *
     * A resposta pública leva o link e não promete nada: as contas são simuladas e as regras
     * estão publicadas na página, que é onde a decisão se toma.
     */
    key: "funded",
    kw: ["FUNDED", "DESAFIO", "DESAFIOS", "CHALLENGE", "FINANCIADA", "FINANCIADO", "PROP", "TORNEIO"],
    dm: (h) =>
      `Boa${h}! 🙌 O MTM Funded é aqui 👉 ${FUNDED} — avaliação em conta simulada, regras publicadas antes de entrares, e 75% dos resultados para ti quando passas. Qualquer dúvida, diz-me. 🚀`,
    pub: (h) =>
      `Boa${h}! 🔥 Os desafios MTM Funded estão aqui 👉 ${FUNDED} — contas simuladas, regras à vista e 75% para o trader. 🙌`,
  },
  {
    key: "trial",
    kw: ["MUNDO", "EU VOU", "EUVOU", "DISCIPLINA", "PREMIUM", "APP", "TRIAL", "GRÁTIS", "GRATIS", "QUERO", "COMEÇAR", "COMECAR", "BORA"],
    dm: (h) => `Boa${h}! 🙌 Começa GRÁTIS: 3 dias de Premium, sem cartão 👉 ${REGISTER} — qualquer dúvida diz-me aqui na DM que ajudo. 🚀`,
    pub: (h) => `Boa${h}! 🚀 Começa GRÁTIS 3 dias de Premium (sem cartão) 👉 ${REGISTER} — qualquer dúvida, comenta aqui que ajudo! 🙌`,
  },
]

/**
 * As intenções que estão EDITÁVEIS no /admin/social, mais as que vivem aqui no código.
 *
 * Isto é o que substitui o ManyChat. As palavras e as respostas deixam de estar escritas num
 * ficheiro que só se muda com um deploy: passam a ser regras que se editam num ecrã — que é a
 * única coisa que o ManyChat fazia melhor do que nós.
 *
 * As do código ficam como fundo, e ficam de propósito: uma base vazia (ou em baixo) faria o funil
 * de Instagram emudecer sem que nada o dissesse, e uma automação que se cala em silêncio é pior
 * do que uma que não existe.
 */
const CACHE_MS = 60_000
let cacheIntencoes: { em: number; lista: Intent[] } | null = null

async function intencoesEditaveis(): Promise<Intent[]> {
  if (cacheIntencoes && Date.now() - cacheIntencoes.em < CACHE_MS) return cacheIntencoes.lista
  try {
    const { listarAutomacoes, respostaPublica } = await import("@/lib/automacoes")
    const regras = (await listarAutomacoes("instagram_comentario")).filter((a) => a.ativa)
    const lista: Intent[] = regras
      .filter((a) => a.valor)
      .map((a) => {
        // Várias palavras por regra, separadas por vírgula — uma regra por palavra dava trinta
        // regras a dizer a mesma coisa.
        const kw = String(a.valor).split(/[,;]/).map((k) => k.trim().toUpperCase()).filter(Boolean)
        const publica = () => respostaPublica(a) ?? a.resposta?.texto ?? ""
        return {
          key: a.id,
          kw,
          dm: () => a.resposta?.texto ?? publica(),
          pub: () => publica(),
        }
      })
      .filter((i) => i.kw.length)
    cacheIntencoes = { em: Date.now(), lista }
  } catch {
    // Falhar a ler a base não pode parar o funil: cai no que está no código.
    cacheIntencoes = { em: Date.now(), lista: [] }
  }
  return cacheIntencoes.lista
}

async function detectIntent(text: string): Promise<Intent | null> {
  const up = (text || "").toUpperCase()
  // As editáveis primeiro: quem escreveu uma regra no ecrã espera que ela ganhe ao que está no
  // código, e não o contrário.
  for (const it of await intencoesEditaveis()) if (it.kw.some((k) => up.includes(k))) return it
  for (const it of INTENTS) if (it.kw.some((k) => up.includes(k))) return it
  return null
}

async function gget(pathAndQuery: string, token: string) {
  const sep = pathAndQuery.includes("?") ? "&" : "?"
  const r = await fetch(`${GRAPH}/${pathAndQuery}${sep}access_token=${encodeURIComponent(token)}`)
  const json = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, json } as { ok: boolean; status: number; json: any }
}
async function gpost(path: string, params: Record<string, string>, token: string) {
  const body = new URLSearchParams({ ...params, access_token: token })
  const r = await fetch(`${GRAPH}/${path}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body })
  const json = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, json } as { ok: boolean; status: number; json: any }
}

async function fetchMedia(igId: string, token: string): Promise<any[]> {
  const out: any[] = []
  let url = `${igId}/media?fields=id,caption,timestamp,comments_count,permalink&limit=25`
  for (let p = 0; p < 4 && out.length < MAX_MEDIA; p++) {
    const r = await gget(url, token)
    if (!r.ok) break
    out.push(...(r.json?.data ?? []))
    const next = r.json?.paging?.next
    if (!next) break
    url = next.replace(`${GRAPH}/`, "").replace(/&access_token=[^&]+/, "")
  }
  return out.slice(0, MAX_MEDIA)
}

interface AcctResult { account: string; leads: number; dmsSent: number; publicFallback: number; skippedDup: number; errors: string[]; setter?: ResumoDoSetter }

async function funnelAccount(acc: (typeof IG_ACCOUNTS)[number], own: Set<string>): Promise<AcctResult> {
  const res: AcctResult = { account: acc.username, leads: 0, dmsSent: 0, publicFallback: 0, skippedDup: 0, errors: [] }
  const token = await tokenForAccount(acc.id)
  if (!token) { res.errors.push(`sem token (${acc.tokenEnv})`); return res }
  const supabase = getSupabaseAdmin()
  const cutoff = Date.now() - DAYS_BACK * 86400000

  /**
   * O SETTER DA PERSONA — a rede por baixo do funil por palavra-chave.
   *
   * Medido a 26/09: em 30 dias, 19 respostas de agradecimento a 5 pessoas, e ZERO delas virou lead,
   * porque nenhuma escreveu uma das palavras das campanhas. O funil não estava avariado; estava a
   * ver passar as únicas pessoas que apareceram.
   *
   * Aqui, o caminho por palavra-chave continua a mandar e não muda uma linha: quem escreve PREMIUM
   * pediu o Premium, e uma persona a conversar por cima disso seria pior do que o link directo. O
   * setter só vê o que o `detectIntent` devolveu vazio.
   *
   * O interruptor é lido UMA vez por conta e não por comentário: com ele desligado — que é como
   * nasce — isto custa uma leitura e nada mais.
   */
  const chavesDoSetter = await lerInterruptor()
  const setter = resumoVazio(chavesDoSetter)
  res.setter = setter

  const media = (await fetchMedia(acc.id, token)).filter((m) => (m.comments_count ?? 0) > 0)
  for (const post of media) {
    if (res.leads >= MAX_DM_PER_ACCOUNT) break
    const comments = await gget(`${post.id}/comments?fields=id,text,username,timestamp&limit=50`, token)
    if (!comments.ok) { res.errors.push(`comments ${post.id}: ${comments.json?.error?.message ?? comments.status}`); continue }
    for (const c of (comments.json?.data ?? [])) {
      if (res.leads >= MAX_DM_PER_ACCOUNT) break
      const commenter: string | null = c.username ?? null
      if (commenter && own.has(commenter.toLowerCase())) continue
      // PROSPECTOR: deteta intenção em TODO o conteúdo (sem cortar por data — nada se perde).
      const intent = await detectIntent(c.text)
      if (!intent) {
        // Sem palavra-chave: é aqui que o setter da persona pega, se estiver ligado.
        if (chavesDoSetter.redigir && !chegouAoTecto(setter)) {
          try {
            contar(setter, await tratarComentario({
              commentId: c.id,
              mediaId: post.id,
              igAccountId: acc.id,
              igUsername: acc.username,
              commenter,
              texto: c.text ?? '',
              timestamp: c.timestamp ?? null,
              ehNossa: !!commenter && own.has(commenter.toLowerCase()),
              legendaDoPost: post.caption ?? '',
            }, token))
          } catch (e) {
            // Um erro do setter não pode derrubar o funil por palavra-chave, que é o que já vende.
            setter.erros++
            res.errors.push(`setter ${c.id}: ${String(e).slice(0, 120)}`)
          }
        } else if (chavesDoSetter.redigir) {
          setter.atingiuTecto = true
        }
        continue
      }

      const { data: existing } = await supabase.from("ig_leads").select("comment_id").eq("comment_id", c.id).maybeSingle()
      if (existing) { res.skippedDup++; continue }
      res.leads++

      const handle = commenter ? ` @${commenter}` : ""
      const dmText = intent.dm(commenter ? ` ${commenter.split(" ")[0]}` : "")
      // SETTER: DM só dentro da janela de 7 dias (regra Meta). Fora → loga como window_expired
      // (segues à mão). Dentro → private_reply; se falhar (scope), resposta pública sem link.
      const withinWindow = !c.timestamp || new Date(c.timestamp).getTime() >= cutoff
      let dm_status = "window_expired"
      let dm_error: string | null = null
      if (withinWindow) {
        const dm = await gpost(`${c.id}/private_replies`, { message: dmText }, token)
        if (dm.ok) { dm_status = "sent"; res.dmsSent++ }
        else {
          dm_status = "public_fallback"
          dm_error = String(dm.json?.error?.message ?? dm.status).slice(0, 200)
          if (isAutoPublishBlocked(acc.id)) {
            // Conta pessoal: fica registado como lead para seguir à mão, sem escrever nada lá.
            dm_status = "window_expired"
          } else {
            const pub = await gpost(`${c.id}/replies`, { message: intent.pub(handle) }, token)
            if (pub.ok) res.publicFallback++
            else { dm_status = "error"; res.errors.push(`${intent.key} ${c.id}: dm(${dm_error}) pub(${pub.json?.error?.message ?? pub.status})`) }
          }
        }
      }
      /**
       * UM COMENTÁRIO NO POST DO SORTEIO É UMA ENTRADA.
       *
       * Sem isto, a variante A não existia: a mecânica dela é «comenta e estás dentro», e o que
       * acontecia era só o Direct sair com um link — ou seja, a porta larga passava a exigir
       * exactamente o mesmo que a estreita. A experiência comparava três coisas em que duas
       * eram a mesma.
       *
       * Só conta no POST do sorteio, e não em qualquer comentário que use a palavra: quem
       * escrever DESAFIO noutro sítio está a perguntar pelos desafios, não a entrar em nada.
       *
       * As pessoas identificadas no comentário valem bilhetes — é a parte de «traz um amigo»,
       * e o tecto de cada tipo está na mecânica da campanha, não aqui.
       */
      if (intent.key === "sorteio" && commenter) {
        try {
          /**
           * Em DOIS passos, de propósito.
           *
           * Um `join` embutido do PostgREST precisa de uma chave estrangeira declarada entre as
           * duas tabelas, e `giveaways.ig_post_id` não a tem — a campanha e a publicação são
           * coisas que se ligam, não que dependam uma da outra. Com o embed, a consulta falhava
           * em silêncio e ninguém se inscrevia.
           */
          const { data: publicacao } = await supabase
            .from("social_scheduled_posts")
            .select("id")
            .eq("published_media_id", post.id)
            .maybeSingle()

          const { data: campanha } = publicacao
            ? await supabase
                .from("giveaways")
                .select("slug")
                .eq("estado", "a_decorrer")
                .eq("ig_post_id", publicacao.id)
                .maybeSingle()
            : { data: null }

          if (campanha?.slug) {
            const { registarEntrada, registarAccao } = await import("@/lib/giveaway/motor")
            const entrada = await registarEntrada({
              giveawaySlug: campanha.slug as string,
              instagramHandle: commenter,
              nome: commenter,
            })
            if (entrada.ok && entrada.entryId) {
              // Os @ do comentário, sem repetições e sem a própria pessoa.
              const etiquetados: string[] = [
                ...new Set<string>(
                  ((c.text || "").match(/@[A-Za-z0-9._]{2,30}/g) ?? [])
                    .map((h: string) => h.slice(1).toLowerCase())
                    .filter((h: string) => h !== commenter.toLowerCase() && !own.has(h)),
                ),
              ]
              for (const alvo of etiquetados) {
                await registarAccao({
                  giveawaySlug: campanha.slug as string,
                  entryId: entrada.entryId,
                  tipo: "etiqueta",
                  referencia: alvo,
                }).catch(() => undefined)
              }
            }
          }
        } catch {
          // Falhar a inscrição não pode travar o funil: o Direct já saiu e o lead está registado.
        }
      }

      await supabase.from("ig_leads").upsert({
        comment_id: c.id, media_id: post.id, ig_account_id: acc.id, ig_username: acc.username,
        commenter, keyword: intent.kw.find((k) => (c.text || "").toUpperCase().includes(k)) ?? intent.key,
        intent: intent.key, comment_text: (c.text || "").slice(0, 500),
        dm_status, dm_text: dmText, dm_error,
      }, { onConflict: "comment_id" })
    }
  }
  return res
}

/** Corre o funil (prospector + setter) para todas as contas. */
export async function runIgFunnel(): Promise<{ ok: boolean; accounts: AcctResult[] }> {
  // O funil lê os comentários das duas contas mas só ESCREVE na da marca: quando a DM falha,
  // a alternativa é uma resposta pública no post — e essa resposta apareceria no Instagram
  // pessoal do Ricardo, assinada por um cron. Ver isAutoPublishBlocked em ./publish.
  const own = new Set(IG_ACCOUNTS.map((a) => a.username.toLowerCase()))
  const accounts: AcctResult[] = []
  for (const acc of IG_ACCOUNTS) {
    try { accounts.push(await funnelAccount(acc, own)) }
    catch (e) { accounts.push({ account: acc.username, leads: 0, dmsSent: 0, publicFallback: 0, skippedDup: 0, errors: [String(e).slice(0, 200)] }) }
  }
  return { ok: true, accounts }
}
