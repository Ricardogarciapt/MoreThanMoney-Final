/**
 * ÁUDIOS NA VOZ DO RICARDO NAS DMs (pedido do dono, 16/11/2026).
 *
 * «Podes mesmo nesses agentes fazer criação de áudios com a minha voz e responder às mensagens.»
 * A voz é o clone da casa (`lib/voz`, Fish). O áudio vai a seguir ao texto, nunca em vez dele: quem
 * não pode ouvir lê, e o link de fecho continua clicável.
 *
 * ═══ AS TRÊS TRAVAS ════════════════════════════════════════════════════════════════════════
 *
 *  1. Interruptor `site_settings.vendas_audio_dm` ({ ligado, tecto_dia }) — nasce DESLIGADO. Liga-o
 *     o Ricardo; sem isso nada sai.
 *  2. Só em dois momentos da conversa (o Ricardo, 16/11: «algumas mensagens de texto, depois
 *     quebrar o gelo ali com áudio [...] e no fecho»):
 *       · quebra-gelo — depois de pelo menos 2 mensagens da pessoa, se ainda não houve áudio e a
 *         resposta não é já o fecho. Nunca a abrir conversa fria (o que se faz lá fora: 2 a 3
 *         trocas de texto primeiro, voz de 20 a 45 s, com o nome e o que a pessoa disse);
 *       · fecho — a resposta leva um link de fecho (registo, abrir conta, upgrade ou agenda).
 *     No máximo 2 áudios por conversa (`ig_dm_log.audio_motivo`).
 *  3. Tecto diário (por omissão 30 áudios), contado pelos ficheiros do dia no storage.
 *
 * ═══ TRANSPARÊNCIA ═════════════════════════════════════════════════════════════════════════
 *
 * Cada áudio sai com uma linha a dizer que a voz é gerada por IA. O AI Act (art. 50.º, em vigor
 * desde Agosto de 2026) obriga a assinalar áudio sintético que imita uma pessoa real, e um lead que
 * descobre depois que «o Ricardo» era uma máquina é uma venda perdida e uma queixa ganha.
 */
import { falarParaStorage, type StorageVoz } from '@/lib/voz'
import { candidateTokensForIgAccount, carregarTokensIG } from '@/lib/instagram/dm-closer'

export const CHAVE_AUDIO_DM = 'vendas_audio_dm'
export const TECTO_DIA_OMISSAO = 30
export const MAX_CARACTERES_AUDIO = 450 // ~30–35 s de voz
export const MAX_AUDIOS_CONVERSA = 2
export const MIN_MENSAGENS_QUEBRA_GELO = 2
/** 23/11: decisão do Ricardo — sem etiquetas de IA nas mensagens. Vazio = não sai nada. */
export const AVISO_AUDIO_IA = ''

const LINKS_DE_FECHO = /\/(register|abrir-conta|upgrade|agendar|ativar-premium)\b/i

export interface ConfigAudio { ligado: boolean; tectoDia: number }

export type MomentoAudio = 'quebra_gelo' | 'fecho'

export interface ConversaAudio {
  /** Mensagens que a pessoa já tinha mandado antes desta. */
  mensagensAntes: number
  /** Áudios que já lhe mandámos nesta conversa. */
  audiosAntes: number
}

/** Que áudio sai com esta resposta, se algum. Puro. */
export function momentoDoAudio(p: {
  config: ConfigAudio
  resposta: string
  audiosHoje: number
  conversa?: ConversaAudio
}): MomentoAudio | null {
  if (!p.config.ligado) return null
  if (p.audiosHoje >= p.config.tectoDia) return null
  const c = p.conversa ?? { mensagensAntes: 0, audiosAntes: 0 }
  if (c.audiosAntes >= MAX_AUDIOS_CONVERSA) return null
  if (LINKS_DE_FECHO.test(p.resposta)) return 'fecho'
  if (c.audiosAntes === 0 && c.mensagensAntes >= MIN_MENSAGENS_QUEBRA_GELO) return 'quebra_gelo'
  return null
}

/** Compatível com a versão anterior: só diz se sai algum áudio. */
export function deveMandarAudio(p: { config: ConfigAudio; resposta: string; audiosHoje: number; conversa?: ConversaAudio }): boolean {
  return momentoDoAudio(p) !== null
}

