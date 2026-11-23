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
  GUIAO,
  ID_HUMANO,
  ID_MUDAR_LINGUA,
  ROTAS_WA,
  audioAbertura,
  audioDaRota,
  lerIntencao,
  menuComLingua,
  textoDaRota,
  type RotaWa,
} from '@/lib/vendas/guiao-whatsapp'
import { LINGUAS, ehLingua, linguaDoIndicativo, linguaEscolhida, linhasDeLinguas, type Lingua } from '@/lib/whatsapp/linguas'
import { variantesDoNumero } from '@/lib/whatsapp-envio'

const FUNIL = 'whatsapp:funil'
const ESPERA_DEPOIS_DO_AUDIO_MS = 6000
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** O id/título de um botão ou linha de lista, normalizado para a intenção, em qualquer das 5 línguas. Puro. */
export function intencaoDoBotao(idOuTitulo: string | null | undefined): RotaWa | 'sim' | 'depois' | 'sair' | 'humano' | 'lingua' | null {
  const v = (idOuTitulo ?? '').trim()
  if (!v) return null
  if ((ROTAS_WA as readonly string[]).includes(v)) return v as RotaWa
  if (v === ID_HUMANO) return 'humano'
  if (v === ID_MUDAR_LINGUA) return 'lingua'
  for (const l of LINGUAS) {
    const g = GUIAO[l]
    if (v === g.botaoSim) return 'sim'
    if (v === g.botaoDepois) return 'depois'
    if (v === g.botaoSair) return 'sair'
  }
  if (v === 'sim') return 'sim'
  if (v === 'depois') return 'depois'
  if (v === 'sair') return 'sair'
  return null
}

/**
 * Quem pede uma pessoa vai para a FILA DOS SETTERS no pipeline (pedido do Ricardo 23/11): o negócio
 * ganha a etiqueta `quer_pessoa` e uma tarefa aberta para hoje, papel setter. Nunca rebenta o funil.
 */
