// Núcleo PURO da voz da casa: identidade da voz, limites, chave de cache e erros.
// Não faz rede nem toca em storage — é tudo testável por guarda (voz-da-casa.check.ts).
//
// REGRA MTM: todo o áudio AI da casa fala na voz clonada Fish "ricardogarcia".
// Quebrar isto significa publicar conteúdo com uma voz que não é a do dono da marca —
// por isso a voz alternativa não é um parâmetro qualquer, é uma PORTA EXPLÍCITA
// (ver `resolverVoz`) e está trancada por guarda.

import { createHash } from 'crypto'

/** Voice ID canónico do clone "ricardogarcia" na Fish Audio. Não mudar sem mudar o clone. */
export const VOZ_RICARDO = '1e0fa8b490c744acba94da72710e6db2'

/** Backend de síntese (mesmo default que a dobragem já usava em produção). */
export const MODELO_FISH = process.env.FISH_MODEL || 'speech-1.6'

/** Bucket público já provisionado para áudio TTS (reutilizado; não criamos infra nova). */
export const BUCKET_VOZ = 'lms-tts'

export type FormatoVoz = 'mp3' | 'opus' | 'wav'

// ── Limites ────────────────────────────────────────────────────────────────
// A Fish cobra por caracteres sintetizados. Dois tectos, com propósitos diferentes:
//  · POR PEDIDO: acima disto partimos o texto em frases e juntamos o áudio
//    (mp3/opus são streams de frames — concatenar dá um ficheiro válido).
//  · TOTAL: acima disto RECUSAMOS. Partir um livro em 400 pedidos seria uma
//    fatura silenciosa; é melhor o chamador decidir do que gastar crédito sozinho.
export const MAX_CARACTERES_PEDIDO = 2000
export const MAX_CARACTERES_TOTAL = 10000

/** Motivos de falha. Existem para distinguir CONFIGURAÇÃO de REDE de TEXTO. */
export type MotivoFalhaVoz =
  | 'sem-configuracao' // falta FISH_API_KEY → é bug de deploy, não de rede
  | 'voz-nao-autorizada' // alguém pediu voz genérica sem passar pela porta
  | 'texto-invalido' // vazio / só espaços
  | 'texto-longo' // acima do tecto total
  | 'api-falhou' // a Fish respondeu mal ou não respondeu
  | 'storage-falhou' // a síntese foi feita mas não conseguimos guardar

export type FalhaVoz = {
  ok: false
  motivo: MotivoFalhaVoz
  detalhe: string
  /** Status HTTP da Fish, quando houve resposta. */
  status?: number
}

export function falha(motivo: MotivoFalhaVoz, detalhe: string, status?: number): FalhaVoz {
  return { ok: false, motivo, detalhe, ...(status !== undefined ? { status } : {}) }
}

// ── A porta da voz ─────────────────────────────────────────────────────────

export type PedidoVoz = {
  /** Voz alternativa (ex.: outro educador). Só passa com a porta aberta. */
  voiceId?: string
  /**
   * A PORTA: quem quer uma voz que não é a do Ricardo tem de dizer porquê.
   * String vazia/ausente = porta fechada = pedido recusado.
   */
  motivoVozAlternativa?: string
}

export type VozResolvida = { ok: true; voiceId: string; alternativa: boolean }

/**
 * Decide que voz vai falar. Sem `voiceId` → voz do Ricardo, sempre.
 * Com `voiceId` diferente → só se vier `motivoVozAlternativa` preenchido.
 *
 * Consequência de partir isto: qualquer parte do sistema passava a poder falar
 * com uma voz genérica sem ninguém notar, e a marca perdia a assinatura sonora.
 */
export function resolverVoz(pedido?: PedidoVoz): VozResolvida | FalhaVoz {
  const pedida = (pedido?.voiceId || '').trim()
  if (!pedida || pedida === VOZ_RICARDO) return { ok: true, voiceId: VOZ_RICARDO, alternativa: false }
  const motivo = (pedido?.motivoVozAlternativa || '').trim()
  if (!motivo) {
    return falha(
      'voz-nao-autorizada',
      `voiceId "${pedida}" não é o clone do Ricardo; passa motivoVozAlternativa para o autorizar`,
    )
  }
  return { ok: true, voiceId: pedida, alternativa: true }
}

