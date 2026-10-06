/**
 * A FILA DE ENVIOS POR APROVAR — o que a máquina quer mandar por iniciativa própria.
 *
 * ═══ QUE FILA, E PORQUÊ ESTA ═══════════════════════════════════════════════════════════════
 *
 * Havia três candidatas (06/10):
 *  · `email_campaigns` (captacao-campanhas) — é de envio EM MASSA: um texto para um segmento. Um
 *    lembrete de checkout é uma mensagem a UMA pessoa sobre o checkout DELA; enfiá-lo numa
 *    campanha misturava as duas listas que `captacao-consentimento.ts` existe para separar.
 *  · `vendas_tarefas` — é trabalho para uma PESSOA fazer à mão (tem `responsavel_id`); não tem
 *    canal, destino nem um estado «aprovado» que faça sair a mensagem.
 *  · `aios_tasks` — ESCOLHIDA. É a fila que a API do agente já lê (`resource=tasks`) e escreve, o
 *    AIOS local já a mostra, estava vazia (nenhuma convenção a partir), e com a migração 181 ganhou
 *    `chave` (única — um lembrete por sessão, um rascunho por toque) e `payload` (o que sai).
 *
 * Os envios distinguem-se das tarefas internas pelo `kind` com prefixo `envio:` (ver
 * `KIND_ENVIO`). O `update_task` genérico da API NÃO os faz sair: só `aprovar_envio` faz.
 *
 * O Instagram fica na sua própria tabela (`ig_setter_rascunhos`): a private reply é UMA por
 * comentário e é por comentário que se tem de saber se já se gastou. `aprovarEnvio` aceita os
 * dois ids — um uuid é desta fila, outra coisa é um `comment_id` do setter.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  KIND_ENVIO,
  ehKindDeEnvio,
  followupAindaValido,
  podeSair,
  tipoDoKind,
  transicaoValida,
  type KindEnvio,
  type PayloadEmailRecuperacao,
  type PayloadFollowupTelegram,
} from '@/lib/envios-aprovacao'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface NovoEnvio {
  kind: KindEnvio
  /** Única. Correr o cron dez vezes não dá dez rascunhos do mesmo. */
  chave: string
  titulo: string
  /** O resumo legível para quem aprova. */
  detalhes: string
  payload: PayloadFollowupTelegram | PayloadEmailRecuperacao
  relatedUserId?: string | null
}

/** Grava um rascunho `pendente`. Devolve `false` quando já existia (pela `chave`). Nunca envia. */
export async function criarEnvioPorAprovar(n: NovoEnvio): Promise<{ criado: boolean; erro?: string }> {
  const db = getSupabaseAdmin()
  const { data: ja } = await db.from('aios_tasks').select('id').eq('chave', n.chave).maybeSingle()
  if (ja) return { criado: false }
  const { error } = await db.from('aios_tasks').insert({
    title: n.titulo,
    details: n.detalhes,
    kind: n.kind,
    status: 'pendente',
    priority: 'normal',
    chave: n.chave,
    payload: n.payload,
    related_user_id: n.relatedUserId ?? null,
    created_by: 'maquina',
  })
  // 23505 = a chave única apanhou uma corrida entre dois crons. Não é erro: já existe.
  if (error && (error as { code?: string }).code === '23505') return { criado: false }
  return error ? { criado: false, erro: error.message } : { criado: true }
}

export interface ResultadoDecisao {
  ok: boolean
  fila: 'aios_tasks' | 'ig_setter_rascunhos'
  estado: string
  enviado?: boolean
  erro?: string
}

/**
 * Aprova e envia. A transição é condicional NA BASE (`where estado = 'pendente'`): dois cliques
 * seguidos não aprovam duas vezes, e um rascunho rejeitado não ressuscita.
 */
