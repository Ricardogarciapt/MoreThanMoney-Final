/**
 * ÁUDIOS NA VOZ DO RICARDO NO FUNIL DE WHATSAPP (pedido do dono, 19/11/2026).
 *
 * As mesmas regras dos áudios das DMs de Instagram (`lib/vendas/audio-dm.ts`): só no quebra-gelo
 * (depois de 2 mensagens dela) e no fecho (resposta com link de registo/conta/agenda), no máximo 2
 * por conversa, tecto diário, e sempre com o aviso de que a voz é gerada por IA (AI Act, art. 50.º).
 *
 * Interruptor próprio: `site_settings.whatsapp_audio` ({ ligado, tecto_dia }). Sem ele, nada sai.
 * Áudio só dentro da janela das 24 h — fora dela a Meta só aceita template, e um template não leva
 * áudio. A decisão passa por `decidirEnvio`, como tudo o que sai desta casa.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { falarParaStorage } from '@/lib/voz'
import { AVISO_AUDIO_IA, audiosHoje, lerConfigAudio, momentoDoAudio, pastaDoDia, textoParaAudio, type MomentoAudio } from '@/lib/vendas/audio-dm'
import { credenciaisWhatsApp, enviarWhatsApp, lerEstadoDoContacto } from '@/lib/whatsapp-mensageiro'
import { decidirEnvio, normalizarE164 } from '@/lib/whatsapp-envio'

export const CHAVE_AUDIO_WHATSAPP = 'whatsapp_audio'
const PREFIXO = 'wa-audio'

/** Corpo da Graph API para uma mensagem de áudio por link. Puro. */
export function corpoAudio(paraE164: string, url: string): Record<string, unknown> {
  return { messaging_product: 'whatsapp', to: paraE164.replace(/^\+/, ''), type: 'audio', audio: { link: url } }
}

export async function talvezAudioWhatsApp(p: {
  para: string
  resposta: string
  referencia: string
}): Promise<{ enviado: boolean; momento?: MomentoAudio; motivo?: string }> {
  try {
    const db = getSupabaseAdmin()
    const config = await lerConfigAudio(db as never, CHAVE_AUDIO_WHATSAPP)
    if (!config.ligado) return { enviado: false, motivo: 'desligado' }

    const { e164 } = normalizarE164(p.para)
    if (!e164) return { enviado: false, motivo: 'numero' }

    // Conversa: quantas mensagens dela antes desta, e quantos áudios já lhe mandámos.
    const [{ count: entradas }, { count: audios }] = await Promise.all([
      db.from('whatsapp_mensagens').select('id', { count: 'exact', head: true }).eq('telefone', e164).eq('direcao', 'entrada'),
      db.from('whatsapp_mensagens').select('id', { count: 'exact', head: true }).eq('telefone', e164).eq('direcao', 'saida').eq('tipo', 'audio').eq('estado', 'enviada'),
    ])
    const hoje = await audiosHoje(db as never, PREFIXO)
    const momento = momentoDoAudio({
      config,
      resposta: p.resposta,
      audiosHoje: hoje,
      conversa: { mensagensAntes: Math.max(0, (entradas ?? 0) - 1), audiosAntes: audios ?? 0 },
    })
    if (!momento) return { enviado: false, motivo: 'travas' }

    const estado = await lerEstadoDoContacto(e164)
    const decisao = decidirEnvio({ para: e164, tipo: 'texto', templateNome: null, finalidade: 'resposta' }, estado, Date.now())
    if (!decisao.pode || decisao.exigeTemplate) return { enviado: false, motivo: decisao.porque }

    const texto = textoParaAudio(p.resposta)
    if (texto.length < 20) return { enviado: false, motivo: 'texto-curto' }
    const ref = p.referencia.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) || String(Date.now())
    const pub = await falarParaStorage(db as never, texto, `${pastaDoDia(new Date(), PREFIXO)}/${ref}.mp3`)
    if (!pub.ok) return { enviado: false, motivo: `voz: ${pub.motivo}` }

    const { creds, falta } = credenciaisWhatsApp()
    if (!creds) return { enviado: false, motivo: `sem credenciais: ${falta}` }
    const res = await fetch(`https://graph.facebook.com/v21.0/${creds.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpoAudio(e164, pub.url)),
    })
    const corpo = await res.json().catch(() => ({}))
    const ok = res.ok && !corpo?.error
    await db.from('whatsapp_mensagens').insert({
      direcao: 'saida',
      telefone: e164,
      tipo: 'audio',
      texto,
      estado: ok ? 'enviada' : 'falhou',
      finalidade: 'resposta',
      wa_message_id: corpo?.messages?.[0]?.id ?? null,
      erro: ok ? null : String(corpo?.error?.message ?? `HTTP ${res.status}`).slice(0, 500),
      motivo: `áudio ${momento}`,
      bruto: { url: pub.url },
    })
    if (!ok) return { enviado: false, motivo: corpo?.error?.message ?? `HTTP ${res.status}` }

    if (AVISO_AUDIO_IA) await enviarWhatsApp({ para: e164, finalidade: 'resposta', texto: AVISO_AUDIO_IA, estado })
    return { enviado: true, momento }
  } catch (e) {
    return { enviado: false, motivo: e instanceof Error ? e.message : 'erro' }
  }
}
