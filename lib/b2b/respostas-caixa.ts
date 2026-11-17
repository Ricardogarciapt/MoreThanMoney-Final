/**
 * Lê a caixa de onde sai a prospeção B2B e aplica `decidirAccoes` (lib/b2b/respostas.ts).
 *
 * A caixa é a mesma do transporte de email do site (`escolherRemetente`): Gmail com palavra-passe de
 * aplicação, que também abre o IMAP; ou SMTP próprio, e então o IMAP vem de `MAIL_IMAP_HOST`
 * (porta `MAIL_IMAP_PORT`, 993 por omissão), com as mesmas credenciais. Sem IMAP configurado não
 * faz nada e diz porquê. Só lê: nunca apaga, move ou marca mensagens como lidas.
 */
import { ImapFlow } from 'imapflow'
import { escolherRemetente, limpar, type AmbienteDeCorreio } from '@/lib/correio/remetente'
import { avisarDono, excluir } from './envio'
import { decidirAccoes, textoResumo, type MensagemRecebida, type ProspectoContactado, type ResumoSemanal } from './respostas'
import { PAISES } from './sequencias'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (t: string) => any }

const CHAVE = 'b2b_respostas'
const MAX_MENSAGENS = 300

function configImap(env: AmbienteDeCorreio & { MAIL_IMAP_HOST?: string; MAIL_IMAP_PORT?: string }) {
  const r = escolherRemetente(env)
  if (!r.password) return { erro: 'Sem palavra-passe da caixa de correio.' as const }
  if (r.via === 'gmail') return { host: 'imap.gmail.com', porta: 993, conta: r.conta, password: r.password }
  const host = limpar(env.MAIL_IMAP_HOST)
  if (!host) return { erro: 'SMTP próprio sem MAIL_IMAP_HOST: não há onde ler as respostas.' as const }
  return { host, porta: Number(limpar(env.MAIL_IMAP_PORT)) || 993, conta: r.conta, password: r.password }
}

async function lerEstado(db: Db): Promise<{ ultima_leitura?: string; ultimo_resumo?: string; resumo?: ResumoSemanal }> {
  const { data } = await db.from('site_settings').select('value').eq('key', CHAVE).maybeSingle()
  return (data?.value as Record<string, never>) ?? {}
}

async function gravarEstado(db: Db, v: Record<string, unknown>) {
  const antes = await lerEstado(db)
  await db.from('site_settings').upsert({ key: CHAVE, value: { ...antes, ...v } }, { onConflict: 'key' })
}

/** Busca as mensagens recebidas desde `desde`, em todo o correio (os filtros do Gmail tiram coisas da caixa de entrada). */
async function buscarMensagens(cfg: { host: string; porta: number; conta: string; password: string }, desde: Date): Promise<MensagemRecebida[]> {
  const cliente = new ImapFlow({ host: cfg.host, port: cfg.porta, secure: true, auth: { user: cfg.conta, pass: cfg.password }, logger: false })
  await cliente.connect()
  const out: MensagemRecebida[] = []
  try {
    const caixas = await cliente.list()
    const todo = caixas.find((c) => c.specialUse === '\\All')?.path ?? 'INBOX'
    const lock = await cliente.getMailboxLock(todo, { readOnly: true })
    try {
      const uids = (await cliente.search({ since: desde }, { uid: true })) || []
      const ultimos = uids.slice(-MAX_MENSAGENS)
      if (!ultimos.length) return out
      for await (const msg of cliente.fetch(ultimos, { envelope: true, headers: ['auto-submitted', 'x-autoreply', 'x-autorespond', 'precedence'], bodyParts: ['TEXT'] }, { uid: true })) {
        const de = msg.envelope?.from?.[0]?.address ?? ''
        if (!de || de.toLowerCase() === cfg.conta.toLowerCase()) continue
        const cab: Record<string, string> = {}
        for (const l of String(msg.headers ?? '').split(/\r?\n/)) {
          const m = l.match(/^([\w-]+):\s*(.*)$/)
          if (m) cab[m[1].toLowerCase()] = m[2].trim()
        }
        const corpo = (msg.bodyParts?.get('text') ?? msg.bodyParts?.get('TEXT'))?.toString('utf8').slice(0, 4096) ?? ''
        out.push({ de, assunto: msg.envelope?.subject ?? '', corpo, cabecalhos: cab })
      }
    } finally {
      lock.release()
    }
  } finally {
    await cliente.logout().catch(() => {})
  }
  return out
}

export interface ResultadoRespostas {
  lidas: number
  respostas: number
  saidas: number
  devolvidos: number
  aviso?: string
  resumo?: string
}

