/**
 * O MOTOR DO FUNIL HÍBRIDO DE WHATSAPP (19/11/2026): texto → áudio → lista → áudio → link.
 *
 *   mtm_reencontro (template, botões)                      ← 1.ª mensagem, do Ricardo
 *     ├─ «Sim, manda»  → opt-in gravado → áudio de abertura → lista de rotas
 *     │     └─ rota escolhida → áudio da rota → texto com link e pergunta → closer IA continua
 *     ├─ «Agora não»   → resposta simpática, não volta a receber campanha
 *     └─ «Não quero receber» / SAIR → exclusão global (tratado no webhook)
 *   Em qualquer ponto: «falar com o Ricardo» → passa a humano + aviso no Telegram.
 *
 * Devolve `true` quando tratou a mensagem; `false` deixa o closer IA (`runLeadFunnelReply`) responder.
 * O guião (textos dos áudios, rotas, links) está em `lib/vendas/guiao-whatsapp.ts`.
 * Tudo sai por `enviarWhatsApp`, que decide se pode (janela, consentimento, exclusão).
 */
import { createHash } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { falarParaStorage } from '@/lib/voz'
import { enviarWhatsApp, lerEstadoDoContacto } from '@/lib/whatsapp-mensageiro'
import {
  AVISO_IA,
  BOTAO_DEPOIS,
  BOTAO_MENU,
  BOTAO_SAIR,
  BOTAO_SIM,
  MENU_ROTAS,
  ROTAS_WA,
  TEXTO_DEPOIS,
  TEXTO_HUMANO,
  TEXTO_MENU,
  audioAbertura,
  audioDaRota,
  lerIntencao,
  textoDaRota,
  type RotaWa,
} from '@/lib/vendas/guiao-whatsapp'

const FUNIL = 'whatsapp:funil'
const ESPERA_DEPOIS_DO_AUDIO_MS = 6000
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** O id/título de um botão ou linha de lista, normalizado para a intenção. Puro. */
export function intencaoDoBotao(idOuTitulo: string | null | undefined): RotaWa | 'sim' | 'depois' | 'sair' | null {
  const v = (idOuTitulo ?? '').trim()
  if (!v) return null
  if ((ROTAS_WA as readonly string[]).includes(v)) return v as RotaWa
  if (v === BOTAO_SIM || v === 'sim') return 'sim'
  if (v === BOTAO_DEPOIS || v === 'depois') return 'depois'
  if (v === BOTAO_SAIR || v === 'sair') return 'sair'
  return null
}

async function avisarRicardo(texto: string) {
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
    console.error('[whatsapp-fluxo] aviso falhou:', e instanceof Error ? e.message : e)
  }
}

/**
 * Áudio na voz do Ricardo (o aviso de IA vai no rodapé da lista que se segue). Se a voz falhar, o mesmo texto sai escrito: o funil
 * nunca pára por causa do áudio.
 */
async function falar(para: string, texto: string): Promise<'audio' | 'texto' | 'falhou'> {
  const db = getSupabaseAdmin()
  const ref = createHash('sha1').update(texto).digest('hex').slice(0, 20)
  try {
    const pub = await falarParaStorage(db as never, texto, `wa-audio/guiao/${ref}.mp3`)
    if (pub.ok) {
      const r = await enviarWhatsApp({ para, finalidade: 'resposta', audioUrl: pub.url, texto, agente: { funil: FUNIL } })
      if (r.enviado) return 'audio'
    }
  } catch (e) {
    console.warn('[whatsapp-fluxo] voz falhou:', e instanceof Error ? e.message : e)
  }
  const r = await enviarWhatsApp({ para, finalidade: 'resposta', texto, agente: { funil: FUNIL } })
  return r.enviado ? 'texto' : 'falhou'
}

async function guardarEstado(chatId: string, campos: Record<string, unknown>) {
  await getSupabaseAdmin()
    .from('telegram_leads')
    .upsert({ chat_id: chatId, source: 'whatsapp', ...campos, updated_at: new Date().toISOString() }, { onConflict: 'chat_id' })
}

async function gravarOptIn(e164: string, prova: string) {
  const db = getSupabaseAdmin()
  const { data } = await db
    .from('captacao_consentimento')
    .select('id')
    .eq('telefone', e164)
    .eq('canal', 'whatsapp')
    .eq('base_legal', 'consentimento')
    .is('retirado_em', null)
    .limit(1)
  if (data?.length) return
  await db.from('captacao_consentimento').insert({
    telefone: e164,
    canal: 'whatsapp',
    base_legal: 'consentimento',
    prova,
    origem: 'whatsapp:reencontro',
  })
}

