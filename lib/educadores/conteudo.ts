/**
 * CONTEÚDO PARA OS EDUCADORES PUBLICAREM NAS CONTAS DELES (22/11/2026).
 *
 * Começou com o Ruben Pereira (cripto, vive em França): três vezes por semana a tarefa agendada
 * do thread «Criar conteúdo em francês para o Ruben publicar» escreve um pacote em
 * `educador_conteudo` (guião de reel, carrossel, stories, capas, CTA). Este módulo ENTREGA:
 *
 *  1. e-mail com o link do pacote (página /educadores/conteudo/<id>?t=…, assinada, 60 dias);
 *  2. DM da @morethanmoney.pt, só se a janela de 24 h da Meta estiver aberta (o educador
 *     escreveu-nos há menos de 24 h). Fora da janela a Meta recusa; fica o e-mail;
 *  3. Telegram, se houver `telegram_chat_id`.
 *
 * Porquê canal próprio: o motor de DMs ignora contas internas (`dm_contas_internas`), por isso os
 * educadores nunca recebem nada pelo funil. Isto corre à parte, chamado pelo leitor da caixa.
 *
 * Travão: nada sai enquanto `site_settings.educador_conteudo.envio_ativo` não for true.
 */
import crypto from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export type Slide = { titulo: string; texto?: string }
export type Pacote = {
  reel?: { gancho: string; guiao: string[]; legenda_ecra?: string[]; duracao_s?: number; legenda: string; hashtags?: string[]; capa?: { titulo: string; subtitulo?: string } }
  carrossel?: { slides: Slide[]; legenda: string; hashtags?: string[] }
  stories?: { texto: string; sticker?: string }[]
  cta?: string
  notas?: string
}

export type Educador = {
  nome: string
  email?: string | null
  ig_handle?: string | null
  igsid?: string | null
  telegram_chat_id?: string | null
  lingua?: string
  foto?: string
}
type Config = { envio_ativo?: boolean; educadores?: Record<string, Educador> }

const SITE = 'https://www.morethanmoney.pt'
const IG_MTM = '17841474872672009'

function segredo(): string {
  const s = process.env.EBOOKS_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!s) throw new Error('Sem segredo para assinar links.')
  return s
}
const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export function assinarPacote(id: string, dias = 60): string {
  const fim = Math.floor(Date.now() / 1000) + dias * 86400
  const sig = b64url(crypto.createHmac('sha256', segredo()).update(`pacote.${id}.${fim}`).digest()).slice(0, 32)
  return `${fim}.${sig}`
}

export function verificarPacote(id: string, token: string | null | undefined): boolean {
  if (!token) return false
  const [fim, sig] = token.split('.')
  if (!fim || !sig || Number(fim) * 1000 < Date.now()) return false
  const esperado = b64url(crypto.createHmac('sha256', segredo()).update(`pacote.${id}.${fim}`).digest()).slice(0, 32)
  return sig.length === esperado.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado))
}

export function linkPacote(id: string): string {
  return `${SITE}/educadores/conteudo/${id}?t=${assinarPacote(id)}`
}

/** URL da capa gerada ao vivo (next/og) no estilo MTM, com a foto do educador. */
export function urlCapa(p: { educador: string; titulo: string; subtitulo?: string; formato?: 'reel' | 'post' | 'story'; n?: string }): string {
  const qs = new URLSearchParams({ e: p.educador, t: p.titulo, ...(p.subtitulo ? { s: p.subtitulo } : {}), f: p.formato ?? 'reel', ...(p.n ? { n: p.n } : {}) })
  return `${SITE}/api/educadores/capa?${qs}`
}

export async function lerConfig(): Promise<Config> {
  const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', 'educador_conteudo').maybeSingle()
  return (data?.value as Config) ?? {}
}

const MENSAGEM: Record<string, (nome: string, link: string, tema: string) => { assunto: string; texto: string; html: string }> = {
  fr: (nome, link, tema) => ({
    assunto: `Ton contenu du jour est prêt · ${tema}`,
    texto: `Salut ${nome} ! Ton contenu du jour est prêt (reel, carrousel, stories et couvertures) : ${tema}. Tout est ici, prêt à copier : ${link}`,
    html: `<div style="font-family:Arial,sans-serif;background:#0b0b0d;color:#eee;padding:28px;border-radius:14px;max-width:600px">
<h1 style="color:#E9C46A;font-size:22px;margin:0 0 10px">Salut ${nome} 👋</h1>
<p style="line-height:1.55;margin:0 0 14px">Ton contenu du jour est prêt : <b>${tema}</b>.<br>Script du reel, carrousel, stories et couvertures, tout est prêt à copier et à publier sur ton compte.</p>
<a href="${link}" style="display:inline-block;background:#D2A63C;color:#0b0b0d;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">Ouvrir mon contenu</a>
<p style="line-height:1.55;margin:18px 0 0;font-size:13px;color:#bbb">Tu peux adapter les mots à ta façon de parler : c'est ton histoire. Une question ? Réponds simplement à cet e-mail.</p>
<p style="margin:22px 0 0;font-size:12px;color:#999">Contenu éducatif, ne constitue pas un conseil financier. · MoreThanMoney.pt</p></div>`,
  }),
  pt: (nome, link, tema) => ({
    assunto: `O teu conteúdo de hoje está pronto · ${tema}`,
    texto: `Olá ${nome}! O teu conteúdo de hoje está pronto (reel, carrossel, stories e capas): ${tema}. Está tudo aqui: ${link}`,
    html: `<div style="font-family:Arial,sans-serif;background:#0b0b0d;color:#eee;padding:28px;border-radius:14px;max-width:600px"><h1 style="color:#E9C46A;font-size:22px">Olá ${nome} 👋</h1><p>O teu conteúdo de hoje está pronto: <b>${tema}</b>.</p><a href="${link}" style="display:inline-block;background:#D2A63C;color:#0b0b0d;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">Abrir o meu conteúdo</a></div>`,
  }),
}

