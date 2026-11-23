/**
 * O MOTOR DO SEGUIMENTO DE QUEM FOI AO SITE (23/11/2026). Corre de 5 em 5 minutos dentro do cron
 * `lead-instantaneo`. As regras (quando, o quê) estão em `seguimento-site.ts`, que é puro.
 *
 * Tudo sai por `enviarWhatsApp`, que volta a decidir (janela, consentimento, SAIR): este motor
 * nunca consegue mandar o que a lei ou a Meta não deixam, mesmo que se engane.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { enviarWhatsApp, lerEstadoDoContacto } from '@/lib/whatsapp-mensageiro'
import { variantesDoNumero } from '@/lib/whatsapp-envio'
import { linkAgendar } from '@/lib/agenda/link'
import { ehLingua, linguaDoIndicativo, type Lingua } from './linguas'
import { destinoDaRota, linkSeguido, seguirLinks } from './link-seguido'
import { passarParaSetter, passarParaSetterTelegram } from './setter'
import {
  FASES_FORA,
  ID_SEG_AGENDAR,
  ID_SEG_DUVIDA,
  TEXTOS_SEGUIMENTO,
  contagemDepois,
  horaDeLisboa,
  proximoToque,
  rotaDoLead,
  temaDaRota,
  type Toque,
} from './seguimento-site'
import { ID_HUMANO } from '@/lib/vendas/guiao-whatsapp'

const FUNIL = 'whatsapp:seguimento-site'
const AGENDA = linkAgendar('apresentacao')

type Lead = {
  chat_id: string
  first_name: string | null
  stage: string | null
  interest: string | null
  lang: string | null
  followup_count: number | null
  last_followup_at: string | null
  updated_at: string | null
  created_at: string | null
  granted_at: string | null
}

export async function correrSeguimentoSite(agora = Date.now()): Promise<{ vistos: number; enviados: number; setter: number; detalhe: string[] }> {
  const db = getSupabaseAdmin()
  const detalhe: string[] = []
  const hora = horaDeLisboa(agora)
  if (hora < 9 || hora >= 21) return { vistos: 0, enviados: 0, setter: 0, detalhe: ['fora de horas'] }

  const { data } = await db
    .from('telegram_leads')
    .select('chat_id, first_name, stage, interest, lang, followup_count, last_followup_at, updated_at, created_at, granted_at')
    .eq('source', 'whatsapp')
    .is('granted_at', null)
    .lt('followup_count', 4)
    .not('stage', 'in', `(${FASES_FORA.join(',')})`)
    .lt('updated_at', new Date(agora - 45 * 60_000).toISOString())
    .gt('updated_at', new Date(agora - 10 * 24 * 3_600_000).toISOString())
    .order('updated_at', { ascending: true })
    .limit(40)

  let enviados = 0
  let setter = 0
  const leads = (data ?? []) as Lead[]
  for (const l of leads) {
    try {
      const e164 = l.chat_id.replace(/^wa:/, '').replace(/^(\d)/, '+$1')
      const variantes = variantesDoNumero(e164)
      const lingua: Lingua = ehLingua(l.lang) ? l.lang : linguaDoIndicativo(e164)
      const rota = rotaDoLead(l.stage, l.interest)

      const estado = await lerEstadoDoContacto(e164)
      const [{ data: cliques }, convertido] = await Promise.all([
        db.from('bot_avisos_enviados').select('enviado_em').eq('tipo', 'wa-clique').in('alvo', variantes).order('enviado_em', { ascending: false }).limit(1),
        jaConverteu(variantes, l.created_at),
      ])
      const clicou = (cliques?.[0] as { enviado_em?: string } | undefined)?.enviado_em ?? null
      // Só conta o clique desta conversa (depois da última mensagem do funil ou dela).
      const clicouAgora = clicou && l.updated_at && Date.parse(clicou) >= Date.parse(l.updated_at) - 6 * 3_600_000 ? clicou : null

      const toque = proximoToque({
        stage: l.stage,
        followupCount: Number(l.followup_count || 0),
        ultimaAtividadeIso: l.updated_at,
        ultimaEntradaIso: estado.ultimaEntradaIso,
        ultimoToqueIso: l.last_followup_at,
        clicouEmIso: clicouAgora,
        lingua,
        convertido,
        saiu: estado.retirou,
        horaLisboa: hora,
        agora,
      })
      if (!toque) continue

      // Trinco: dois crons sobrepostos nunca mandam o mesmo toque.
      const chave = `wa-site:${e164}:${toque}:${l.updated_at ?? ''}`
      const { data: trinco } = await db
        .from('bot_avisos_enviados')
        .upsert({ chave, tipo: 'wa-seguimento-site', alvo: e164 }, { onConflict: 'chave', ignoreDuplicates: true })
        .select('chave')
      if (!trinco?.length) continue

      const nome = (l.first_name || '').trim().split(/\s+/)[0] || ({ pt: 'Olá', en: 'Hi', fr: 'Salut', de: 'Hallo', es: 'Hola' } as const)[lingua]
      const saiu = await darToque(toque, { e164, nome, lingua, rota, clicou: !!clicouAgora })
      detalhe.push(`${e164.slice(0, 7)}… ${toque}: ${saiu}`)
      if (saiu === 'ok') {
        if (toque === 'setter') setter++
        else enviados++
        // updated_at fica como estava: é a última atividade DELA/do funil, a régua dos próximos toques.
        await db
          .from('telegram_leads')
          .update({ followup_count: contagemDepois(toque), last_followup_at: new Date(agora).toISOString() })
          .eq('chat_id', l.chat_id)
      }
    } catch (e) {
      detalhe.push(`${l.chat_id.slice(0, 8)}… erro: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  const t = await correrSeguimentoTelegram(agora, hora)
  return { vistos: leads.length + t.vistos, enviados: enviados + t.enviados, setter: setter + t.setter, detalhe: [...detalhe, ...t.detalhe] }
}

/**
 * O MESMO PARA O TELEGRAM (23/11): leads que passaram pelo funil de conversa (fases tg_*). No
 * Telegram não há janela da Meta, mas a regra é a mesma por respeito: os dois primeiros toques só
 * nas 23 h a seguir à última mensagem dela, e depois disso passa logo à fila dos setters.
 */
