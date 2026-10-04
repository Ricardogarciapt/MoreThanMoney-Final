import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { chamarIA, mensagemIndisponivel } from '@/lib/ia/chamar'
import { EMOJIS_PERMITIDOS, lerEnfase, type Enfase } from './estilos'

/**
 * ESCOLHER OS DEZ MOMENTOS de uma sessão de duas horas.
 *
 * Uma transmissão ao vivo tem muito pouco que se aproveite em quinze segundos, e o pouco que
 * tem não está onde alguém se lembraria de procurar. É este o trabalho que o videocliper faz:
 * ler a transcrição inteira e apontar os sítios onde alguém pararia de deslizar.
 *
 * ── porque é que o corte tem de sair da TRANSCRIÇÃO e não do vídeo ───────────
 *
 * Um clipe que começa a meio de uma frase perde-se nos dois primeiros segundos, que são os
 * únicos que a pessoa dá. Os tempos por palavra deixam cortar EXACTAMENTE onde a ideia começa e
 * onde ela fecha — e é por isso que a transcrição vem antes da análise, e não ao contrário.
 *
 * ── o CTA não é decoração ────────────────────────────────────────────────────
 *
 * Cada clipe leva uma palavra de comentário que o funil do Instagram já sabe atender. Não se
 * inventa uma palavra nova: se ela não estiver em `lib/instagram/funnel`, quem comentar não
 * recebe nada, e o clipe passa a ser entretenimento — que é exactamente o que não pode ser.
 */

export interface Palavra {
  palavra: string
  inicio: number
  fim: number
}

export interface ClipeProposto {
  ordem: number
  titulo: string
  hook: string
  score: number
  porque: string
  inicioSeg: number
  fimSeg: number
  duracaoSeg: 15 | 30 | 60
  ctaPalavra: string
  caption: string
  /** Cortes para imagem de apoio (B-roll), em segundos RELATIVOS ao início do clipe. */
  broll: BRoll[]
  /** Até 3 palavras-chave ditas no clipe: a legenda mostra-as sozinhas, maiores e na cor de acento. */
  enfase: Enfase[]
}

export interface BRoll {
  inicio: number
  fim: number
  /** Em inglês, para o gerador de imagem. */
  descricao: string
}

/**
 * As palavras que o funil ATENDE hoje.
 *
 * Derivadas do próprio funil e não escritas à mão: uma lista copiada envelhece em silêncio, e o
 * sintoma seria clips a pedir comentários que ninguém responde — o pior modo de falhar, porque
 * parece que está tudo bem.
 */
export const CTAS_VALIDOS = ['SINAIS', 'APP', 'PREMIUM', 'DESAFIO', 'QUERO', 'MUDANCA', 'COPY'] as const