export async function aprovarEnvio(id: string, quem: string): Promise<ResultadoDecisao> {
  const db = getSupabaseAdmin()
  const agora = new Date().toISOString()

  if (!UUID.test(id)) {
    const { data } = await db
      .from('ig_setter_rascunhos')
      .update({ estado: 'aprovado', decidido_em: agora, decidido_por: quem })
      .eq('comment_id', id)
      .eq('estado', 'pendente')
      .select('comment_id, estado')
    if (!data?.length) return { ok: false, fila: 'ig_setter_rascunhos', estado: 'nao_pendente', erro: 'não existe ou não está pendente' }
    const { enviarRascunhoAprovado } = await import('@/lib/instagram/setter')
    const r = await enviarRascunhoAprovado(id)
    return { ok: true, fila: 'ig_setter_rascunhos', estado: r.estado, enviado: r.ok, ...(r.erro ? { erro: r.erro } : {}) }
  }

  const { data: atual } = await db.from('aios_tasks').select('id, kind, status').eq('id', id).maybeSingle()
  if (!atual || !ehKindDeEnvio((atual as { kind: string }).kind)) {
    return { ok: false, fila: 'aios_tasks', estado: 'desconhecido', erro: 'não é um envio por aprovar' }
  }
  if (!transicaoValida((atual as { status: string }).status, 'aprovado')) {
    return { ok: false, fila: 'aios_tasks', estado: String((atual as { status: string }).status), erro: 'não está pendente' }
  }
  const { data } = await db
    .from('aios_tasks')
    .update({ status: 'aprovado', decidido_por: quem, decidido_em: agora, updated_at: agora })
    .eq('id', id)
    .eq('status', 'pendente')
    .select('id')
  if (!data?.length) return { ok: false, fila: 'aios_tasks', estado: 'nao_pendente', erro: 'outra decisão chegou primeiro' }
  const r = await enviarEnvioAprovado(id)
  return { ok: true, fila: 'aios_tasks', estado: r.estado, enviado: r.ok, ...(r.erro ? { erro: r.erro } : {}) }
}

export async function rejeitarEnvio(id: string, quem: string, motivo?: string): Promise<ResultadoDecisao> {
  const db = getSupabaseAdmin()
  const agora = new Date().toISOString()
  if (!UUID.test(id)) {
    // No setter, rejeitar chama-se `descartado` desde a migração 144.
    const { data } = await db
      .from('ig_setter_rascunhos')
      .update({ estado: 'descartado', decidido_em: agora, decidido_por: quem, erro: motivo ? `rejeitado: ${motivo}` : null })
      .eq('comment_id', id)
      .eq('estado', 'pendente')
      .select('comment_id')
    return data?.length
      ? { ok: true, fila: 'ig_setter_rascunhos', estado: 'descartado' }
      : { ok: false, fila: 'ig_setter_rascunhos', estado: 'nao_pendente', erro: 'não existe ou não está pendente' }
  }
  const { data } = await db
    .from('aios_tasks')
    .update({ status: 'rejeitado', decidido_por: quem, decidido_em: agora, updated_at: agora, ...(motivo ? { erro: `rejeitado: ${motivo}` } : {}) })
    .eq('id', id)
    .eq('status', 'pendente')
    .like('kind', 'envio:%')
    .select('id')
  return data?.length
    ? { ok: true, fila: 'aios_tasks', estado: 'rejeitado' }
    : { ok: false, fila: 'aios_tasks', estado: 'nao_pendente', erro: 'não existe, não é envio, ou não está pendente' }
}

