import { chamarIA, mensagemIndisponivel } from '@/lib/ia/chamar'
import { AVISO, DEMOS_GENERICAS, type EducadorReel } from './config'

/**
 * O ROTEIRO DE UM REEL ANIMADO, escrito pela IA no formato que `tools/reels-educadores/reel2.html`
 * desenha: gancho → demonstração → pontos → CTA.
 *
 * ── porque é que aprende ─────────────────────────────────────────────────────
 * Cada roteiro recebe os reels anteriores com a nota que tiveram no Instagram (comentários,
 * partilhas, guardados, alcance). Pede-se mais do que resultou e menos do que não resultou — é
 * isso que «evolutivo» quer dizer aqui, sem modelo nenhum treinado: a memória é a tabela
 * `reels_auto` e a régua é o próprio Instagram.
 *
 * ── o que nunca muda ─────────────────────────────────────────────────────────
 * Nenhum número de desempenho inventado: só ilustrações, declaradas como tal. Nomes de
 * educadores, produtos e cursos nunca se traduzem. PT-PT, «tu».
 */

export interface Cena {
  tipo: 'gancho' | 'demo' | 'ponto' | 'cta'
  dur: number
  [k: string]: unknown
}

export interface Roteiro {
  id: string
  educador: string
  tema: string
  aviso: string
  cenas: Cena[]
  legenda: string
}

export interface Historico {
  tema: string | null
  gancho: string
  nota: number | null
}

const SISTEMA = `És o realizador de Reels do @morethanmoney.pt. Escreves roteiros de 22 a 30 segundos, em português de Portugal, a tratar por «tu», informais e sem soar a robô.

Formato: devolve SÓ um objecto JSON:
{"tema": "...", "cenas": [...], "legenda": "..."}

Cenas, por esta ordem:
1. {"tipo":"gancho","dur":2.6,"palavras":["2 a 4 blocos curtos","em maiúsculas não é preciso"],"destaque":<índice do bloco a dourado>}
   Cada bloco tem no máximo 14 caracteres. O gancho tem de parar o scroll: tensão, contraste, pergunta, erro comum.
2. Uma {"tipo":"demo",...} de 4.4 a 5.4 segundos. Ou uma demo assinatura do educador ({"tipo":"demo","dur":5,"demo":"<nome>"}), ou uma genérica:
   · {"demo":"versus","titulo":"...","tituloMau":"ERRO","tituloBom":"CERTO","mau":["3 itens curtos"],"bom":["3 itens curtos"],"sub":"frase final"}
   · {"demo":"lista","titulo":"...","itens":["3 ou 4 itens curtos"],"sub":"..."}
   · {"demo":"contador","titulo":"...","de":0,"ate":15,"sufixo":"","rotulo":"minutos","sub":"..."}
   · {"demo":"barras","titulo":"...","a":{"rot":"...","val":30},"b":{"rot":"...","val":80},"sufixo":"%","sub":"..."}
   Itens de versus/lista: no máximo 22 caracteres. Títulos: no máximo 24 caracteres.
3. Duas ou três {"tipo":"ponto","dur":2.3,"n":1,"texto":"frase de 3 a 6 palavras","destaque":<índice da palavra a dourado>,"sub":"opcional, curto"}
4. {"tipo":"cta","dur":3.6,"palavra":"<PALAVRA DADA>","depois":"<frase dada>"}

No "sub" podes usar <span style='color:var(--ouro2)'>…</span> para destacar.

Legenda: 4 a 8 linhas curtas, com 1 ou 2 emojis, termina com «Comenta <PALAVRA> …», depois o aviso legal exacto que te é dado e as hashtags dadas.

Regras que nunca se quebram:
· NUNCA inventes resultados, taxas de acerto, lucros, rendimentos ou testemunhos. Números só como ilustração ou conta simples, e quando houver números a demo ou a legenda dizem «ilustração» ou «exemplo».
· Nunca prometas ganhos. Nunca digas «garantido».
· Nunca traduzas nomes de educadores, produtos, scanners ou cursos.
· Não nomeies a plataforma onde estão os cursos.
· Português de Portugal: «ecrã», «telemóvel», «tu».`

