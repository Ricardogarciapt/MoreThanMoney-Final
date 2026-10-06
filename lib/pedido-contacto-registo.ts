/**
 * «Quero que me liguem» e Meta Lead Ads → base de dados, tarefa do setter e aviso ao dono.
 *
 * A decisão do que é consentimento é pura (`lib/pedido-contacto.ts`). Aqui só se grava:
 *  1. o pedido (`pedidos_contacto`);
 *  2. uma linha no livro (`captacao_consentimento`) POR CANAL MARCADO, com a prova, a origem e o ag;
 *  3. a tarefa de contacto IMEDIATO para o setter na fila de envios (`aios_tasks`, kind
 *     `envio:contacto_imediato`). Se a regra do motor (`lib/agentes/contacto-inicial.ts`, usada só
 *     como consumidora) autoriza o canal, a tarefa nasce `aprovado` (saída autorizada); senão
 *     nasce `pendente` e espera o dono;
 *  4. o aviso ao dono, pelo mesmo Telegram de admin que os outros alertas usam.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { AG } from '@/lib/agentes/codigos'
import { contarHoje, decidirContacto, juntarEvidencia, type Decisao } from '@/lib/agentes/contacto-inicial'
import { criarTarefaContactoImediato } from '@/lib/envios-fila'
import type { PayloadContactoImediato } from '@/lib/envios-aprovacao'
import {
  INTERESSES,
  MELHORES_HORAS,
  canalPreferido,
  textoPrimeiroContacto,
  type CanalContacto,
  type LinhaConsentimento,
  type PedidoValido,
} from '@/lib/pedido-contacto'

type Fonte = 'site' | 'meta_lead_ads' | 'telegram'

export async function contarRecentes(p: { ipHash: string | null; telefone: string | null }) {
  const db = getSupabaseAdmin()
  const hora = new Date(Date.now() - 3600_000).toISOString()
  const dia = new Date(Date.now() - 86_400_000).toISOString()
  let ipUltimaHora = 0
  let telefoneUltimoDia = 0
  if (p.ipHash) {
    const { count } = await db.from('pedidos_contacto').select('id', { count: 'exact', head: true }).eq('ip_hash', p.ipHash).gte('criado_em', hora)
    ipUltimaHora = count ?? 0
  }
  if (p.telefone) {
    const { count } = await db.from('pedidos_contacto').select('id', { count: 'exact', head: true }).eq('telefone', p.telefone).gte('criado_em', dia)
    telefoneUltimoDia = count ?? 0
  }
  return { ipUltimaHora, telefoneUltimoDia }
}

async function idDoSetter(): Promise<string | null> {
  try {
    const { data } = await getSupabaseAdmin().from('agentes_equipa').select('id').eq('chave_receita', AG.SETTER).maybeSingle()
    return (data as { id?: string } | null)?.id ?? null
  } catch {
    return null
  }
}

/**
 * Pergunta ao motor, canal a canal, se o setter pode avançar sozinho. Qualquer falha (tabela que
 * ainda não existe, leitura que caiu) conta como NÃO — fica pendente para o dono.
 */
async function decisoesDoMotor(pedido: PedidoValido): Promise<Record<string, Decisao>> {
  const db = getSupabaseAdmin()
  const agente = await idDoSetter()
  const out: Record<string, Decisao> = {}
  for (const canal of pedido.canais) {
    const destino = canal === 'email' ? pedido.email : pedido.telefone
    if (!destino) continue
    const p = { canal, destino, texto: textoPrimeiroContacto({ nome: pedido.nome, interesse: pedido.interesse, canal }) }
    try {
      const ev = await juntarEvidencia(db, p)
      const usados = agente ? await contarHoje(db, agente, canal) : null
      out[canal] = usados
        ? decidirContacto(p, ev, usados)
        : { pode: false, base: null, porque: 'Sem contagem do tecto do setter (agente ou registo em falta) — fica para o dono.', destino: 'fila' }
    } catch (e) {
      out[canal] = { pode: false, base: null, porque: `Não foi possível verificar: ${e instanceof Error ? e.message : 'erro'}`, destino: 'fila' }
    }
  }
  return out
}

async function avisarDono(texto: string) {
  try {
    const { sendTelegramChannelMessage } = await import('@/lib/mtmcopy/telegram-bot')
    const db = getSupabaseAdmin()
    let chat = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || ''
    if (!chat) {
      const { data } = await db.from('site_settings').select('value').eq('key', 'telegram_admin_chat_id').maybeSingle()
      const v = data?.value as { chat_id?: string } | string | null
      chat = typeof v === 'string' ? v : v?.chat_id ? String(v.chat_id) : ''
    }
    if (chat) await sendTelegramChannelMessage(chat, texto)
  } catch (e) {
    console.error('[pedido-contacto] aviso ao dono falhou:', e instanceof Error ? e.message : e)
  }
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)

export interface ResultadoRegisto {
  ok: boolean
  duplicado?: boolean
  pedidoId?: string
  consentimentos?: number
  tarefa?: { id: string | null; estado: string | null }
  erro?: string
}