export async function tratarFluxoWhatsApp(p: {
  from: string
  e164: string
  texto: string
  /** id ou título do botão / linha de lista em que a pessoa tocou. */
  botao: string | null
  nome: string | null
}): Promise<boolean> {
  const db = getSupabaseAdmin()
  const chatId = `wa:${p.from}`
  const { data: lead } = await db.from('telegram_leads').select('stage, interest, first_name').eq('chat_id', chatId).maybeSingle()
  const stage = (lead?.stage as string | null) ?? null
  const nome = ((p.nome || (lead?.first_name as string | null) || '').trim().split(/\s+/)[0] || '').slice(0, 30)
  const intencao = intencaoDoBotao(p.botao) ?? lerIntencao(p.texto)

  if (intencao === 'humano') {
    await enviarWhatsApp({ para: p.from, finalidade: 'resposta', texto: TEXTO_HUMANO, agente: { funil: FUNIL } })
    await guardarEstado(chatId, { stage: 'wa_humano', first_name: nome || null })
    await avisarRicardo(`🙋 <b>WhatsApp: quer falar contigo</b>\n${nome || p.e164} · ${p.e164}\n«${p.texto.slice(0, 200)}»`)
    return true
  }

  const veioDoReencontro = stage === 'wa_reencontro' || p.botao === BOTAO_SIM || p.botao === BOTAO_DEPOIS
  if (veioDoReencontro && intencao === 'sim') {
    await gravarOptIn(p.e164, `tocou/respondeu «${p.botao ?? p.texto}» ao template mtm_reencontro`)
    const comoSaiu = await falar(p.from, audioAbertura(nome || 'olá'))
    // A Meta vai buscar o ficheiro do áudio antes de o entregar; uma lista enviada logo a seguir chega
    // ANTES dele. Espera-se uns segundos para a lista aparecer sempre depois do áudio (pedido 23/11).
    if (comoSaiu === 'audio') await esperar(ESPERA_DEPOIS_DO_AUDIO_MS)
    await enviarWhatsApp({
      para: p.from,
      finalidade: 'resposta',
      interativo: { tipo: 'lista', corpo: TEXTO_MENU, botao: BOTAO_MENU, linhas: MENU_ROTAS, ...(comoSaiu === 'audio' ? { rodape: AVISO_IA } : {}) },
    })
    await guardarEstado(chatId, { stage: 'wa_menu', first_name: nome || null })
    return true
  }
  if (veioDoReencontro && intencao === 'depois') {
    await enviarWhatsApp({ para: p.from, finalidade: 'resposta', texto: TEXTO_DEPOIS })
    await guardarEstado(chatId, { stage: 'wa_depois', first_name: nome || null })
    return true
  }

  const rota = intencao && (ROTAS_WA as readonly string[]).includes(intencao) ? (intencao as RotaWa) : null
  // A rota só se dispara pelo guião uma vez (menu ou escolha explícita); depois o closer IA conduz.
  if (rota && (stage === 'wa_menu' || stage === 'wa_reencontro' || p.botao)) {
    const comoSaiu = await falar(p.from, audioDaRota(rota, nome || 'olá'))
    if (comoSaiu === 'audio') await esperar(ESPERA_DEPOIS_DO_AUDIO_MS)
    await enviarWhatsApp({
      para: p.from,
      finalidade: 'resposta',
      texto: textoDaRota(rota) + (comoSaiu === 'audio' ? `\n\n_${AVISO_IA}_` : ''),
      agente: { funil: FUNIL },
    })
    await guardarEstado(chatId, { stage: `wa_rota_${rota}`, interest: rota, first_name: nome || null })
    if (rota === 'solucoes') {
      await avisarRicardo(`🏢 <b>WhatsApp: interesse em Soluções (B2B)</b>\n${nome || p.e164} · ${p.e164}`)
    }
    return true
  }

  // Ainda no menu e escreveu outra coisa: volta a mostrar a lista uma vez, sem insistir mais.
  if (stage === 'wa_menu' && !rota) {
    const estado = await lerEstadoDoContacto(p.e164)
    if (!estado.retirou) {
      await enviarWhatsApp({
        para: p.from,
        finalidade: 'resposta',
        interativo: { tipo: 'lista', corpo: 'Escolhe uma opção para eu te mandar o que interessa 👇', botao: BOTAO_MENU, linhas: MENU_ROTAS },
      })
      await guardarEstado(chatId, { stage: 'wa_menu_2' })
      return true
    }
  }
  return false
}
