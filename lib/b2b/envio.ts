/**
 * O ENVIO B2B — puro em cima (quem sai hoje, e se ainda cabe no tecto), base de dados em baixo.
 *
 * A ordem, para cada prospecto:
 *  1. o interruptor (`site_settings.b2b_prospeccao.ligado`) — desligado, nada sai;
 *  2. o tecto do dia (por omissão 20, no total) e, no primeiríssimo lote, no máximo 10;
 *  3. o validador (`validador.ts`): exclusão global, webmail, pessoa colectiva, URL de origem;
 *  4. a porta da mensagem (`sequencias.ts::validarMensagem`): saída + ?ag= + identificação;
 *  5. a REGRA DO MOTOR (`lib/agentes/contacto-inicial.ts::decidirContacto`), que só se consome:
 *     se disser «sai» com base `b2b`, sai; se disser «fila», fica registado na fila e não sai.
 * Cada decisão grava-se em `b2b_envios` com a base legal «b2b_pessoa_colectiva».
 */
import { decidirContacto, type Tectos } from '@/lib/agentes/contacto-inicial'
import { validarProspecto } from './validador'
import { montarMensagem, segredoSaida, validarMensagem, AGENTE_B2B, type Pais, type Segmento } from './sequencias'

export const BASE_LEGAL_B2B = 'b2b_pessoa_colectiva' as const

export interface ConfigB2B {
  ligado: boolean
  tecto_dia: number
  intervalo_seg: number
  primeiro_lote: number
  /** Dias mínimos desde o último toque antes do toque N+1 (índice = toques já dados). */
  dias_entre_toques: number[]
}
export const CONFIG_PADRAO: ConfigB2B = { ligado: false, tecto_dia: 20, intervalo_seg: 12, primeiro_lote: 10, dias_entre_toques: [0, 4, 7] }

export function lerConfig(v: unknown): ConfigB2B {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<ConfigB2B>
  const n = (x: unknown, d: number, max: number) => {
    const k = Math.floor(Number(x))
    return Number.isFinite(k) && k >= 0 ? Math.min(k, max) : d
  }
  const dias = Array.isArray(o.dias_entre_toques) && o.dias_entre_toques.length === 3
    ? o.dias_entre_toques.map((d, i) => n(d, CONFIG_PADRAO.dias_entre_toques[i], 60))
    : CONFIG_PADRAO.dias_entre_toques
  return {
    ligado: o.ligado === true,
    // O tecto nunca passa de 50/dia por aqui: mais do que isso pede um fornecedor no domínio (ver relatório).
    tecto_dia: n(o.tecto_dia, CONFIG_PADRAO.tecto_dia, 50),
    intervalo_seg: n(o.intervalo_seg, CONFIG_PADRAO.intervalo_seg, 60),
    primeiro_lote: n(o.primeiro_lote, CONFIG_PADRAO.primeiro_lote, 10),
    dias_entre_toques: dias,
  }
}

/** Quantos ainda podem sair hoje. O primeiríssimo lote (nunca saiu nada) fica no máximo em `primeiro_lote`. */
export function vagasHoje(cfg: ConfigB2B, enviadosHoje: number, enviadosSempre: number): number {
  if (!cfg.ligado) return 0
  let v = Math.max(0, cfg.tecto_dia - Math.max(0, enviadosHoje))
  if (enviadosSempre <= 0) v = Math.min(v, cfg.primeiro_lote)
  return v
}

export interface ProspectoLinha {
  id: string
  empresa: string
  segmento: Segmento
  pais: Pais
  email: string
  email_tipo: 'generico' | 'comercial_publicado'
  fonte_url: string
  pessoa_colectiva: boolean
  estado: string
  agente: string | null
  toques: number
  ultimo_toque_em: string | null
}