/** Envia um envio da fila que está `aprovado`. Lê o estado da base; só `aprovado` sai. */
export async function enviarEnvioAprovado(id: string): Promise<{ ok: boolean; estado: string; erro?: string }> {
  const db = getSupabaseAdmin()
  const { data: row } = await db.from('aios_tasks').select('*').eq('id', id).maybeSingle()
  if (!row) return { ok: false, estado: 'desconhecido', erro: 'não encontrado' }
  const t = row as { kind: string; status: string; payload: unknown }
  if (!ehKindDeEnvio(t.kind)) return { ok: false, estado: t.status, erro: 'não é envio' }

  const decisao = podeSair({ tipo: tipoDoKind(t.kind), estado: t.status })
  if (!decisao.pode) return { ok: false, estado: t.status, erro: decisao.porque }

  const fechar = async (status: string, erro: string | null) => {
    await db
      .from('aios_tasks')
      .update({ status, erro, enviado_em: status === 'enviado' ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'aprovado')
    return { ok: status === 'enviado', estado: status, ...(erro ? { erro } : {}) }
  }

  if (t.kind === KIND_ENVIO.FOLLOWUP_TELEGRAM) {
    const p = t.payload as PayloadFollowupTelegram
    const { data: lead } = await db
      .from('telegram_leads')
      .select('followup_count, granted_at, stage')
      .eq('chat_id', p.chat_id)
      .maybeSingle()
    const l = lead as { followup_count: number | null; granted_at: string | null; stage: string | null } | null
    if (
      !l ||
      !followupAindaValido({
        countNaCriacao: p.followup_count_na_criacao,
        countAgora: l.followup_count,
        convertido: !!l.granted_at || !['new', 'qualifying', 'routed'].includes(String(l.stage ?? '')),
      })
    ) {
      return fechar('obsoleto', 'o lead mexeu-se depois do rascunho (respondeu, converteu ou já levou outro toque)')
    }
    const { enviarTelegramPorAgente } = await import('@/lib/agentes/mensagem-livro')
    const r = await enviarTelegramPorAgente({
      chatId: p.chat_id,
      texto: p.texto,
      funil: p.funil,
      codigoExplicito: p.codigo ?? undefined,
    })
    if (!r.enviado) return fechar('falhou', r.erro ?? 'o Telegram recusou')
    await db
      .from('telegram_leads')
      .update({ followup_count: p.toque, last_followup_at: new Date().toISOString() })
      .eq('chat_id', p.chat_id)
    return fechar('enviado', null)
  }

  if (t.kind === KIND_ENVIO.EMAIL_RECUPERACAO) {
    const p = t.payload as PayloadEmailRecuperacao
    try {
      const { createMailTransporter, mailFrom, prepareBrandedEmailHtml, brandedMailAttachments } = await import('@/lib/mail-transport')
      const html = textoParaHtml(p.texto)
      await createMailTransporter().sendMail({
        from: mailFrom(),
        to: p.email,
        subject: p.assunto,
        html: prepareBrandedEmailHtml(html),
        text: p.texto,
        attachments: brandedMailAttachments(),
      })
      return fechar('enviado', null)
    } catch (e) {
      return fechar('falhou', e instanceof Error ? e.message.slice(0, 300) : 'erro no envio')
    }
  }

  return { ok: false, estado: t.status, erro: 'kind sem envio' }
}

function textoParaHtml(texto: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc(texto)
    .split(/\n{2,}/)
    .map((par) => `<p>${par.replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')}</p>`)
    .join('\n')
}

/** O que está por decidir, nas duas filas. Para o painel e para a API do agente. */
export async function listarEnviosPendentes(limite = 100) {
  const db = getSupabaseAdmin()
  const [fila, ig] = await Promise.all([
    db
      .from('aios_tasks')
      .select('id, title, details, kind, status, payload, created_at')
      .like('kind', 'envio:%')
      .eq('status', 'pendente')
      .order('created_at', { ascending: false })
      .limit(limite),
    db
      .from('ig_setter_rascunhos')
      .select('comment_id, commenter, comment_text, texto_publico, texto_dm, dm_possivel, dm_motivo, publica_enviada_em, criado_em')
      .eq('estado', 'pendente')
      .order('criado_em', { ascending: false })
      .limit(limite),
  ])
  return {
    fila: fila.data ?? [],
    instagram: ig.data ?? [],
    erros: [fila.error?.message, ig.error?.message].filter(Boolean),
  }
}