const SISTEMA = `És o director de conteúdo da More Than Money (@morethanmoney.pt), uma escola e
comunidade portuguesa de trading. Recebes a transcrição de uma sessão ao vivo e escolhes os
momentos que funcionam como vídeo curto vertical.

O QUE PROCURAS, por ordem de valor:
1. Uma ideia completa dita em poucos segundos — começo, meio e fim. Um clipe que precisa de
   contexto que não está lá dentro não serve.
2. Quebras de padrão: o contrário do que se espera ouvir, um erro admitido, um número concreto.
3. Momentos de tensão ou energia: uma decisão difícil, uma perda explicada, uma discordância.
4. Ensino accionável: uma regra que se percebe e se aplica sem ver o resto.

O QUE NÃO SERVE, e o primeiro ponto é o mais importante:

1. ⛔ PROJECÇÕES DE LUCRO E VALORES EM DINHEIRO. Rejeita qualquer momento em que se calcule
   quanto se «pode ganhar», se multipliquem cêntimos por moedas, se digam euros ou dólares de
   resultado, ou se projecte o que uma posição «daria». Numa aula, essas contas são um exercício
   com o gráfico à frente e um professor a explicar o raciocínio. Cortadas em quinze segundos e
   postas no Instagram, deixam de ser um exercício e passam a ser uma promessa de retorno — com
   o nome da marca em cima, e sem o contexto que as tornava legítimas.
   É a regra mais dura que a MTM tem, e é também a que mais facilmente se quebra por acidente:
   os momentos com números grandes são precisamente os que parecem mais «virais».
2. Cumprimentos, logística da sessão, responder a uma pergunta que não se ouve.
3. Qualquer coisa que comece a meio de um raciocínio.
4. Menções a preços de entrada concretos de uma posição aberta naquele momento.

REGRAS DURAS:
· A duração é 15, 30 ou 60 segundos. Nada pelo meio.
· O corte começa no início de uma frase e acaba no fim de outra.
· Os primeiros três segundos TÊM de conter o gancho. Se a parte boa está no meio, começa lá.
· Nunca prometas lucro, retorno garantido nem resultado — nem no título, nem no gancho, nem
  na legenda. É proibido pela marca e pela lei.
· Não inventes números. Só os que foram mesmo ditos na transcrição — e ainda assim, um
  número de RESULTADO em dinheiro desqualifica o momento inteiro (ver acima).
· Se depois de aplicar estas regras sobrarem menos de dez momentos bons, devolve MENOS. Um
  clipe mau custa mais do que um clipe a menos: fica publicado, com a marca em cima.
· Português de Portugal. Directo, sem palavreado de guru.

A-ROLL E B-ROLL: o clipe é a pessoa a falar (A-roll) intercalada com imagens de apoio
(B-roll) que ilustram o que está a ser dito. Para cada clipe escolhe 2 a 4 momentos de B-roll
(1 a 2 num clipe de 15s):
· nunca nos primeiros 3 segundos (o gancho é a cara) nem nos últimos 3 (o pedido do comentário);
· cada um dura 2 a 4 segundos, sem se sobreporem, com pelo menos 3 segundos de cara entre eles;
· cai em cima de uma palavra CONCRETA que se está a dizer (um gráfico, um ecrã, uma cidade, uma
  decisão, uma emoção) e descreve uma imagem que a mostre;
· a descrição é em INGLÊS, cinematográfica, vertical, sem texto, sem logótipos, sem notas nem
  moedas, sem gráficos a subir em flecha (nada que sugira lucro fácil).

PALAVRAS-CHAVE (ENFASE): até 3 palavras DITAS dentro do clipe, escritas exactamente como na
transcrição, que carregam a ideia (um conceito, uma emoção, uma decisão — «disciplina», «stop»,
«medo», «plano»). Aparecem sozinhas no ecrã, grandes e na cor da marca, com um zoom na cara.
Nunca palavras de dinheiro nem de resultado («lucro», «ganhar», «euros»). Opcionalmente um
emoji a seguir à palavra, SÓ destes: ${EMOJIS_PERMITIDOS.join(' ')}.

Para cada clipe escreves uma legenda de publicação que acaba a pedir um comentário com UMA das
palavras que te forem dadas — sem inventar outras.

RESPONDE EXACTAMENTE NESTE FORMATO, dez vezes:

===CLIPE===
INICIO: <segundos, número>
FIM: <segundos, número>
DURACAO: <15|30|60>
SCORE: <0-100>
TITULO: <curto, para o painel de admin>
HOOK: <a primeira frase do clipe, literal da transcrição>
PORQUE: <uma linha: porque é que este momento prende>
CTA: <uma das palavras dadas>
ENFASE: <palavra> [emoji]; <palavra>; <palavra>
BROLL: <segundos DENTRO do clipe, a contar de 0>-<fim> | <descrição em inglês>; <inicio>-<fim> | <descrição em inglês>
CAPTION: <a legenda da publicação, em pt-PT, até 5 linhas, a acabar no pedido do comentário>
===FIM===`

/**
 * Junta as palavras em blocos legíveis pelo modelo, com o tempo à cabeça.
 *
 * Mandar a lista de palavras uma a uma gastava o contexto todo em JSON e dava ao modelo uma
 * coisa que ele lê pior do que texto corrido. Cada linha leva o segundo em que começa — é o que
 * ele precisa para devolver tempos e é tudo o que precisa.
 */
export function transcricaoParaTexto(palavras: Palavra[], segundosPorLinha = 12): string {
  if (!palavras.length) return ''
  const linhas: string[] = []
  let bloco: string[] = []
  let inicio = palavras[0].inicio

  for (const p of palavras) {
    if (p.inicio - inicio >= segundosPorLinha && bloco.length) {
      linhas.push(`[${Math.round(inicio)}s] ${bloco.join(' ')}`)
      bloco = []
      inicio = p.inicio
    }
    bloco.push(p.palavra)
  }
  if (bloco.length) linhas.push(`[${Math.round(inicio)}s] ${bloco.join(' ')}`)
  return linhas.join('\n')
}