export async function registarPedidoDeContacto(p: {
  pedido: PedidoValido
  linhas: LinhaConsentimento[]
  fonte: Fonte
  ipHash?: string | null
  meta?: { leadgenId: string; formId: string | null; pageId: string | null; adId: string | null }
}): Promise<ResultadoRegisto> {
  const db = getSupabaseAdmin()
  const { pedido } = p

  const { data: ins, error } = await db
    .from('pedidos_contacto')
    .insert({
      fonte: p.fonte,
      nome: pedido.nome,
      telefone: pedido.telefone || null,
      email: pedido.email,
      interesse: pedido.interesse,
      melhor_hora: pedido.melhorHora,
      canais: pedido.canais,
      origem: pedido.origem,
      ag: pedido.ag,
      ip_hash: p.ipHash ?? null,
      meta_leadgen_id: p.meta?.leadgenId ?? null,
      meta_form_id: p.meta?.formId ?? null,
      meta_page_id: p.meta?.pageId ?? null,
      meta_ad_id: p.meta?.adId ?? null,
    })
    .select('id')
    .maybeSingle()
  if (error) {
    if ((error as { code?: string }).code === '23505') return { ok: true, duplicado: true }
    return { ok: false, erro: error.message }
  }
  const pedidoId = (ins as { id: string }).id

  // Uma linha por canal marcado. Sem caixa marcada não há linhas — e então também não há tarefa.
  let consentimentos = 0
  if (p.linhas.length) {
    const { error: eL } = await db
      .from('captacao_consentimento')
      .insert(p.linhas.map((l) => ({ ...l, pedido_contacto_id: pedidoId })))
    if (eL) console.error('[pedido-contacto] consentimento não gravou:', eL.message)
    else consentimentos = p.linhas.length
  }

  if (consentimentos === 0) {
    await avisarDono(
      `📥 <b>Lead sem consentimento</b> (${p.fonte})\n${esc(pedido.nome)} · ${esc(INTERESSES[pedido.interesse])}\n` +
        'Nenhuma caixa marcada: NÃO pode ser contactado pelos agentes.',
    )
    return { ok: true, pedidoId, consentimentos: 0, tarefa: { id: null, estado: null } }
  }

  const canais = p.linhas.map((l) => l.canal) as CanalContacto[]
  const decisoes = await decisoesDoMotor({ ...pedido, canais })
  // Começa-se pelo canal preferido que o motor JÁ autoriza; se nenhum, pelo preferido (pendente).
  const autorizados = canais.filter((c) => decisoes[c]?.destino === 'sai')
  const autorizada = autorizados.length > 0
  const inicial = canalPreferido(autorizada ? autorizados : canais)

  const payload: PayloadContactoImediato = {
    pedido_contacto_id: pedidoId,
    agente: AG.SETTER,
    nome: pedido.nome,
    telefone: pedido.telefone || null,
    email: pedido.email,
    interesse: pedido.interesse,
    melhor_hora: pedido.melhorHora,
    canais,
    canal_inicial: inicial,
    texto: inicial ? textoPrimeiroContacto({ nome: pedido.nome, interesse: pedido.interesse, canal: inicial }) : '',
    origem: pedido.origem,
    ag: pedido.ag,
    fonte: p.fonte,
    decisoes: Object.fromEntries(Object.entries(decisoes).map(([k, d]) => [k, { destino: d.destino, base: d.base, porque: d.porque }])),
    saida_autorizada: autorizada,
  }
  const tarefa = await criarTarefaContactoImediato({
    chave: `contacto_imediato:${pedidoId}`,
    titulo: `Contactar já: ${pedido.nome} (${INTERESSES[pedido.interesse]})`,
    detalhes:
      `Pediu contacto por ${canais.join(', ')}. Melhor hora: ${MELHORES_HORAS[pedido.melhorHora]}. ` +
      `Origem: ${pedido.origem ?? '—'}${pedido.ag ? ` · ${pedido.ag}` : ''}. ` +
      (autorizada ? 'Saída autorizada pela regra do motor (consentimento).' : `Pendente: ${inicial ? decisoes[inicial]?.porque ?? '' : ''}`),
    payload,
  })
  await db.from('pedidos_contacto').update({ tarefa_id: tarefa.id, tarefa_estado: tarefa.estado }).eq('id', pedidoId)

  await avisarDono(
    `📞 <b>Quero que me liguem</b> (${p.fonte})\n` +
      `${esc(pedido.nome)} · ${esc(pedido.telefone || pedido.email || '')}\n` +
      `Interesse: ${esc(INTERESSES[pedido.interesse])} · ${esc(MELHORES_HORAS[pedido.melhorHora])}\n` +
      `Consentiu: ${canais.join(', ')}${pedido.origem ? `\nOrigem: ${esc(pedido.origem)}` : ''}${pedido.ag ? ` · ${pedido.ag}` : ''}\n` +
      (autorizada ? '✅ Saída autorizada: o setter contacta já.' : '⏳ Tarefa pendente na fila de envios (aprovar no /admin).'),
  )

  return { ok: true, pedidoId, consentimentos, tarefa }
}
