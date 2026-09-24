import { getProofStats } from '@/lib/proof-stats'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { CAPTION_INTERNAL_MARK, uploadBufferToBucket } from '@/lib/instagram/publish'
import { renderSocialCardBuffer } from '@/lib/social-card'
import { factoDoDia, getPipsProof, notaViesPreco } from '@/lib/pips-proof'
import { canvaAutofillImage } from '@/lib/canva-connect'

/**
 * Imagem do post: 1º tenta o Canva Connect (teus templates reais, se configurado + plano pago);
 * senão / se falhar, cai no card gerado em processo. Upload → URL público estável.
 */
async function buildCardImage(
  hook: string,
  cta: string,
  handle: string,
  /** O facto que vai no cartão. Vem vivo dos pips e roda por dia — ver `factoDoDia()`. */
  facto: string | null,
  /**
   * A ressalva que tem de sair com o número — hoje a nota do defeito de preço de 24/09.
   *
   * Um cartão é a peça que mais viaja sozinha: quem o reencaminha não leva a legenda. Por isso o
   * número nunca pode aparecer nu enquanto houver algo a ressalvar.
   */
  nota: string | null,
): Promise<string | null> {
  /**
   * O `handle` já cá estava — é a conta para quem é o post. Passa a decidir o TEMPLATE, e não só
   * a assinatura desenhada no cartão: a marca e o pessoal têm vozes diferentes, e um cartão com
   * a assinatura de uma no desenho da outra é pior do que um cartão simples.
   *
   * Sem template para a conta, `canvaAutofillImage` devolve null e cai-se no cartão nosso — que
   * é o que já acontecia e continua a funcionar.
   */
  /**
   * O template do Canva só tem três campos (gancho, CTA e prova) e não há um para a ressalva —
   * o desenho vive lá, não aqui. Por isso, quando há nota, ela vai dentro do MESMO campo da
   * prova: o número não sai nu nem sequer no caminho que não controlamos.
   */
  const provaCanva = facto ? (nota ? `${facto} — ${nota}` : facto) : undefined
  const viaCanva = await canvaAutofillImage(hook, cta, provaCanva, handle)
  if (viaCanva) return viaCanva
  try {
    const buf = await renderSocialCardBuffer({ hook, cta, handle, proof: facto ?? false, proofNota: nota })
    return await uploadBufferToBucket(buf, 'image/png', 'auto')
  } catch (e) {
    console.error('[content-draft] card falhou:', e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * GERADOR AUTÓNOMO DE CONTEÚDO (Fase 2 da máquina de vendas).
 * Escreve rascunhos de posts para @morethanmoney.pt → tabela social_scheduled_posts (status='draft').
 * O Ricardo só APROVA (status='approved') e o cron ig-publish publica. Tudo server-side, sem browser.
 *
 * O fecho do ciclo: cada legenda pede um COMENTÁRIO com uma palavra-chave que o cron ig-funnel
 * deteta (SINAIS/COPY/GRUPO → Telegram copytrading · APP/PREMIUM/QUERO/MUNDO → trial 3 dias) →
 * comentário → DM → funil. O brief visual viaja depois do marcador —INTERNO— (nunca é publicado).
 *
 * Bearer CRON_SECRET (ou x-vercel-cron). Não inunda: pára se já há >= TARGET rascunhos por rever.
 */
export const dynamic = 'force-dynamic'

const IG_MTM = '17841474872672009' // @morethanmoney.pt
const TARGET_BACKLOG = Number(process.env.CONTENT_DRAFT_BACKLOG || 8) // buffer de posts na fila (≈1 semana a 1/dia)
const BATCH = Number(process.env.CONTENT_DRAFT_BATCH || 3) // quantos gerar por passagem

// CTAs válidos = palavras-chave que o ig-funnel reconhece (lib/instagram/funnel.ts INTENTS).
const CTA_KEYWORDS = ['SINAIS', 'APP', 'PREMIUM', 'DESAFIO', 'QUERO', 'MUNDO', 'COPY']

/**
 * O bloco da CAMPANHA no prompt.
 *
 * Vem vivo das promoções na base de dados — o mesmo `promosAtivas()` que alimenta o splash da
 * página. Escrever a campanha à mão aqui dava posts a anunciar um desconto já expirado, que é
 * a pior publicidade que há: leva a pessoa ao checkout para lhe dizer que não.
 *
 * Sem campanha viva devolve string vazia, e o gerador escreve o que escrevia antes.
 */
function blocoCampanha(promos: Array<{ etiqueta: string; titulo: string; detalhe: string; codigo?: string }>): string {
  if (!promos.length) return ''
  return (
    `\n\nCAMPANHA A DECORRER (MTM Funded — avaliação de traders em contas SIMULADAS, 75% dos resultados para o trader):\n` +
    promos
      .map((p) => `- ${p.titulo}${p.codigo ? ` (código ${p.codigo})` : ''} — ${p.detalhe}`)
      .join('\n') +
    `\nQuando o post for de campanha (palavra-chave DESAFIO), fala DISTO e manda para morethanmoney.pt/mtmfunded.\n` +
    `Nunca digas que o trader arrisca dinheiro real na avaliação, nem prometas que passa.`
  )
}

function buildSystem(PROOF: string, campanha: string): string { return `És o estratega de conteúdo da MoreThanMoney (comunidade portuguesa de educação financeira e trading, fundada pelo Ricardo Garcia).
Escreves posts curtos para o Instagram @morethanmoney.pt que educam, criam confiança e puxam um comentário.

FACTOS REAIS (usa só estes; NUNCA promic lucros — é educação, não aconselhamento):
- Provas da comunidade: ${PROOF}
- App MTM System (grátis): alertas, scanner, sessões ao vivo, ferramentas.
- Trial de 3 dias de Premium sem cartão em morethanmoney.pt/register.
- Copytrading (copiar sinais automaticamente) via assistente no Telegram.

MECÂNICA DE CTA (obrigatória): cada post TERMINA a pedir um comentário com UMA palavra-chave exata
que te será indicada. Ex.: «Comenta "SINAIS" que eu envio o acesso 👇». O comentário abre a conversa.
- SINAIS / COPY → quem quer copiar/sinais (encaminhado para o Telegram)
- APP / QUERO / MUNDO → quem quer começar (trial grátis / app)
- PREMIUM → quem quer o Premium
- DESAFIO → quem quer o MTM Funded (avaliação em conta simulada)

ESTILO: português de Portugal, humano, direto, gancho forte na 1.ª linha, 60–120 palavras, no máx. 1–2 emojis, 3–5 hashtags no fim.

FORMATO DE SAÍDA (exato, sem JSON, sem markdown, sem texto fora dos blocos). Para CADA post escreve um bloco:
===POST===
KEYWORD: <UMA palavra-chave das indicadas>
HOOK: <frase de impacto para a IMAGEM do post, no máx. 10 palavras, sem hashtags nem emojis>
VISUAL: <1 frase: o que mostrar na imagem para o designer>
CAPTION:
<a legenda completa PRONTA A PUBLICAR, já com o CTA e as hashtags — pode ter várias linhas>
===END===

Repete o bloco ${BATCH} vezes. Nada antes do primeiro ===POST=== nem depois do último ===END===.${campanha}` }

function todayLisbon(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date())
}

async function authorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (secret && auth === `Bearer ${secret}`) return true
  return Boolean(req.headers.get('x-vercel-cron'))
}

async function draftBatch(
  assigned: string[],
  proofText: string,
  recentHooks: string[],
  campanha: string,
): Promise<Array<{ hook: string; caption: string; cta_keyword: string; visual_brief: string }>> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) throw new Error('ANTHROPIC_API_KEY em falta')
  const model = process.env.CONTENT_DRAFT_MODEL?.trim() || process.env.ANTHROPIC_MODEL?.trim() || 'claude-3-5-haiku-20241022'
  const user =
    `Gera ${BATCH} posts distintos (temas variados: mentalidade/disciplina, prova social, educação de trading, bastidores da comunidade, sessões ao vivo).\n` +
    `Atribui a cada post, por ordem, esta palavra-chave de CTA: ${assigned.join(', ')}.\n` +
    `Evita repetir ganchos. Não uses datas nem números que não estejam nos factos.` +
    (recentHooks.length
      ? `\n\nJÁ PUBLICADO NAS ÚLTIMAS SEMANAS (NÃO repitas estes ganchos, ângulos nem exemplos — traz temas e aberturas DIFERENTES):\n` +
        recentHooks.map((h, i) => `${i + 1}. ${h}`).join('\n')
      : '')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30000)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 1600, system: buildSystem(proofText, campanha), messages: [{ role: 'user', content: user }] }),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    const text: string = (data?.content || []).filter((p: any) => p?.type === 'text').map((p: any) => p.text).join('').trim()
    // Parser do formato delimitado (robusto a legendas multi-linha).
    const out: Array<{ hook: string; caption: string; cta_keyword: string; visual_brief: string }> = []
    for (const block of text.split('===POST===').slice(1)) {
      const body = block.split('===END===')[0]
      const kw = (body.match(/KEYWORD:\s*([^\n]+)/i)?.[1] || '').trim().toUpperCase()
      const hk = (body.match(/HOOK:\s*([^\n]+)/i)?.[1] || '').trim()
      const vis = (body.match(/VISUAL:\s*([^\n]+)/i)?.[1] || '').trim()
      const cap = (body.split(/CAPTION:\s*/i)[1] || '').trim()
      if (!cap) continue
      out.push({ hook: (hk || cap.split('\n')[0]).slice(0, 120), caption: cap, cta_keyword: kw, visual_brief: vis })
    }
    return out
  } finally {
    clearTimeout(timer)
  }
}

