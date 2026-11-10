/**
 * Escrever o guião — a «Fase 1» da especificação, pela porta única da IA e só pelos grátis.
 *
 * `chamarIAGratis` (Groq → Gemini → Ollama): ninguém a carregar em «gerar» gasta dinheiro da casa.
 * O texto que volta passa por `verificarObjecto`; se falhar as regras, a IA tem UMA segunda
 * oportunidade com a lista do que falhou. Se ainda assim falhar, o guião chega com `avisos` —
 * nunca se esconde o problema, e o ecrã não deixa publicar sem o ver.
 */
import { chamarIAGratis } from '@/lib/ia/chamar'
import { corrigirObjectoPtPt } from '@/lib/pt-pt'
import { blocoFramework } from '@/lib/framework-mtm'
import { blocoGanchos, blocoLegendaReel } from '@/lib/conteudo/ganchos'
import { MARCAS, type Formato, type Marca } from './marcas'
import { LIMITES, OBJECTIVOS, TONS, normalizarGuiao, type Guiao, type Objectivo, type Tom } from './guiao'
import { DISCLAIMER_PT, regrasParaPrompt, verificarObjecto, type Problema } from './regras'

export type PedidoGuiao = {
  formato: Formato
  marca: Marca
  nicho: string
  objectivo: Objectivo
  tom: Tom
  /** Ideia, história ou dados que o autor quer usar (os únicos números permitidos). */
  notas?: string
  /** Quantas lâminas (carrossel). */
  quantas?: number
}

const ESQUEMA_LAMINA = '{"papel":"capa|meio|fim","antetitulo":"curto","titulo":"CAIXA ALTA, máx 6 palavras","destaque":"palavra(s) do título a pintar na cor","corpo":"1-2 frases","prompt_visual":"prompt em inglês para gerar a imagem de fundo (cena, luz, enquadramento vertical), sem texto na imagem"}'

function instrucoesFormato(f: Formato, quantas: number): string {
  if (f === 'carrossel')
    return `CARROSSEL de ${quantas} lâminas 4:5. Lâmina 1 = capa que pára o dedo (gancho). As do meio entregam valor, uma ideia por lâmina. A última = CTA a comentar a palavra-chave.`
  if (f === 'post') return 'PUBLICAÇÃO única 4:5: 1 lâmina (capa forte) + legenda que desenvolve.'
  if (f === 'story') return `STORIES 9:16: ${quantas} lâmina(s), texto curto, a última com CTA (responder/comentar a palavra-chave).`
  return [
    'REEL 9:16 de 20 a 45 segundos, ritmo alto (muda de plano a cada 3-5 s).',
    'Devolve também "reel": {"duracao_estimada_segundos":N,"musica_termo":"termo em inglês","segmentos":[...]}',
    'Cada segmento: {"fala":"o que se diz, máx 2 frases curtas","texto_ecra":"3-6 palavras em CAIXA ALTA","visual":"apresentador|b_roll|cartao","zoom":"normal|zoom_in|close_up","b_roll_busca":"termo em inglês para Pexels ou null","sfx":"boom|whoosh|click|nenhum","legenda_estilo":"impacto|palavra_a_palavra|simples","prompt_visual":"prompt em inglês para gerar este plano em vídeo vertical 9:16 (cena, movimento de câmara, luz), sem texto"}',
    'Segmento 1 = gancho (sfx boom, legenda impacto). Último = CTA (sfx click). 5 a 9 segmentos.',
    'Em "laminas" devolve 1 lâmina: a CAPA do reel.',
  ].join('\n')
}

export function montarPrompt(p: PedidoGuiao): { sistema: string; utilizador: string } {
  const lim = LIMITES[p.formato]
  const quantas = Math.min(Math.max(p.quantas ?? (p.formato === 'carrossel' ? 6 : 1), lim.min), lim.max)
  const sistema = [
    'És o director criativo e copywriter do MTM Conteúdo Magnético: conteúdo de alta retenção para Instagram/TikTok/YouTube Shorts.',
    blocoFramework('conteudo'),
    `MARCA: ${p.marca.nome} (${p.marca.arroba}). ${p.marca.voz}`,
    regrasParaPrompt(),
    'Escreve em português de Portugal («tu», «ecrã», «telemóvel»), nunca português do Brasil.',
    'Ganchos com tensão e curiosidade, linguagem pouco técnica, emoção; CTA disruptivo mas humano, nunca a soar a robô.',
    blocoGanchos(),
    blocoLegendaReel(),
    `Se falares de trading/investimento, a legenda termina com: «${DISCLAIMER_PT}»`,
    'Responde APENAS com JSON válido, sem comentários.',
  ].join('\n\n')
  const utilizador = [
    `Nicho / produto: ${p.nicho}`,
    `Objectivo: ${OBJECTIVOS[p.objectivo]}`,
    `Tom: ${TONS[p.tom]}`,
    p.notas ? `Notas do autor (história, dados reais — os ÚNICOS números que podes usar):\n${p.notas.slice(0, 1500)}` : 'Sem dados fornecidos: não uses números de resultados.',
    instrucoesFormato(p.formato, quantas),
    `JSON: {"palavra_chave":"UMA PALAVRA","legenda":"legenda completa com quebras de linha","hashtags":["#..."],"laminas":[${ESQUEMA_LAMINA}]${p.formato === 'reel' ? ',"reel":{...}' : ''}}`,
  ].join('\n\n')
  return { sistema, utilizador }
}

export type ResultadoGuiao = {
  guiao: Guiao
  avisos: Problema[]
  fornecedor: string
  modelo: string
}

function parse(texto: string): unknown {
  try {
    return JSON.parse(texto)
  } catch {
    const i = texto.indexOf('{')
    const j = texto.lastIndexOf('}')
    if (i >= 0 && j > i) return JSON.parse(texto.slice(i, j + 1))
    throw new Error('A IA não devolveu JSON.')
  }
}

export async function gerarGuiao(p: PedidoGuiao): Promise<ResultadoGuiao> {
  const { sistema, utilizador } = montarPrompt(p)
  const base = { formato: p.formato, marca: p.marca.id, nicho: p.nicho, objectivo: p.objectivo, tom: p.tom }
  const mensagens: { role: 'user' | 'assistant'; content: string }[] = [{ role: 'user', content: utilizador }]

  let ultimo: ResultadoGuiao | null = null
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const r = await chamarIAGratis({
      sistema,
      mensagens,
      json: true,
      maxTokens: p.formato === 'reel' ? 2600 : 2000,
      temperatura: 0.85,
      tarefa: 'conteudo-magnetico',
      preferencia: 'qualidade',
      timeoutMs: 45_000,
    })
    // Trocas seguras de PT-BR para PT-PT antes da verificação (celular → telemóvel, Comente → Comenta…).
    const guiao = corrigirObjectoPtPt(normalizarGuiao(parse(r.texto), base)).valor
    const avisos = verificarObjecto(guiao)
    ultimo = { guiao, avisos, fornecedor: r.fornecedor, modelo: r.modelo }
    if (avisos.length === 0) return ultimo
    mensagens.push(
      { role: 'assistant', content: r.texto },
      {
        role: 'user',
        content: `O texto falhou as regras: ${avisos.map((a) => `«${a.trecho}» (${a.tipo})`).join('; ')}. Reescreve o JSON inteiro sem isso.`,
      },
    )
  }
  return ultimo as ResultadoGuiao
}

export { MARCAS }