/** Um JSON estrito, com tudo o que o desenhador precisa. Recusa o que não bate certo. */
export function validarRoteiro(bruto: unknown, ed: EducadorReel): Omit<Roteiro, 'id'> {
  const o = bruto as { tema?: unknown; cenas?: unknown; legenda?: unknown }
  if (!o || !Array.isArray(o.cenas)) throw new Error('roteiro sem cenas')
  const cenas = (o.cenas as Cena[]).filter((c) => c && typeof c === 'object')
  const g = cenas[0]
  if (!g || g.tipo !== 'gancho' || !Array.isArray(g.palavras) || !g.palavras.length) throw new Error('falta o gancho')
  g.palavras = (g.palavras as unknown[]).slice(0, 4).map((p) => String(p).slice(0, 18))
  const demosOk = new Set<string>([...DEMOS_GENERICAS, ...ed.demos])
  for (const c of cenas) {
    c.dur = Math.min(6, Math.max(1.8, Number(c.dur) || 2.5))
    if (c.tipo === 'demo' && !demosOk.has(String(c.demo))) throw new Error(`demo desconhecida: ${String(c.demo)}`)
    if (c.tipo === 'ponto' && !String(c.texto ?? '').trim()) throw new Error('ponto sem texto')
  }
  // O CTA é nosso, não da IA: a palavra tem de ser a que o funil atende.
  const semCta = cenas.filter((c) => c.tipo !== 'cta')
  semCta.push({ tipo: 'cta', dur: 3.6, palavra: ed.palavra, depois: ed.depois })
  const total = semCta.reduce((s, c) => s + c.dur, 0)
  if (total < 14 || total > 40) throw new Error(`duração fora do sítio: ${total.toFixed(1)} s`)

  let legenda = String(o.legenda ?? '').trim()
  if (!legenda) throw new Error('sem legenda')
  if (!legenda.includes(ed.palavra)) legenda += `\n\nComenta ${ed.palavra} ${ed.depois}.`
  if (!legenda.includes('não constitui consultoria')) legenda += `\n\n${AVISO}`
  if (!legenda.includes('#morethanmoney')) legenda += `\n\n${ed.hashtags}`

  const proibido = /garantid|taxa de acerto|\d+\s?% de acerto|lucro garantido|win ?rate/i
  if (proibido.test(JSON.stringify(semCta)) || proibido.test(legenda)) throw new Error('promessa ou taxa de acerto no roteiro')

  return { educador: ed.slug, tema: String(o.tema ?? '').slice(0, 120), aviso: AVISO, cenas: semCta, legenda }
}

export async function gerarRoteiro(ed: EducadorReel, historico: Historico[], id: string): Promise<Roteiro> {
  const comNota = historico.filter((h) => h.nota != null).sort((a, b) => (b.nota ?? 0) - (a.nota ?? 0))
  const melhores = comNota.slice(0, 4).map((h) => `· «${h.gancho}» (${h.tema ?? '—'}) nota ${h.nota?.toFixed(1)}`).join('\n')
  const piores = comNota.slice(-3).reverse().map((h) => `· «${h.gancho}» (${h.tema ?? '—'}) nota ${h.nota?.toFixed(1)}`).join('\n')
  const recentes = historico.slice(0, 12).map((h) => h.tema).filter(Boolean).join('; ')

  const pedido =
    `Educador: ${ed.nome} — ${ed.area}${ed.marca ? ` (${ed.marca})` : ''}.\n` +
    `Temas possíveis (escolhe um, ou um ângulo novo da mesma área): ${ed.temas.join('; ')}.\n` +
    `Demos assinatura deste educador: ${ed.demos.length ? ed.demos.join(', ') : 'nenhuma — usa uma genérica'}.\n` +
    `Temas já usados nos últimos dias (não repitas o mesmo ângulo): ${recentes || 'nenhum'}.\n` +
    (melhores ? `\nOs reels que MELHOR resultaram (faz mais disto — o tipo de gancho, não a frase):\n${melhores}\n` : '') +
    (piores && comNota.length > 4 ? `\nOs que PIOR resultaram (evita este estilo):\n${piores}\n` : '') +
    `\nPalavra do CTA: ${ed.palavra}. Frase do CTA: «${ed.depois}».\n` +
    `Aviso legal exacto: ${AVISO}\nHashtags: ${ed.hashtags}`

  let ultimoErro = ''
  // Duas tentativas: um JSON torto ou uma regra partida pede outra versão, não um reel estragado.
  for (let i = 0; i < 2; i++) {
    try {
      const r = await chamarIA({
        tarefa: 'reels-educadores-roteiro',
        sistema: SISTEMA,
        mensagens: [{ role: 'user', content: pedido + (ultimoErro ? `\n\nA versão anterior foi recusada: ${ultimoErro}. Corrige.` : '') }],
        json: true,
        maxTokens: 2500,
        temperatura: 0.9,
        preferencia: 'qualidade',
        timeoutMs: 60_000,
      })
      return { id, ...validarRoteiro(JSON.parse(r.texto), ed) }
    } catch (e) {
      ultimoErro = e instanceof Error ? e.message : String(e)
      if (/indispon|todos os fornecedores/i.test(ultimoErro)) throw new Error(mensagemIndisponivel(e))
    }
  }
  throw new Error(`roteiro recusado duas vezes: ${ultimoErro}`)
}

/** O texto do gancho, para a memória do que resultou. */
export function textoDoGancho(r: Pick<Roteiro, 'cenas'>): string {
  const g = r.cenas.find((c) => c.tipo === 'gancho')
  return Array.isArray(g?.palavras) ? (g!.palavras as string[]).join(' ') : ''
}