async function passarParaSetter(e164: string, nome: string, lingua: Lingua, frase: string) {
  try {
    const db = getSupabaseAdmin()
    type Neg = { id: string; etiquetas: string[] | null; nome: string | null }
    const { data } = await db.from('vendas_negocios').select('id, etiquetas, nome').in('telefone', variantesDoNumero(e164)).order('criado_em', { ascending: false }).limit(1)
    let neg = (data?.[0] as Neg | undefined) ?? null
    if (!neg) {
      const { data: novo } = await db
        .from('vendas_negocios')
        .insert({ nome: nome || null, telefone: e164, origem: 'whatsapp', chave_origem: `wa-humano:${e164}`, funil: 'educacao', estado: 'lead', etiquetas: ['quer_pessoa', `lingua-${lingua}`] })
        .select('id, etiquetas, nome')
        .single()
      neg = (novo as Neg | null) ?? null
    } else {
      await db
        .from('vendas_negocios')
        .update({ etiquetas: [...new Set([...(neg.etiquetas ?? []), 'quer_pessoa', `lingua-${lingua}`])], atualizado_em: new Date().toISOString() })
        .eq('id', neg.id)
    }
    if (!neg) return
    const hoje = new Date().toISOString().slice(0, 10)
    const chave = `wa-humano:${neg.id}:${hoje}`
    const { data: ja } = await db.from('vendas_tarefas').select('id').eq('chave', chave).maybeSingle()
    if (!ja) {
      await db.from('vendas_tarefas').insert({
        chave,
        titulo: `Falar com ${neg.nome || nome || e164} no WhatsApp (pediu uma pessoa)`,
        descricao: `Pediu para falar com uma pessoa no funil de WhatsApp. Língua: ${lingua.toUpperCase()}. Número ${e164}. Disse: «${frase.slice(0, 300)}». Já recebeu o link da agenda.`,
        negocio_id: neg.id,
        papel: 'setter',
        prazo: hoje,
        estado: 'aberta',
      })
    }
  } catch (e) {
    console.error('[whatsapp-fluxo] fila de setters falhou:', e instanceof Error ? e.message : e)
  }
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
  const { data: lead } = await db.from('telegram_leads').select('stage, interest, first_name, lang').eq('chat_id', chatId).maybeSingle()
  const stage = (lead?.stage as string | null) ?? null
  const nome = ((p.nome || (lead?.first_name as string | null) || '').trim().split(/\s+/)[0] || '').slice(0, 30)
  // Língua: a que a pessoa escolheu (ou a que lhe demos) > a do indicativo.
  let lingua: Lingua = ehLingua(lead?.lang) ? (lead!.lang as Lingua) : linguaDoIndicativo(p.e164)
  const g = () => GUIAO[lingua]

  // ── Troca de língua (bandeiras) ─────────────────────────────────────────────────────────────
  const escolhida = linguaEscolhida(p.botao) ?? (p.botao ? null : linguaEscolhida(p.texto))
  if (escolhida) {
    lingua = escolhida
    await guardarEstado(chatId, { lang: lingua, first_name: nome || null })
    if (stage === 'wa_reencontro' || stage === 'wa_lingua_reencontro') {
      // Ainda não disse que sim: pergunta outra vez, já na língua dele, com botões.
      await enviarWhatsApp({
        para: p.from,
        finalidade: 'resposta',
        interativo: {
          tipo: 'botoes',
          corpo: g().licenca(nome),
          botoes: [
            { id: 'sim', titulo: g().botaoSim },
            { id: 'depois', titulo: g().botaoDepois },
            { id: 'sair', titulo: g().botaoSair },
          ],
        },
      })
      await guardarEstado(chatId, { stage: 'wa_reencontro' })
      return true
    }
    // Já no funil: recomeça a abertura na língua nova.
    await abrirFunil(p, chatId, nome, lingua)
    return true
  }

  const intencao = intencaoDoBotao(p.botao) ?? lerIntencao(p.texto)

  if (intencao === 'lingua') {
    await enviarWhatsApp({
      para: p.from,
      finalidade: 'resposta',
      interativo: { tipo: 'lista', corpo: g().textoLinguas, botao: g().botaoLinguas, linhas: linhasDeLinguas() },
    })
    if (stage === 'wa_reencontro') await guardarEstado(chatId, { stage: 'wa_lingua_reencontro' })
    return true
  }

  if (intencao === 'humano') {
    await enviarWhatsApp({ para: p.from, finalidade: 'resposta', texto: g().textoHumano, agente: { funil: FUNIL } })
    await guardarEstado(chatId, { stage: 'wa_humano', first_name: nome || null, lang: lingua })
    await passarParaSetter(p.e164, nome, lingua, p.botao ?? p.texto)
    await avisarRicardo(`🙋 <b>WhatsApp: quer falar com uma pessoa</b>\n${nome || p.e164} · ${p.e164} · ${lingua.toUpperCase()}\nFicou na fila dos setters no pipeline.\n«${p.texto.slice(0, 200)}»`)
    return true
  }

  const veioDoReencontro =
    stage === 'wa_reencontro' || stage === 'wa_lingua_reencontro' || (!!p.botao && (intencao === 'sim' || intencao === 'depois'))
  if (veioDoReencontro && intencao === 'sim') {
    await gravarOptIn(p.e164, `tocou/respondeu «${p.botao ?? p.texto}» ao template de reencontro`)
    await abrirFunil(p, chatId, nome, lingua)
    return true
  }
  if (veioDoReencontro && intencao === 'depois') {
    await enviarWhatsApp({ para: p.from, finalidade: 'resposta', texto: g().textoDepois })
    await guardarEstado(chatId, { stage: 'wa_depois', first_name: nome || null, lang: lingua })
    return true
  }

  const rota = intencao && (ROTAS_WA as readonly string[]).includes(intencao) ? (intencao as RotaWa) : null
  // A rota só se dispara pelo guião uma vez (menu ou escolha explícita); depois o closer IA conduz.
  if (rota && (stage === 'wa_menu' || stage === 'wa_menu_2' || stage === 'wa_reencontro' || p.botao)) {
    const comoSaiu = await falar(p.from, audioDaRota(rota, nome || saudacao(lingua), lingua))
    if (comoSaiu === 'audio') await esperar(ESPERA_DEPOIS_DO_AUDIO_MS)
    await enviarWhatsApp({
      para: p.from,
      finalidade: 'resposta',
      texto: textoDaRota(rota, lingua) + (comoSaiu === 'audio' ? `\n\n_${g().avisoIa}_` : ''),
      agente: { funil: FUNIL },
    })
    await guardarEstado(chatId, { stage: `wa_rota_${rota}`, interest: rota, first_name: nome || null, lang: lingua })
    if (rota === 'solucoes') {
      await avisarRicardo(`🏢 <b>WhatsApp: interesse em Soluções (B2B)</b>\n${nome || p.e164} · ${p.e164} · ${lingua.toUpperCase()}`)
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
        interativo: { tipo: 'lista', corpo: g().textoMenuDeNovo, botao: g().botaoMenu, linhas: menuComLingua(lingua) },
      })
      await guardarEstado(chatId, { stage: 'wa_menu_2' })
      return true
    }
  }
  return false
}

function saudacao(l: Lingua): string {
  return { pt: 'olá', en: 'hi', fr: 'salut', de: 'hallo', es: 'hola' }[l]
}

/** Áudio de abertura → espera → lista de rotas (com pessoa e bandeiras), na língua do lead. */
async function abrirFunil(p: { from: string }, chatId: string, nome: string, lingua: Lingua) {
  const g = GUIAO[lingua]
  const comoSaiu = await falar(p.from, audioAbertura(nome || saudacao(lingua), lingua))
  // A Meta vai buscar o ficheiro do áudio antes de o entregar; uma lista enviada logo a seguir chega
  // ANTES dele. Espera-se uns segundos para a lista aparecer sempre depois do áudio (pedido 23/11).
  if (comoSaiu === 'audio') await esperar(ESPERA_DEPOIS_DO_AUDIO_MS)
  await enviarWhatsApp({
    para: p.from,
    finalidade: 'resposta',
    interativo: { tipo: 'lista', corpo: g.textoMenu, botao: g.botaoMenu, linhas: menuComLingua(lingua), ...(comoSaiu === 'audio' ? { rodape: g.avisoIa } : {}) },
  })
  await guardarEstado(chatId, { stage: 'wa_menu', first_name: nome || null, lang: lingua })
}
