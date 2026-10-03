// A VOZ DA CASA — peça partilhada para qualquer parte do sistema falar na voz do Ricardo.
// Documentação e exemplo: docs/voz-da-casa.md
//
// Isto era código preso dentro de lib/lms-captions/tts.ts (dobragem das sessões).
// Foi promovido aqui para que o bot, os emails, os vídeos e o que vier a seguir usem
// a MESMA voz, a mesma cache e os mesmos limites, sem arrastar o LMS atrás.
//
// Diferenças em relação ao que existia, e porquê:
//  · devolve um resultado etiquetado em vez de `null` — um deploy sem FISH_API_KEY
//    deixou de se parecer com uma falha de rede;
//  · cache no storage por conteúdo — a mesma frase não se paga duas vezes;
//  · tecto de caracteres com partição/recusa definida (ver nucleo.ts);
//  · a voz alternativa passa por uma porta explícita, trancada por guarda.

import {
  BUCKET_VOZ,
  MODELO_FISH,
  VOZ_RICARDO,
  caminhoDeCache,
  falha,
  prepararTexto,
  resolverVoz,
  tipoDeConteudo,
  vozDoAmbiente,
  type FalhaVoz,
  type FormatoVoz,
  type PedidoVoz,
} from './nucleo'

export * from './nucleo'

const FISH_TTS_URL = 'https://api.fish.audio/v1/tts'

/** Cliente de síntese. Injectável para se poder testar sem gastar créditos Fish. */
export type ClienteVoz = (pedido: {
  texto: string
  voiceId: string
  modelo: string
  formato: FormatoVoz
  latencia: 'normal' | 'balanced'
}) => Promise<{ ok: true; buffer: Buffer } | FalhaVoz>

/** Só a parte do Supabase de que precisamos — evita arrastar o tipo inteiro. */
export type StorageVoz = { storage: any }

export type OpcoesVoz = PedidoVoz & {
  formato?: FormatoVoz
  latencia?: 'normal' | 'balanced'
  modelo?: string
  /** Passa o cliente Supabase para ligar a cache por conteúdo (recomendado). */
  cache?: StorageVoz | null
  /** Cliente alternativo (testes). Por omissão, a Fish real. */
  cliente?: ClienteVoz
}

export type VozOk = {
  ok: true
  buffer: Buffer
  contentType: string
  voiceId: string
  /** Quantos pedidos à Fish foram feitos (0 quando veio da cache). */
  pedidos: number
  cache: 'hit' | 'miss' | 'off'
}

export type ResultadoVoz = VozOk | FalhaVoz

/** Cliente real da Fish Audio. Não é chamado nos testes. */
export const clienteFish: ClienteVoz = async ({ texto, voiceId, modelo, formato, latencia }) => {
  const key = process.env.FISH_API_KEY
  // Configuração em falta ≠ API em baixo. Quem chama tem de poder distinguir.
  if (!key) return falha('sem-configuracao', 'FISH_API_KEY não está definida')
  try {
    const res = await fetch(FISH_TTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        model: modelo,
      },
      body: JSON.stringify({
        text: texto,
        reference_id: voiceId,
        format: formato,
        mp3_bitrate: 128,
        normalize: true,
        latency: latencia,
      }),
    })
    if (!res.ok) {
      const corpo = (await res.text().catch(() => '')).slice(0, 200)
      return falha('api-falhou', `Fish ${res.status}: ${corpo}`, res.status)
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length < 200) return falha('api-falhou', 'resposta vazia da Fish', res.status)
    return { ok: true, buffer }
  } catch (err) {
    return falha('api-falhou', `exceção: ${(err as Error).message}`)
  }
}

/**
 * Gera fala na voz da casa. Usa cache no storage quando lhe dás o cliente Supabase.
 *
 * Exemplo:
 *   const r = await falar('Bom dia, sou o Ricardo.', { cache: supabase })
 *   if (!r.ok) console.error(r.motivo, r.detalhe)
 */