export async function processarRespostas(db: Db, opts: { ensaio?: boolean; agora?: Date } = {}): Promise<ResultadoRespostas> {
  const agora = opts.agora ?? new Date()
  const cfg = configImap(process.env as AmbienteDeCorreio)
  const res: ResultadoRespostas = { lidas: 0, respostas: 0, saidas: 0, devolvidos: 0 }
  if ('erro' in cfg) return { ...res, aviso: cfg.erro }

  const estado = await lerEstado(db)
  // Sobreposição de 2 dias: uma mensagem lida duas vezes não faz mal (o estado já mudou), uma perdida faz.
  const base = estado.ultima_leitura ? new Date(estado.ultima_leitura) : new Date(agora.getTime() - 14 * 864e5)
  const desde = new Date(base.getTime() - 2 * 864e5)

  const { data: pros } = await db.from('b2b_prospectos').select('id, email, empresa, segmento, estado').gt('toques', 0).limit(5000)
  const prospectos = (pros ?? []) as ProspectoContactado[]
  if (prospectos.length) {
    const mensagens = await buscarMensagens(cfg, desde)
    res.lidas = mensagens.length
    for (const a of decidirAccoes(mensagens, prospectos)) {
      if (a.tipo === 'resposta') res.respostas++
      else if (a.tipo === 'saida') res.saidas++
      else res.devolvidos++
      if (opts.ensaio) continue
      const iso = agora.toISOString()
      if (a.tipo === 'resposta') {
        await db.from('b2b_prospectos').update({ estado: 'respondeu', respondeu_em: iso, atualizado_em: iso }).eq('id', a.prospectoId)
        const p = prospectos.find((x) => x.id === a.prospectoId)
        await avisarDono(`📬 B2B: ${a.empresa} (${a.email}${p ? `, ${p.segmento}` : ''}) respondeu ao email. Responde a partir da caixa geral; está em /admin/sales-machine.`)
      } else if (a.tipo === 'saida') {
        await excluir(db, a.email, 'b2b_resposta', 'Pediu para sair ao responder ao email B2B.')
      } else {
        await excluir(db, a.email, 'b2b_devolvido', 'Email devolvido pelo servidor do destinatário.')
      }
    }
  }
  if (!opts.ensaio) await gravarEstado(db, { ultima_leitura: agora.toISOString() })

  // Segunda-feira: resumo da semana anterior, uma vez por semana.
  if (agora.getUTCDay() === 1) {
    const inicio = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate() - 7))
    const chaveSemana = inicio.toISOString().slice(0, 10)
    if (estado.ultimo_resumo !== chaveSemana) {
      const r = await resumoSemanal(db, inicio)
      res.resumo = textoResumo(r)
      if (!opts.ensaio) {
        await avisarDono(res.resumo)
        await gravarEstado(db, { ultimo_resumo: chaveSemana, resumo: r })
      }
    }
  }
  return res
}

export async function resumoSemanal(db: Db, inicio: Date): Promise<ResumoSemanal> {
  const fim = new Date(inicio.getTime() + 7 * 864e5)
  const [ini, fi] = [inicio.toISOString(), fim.toISOString()]
  const { data: env } = await db.from('b2b_envios').select('prospecto_id').eq('decisao', 'sai').gte('criado_em', ini).lt('criado_em', fi).limit(5000)
  const { data: resp } = await db.from('b2b_prospectos').select('empresa, segmento, pais').gte('respondeu_em', ini).lt('respondeu_em', fi).limit(500)
  const { data: exc } = await db.from('contacto_exclusao').select('canal_origem').in('canal_origem', ['b2b_resposta', 'b2b_devolvido']).gte('pedido_em', ini).lt('pedido_em', fi).limit(5000)
  const ids = [...new Set((env ?? []).map((e: { prospecto_id: string }) => e.prospecto_id))]
  const paisDe = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from('b2b_prospectos').select('id, pais').in('id', ids.slice(i, i + 200))
    for (const p of data ?? []) paisDe.set(p.id, p.pais)
  }
  const por_lingua: ResumoSemanal['por_lingua'] = Object.fromEntries(PAISES.map((p) => [p, { enviados: 0, respostas: 0 }]))
  for (const e of env ?? []) {
    const k = paisDe.get(e.prospecto_id)
    if (k && por_lingua[k]) por_lingua[k].enviados++
  }
  for (const r of resp ?? []) if (por_lingua[r.pais]) por_lingua[r.pais].respostas++
  const enviados = (env ?? []).length
  const respostas = (resp ?? []).length
  return {
    semana_inicio: inicio.toISOString().slice(0, 10),
    enviados,
    respostas,
    saidas: (exc ?? []).filter((x: { canal_origem: string }) => x.canal_origem !== 'b2b_devolvido').length,
    devolvidos: (exc ?? []).filter((x: { canal_origem: string }) => x.canal_origem === 'b2b_devolvido').length,
    taxa_resposta_pct: enviados ? Math.round((respostas / enviados) * 1000) / 10 : null,
    por_lingua,
    quem_respondeu: (resp ?? []).map((r: { empresa: string; segmento: string; pais: string }) => ({ empresa: r.empresa, segmento: r.segmento, pais: r.pais })),
  }
}
