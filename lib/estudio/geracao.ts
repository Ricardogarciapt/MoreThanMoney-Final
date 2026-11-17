/**
 * MOTOR DE ATIVOS MTM — o nosso substituto do Higgsfield (17/11/2026).
 *
 * Pedidos de geração (imagem, vídeo, voz, clone a falar) entram numa fila (`estudio_geracoes`).
 * Um worker numa máquina com GPU (services/motor-ativos) reclama-os, corre ComfyUI (Qwen-Image-Edit
 * + LTX-2, workflows do open-higgsfield, MIT), Chatterbox (voz) e LatentSync (lábios), e grava a
 * saída como um ativo novo do /estudio. Sem GPU ligada, o pedido fica na fila; `ensaio: true`
 * devolve na hora um clipe de teste, para os clientes (reels diários, /estudio) se ligarem já.
 *
 * Este ficheiro é puro (sem rede): validação e catálogo, partilhados pelas rotas e pelos testes.
 */

export const TIPOS_GERACAO = ['cena', 'angulo', 'mover', 'voz', 'falar'] as const
export type TipoGeracao = (typeof TIPOS_GERACAO)[number]

export const DESCRICAO_TIPOS: Record<TipoGeracao, string> = {
  cena: 'Imagem: a pessoa da foto noutro cenário (ex.: estúdio de podcast), mesma cara.',
  angulo: 'Imagem: a mesma foto vista de outro ângulo/distância (96 câmaras virtuais).',
  mover: 'Vídeo 9:16 de 3 a 6 s a partir de uma imagem, com movimento de câmara.',
  voz: 'Áudio: texto lido com a voz clonada do Ricardo.',
  falar: 'Vídeo do clone a falar: imagem/clipe + texto (ou áudio) com lábios sincronizados.',
}

// Os 15 movimentos do catálogo do open-higgsfield (os 7 primeiros têm LoRA de câmara; os outros vão só por prompt).
export const MOVIMENTOS = [
  'static', 'dolly-in', 'dolly-out', 'dolly-left', 'dolly-right', 'jib-up', 'jib-down',
  'dolly-zoom', 'orbit-left', 'orbit-right', 'pan-left', 'pan-right', 'tilt-up', 'tilt-down', 'handheld',
] as const
export const AZIMUTES = ['front', 'front-right', 'right', 'back-right', 'back', 'back-left', 'left', 'front-left'] as const
export const ELEVACOES = ['low', 'eye', 'elevated', 'high'] as const
export const DISTANCIAS = ['close', 'medium', 'wide'] as const
export const ASPECTOS = ['9:16', '1:1', '4:5', '16:9'] as const

export const ESTADOS_GERACAO = ['fila', 'a_gerar', 'pronto', 'erro', 'cancelado'] as const
export type EstadoGeracao = (typeof ESTADOS_GERACAO)[number]

/** Um motor que não dá sinal há mais do que isto conta como desligado. */
export const MOTOR_ONLINE_MS = 3 * 60_000
/** Um trabalho preso em 'a_gerar' há mais do que isto volta à fila (a máquina caiu). */
export const RECLAMO_EXPIRA_MS = 20 * 60_000
export const MAX_TENTATIVAS = 3
/** Clipe de ensaio (public/), servido pelo próprio site. */
export const CLIPE_ENSAIO = '/estudio/ensaio-9x16.mp4'

export type ParamsGeracao = {
  prompt?: string
  texto?: string
  aspecto: (typeof ASPECTOS)[number]
  duracao_s?: number
  movimento?: (typeof MOVIMENTOS)[number]
  azimute?: (typeof AZIMUTES)[number]
  elevacao?: (typeof ELEVACOES)[number]
  distancia?: (typeof DISTANCIAS)[number]
  seed?: number
  marca?: 'ricardo-garcia' | 'morethanmoney'
  /** Fonte externa da imagem (http/https), quando não vem de um ativo do estúdio. */
  imagem_url?: string
}

export type PedidoGeracao = {
  tipo: TipoGeracao
  ativo_id: string | null
  audio_ativo_id: string | null
  ensaio: boolean
  origem: string
  params: ParamsGeracao
}