export async function falar(texto: string, opcoes: OpcoesVoz = {}): Promise<ResultadoVoz> {
  const voz = resolverVoz(opcoes)
  if (!voz.ok) return voz
  // Sem voz pedida, a voz é a do ambiente (que já só aceita o clone sem porta aberta).
  const voiceId = voz.alternativa ? voz.voiceId : vozDoAmbiente()

  const preparado = prepararTexto(texto)
  if (!preparado.ok) return preparado

  const formato: FormatoVoz = opcoes.formato || 'mp3'
  const modelo = opcoes.modelo || MODELO_FISH
  const contentType = tipoDeConteudo(formato)
  const cliente = opcoes.cliente || clienteFish
  const supabase = opcoes.cache || null
  const caminho = caminhoDeCache({ voiceId, modelo, formato, texto })

  if (supabase) {
    const guardado = await lerCache(supabase, caminho)
    if (guardado) {
      return { ok: true, buffer: guardado, contentType, voiceId, pedidos: 0, cache: 'hit' }
    }
  }

  const pedacos: Buffer[] = []
  for (const parte of preparado.partes) {
    const r = await cliente({
      texto: parte,
      voiceId,
      modelo,
      formato,
      latencia: opcoes.latencia || 'balanced',
    })
    if (!r.ok) return r // falhar à primeira: metade de uma frase é pior que nada
    pedacos.push(r.buffer)
  }
  // mp3/opus/wav-stream: os frames concatenam-se; para 1 parte (caso normal) é um no-op.
  const buffer = pedacos.length === 1 ? pedacos[0] : Buffer.concat(pedacos)

  if (supabase) await escreverCache(supabase, caminho, buffer, contentType)

  return {
    ok: true,
    buffer,
    contentType,
    voiceId,
    pedidos: preparado.partes.length,
    cache: supabase ? 'miss' : 'off',
  }
}

/**
 * Gera fala e publica-a num caminho concreto do bucket `lms-tts`; devolve o URL público.
 * A cache por conteúdo continua a valer, por isso republicar a mesma frase noutro
 * caminho não volta a pagar a síntese.
 */
export async function falarParaStorage(
  supabase: StorageVoz,
  texto: string,
  caminhoPublico: string,
  opcoes: OpcoesVoz = {},
): Promise<{ ok: true; url: string; voz: VozOk } | FalhaVoz> {
  const r = await falar(texto, { ...opcoes, cache: opcoes.cache ?? supabase })
  if (!r.ok) return r
  const { error } = await supabase.storage
    .from(BUCKET_VOZ)
    .upload(caminhoPublico, r.buffer, { contentType: r.contentType, upsert: true })
  if (error) return falha('storage-falhou', `upload falhou: ${error.message}`)
  const { data } = supabase.storage.from(BUCKET_VOZ).getPublicUrl(caminhoPublico)
  const url = (data?.publicUrl as string) || ''
  if (!url) return falha('storage-falhou', 'sem publicUrl para ' + caminhoPublico)
  return { ok: true, url, voz: r }
}

async function lerCache(supabase: StorageVoz, caminho: string): Promise<Buffer | null> {
  try {
    const { data, error } = await supabase.storage.from(BUCKET_VOZ).download(caminho)
    if (error || !data) return null
    const arr = await data.arrayBuffer()
    const buf = Buffer.from(arr)
    return buf.length > 200 ? buf : null
  } catch {
    return null // cache indisponível nunca pode impedir a fala
  }
}

async function escreverCache(
  supabase: StorageVoz,
  caminho: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  try {
    const { error } = await supabase.storage
      .from(BUCKET_VOZ)
      .upload(caminho, buffer, { contentType, upsert: true })
    if (error) console.error('[voz] cache não gravou:', error.message)
  } catch (err) {
    console.error('[voz] cache não gravou:', (err as Error).message)
  }
}

/** Atalho legível quando não há Supabase à mão (sem cache). */
export const VOZ_DA_CASA = VOZ_RICARDO