export async function analisarTranscricao(input: {
  palavras: Palavra[]
  titulo?: string | null
  quantos?: number
}): Promise<ClipeProposto[]> {
  const texto = transcricaoParaTexto(input.palavras)
  if (texto.length < 200) throw new Error('transcrição demasiado curta para analisar')

  const quantos = input.quantos ?? 10
  // Uma sessão de duas horas dá uma transcrição maior do que a janela do modelo compensa. O
  // corte é generoso mas existe: mais do que isto é gastar tokens em logística de sessão.
  const recortado = texto.length > 120_000 ? texto.slice(0, 120_000) : texto

  const pedido =
    `Sessão: ${input.titulo ?? 'sem título'}\n\n` +
    `Escolhe os ${quantos} melhores momentos. Palavras de CTA disponíveis: ${CTAS_VALIDOS.join(', ')}.\n\n` +
    `TRANSCRIÇÃO (o número entre parêntesis é o segundo em que a linha começa):\n\n${recortado}`

  // Porta única da IA (Groq → Gemini → Ollama → OpenAI → Anthropic). O formato é delimitado
  // (===CLIPE===), não JSON — `interpretar` recusa o que não bate certo. Uma sessão de duas
  // horas é um pedido grande: tecto de 2 min por fornecedor, como antes.
  let bruto = ''
  try {
    const r = await chamarIA({
      tarefa: 'videocliper-analise',
      sistema: SISTEMA,
      mensagens: [{ role: 'user', content: pedido }],
      maxTokens: 12000,
      preferencia: 'qualidade',
      timeoutMs: 120_000,
    })
    bruto = r.texto
  } catch (e) {
    throw new Error(mensagemIndisponivel(e))
  }

  return interpretar(bruto, input.palavras)
}

/**
 * Lê o formato delimitado e RECUSA o que não bate certo.
 *
 * O modelo devolve tempos que às vezes não existem no vídeo, durações fora das três
 * permitidas, ou palavras de CTA que inventou. Aceitar qualquer uma dessas coisas dava um clipe
 * que rebenta no ffmpeg ou uma legenda a pedir um comentário que ninguém atende — e as duas
 * falham tarde, já depois de publicadas.
 */
function interpretar(bruto: string, palavras: Palavra[]): ClipeProposto[] {
  const fimDoVideo = palavras.length ? palavras[palavras.length - 1].fim : 0
  const blocos = bruto.split('===CLIPE===').slice(1)
  const saida: ClipeProposto[] = []

  for (const b of blocos) {
    const corpo = b.split('===FIM===')[0] ?? ''
    const campo = (nome: string): string => {
      // SEM a bandeira `m`: com ela o `$` parava no fim da primeira linha, e a legenda — que tem
      // várias — chegava só com a primeira frase.
      const m = corpo.match(new RegExp(`(?:^|\\n)${nome}:[ \\t]*([\\s\\S]*?)(?=\\n[A-Z]+:|$)`))
      return (m?.[1] ?? '').trim()
    }

    const inicio = Number(campo('INICIO'))
    const fim = Number(campo('FIM'))
    const duracao = Number(campo('DURACAO'))
    const cta = campo('CTA').toUpperCase().replace(/[^A-Z]/g, '')
    const caption = campo('CAPTION')
    const titulo = campo('TITULO')

    if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio) continue
    if (![15, 30, 60].includes(duracao)) continue
    // Um tempo para lá do fim do vídeo é o modelo a extrapolar. Cortar aí dava um clipe que
    // acaba em preto — ou um ffmpeg a falhar.
    if (fimDoVideo > 0 && fim > fimDoVideo + 2) continue
    if (!CTAS_VALIDOS.includes(cta as (typeof CTAS_VALIDOS)[number])) continue
    if (!titulo || caption.length < 20) continue

    saida.push({
      ordem: saida.length + 1,
      titulo,
      hook: campo('HOOK'),
      score: Math.min(100, Math.max(0, Number(campo('SCORE')) || 50)),
      porque: campo('PORQUE'),
      inicioSeg: Math.max(0, inicio),
      fimSeg: fim,
      duracaoSeg: duracao as 15 | 30 | 60,
      ctaPalavra: cta,
      caption,
      broll: lerBroll(campo('BROLL'), fim - inicio, inicio),
      enfase: filtrarEnfase(lerEnfase(campo('ENFASE')), palavras, inicio, fim),
    })
  }

  // Os melhores em cima: é por aqui que alguém escolhe o que aprova primeiro.
  saida.sort((a, b) => b.score - a.score)
  return saida.map((c, i) => ({ ...c, ordem: i + 1 }))
}

/**
 * Só ficam palavras-chave que foram mesmo DITAS no excerto — uma inventada nunca acendia, e o
 * zoom caía em lado nenhum — e nenhuma de dinheiro, mesmo que o modelo a proponha.
 */
const PROIBIDAS_ENFASE = /^(lucro|lucros|ganhar|ganhei|ganhos?|euros?|dolares|dólares|dinheiro|rico|riqueza|milion)/i
function filtrarEnfase(lista: Enfase[], palavras: Palavra[], inicioSeg: number, fimSeg: number): Enfase[] {
  const norm = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9%]/g, '')
  const ditas = new Set(palavras.filter((p) => p.fim > inicioSeg && p.inicio < fimSeg).map((p) => norm(p.palavra)))
  return lista.filter((e) => !PROIBIDAS_ENFASE.test(norm(e.palavra)) && ditas.has(norm(e.palavra)))
}