export async function GET(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const supabase = getSupabaseAdmin()

  // Guarda anti-inundação: conta posts ainda não publicados (rascunho ou aprovados por publicar).
  const { count: pending } = await supabase
    .from('social_scheduled_posts')
    .select('id', { count: 'exact', head: true })
    .eq('ig_account_id', IG_MTM)
    .in('status', ['draft', 'approved', 'processing'])
  if ((pending ?? 0) >= TARGET_BACKLOG) {
    return NextResponse.json({ ok: true, skipped: 'backlog_cheio', pending })
  }

  // Roda as palavras-chave para variar a mistura de CTA.
  const start = new Date().getUTCDate() % CTA_KEYWORDS.length
  const assigned = Array.from({ length: BATCH }, (_, i) => CTA_KEYWORDS[(start + i) % CTA_KEYWORDS.length])

  let drafts: Array<{ hook: string; caption: string; cta_keyword: string; visual_brief: string }>
  try {
    // PROVA VIVA (cron diário) — deixa de haver números congelados no prompt.
    const proof = await getProofStats()
    let proofText =
      `${proof.members} membros ativos. NUNCA cites lucro em euros nem prometas ganhos: fala de resultados ` +
      `em PIPS e PERCENTAGEM, com o valor em dinheiro só como exemplo por lote (0,01 · 0,1 · 1,0) e sempre ` +
      `com a ressalva de que é bruto e de que resultados passados não garantem resultados futuros.`
    // DESTAQUE DO DIA — só métricas verdadeiras E positivas (nunca força; se não houver, fica só a prova).
    try {
      const { inspiringHighlights } = await import('@/lib/inspiring-metrics')
      const hs = await inspiringHighlights()
      if (hs.length) proofText += `\n- Destaques REAIS de hoje (usa no máximo UM, com naturalidade): ${hs.map((h) => h.line).join(' | ')}`
    } catch { /* opcional */ }
    // ANTI-REPETIÇÃO: dá ao gerador os ganchos/legendas das últimas semanas para não repetir ângulos.
    const { data: recent } = await supabase
      .from('social_scheduled_posts')
      .select('caption')
      .eq('ig_account_id', IG_MTM)
      .order('created_at', { ascending: false })
      .limit(25)
    const recentHooks = (recent ?? [])
      .map((r) => String((r as { caption?: string }).caption ?? '').split('\n')[0].trim())
      .filter((h) => h.length > 8)
      .slice(0, 20)
    // A campanha viva entra no prompt. Falhando a leitura, o lote sai sem campanha em vez de
    // não sair de todo: uma promoção em falta é melhor do que um dia sem conteúdo.
    let campanha = ''
    try {
      const { promosAtivas } = await import('@/lib/mtmfunded/promos')
      campanha = blocoCampanha(await promosAtivas())
    } catch { /* opcional */ }
    drafts = await draftBatch(assigned, proofText, recentHooks, campanha)
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
  if (!drafts.length) return NextResponse.json({ ok: false, error: 'sem rascunhos gerados' }, { status: 500 })

  // Autopilot: se ligado, os posts COM imagem entram já como 'approved' (publicam sem toque).
  // Flag em site_settings.content_autopilot { morethanmoney: true|false }. Default: false (rascunho).
  // A prova viva, lida uma vez para todo o lote: são os pips da conta-espelho, não a linha
  // congelada de 30/06 que andava nos cartões.
  const prova = await getPipsProof()
  // A ressalva do defeito de preço de 24/09. É `null` assim que a amostra deixar de o atravessar —
  // e nesse dia os cartões e as legendas voltam sozinhos ao que eram, sem ninguém ter de se lembrar.
  const notaProva = notaViesPreco(prova)

  const { data: apRow } = await supabase.from('site_settings').select('value').eq('key', 'content_autopilot').maybeSingle()
  const autopilot = Boolean((apRow?.value as { morethanmoney?: boolean } | null)?.morethanmoney)

  // Agenda escalonado: próximos dias às 18:00 UTC (~19:00 Lisboa).
  const now = Date.now()
  const rows = await Promise.all(
    drafts.slice(0, BATCH).map(async (d, i) => {
      const when = new Date(now + (i + 1) * 24 * 3600 * 1000)
      when.setUTCHours(18, 0, 0, 0)
      const cta = (d.cta_keyword || assigned[i] || 'APP').toUpperCase()
      // Gera o card de marca (imagem) para publicação sem toque.
      // Um facto por post, rodando: publicar todos os dias a mesma frase treina o leitor a
      // saltá-la. O deslocamento pelo índice dá factos diferentes no mesmo lote.
      const facto = factoDoDia(prova, i)
      const card = await buildCardImage(d.hook, cta, 'morethanmoney.pt', facto, notaProva)
      // Só auto-publica se o autopilot estiver ligado E houver imagem; senão fica rascunho.
      const status = autopilot && card ? 'approved' : 'draft'
      // A legenda repete a ressalva. Não é redundância: o cartão pode ser cortado, recomprimido ou
      // visto em miniatura, e a legenda é o único sítio onde a frase se lê sempre inteira.
      const ressalva = facto && notaProva ? `\n\n${notaProva}` : ''
      const caption =
        `${(d.caption || '').trim()}${ressalva}\n\n${CAPTION_INTERNAL_MARK}\n` +
        `🎨 Visual sugerido: ${d.visual_brief || '—'}\n` +
        `🔑 CTA: comentário "${cta}" → funil automático\n` +
        `🤖 ${status === 'approved' ? 'Auto-publicado pela máquina de vendas (card de marca gerado).' : 'Rascunho da máquina — revê/troca a imagem e aprova.'}`
      return {
        channel: 'instagram',
        ig_account_id: IG_MTM,
        ig_username: 'morethanmoney.pt',
        media_type: 'IMAGE',
        media_urls: card ? [card] : ([] as string[]),
        caption,
        pillar: `cta:${cta.toLowerCase()}`,
        scheduled_at: when.toISOString(),
        status,
        created_by: 'sales-machine',
        ...(status === 'approved' ? { approved_by: 'sales-machine', approved_at: new Date().toISOString() } : {}),
      }
    }),
  )

  const { data, error } = await supabase.from('social_scheduled_posts').insert(rows).select('id')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  const approved = rows.filter((r) => r.status === 'approved').length
  return NextResponse.json({
    ok: true,
    created: data?.length ?? 0,
    approved,
    drafts: (data?.length ?? 0) - approved,
    withImage: rows.filter((r) => r.media_urls.length > 0).length,
    autopilot,
    day: todayLisbon(),
    ctas: assigned,
  })
}
