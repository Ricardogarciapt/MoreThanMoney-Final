import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getMtmcopyBotToken } from '@/lib/mtmcopy/telegram-bot'
import type { Braços } from '@/lib/funis-motor'
import { lerCampoReal } from '@/lib/funis-motor'

/**
 * Os braços do motor de funis — o que ele faz mesmo no mundo.
 *
 * Estão separados do motor de propósito. O motor decide o CAMINHO; isto executa. É a separação
 * que permite ao ensaio percorrer exactamente o mesmo código de decisão sem tocar em ninguém — e
 * um simulador que não partilha o código de decisão descreve o funil que quem o escreveu julga ter.
 *
 * ── O interruptor ────────────────────────────────────────────────────────────────────────────
 * Isto envia mensagens a pessoas reais. Fica DESLIGADO até alguém decidir o contrário, e a chave
 * está em `site_settings.funis_motor_ligado`. Não é timidez: um funil recém-desenhado com uma
 * espera mal posta manda três mensagens seguidas à mesma pessoa, e essa pessoa não volta.
 * O ensaio existe para se ver o caminho antes; o interruptor existe para se ligar depois.
 */

const CHAVE_LIGADO = 'funis_motor_ligado'

export async function motorLigado(): Promise<boolean> {
  try {
    const { data } = await getSupabaseAdmin()
      .from('site_settings')
      .select('value')
      .eq('key', CHAVE_LIGADO)
      .maybeSingle()
    const v = data?.value
    return v === true || v === 'true' || (typeof v === 'object' && v !== null && (v as { ligado?: boolean }).ligado === true)
  } catch {
    // Falhar a ler a chave conta como DESLIGADO. Um motor que arranca por não conseguir
    // perguntar se pode é a definição de arrancar sem autorização.
    return false
  }
}

async function telegram(metodo: string, corpo: Record<string, unknown>): Promise<void> {
  const token = getMtmcopyBotToken()
  if (!token) return
  try {
    await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    /* uma mensagem que falha não pára o percurso: o passo seguinte pode ser o que interessa */
  }
}

export const bracosReais: Braços = {
  async enviar(pessoa, canal, texto, botoes) {
    const [tipo, ...resto] = pessoa.split(':')
    const id = resto.join(':')

    if (tipo === 'telegram' && canal.startsWith('telegram')) {
      // Botões com link viram botões de URL; os outros viram texto para a pessoa escrever, porque
      // um botão de callback exigia um handler e um handler que não existe é um botão morto.
      const comLink = botoes.filter((b) => b.url)
      const semLink = botoes.filter((b) => !b.url)
      const corpo: Record<string, unknown> = {
        chat_id: id,
        text: semLink.length ? `${texto}\n\n${semLink.map((b) => `• ${b.texto}`).join('\n')}` : texto,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }
      if (comLink.length) {
        corpo.reply_markup = { inline_keyboard: [comLink.map((b) => ({ text: b.texto, url: b.url }))] }
      }
      await telegram('sendMessage', corpo)
      return
    }

    // Os outros canais ainda não têm braço. Registar em vez de fingir que enviou: um passo que
    // se dá por feito sem ter acontecido esconde-se para sempre.
    console.log(`[funis] sem braço para ${canal} (pessoa ${pessoa})`)
  },

  async etiquetar(pessoa, etiquetas) {
    if (!etiquetas.length) return
    const id = pessoa.split(':').slice(1).join(':')
    const db = getSupabaseAdmin()
    const { data } = await db.from('telegram_leads').select('tags').eq('chat_id', id).maybeSingle()
    const atuais = Array.isArray(data?.tags) ? (data.tags as string[]) : []
    // União, não substituição: um funil que apaga as etiquetas dos outros apaga o trabalho deles.
    const juntas = [...new Set([...atuais, ...etiquetas])]
    await db.from('telegram_leads').update({ tags: juntas, updated_at: new Date().toISOString() }).eq('chat_id', id)
  },

  async mudarEtapa(pessoa, etapa) {
    const id = pessoa.split(':').slice(1).join(':')
    await getSupabaseAdmin()
      .from('telegram_leads')
      .update({ stage: etapa, updated_at: new Date().toISOString() })
      .eq('chat_id', id)
  },

  async darCupao(pessoa, codigo) {
    const id = pessoa.split(':').slice(1).join(':')
    // O cupão fica registado no lead; quem o resgata é a pessoa, no site. Criar o acesso aqui
    // seria dar de graça o que o funil ainda não confirmou que foi merecido.
    await getSupabaseAdmin()
      .from('telegram_leads')
      .update({ coupon_code: codigo, updated_at: new Date().toISOString() })
      .eq('chat_id', id)
  },

  async chamar(url, metodo, corpo, cabecalhos) {
    try {
      await fetch(url, {
        method: metodo || 'POST',
        headers: { 'content-type': 'application/json', ...cabecalhos },
        body: metodo === 'GET' ? undefined : corpo || '{}',
        signal: AbortSignal.timeout(20_000),
      })
    } catch {
      /* o funil não pára porque um serviço de fora está em baixo */
    }
  },

  async avisarAdmin(texto) {
    const { data } = await getSupabaseAdmin()
      .from('site_settings')
      .select('value')
      .eq('key', 'telegram_admin_chat_id')
      .maybeSingle()
    const chat = typeof data?.value === 'string' ? data.value : (data?.value as { chat_id?: string } | null)?.chat_id
    if (chat) await telegram('sendMessage', { chat_id: chat, text: texto })
  },

  lerCampo: lerCampoReal,
}