/**
 * As palavras DESTE excerto, com os tempos a começar no zero.
 *
 * A legenda acende palavra a palavra sobre um ficheiro que começa no segundo zero — dar-lhe os
 * tempos do vídeo original punha a primeira palavra a aparecer aos 47 minutos.
 */
export function legendasDoClipe(palavras: Palavra[], inicioSeg: number, fimSeg: number): Palavra[] {
  return palavras
    .filter((p) => p.fim > inicioSeg && p.inicio < fimSeg)
    .map((p) => ({
      palavra: p.palavra,
      inicio: Math.max(0, Math.round((p.inicio - inicioSeg) * 100) / 100),
      fim: Math.round((Math.min(p.fim, fimSeg) - inicioSeg) * 100) / 100,
    }))
}

/**
 * Lê «4-7 | description; 12-15 | description» e recusa o que não cabe: fora do clipe, dentro
 * do gancho ou do fecho, curto ou longo de mais, ou por cima de outro.
 */
export function lerBroll(bruto: string, duracao: number, inicioDoClipe = 0): BRoll[] {
  const saida: BRoll[] = []
  for (const parte of bruto.split(';')) {
    const m = parte.match(/(\d+(?:[.,]\d+)?)\s*s?\s*[-–—]\s*(\d+(?:[.,]\d+)?)\s*s?\s*\|\s*(.+)/)
    if (!m) continue
    let inicio = Number(m[1].replace(',', '.'))
    let fim = Number(m[2].replace(',', '.'))
    // O modelo às vezes dá os tempos do VÍDEO e não do clipe (os mesmos que usa em INICIO/FIM).
    // Se caem dentro do clipe em tempo absoluto, convertem-se em vez de se deitarem fora.
    if (fim > duracao && inicioDoClipe > 0 && inicio >= inicioDoClipe && fim <= inicioDoClipe + duracao) {
      inicio -= inicioDoClipe
      fim -= inicioDoClipe
    }
    const descricao = m[3].trim().slice(0, 300)
    if (!(fim > inicio) || inicio < 3 || fim > duracao - 3) continue
    if (fim - inicio < 1.5 || fim - inicio > 4.5 || !descricao) continue
    if (saida.some((b) => inicio < b.fim + 2 && fim > b.inicio - 2)) continue
    saida.push({ inicio, fim, descricao })
  }
  return saida.slice(0, 4)
}

/** Grava os clips propostos, substituindo uma proposta anterior do mesmo vídeo. */
export async function guardarPropostas(jobId: string, clips: ClipeProposto[], palavras: Palavra[]): Promise<number> {
  const db = getSupabaseAdmin()

  // Só os que ainda ninguém tocou: apagar um clipe já aprovado ou publicado por causa de uma
  // reanálise seria deitar fora trabalho feito.
  await db.from('videocliper_clips').delete().eq('job_id', jobId).eq('estado', 'proposto')

  // As legendas passam pela revisão antes de gravar: o Whisper erra na escrita, e o que se
  // grava aqui é o que fica queimado no vídeo. Em paralelo — são dez pedidos pequenos.
  const { reverPalavras } = await import('./revisao')
  const revistas = await Promise.all(
    clips.map((c) => reverPalavras(legendasDoClipe(palavras, c.inicioSeg, c.fimSeg), `${c.titulo} — ${c.hook ?? ''}`)),
  )

  const linhas = clips.map((c, i) => ({
    job_id: jobId,
    ordem: c.ordem,
    titulo: c.titulo,
    hook: c.hook,
    score: c.score,
    porque: c.porque,
    inicio_seg: c.inicioSeg,
    fim_seg: c.fimSeg,
    duracao_seg: c.duracaoSeg,
    legendas: revistas[i],
    caption: c.caption,
    cta_palavra: c.ctaPalavra,
    broll: c.broll ?? [],
    enfase: c.enfase ?? [],
    estado: 'proposto',
  }))
  if (!linhas.length) return 0

  let { error } = await db.from('videocliper_clips').upsert(linhas, { onConflict: 'job_id,ordem' })
  // Sem a migração 066 a coluna `enfase` não existe: grava-se o resto em vez de perder a análise.
  if (error && /enfase/i.test(error.message)) {
    ;({ error } = await db.from('videocliper_clips').upsert(
      linhas.map(({ enfase: _e, ...resto }) => resto),
      { onConflict: 'job_id,ordem' },
    ))
  }
  if (error) throw new Error(error.message)
  return linhas.length
}