async function correrSeguimentoTelegram(agora: number, hora: number): Promise<{ vistos: number; enviados: number; setter: number; detalhe: string[] }> {
  const db = getSupabaseAdmin()
  const detalhe: string[] = []
  const { data } = await db
    .from('telegram_leads')
    .select('chat_id, first_name, stage, interest, lang, followup_count, last_followup_at, updated_at, created_at, granted_at')
    .like('stage', 'tg_%')
    .is('granted_at', null)
    .lt('followup_count', 4)
    .not('stage', 'in', `(${FASES_FORA.join(',')})`)
    .lt('updated_at', new Date(agora - 45 * 60_000).toISOString())
    .gt('updated_at', new Date(agora - 10 * 24 * 3_600_000).toISOString())
    .order('updated_at', { ascending: true })
    .limit(40)
  let enviados = 0
  let setter = 0
  const leads = (data ?? []) as Lead[]
  const { enviarTextoTelegram } = await import('@/lib/telegram/funil-conversa')
  for (const l of leads) {
    try {
      const chatId = l.chat_id
      const alvo = `tg:${chatId}`
      const lingua: Lingua = ehLingua(l.lang) ? l.lang : 'pt'
      const rota = rotaDoLead(String(l.stage ?? '').replace(/^tg_/, 'wa_'), l.interest)
      const [{ data: cliques }, { data: negs }] = await Promise.all([
        db.from('bot_avisos_enviados').select('enviado_em').eq('tipo', 'wa-clique').eq('alvo', alvo).order('enviado_em', { ascending: false }).limit(1),
        db.from('vendas_negocios').select('id, estado, comprador_id').eq('telegram_id', chatId).limit(3),
      ])
      const lista = (negs ?? []) as Array<{ id: string; estado: string | null; comprador_id: string | null }>
      let convertido = lista.some((n) => n.comprador_id || n.estado === 'ganho' || n.estado === 'perdido')
      if (!convertido && lista.length) {
        const { data: marc } = await db.from('agenda_marcacoes').select('id').in('negocio_id', lista.map((n) => n.id)).is('cancelada_em', null).gte('created_at', l.created_at ?? new Date(agora - 30 * 86_400_000).toISOString()).limit(1)
        convertido = !!marc?.length
      }
      const clicou = (cliques?.[0] as { enviado_em?: string } | undefined)?.enviado_em ?? null
      const clicouAgora = clicou && l.updated_at && Date.parse(clicou) >= Date.parse(l.updated_at) - 6 * 3_600_000 ? clicou : null
      const toque = proximoToque({
        stage: l.stage,
        followupCount: Number(l.followup_count || 0),
        ultimaAtividadeIso: l.updated_at,
        ultimaEntradaIso: l.updated_at,
        ultimoToqueIso: l.last_followup_at,
        clicouEmIso: clicouAgora,
        lingua,
        convertido,
        saiu: false,
        horaLisboa: hora,
        agora,
        canal: 'telegram',
      })
      if (!toque) continue
      const chave = `tg-site:${chatId}:${toque}:${l.updated_at ?? ''}`
      const { data: trinco } = await db.from('bot_avisos_enviados').upsert({ chave, tipo: 'tg-seguimento-site', alvo }, { onConflict: 'chave', ignoreDuplicates: true }).select('chave')
      if (!trinco?.length) continue

      const nome = (l.first_name || '').trim().split(/\s+/)[0] || ({ pt: 'Olá', en: 'Hi', fr: 'Salut', de: 'Hallo', es: 'Hola' } as const)[lingua]
      const tx = TEXTOS_SEGUIMENTO[lingua]
      const botoes = { inline_keyboard: [[{ text: tx.botaoDuvida, callback_data: `fx:${ID_SEG_DUVIDA}` }], [{ text: tx.botaoAgendar, callback_data: `fx:${ID_SEG_AGENDAR}` }], [{ text: tx.botaoPessoa, callback_data: `fx:${ID_HUMANO}` }]] }
      let ok = false
      if (toque === 'clique') ok = await enviarTextoTelegram(chatId, tx.clique(nome), botoes)
      else if (toque === 'lembrete') ok = await enviarTextoTelegram(chatId, tx.lembrete(nome, linkSeguido(alvo, destinoDaRota(rota))), botoes)
      else if (toque === 'ultima_janela') ok = await enviarTextoTelegram(chatId, seguirLinks(tx.ultima(nome, AGENDA), alvo, AGENDA), { inline_keyboard: botoes.inline_keyboard.slice(0, 2) })
      else {
        await passarParaSetterTelegram(chatId, nome, lingua, `Rota: ${rota ?? 'sem rota'}. Abriu o link do site: ${clicouAgora ? 'sim' : 'não'}. Recebeu os toques automáticos sem responder.`, 'seguimento')
        ok = true
      }
      detalhe.push(`tg ${chatId.slice(0, 4)}… ${toque}: ${ok ? 'ok' : 'falhou'}`)
      if (ok) {
        if (toque === 'setter') setter++
        else enviados++
        await db.from('telegram_leads').update({ followup_count: contagemDepois(toque === 'template' ? 'setter' : toque), last_followup_at: new Date(agora).toISOString() }).eq('chat_id', chatId)
      }
    } catch (e) {
      detalhe.push(`tg ${l.chat_id.slice(0, 4)}… erro: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { vistos: leads.length, enviados, setter, detalhe }
}

/** Marcou na agenda, comprou ou já ganhou/perdeu no pipeline desde que entrou no funil? */
async function jaConverteu(variantes: string[], desdeIso: string | null): Promise<boolean> {
  const db = getSupabaseAdmin()
  const desde = desdeIso ?? new Date(Date.now() - 30 * 24 * 3_600_000).toISOString()
  const { data: negs } = await db.from('vendas_negocios').select('id, estado, comprador_id').in('telefone', variantes).limit(5)
  const lista = (negs ?? []) as Array<{ id: string; estado: string | null; comprador_id: string | null }>
  if (lista.some((n) => n.comprador_id || n.estado === 'ganho' || n.estado === 'perdido')) return true
  const ids = lista.map((n) => n.id)
  const filtro = ids.length ? `telefone.in.(${variantes.map((v) => `"${v}"`).join(',')}),negocio_id.in.(${ids.join(',')})` : `telefone.in.(${variantes.map((v) => `"${v}"`).join(',')})`
  const { data: marc } = await db.from('agenda_marcacoes').select('id').or(filtro).gte('created_at', desde).is('cancelada_em', null).limit(1)
  return !!marc?.length
}

async function darToque(
  toque: Toque,
  p: { e164: string; nome: string; lingua: Lingua; rota: string | null; clicou: boolean },
): Promise<string> {
  const tx = TEXTOS_SEGUIMENTO[p.lingua]
  const botoes = [
    { id: ID_SEG_DUVIDA, titulo: tx.botaoDuvida },
    { id: ID_SEG_AGENDAR, titulo: tx.botaoAgendar },
    { id: ID_HUMANO, titulo: tx.botaoPessoa },
  ]
  if (toque === 'clique' || toque === 'lembrete') {
    const corpo = toque === 'clique' ? tx.clique(p.nome) : tx.lembrete(p.nome, linkSeguido(p.e164, destinoDaRota(p.rota)))
    const r = await enviarWhatsApp({ para: p.e164, finalidade: 'resposta', interativo: { tipo: 'botoes', corpo, botoes }, agente: { funil: FUNIL } })
    return r.enviado ? 'ok' : `recusado (${r.codigo})`
  }
  if (toque === 'ultima_janela') {
    const corpo = seguirLinks(tx.ultima(p.nome, AGENDA), p.e164, AGENDA)
    const r = await enviarWhatsApp({ para: p.e164, finalidade: 'resposta', interativo: { tipo: 'botoes', corpo, botoes: botoes.slice(0, 2) }, agente: { funil: FUNIL } })
    return r.enviado ? 'ok' : `recusado (${r.codigo})`
  }
  if (toque === 'template') {
    const r = await enviarWhatsApp({
      para: p.e164,
      finalidade: 'campanha',
      template: { nome: 'mtm_seguimento', idioma: 'pt_PT', parametros: [p.nome, temaDaRota(p.rota)] },
      agente: { funil: FUNIL },
    })
    return r.enviado ? 'ok' : `recusado (${r.codigo})`
  }
  // setter
  await passarParaSetter(
    p.e164,
    p.nome,
    p.lingua,
    `Rota: ${p.rota ?? 'sem rota'}. Abriu o link do site: ${p.clicou ? 'sim' : 'não'}. Recebeu os toques automáticos sem responder. Retomar à mão, com calma.`,
    'seguimento',
  )
  return 'ok'
}