/**
 * Voz por omissão do ambiente. `FISH_VOICE_ID` continua a poder sobrepor-se,
 * mas apenas com `FISH_VOZ_ALTERNATIVA_OK=1` — senão uma variável mal posta
 * trocava a voz da casa em produção sem um único aviso.
 */
export function vozDoAmbiente(env: Record<string, string | undefined> = process.env): string {
  const env_voz = (env.FISH_VOICE_ID || '').trim()
  if (!env_voz || env_voz === VOZ_RICARDO) return VOZ_RICARDO
  if (env.FISH_VOZ_ALTERNATIVA_OK === '1') return env_voz
  console.error(
    '[voz] FISH_VOICE_ID diferente do clone do Ricardo foi IGNORADO (falta FISH_VOZ_ALTERNATIVA_OK=1)',
  )
  return VOZ_RICARDO
}

// ── Texto: validação e partição ────────────────────────────────────────────

export type TextoPreparado = { ok: true; partes: string[] }

/**
 * Valida e parte o texto. Devolve as partes a sintetizar (1 na maioria dos casos:
 * os cues da dobragem são curtos, por isso o caminho vivo não muda).
 */
export function prepararTexto(texto: string): TextoPreparado | FalhaVoz {
  const limpo = (texto || '').trim()
  if (!limpo) return falha('texto-invalido', 'texto vazio')
  if (limpo.length > MAX_CARACTERES_TOTAL) {
    return falha(
      'texto-longo',
      `${limpo.length} caracteres excede o tecto de ${MAX_CARACTERES_TOTAL}; parte o texto do teu lado`,
    )
  }
  if (limpo.length <= MAX_CARACTERES_PEDIDO) return { ok: true, partes: [limpo] }
  return { ok: true, partes: partirPorFrases(limpo, MAX_CARACTERES_PEDIDO) }
}

/** Parte por fim de frase; se uma frase sozinha for grande demais, corta por palavras. */
export function partirPorFrases(texto: string, tecto: number): string[] {
  const frases = texto.match(/[^.!?…\n]+[.!?…]*\s*|\n+/g) || [texto]
  const partes: string[] = []
  let atual = ''
  const empurrar = () => {
    const t = atual.trim()
    if (t) partes.push(t)
    atual = ''
  }
  for (const frase of frases) {
    if (frase.trim().length > tecto) {
      empurrar()
      for (const pedaco of partirPorPalavras(frase, tecto)) partes.push(pedaco)
      continue
    }
    if ((atual + frase).trim().length > tecto) empurrar()
    atual += frase
  }
  empurrar()
  return partes
}

function partirPorPalavras(texto: string, tecto: number): string[] {
  const partes: string[] = []
  let atual = ''
  for (const palavra of texto.trim().split(/\s+/)) {
    if (palavra.length > tecto) {
      if (atual.trim()) partes.push(atual.trim())
      atual = ''
      for (let i = 0; i < palavra.length; i += tecto) partes.push(palavra.slice(i, i + tecto))
      continue
    }
    if ((atual ? atual.length + 1 : 0) + palavra.length > tecto) {
      partes.push(atual.trim())
      atual = ''
    }
    atual += (atual ? ' ' : '') + palavra
  }
  if (atual.trim()) partes.push(atual.trim())
  return partes
}

// ── Cache ──────────────────────────────────────────────────────────────────

export type ChaveCache = { voiceId: string; modelo: string; formato: FormatoVoz; texto: string }

/**
 * Caminho no storage derivado de texto+voz+modelo+formato. Mesma frase na mesma
 * voz = mesmo caminho = não se paga duas vezes. Mudar esta função invalida a
 * cache toda (não é um erro, é só dinheiro).
 */
export function caminhoDeCache(k: ChaveCache): string {
  const digest = createHash('sha256')
    .update([k.modelo, k.voiceId, k.formato, k.texto.trim()].join('\u0000'))
    .digest('hex')
  // 2 níveis de prefixo para não deixar um único diretório com milhares de ficheiros.
  return `voz-cache/${digest.slice(0, 2)}/${digest.slice(2, 4)}/${digest}.${k.formato}`
}

export function tipoDeConteudo(formato: FormatoVoz): string {
  return formato === 'mp3' ? 'audio/mpeg' : `audio/${formato}`
}