/** Está na altura do próximo toque? Puro. */
export function prontoParaToque(p: Pick<ProspectoLinha, 'estado' | 'toques' | 'ultimo_toque_em'>, cfg: ConfigB2B, agora = new Date()): boolean {
  if (!['novo', 'contactado'].includes(p.estado)) return false
  if (p.toques >= 3) return false
  if (p.toques === 0) return true
  if (!p.ultimo_toque_em) return true
  const dias = (agora.getTime() - new Date(p.ultimo_toque_em).getTime()) / 86_400_000
  return dias >= (cfg.dias_entre_toques[p.toques] ?? 7)
}

export interface DecisaoB2B {
  decisao: 'sai' | 'fila' | 'bloqueado'
  motivo: string
  assunto?: string
  texto?: string
  /** O prospecto deve sair da sequência (excluído ou inválido). */
  retirar?: boolean
}

/**
 * A decisão inteira de UM envio — pura. `enviadosHoje` é o que já saiu hoje (o 21.º com tecto 20
 * vê enviadosHoje = 20 e não sai).
 */
export function decidirEnvioB2B(
  p: ProspectoLinha,
  ctx: { cfg: ConfigB2B; enviadosHoje: number; exclusao: Iterable<string>; segredo: string; textoForcado?: string },
): DecisaoB2B {
  const exclusao = [...ctx.exclusao]
  if (!ctx.cfg.ligado) return { decisao: 'fila', motivo: 'Envio B2B desligado — fica na fila.' }

  const v = validarProspecto({ email: p.email, emailTipo: p.email_tipo, fonteUrl: p.fonte_url, pessoaColectiva: p.pessoa_colectiva }, exclusao)
  if (!v.ok) return { decisao: 'bloqueado', motivo: v.motivo, retirar: true }

  if (ctx.enviadosHoje >= ctx.cfg.tecto_dia) {
    return { decisao: 'fila', motivo: `Tecto diário B2B (${ctx.cfg.tecto_dia}) atingido — fica para amanhã.` }
  }

  const toque = (Math.min(3, p.toques + 1)) as 1 | 2 | 3
  if (!ctx.segredo) return { decisao: 'bloqueado', motivo: 'Sem segredo para o link de saída (B2B_SAIR_SEGREDO/CRON_SECRET).' }
  const m = montarMensagem({ segmento: p.segmento, pais: p.pais, toque, empresa: p.empresa, email: p.email, agente: p.agente || AGENTE_B2B, segredo: ctx.segredo })
  const texto = ctx.textoForcado ?? m.texto
  const porta = validarMensagem(texto)
  if (!porta.ok) return { decisao: 'bloqueado', motivo: porta.motivo, assunto: m.assunto, texto }

  // A regra do motor: o B2B por email tem tecto próprio (o nosso, no total) e base `b2b`.
  const tectos: Tectos = { porAgenteDia: ctx.cfg.tecto_dia, porCanalDia: { email: ctx.cfg.tecto_dia } }
  const d = decidirContacto(
    { canal: 'email', destino: p.email, texto },
    { excluido: false, emailProfissional: true },
    { agenteHoje: ctx.enviadosHoje, canalHoje: ctx.enviadosHoje },
    tectos,
  )
  if (d.destino === 'sai' && d.base === 'b2b') return { decisao: 'sai', motivo: d.porque, assunto: m.assunto, texto }
  return { decisao: d.destino === 'sai' ? 'fila' : d.destino, motivo: `Regra do motor: ${d.porque}`, assunto: m.assunto, texto }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Base de dados e rede. Tudo o que decide ficou acima.
// ─────────────────────────────────────────────────────────────────────────────────────────────

type Db = { from: (t: string) => any }

export async function carregarConfig(db: Db): Promise<ConfigB2B> {
  const { data } = await db.from('site_settings').select('value').eq('key', 'b2b_prospeccao').maybeSingle()
  return lerConfig(data?.value)
}

export async function carregarExclusao(db: Db, emails: string[]): Promise<string[]> {
  const ids = new Set<string>()
  for (const e of emails) { ids.add(e.toLowerCase()); ids.add('@' + (e.toLowerCase().split('@')[1] ?? '')) }
  const lista = [...ids]
  const out: string[] = []
  for (let i = 0; i < lista.length; i += 200) {
    const { data, error } = await db.from('contacto_exclusao').select('identificador').in('identificador', lista.slice(i, i + 200))
    // Sem conseguir ler a exclusão, ninguém recebe: devolve todos como excluídos.
    if (error) return lista
    for (const r of data ?? []) out.push(String(r.identificador))
  }
  // Também conta quem cancelou a subscrição pelos outros emails do site.
  const { data: uns } = await db.from('email_sends').select('email').in('email', emails.map((e) => e.toLowerCase())).not('unsubscribed_at', 'is', null)
  for (const r of uns ?? []) out.push(String(r.email))
  return out
}

function inicioDoDiaUTC() {
  const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.toISOString()
}

export async function contarEnviados(db: Db): Promise<{ hoje: number; sempre: number }> {
  const h = await db.from('b2b_envios').select('id', { count: 'exact', head: true }).eq('decisao', 'sai').gte('criado_em', inicioDoDiaUTC())
  const s = await db.from('b2b_envios').select('id', { count: 'exact', head: true }).eq('decisao', 'sai')
  if (h.error || s.error) throw new Error('não consegui contar os envios de hoje — não envio às cegas')
  return { hoje: h.count ?? 0, sempre: s.count ?? 0 }
}

function textoParaHtml(texto: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc(texto)
    .split(/\n{2,}/)
    .map((par) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#e9e9ee">${par.replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#D2A63C">$1</a>')}</p>`)
    .join('\n')
}

export interface ResultadoLote {
  ligado: boolean
  vagas: number
  enviados: number
  fila: number
  bloqueados: number
  erros: string[]
  ensaio: boolean
}

/**
 * Corre um lote. `ensaio` decide e regista nada (nem envia). `limiteExtra` encolhe o lote (ex.: 10).
 */
export async function correrLote(db: Db, opts: { ensaio?: boolean; limiteExtra?: number; esperar?: (ms: number) => Promise<void> } = {}): Promise<ResultadoLote> {
  const ensaio = opts.ensaio === true
  const esperar = opts.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const cfg = await carregarConfig(db)
  const res: ResultadoLote = { ligado: cfg.ligado, vagas: 0, enviados: 0, fila: 0, bloqueados: 0, erros: [], ensaio }
  if (!cfg.ligado && !ensaio) return res

  const cont = await contarEnviados(db)
  let vagas = vagasHoje({ ...cfg, ligado: true }, cont.hoje, cont.sempre)
  if (opts.limiteExtra != null) vagas = Math.min(vagas, Math.max(0, opts.limiteExtra))
  res.vagas = vagas
  if (vagas <= 0) return res

  const { data: linhas, error } = await db
    .from('b2b_prospectos')
    .select('id, empresa, segmento, pais, email, email_tipo, fonte_url, pessoa_colectiva, estado, agente, toques, ultimo_toque_em')
    .in('estado', ['novo', 'contactado'])
    .eq('pessoa_colectiva', true)
    .lt('toques', 3)
    .order('toques', { ascending: true })
    .order('criado_em', { ascending: true })
    .limit(200)
  if (error) { res.erros.push(error.message); return res }
  const prontos = ((linhas ?? []) as ProspectoLinha[]).filter((p) => prontoParaToque(p, cfg))
  if (!prontos.length) return res

  const exclusao = await carregarExclusao(db, prontos.map((p) => p.email))
  const segredo = segredoSaida()
  let enviadosHoje = cont.hoje
  const { createMailTransporter, mailFrom, prepareBrandedEmailHtml, brandedMailAttachments } = await import('@/lib/mail-transport')
  const { mtmEmailShell } = await import('@/lib/activation-emails')
  const transporte = ensaio ? null : createMailTransporter()

  for (const p of prontos) {
    if (res.enviados >= vagas) break
    const d = decidirEnvioB2B(p, { cfg: { ...cfg, ligado: true }, enviadosHoje, exclusao, segredo })
    const toque = Math.min(3, p.toques + 1)
    const registo = { prospecto_id: p.id, email: p.email, toque, assunto: d.assunto ?? null, texto: d.texto ?? null, agente: p.agente || AGENTE_B2B, base_legal: BASE_LEGAL_B2B, decisao: d.decisao, motivo: d.motivo }

    if (d.decisao !== 'sai') {
      if (d.decisao === 'fila') res.fila++
      else res.bloqueados++
      if (!ensaio) {
        await db.from('b2b_envios').insert(registo)
        if (d.retirar) await db.from('b2b_prospectos').update({ estado: 'excluido', nota: d.motivo, atualizado_em: new Date().toISOString() }).eq('id', p.id)
      }
      if (d.decisao === 'fila') break // tecto ou regra: o resto também não sai hoje
      continue
    }
    if (ensaio) { res.enviados++; enviadosHoje++; continue }

    // Última verificação, mesmo antes da rede: saiu entretanto?
    const ultima = await carregarExclusao(db, [p.email])
    if (ultima.length) {
      res.bloqueados++
      await db.from('b2b_envios').insert({ ...registo, decisao: 'bloqueado', motivo: 'Entrou na exclusão global durante o lote.' })
      await db.from('b2b_prospectos').update({ estado: 'excluido', atualizado_em: new Date().toISOString() }).eq('id', p.id)
      continue
    }

    const linkSair = (d.texto!.match(/https?:\/\/\S+\/api\/b2b\/sair\?\S+/) ?? [])[0]
    try {
      await transporte!.sendMail({
        from: mailFrom(),
        to: p.email,
        subject: d.assunto!,
        text: d.texto!,
        // Branding da casa (ouro sobre carvão, logo): o mesmo invólucro dos emails de serviço.
        html: prepareBrandedEmailHtml(mtmEmailShell(textoParaHtml(d.texto!))),
        attachments: brandedMailAttachments(),
        headers: linkSair ? { 'List-Unsubscribe': `<${linkSair}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined,
      })
      const agora = new Date().toISOString()
      await db.from('b2b_envios').insert({ ...registo, enviado_em: agora })
      await db.from('b2b_prospectos').update({ toques: toque, ultimo_toque_em: agora, estado: 'contactado', atualizado_em: agora }).eq('id', p.id)
      res.enviados++
      enviadosHoje++
      if (res.enviados < vagas) await esperar(cfg.intervalo_seg * 1000)
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 300) : 'erro no envio'
      res.erros.push(`${p.email}: ${msg}`)
      // Uma falha de envio grava-se como bloqueada (não saiu, não gasta tecto) e pára o lote.
      await db.from('b2b_envios').insert({ ...registo, decisao: 'bloqueado', motivo: 'Falha no transporte de email.', erro: msg })
      break
    }
  }
  return res
}

/** Grava na exclusão global e tira o prospecto da sequência. Nunca apaga nada. */
export async function excluir(db: Db, email: string, origem: string, nota?: string) {
  const e = String(email).trim().toLowerCase()
  if (!e.includes('@')) return { ok: false, erro: 'email inválido' }
  const { error } = await db.from('contacto_exclusao').upsert({ identificador: e, canal_origem: origem, nota: nota ?? null }, { onConflict: 'identificador', ignoreDuplicates: true })
  await db.from('b2b_prospectos').update({ estado: 'excluido', atualizado_em: new Date().toISOString() }).eq('email', e)
  return { ok: !error, erro: error?.message }
}

/** Avisa o dono no chat de admin do Telegram (melhor esforço). */
export async function avisarDono(texto: string): Promise<boolean> {
  try {
    const { getMtmcopyBotToken } = await import('@/lib/mtmcopy/telegram-bot')
    const { chatDeAdminDoAmbiente } = await import('@/lib/telegram-admin-menu')
    const token = getMtmcopyBotToken()
    if (!token) return false
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatDeAdminDoAmbiente(), text: texto, disable_web_page_preview: true }),
    })
    return r.ok
  } catch {
    return false
  }
}