/** A pessoa escreveu à @morethanmoney.pt há menos de 24 h? (janela da Meta para DMs) */
async function janelaAberta(igsid: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin()
    .from('ig_dm_log')
    .select('created_at')
    .eq('sender_id', igsid)
    .gte('created_at', new Date(Date.now() - 23.5 * 3600_000).toISOString())
    .limit(1)
  return (data?.length ?? 0) > 0
}

async function enviarTelegram(chatId: string, texto: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return { ok: false, error: 'sem TELEGRAM_BOT_TOKEN' }
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: texto, disable_web_page_preview: false }),
  })
  const j = await r.json().catch(() => ({}))
  return j?.ok ? { ok: true } : { ok: false, error: j?.description ?? `HTTP ${r.status}` }
}

/**
 * Entrega os pacotes prontos cujo `entregar_apos` já passou. Barato quando não há nada: uma
 * leitura de site_settings. Chamado de 5 em 5 minutos pelo leitor da caixa de DMs.
 */
export async function entregarConteudoPendente(): Promise<Record<string, unknown>> {
  const cfg = await lerConfig()
  if (!cfg.envio_ativo) return { desligado: true }
  const db = getSupabaseAdmin()
  const { data: linhas } = await db
    .from('educador_conteudo')
    .select('id, educador, lingua, tema, entregue_email_em, entregue_dm_em, entregue_telegram_em')
    .eq('estado', 'pronto')
    .lte('entregar_apos', new Date().toISOString())
    .order('entregar_apos')
    .limit(5)
  const feitos: Record<string, unknown>[] = []
  for (const l of linhas ?? []) {
    const ed = cfg.educadores?.[l.educador]
    if (!ed) continue
    const nome = ed.nome.split(' ')[0]
    const link = linkPacote(l.id)
    const msg = (MENSAGEM[l.lingua] ?? MENSAGEM.pt)(nome, link, l.tema ?? '')
    const upd: Record<string, unknown> = {}
    const erros: string[] = []

    if (ed.email && !l.entregue_email_em) {
      try {
        const { createMailTransporter, mailFrom, prepareBrandedEmailHtml, brandedMailAttachments } = await import('@/lib/mail-transport')
        await createMailTransporter().sendMail({ from: mailFrom(), to: ed.email, subject: msg.assunto, html: prepareBrandedEmailHtml(msg.html), attachments: brandedMailAttachments() })
        upd.entregue_email_em = new Date().toISOString()
      } catch (e) {
        erros.push(`email: ${e instanceof Error ? e.message : e}`)
      }
    }
    if (ed.igsid && !l.entregue_dm_em) {
      if (await janelaAberta(ed.igsid)) {
        const { sendInstagramDmResilient } = await import('@/lib/instagram/dm-closer')
        const r = await sendInstagramDmResilient(IG_MTM, ed.igsid, msg.texto)
        if (r.ok) upd.entregue_dm_em = new Date().toISOString()
        else erros.push(`dm: ${r.error}`)
      }
    }
    if (ed.telegram_chat_id && !l.entregue_telegram_em) {
      const r = await enviarTelegram(ed.telegram_chat_id, msg.texto)
      if (r.ok) upd.entregue_telegram_em = new Date().toISOString()
      else erros.push(`telegram: ${r.error}`)
    }
    const algum = upd.entregue_email_em || upd.entregue_dm_em || upd.entregue_telegram_em || l.entregue_email_em || l.entregue_telegram_em
    if (algum) upd.estado = 'entregue'
    upd.erro = erros.length ? erros.join(' | ').slice(0, 500) : null
    await db.from('educador_conteudo').update(upd).eq('id', l.id)
    feitos.push({ id: l.id, ...upd })
  }

  // Pacote já entregue por e-mail mas DM ainda não: tenta a DM quando a janela abrir (até 3 dias).
  for (const [chave, ed] of Object.entries(cfg.educadores ?? {})) {
    if (!ed.igsid || !(await janelaAberta(ed.igsid))) continue
    const { data: semDm } = await db
      .from('educador_conteudo')
      .select('id, lingua, tema')
      .eq('educador', chave)
      .eq('estado', 'entregue')
      .is('entregue_dm_em', null)
      .gte('entregar_apos', new Date(Date.now() - 3 * 86400_000).toISOString())
      .order('entregar_apos', { ascending: false })
      .limit(1)
    const l = semDm?.[0]
    if (!l) continue
    const msg = (MENSAGEM[l.lingua] ?? MENSAGEM.pt)(ed.nome.split(' ')[0], linkPacote(l.id), l.tema ?? '')
    const { sendInstagramDmResilient } = await import('@/lib/instagram/dm-closer')
    const r = await sendInstagramDmResilient(IG_MTM, ed.igsid, msg.texto)
    if (r.ok) await db.from('educador_conteudo').update({ entregue_dm_em: new Date().toISOString() }).eq('id', l.id)
    feitos.push({ id: l.id, dm: r.ok, erro: r.error })
  }
  return { entregues: feitos.length, feitos }
}