const uuid = (v: unknown) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null)
const de = <T extends readonly string[]>(lista: T, v: unknown, omissao?: T[number]): T[number] | undefined =>
  typeof v === 'string' && (lista as readonly string[]).includes(v) ? (v as T[number]) : omissao
const limpo = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** Valida o corpo de um pedido. Devolve o pedido normalizado ou a mensagem de erro (PT-PT). */
export function validarPedido(b: Record<string, unknown>): { pedido: PedidoGeracao } | { erro: string } {
  const tipo = de(TIPOS_GERACAO, b.tipo)
  if (!tipo) return { erro: `tipo inválido (usa: ${TIPOS_GERACAO.join(', ')}).` }

  const ativo_id = uuid(b.ativo_id)
  const audio_ativo_id = uuid(b.audio_ativo_id)
  const imagem_url = typeof b.imagem_url === 'string' && /^https:\/\//.test(b.imagem_url) ? b.imagem_url.slice(0, 2000) : undefined
  const prompt = limpo(b.prompt, 1200)
  const texto = limpo(b.texto, 1500)

  const precisaImagem = tipo !== 'voz'
  if (precisaImagem && !ativo_id && !imagem_url) return { erro: 'Falta a imagem de referência (ativo_id ou imagem_url).' }
  if (tipo === 'cena' && !prompt) return { erro: 'Descreve o cenário em prompt.' }
  if (tipo === 'voz' && !texto) return { erro: 'Falta o texto a ler.' }
  if (tipo === 'falar' && !texto && !audio_ativo_id) return { erro: 'Falta o texto (ou um áudio) para o clone dizer.' }

  const dur = Number(b.duracao_s)
  const duracao_s = tipo === 'mover' || tipo === 'falar' ? (Number.isFinite(dur) ? Math.min(Math.max(dur, 2), tipo === 'falar' ? 15 : 8) : 5) : undefined
  const seed = Number.isInteger(b.seed) && (b.seed as number) >= 0 ? (b.seed as number) : Math.floor(Math.random() * 2 ** 31)

  const params: ParamsGeracao = {
    aspecto: de(ASPECTOS, b.aspecto, '9:16')!,
    seed,
    ...(prompt ? { prompt } : {}),
    ...(texto ? { texto } : {}),
    ...(duracao_s ? { duracao_s } : {}),
    ...(imagem_url ? { imagem_url } : {}),
    marca: de(['ricardo-garcia', 'morethanmoney'] as const, b.marca, 'ricardo-garcia'),
  }
  if (tipo === 'mover' || tipo === 'falar') params.movimento = de(MOVIMENTOS, b.movimento, tipo === 'falar' ? 'static' : 'dolly-in')
  if (tipo === 'angulo') {
    params.azimute = de(AZIMUTES, b.azimute, 'front-right')
    params.elevacao = de(ELEVACOES, b.elevacao, 'eye')
    params.distancia = de(DISTANCIAS, b.distancia, 'medium')
  }

  const origem = limpo(b.origem, 60) || 'estudio'
  return { pedido: { tipo, ativo_id, audio_ativo_id, ensaio: b.ensaio === true, origem, params } }
}

/** Extensão e mime da saída de cada tipo. */
export function saidaDe(tipo: TipoGeracao): { ext: string; mime: string; tipoAtivo: 'imagem' | 'video' | 'audio' } {
  if (tipo === 'cena' || tipo === 'angulo') return { ext: 'png', mime: 'image/png', tipoAtivo: 'imagem' }
  if (tipo === 'voz') return { ext: 'wav', mime: 'audio/wav', tipoAtivo: 'audio' }
  return { ext: 'mp4', mime: 'video/mp4', tipoAtivo: 'video' }
}

/** Nome legível do ativo gerado, para a biblioteca do /estudio. */
export function nomeDoAtivo(tipo: TipoGeracao, p: ParamsGeracao): string {
  const resumo = (p.prompt || p.texto || [p.azimute, p.elevacao, p.distancia].filter(Boolean).join(' ') || p.movimento || '').slice(0, 70)
  return `IA · ${tipo}${resumo ? ` · ${resumo}` : ''}`
}

export function motorOnline(vistoEm: string | null | undefined, agora = Date.now()): boolean {
  return !!vistoEm && agora - new Date(vistoEm).getTime() < MOTOR_ONLINE_MS
}