/** O texto que se lê em voz alta: sem links, sem emojis, sem marcação, com tecto. Puro. */
export function textoParaAudio(resposta: string): string {
  const limpo = resposta
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\b[\w.-]+\.(pt|com)\/\S*/gi, '')
    .replace(/@\w+/g, '')
    .replace(/[*_`#>]/g, '')
    .replace(/\p{Extended_Pictographic}|️/gu, '')
    .replace(/\s*👉\s*/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim()
  if (limpo.length <= MAX_CARACTERES_AUDIO) return limpo
  const corte = limpo.slice(0, MAX_CARACTERES_AUDIO)
  const fim = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('! '), corte.lastIndexOf('? '))
  return (fim > 120 ? corte.slice(0, fim + 1) : corte).trim()
}

type Db = StorageVoz & { from: (t: string) => any }

export async function lerConfigAudio(db: Db, chave: string = CHAVE_AUDIO_DM): Promise<ConfigAudio> {
  try {
    const { data } = await db.from('site_settings').select('value').eq('key', chave).maybeSingle()
    const v = (typeof data?.value === 'string' ? JSON.parse(data.value) : data?.value) ?? {}
    const t = Number(v.tecto_dia)
    return { ligado: v.ligado === true, tectoDia: Number.isFinite(t) && t >= 0 ? Math.min(t, 200) : TECTO_DIA_OMISSAO }
  } catch {
    return { ligado: false, tectoDia: 0 }
  }
}

export function pastaDoDia(agora = new Date(), prefixo = 'dm-audio'): string {
  return `${prefixo}/${agora.toISOString().slice(0, 10)}`
}

export async function audiosHoje(db: Db, prefixo = 'dm-audio'): Promise<number> {
  try {
    const { data } = await db.storage.from('lms-tts').list(pastaDoDia(new Date(), prefixo), { limit: 1000 })
    return Array.isArray(data) ? data.length : 0
  } catch {
    return Number.POSITIVE_INFINITY // sem contagem, não se arrisca a fatura
  }
}

async function enviarAudioInstagram(accountId: string, destino: string, url: string): Promise<{ ok: boolean; error?: string }> {
  let ultimo: string | undefined
  await carregarTokensIG()
  for (const token of candidateTokensForIgAccount(accountId)) {
    try {
      const res = await fetch('https://graph.facebook.com/v21.0/me/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: destino },
          message: { attachment: { type: 'audio', payload: { url } } },
          access_token: token,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && !data?.error) return { ok: true }
      ultimo = data?.error?.message || `HTTP ${res.status}`
    } catch (e) {
      ultimo = e instanceof Error ? e.message : 'erro'
    }
  }
  return { ok: false, error: ultimo ?? 'sem token IG' }
}

/**
 * Depois de a resposta de texto sair, manda (se as travas deixarem) o áudio e o aviso de IA.
 * Nunca lança: um áudio que falha não pode estragar a conversa que já correu bem.
 */
export async function talvezAudioInstagram(
  db: Db,
  p: { accountId: string; destino: string; resposta: string; referencia: string; conversa?: ConversaAudio },
): Promise<{ enviado: boolean; momento?: MomentoAudio; motivo?: string }> {
  try {
    const config = await lerConfigAudio(db)
    if (!config.ligado) return { enviado: false, motivo: 'desligado' }
    const hoje = await audiosHoje(db)
    const momento = momentoDoAudio({ config, resposta: p.resposta, audiosHoje: hoje, conversa: p.conversa })
    if (!momento) return { enviado: false, motivo: 'travas' }
    const texto = textoParaAudio(p.resposta)
    if (texto.length < 20) return { enviado: false, motivo: 'texto-curto' }
    const ref = p.referencia.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) || String(Date.now())
    const pub = await falarParaStorage(db, texto, `${pastaDoDia()}/${ref}.mp3`)
    if (!pub.ok) return { enviado: false, motivo: `voz: ${pub.motivo}` }
    const r = await enviarAudioInstagram(p.accountId, p.destino, pub.url)
    if (!r.ok) return { enviado: false, motivo: r.error }
    const { sendInstagramDmResilient } = await import('@/lib/instagram/dm-closer')
    if (AVISO_AUDIO_IA) await sendInstagramDmResilient(p.accountId, p.destino, AVISO_AUDIO_IA)
    return { enviado: true, momento }
  } catch (e) {
    return { enviado: false, motivo: e instanceof Error ? e.message : 'erro' }
  }
}
