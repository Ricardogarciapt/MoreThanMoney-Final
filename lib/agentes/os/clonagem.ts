/**
 * AGENT CLONING ENGINE (OS v2, decisão do dono 07/10/2026) — puro. Substitui a reprodução de 06/10
 * (15 vivos, 1 filho a cada 7 dias, 250 de orçamento total).
 *
 * QUEM CLONA
 *   · Proof ≥ clonar (85) COM amostra → clona sozinho (N = clones.clonar, por omissão 3);
 *   · Proof ≥ escalar (95) COM amostra → N = clones.escalar (5) + mais recursos;
 *   · Proof ≥ candidato (70) COM amostra → só se o agente pediu (REQUEST_CLONING) e o CEO validou
 *     (acção «escalar», modo clonar);
 *   · uma venda isolada NUNCA: sem amostra o proof fica em 69 (proof-score.ts).
 *
 * COMO
 *   · uma NINHADA: 1 clone IGUAL ao pai + (N−1) com UMA variação controlada (hook, CTA, público,
 *     oferta, canal) — a do pai primeiro (mutação proposta), depois o catálogo, sem repetir irmãos;
 *   · cada clone regista a genealogia: pai, geração (= pai + 1), variação, ninhada, proof do pai;
 *   · os clones COMPETEM: enquanto a ninhada está em prova (janela do proof), o pai não abre outra;
 *     no fim, a melhor variante passa a DNA DOMINANTE e é dela que nasce a geração seguinte.
 *
 * QUANTOS (sem tecto fixo de vivos)
 *   A população é limitada pela QUOTA do claude -p: cada agente que trabalha pede ciclos/dia
 *   (ciclo-vida.ts `ciclosDiaPedidos`). Nascem clones enquanto a procura total couber em
 *   capacidade × 1,25 (os 25 % a mais esperam a vez na fila do motor, por Proof Score). E nunca
 *   mais de TECTOS_DUROS.clonesPorNinhada numa ninhada.
 */
import { TECTOS_DUROS } from './objectivos'
import type { Banda, ConfigProof } from './proof-score'
import { CICLOS_QUE_TRABALHAM, ciclosDiaPedidos, type Ciclo } from './ciclo-vida'

export type TipoVariacao = 'igual' | 'hook' | 'cta' | 'publico' | 'oferta' | 'canal'

export const VARIACOES_CATALOGO: ReadonlyArray<{ tipo: Exclude<TipoVariacao, 'igual'>; texto: string }> = [
  { tipo: 'hook', texto: 'Abre cada mensagem/post com uma pergunta concreta sobre o problema da pessoa, antes de qualquer oferta.' },
  { tipo: 'hook', texto: 'Abre com a prova medida (pips e %, com «Fonte:»), nunca com promessas.' },
  { tipo: 'cta', texto: 'O CTA é marcar uma conversa curta (/agendar), não comprar já.' },
  { tipo: 'cta', texto: 'O CTA é responder com uma palavra (ex.: «QUERO»), para abrir conversa no canal certo.' },
  { tipo: 'publico', texto: 'Foca-te em quem já é membro grátis e ainda não pagou.' },
  { tipo: 'publico', texto: 'Foca-te em traders que já operam e procuram sinais ou cópia.' },
  { tipo: 'oferta', texto: 'Lidera com a formação (percurso organizado) e só depois os sinais.' },
  { tipo: 'oferta', texto: 'Lidera com as ferramentas (scanners, MTM Auto) para quem quer automatizar.' },
  { tipo: 'canal', texto: 'Trabalha sobretudo o Telegram (quem escreveu ao bot e os grupos), com o teu código em cada link.' },
  { tipo: 'canal', texto: 'Trabalha sobretudo o email com base legal (soft opt-in e B2B), com o teu código em cada link.' },
]

export interface AgenteClonavel {
  id: string
  nome: string
  codigo: string
  ciclo: Ciclo
  ceo: boolean
  geracao: number
  familia: string
  especializacao: string | null
  instrucoes: string
  proof: number
  banda: Banda
  amostraOk: boolean
  recursosMult: number
  /** O agente pediu clonagem (REQUEST_CLONING) e o CEO validou. */
  clonagemValidada: boolean
  /** Mutação proposta pelo próprio (agentes_instrucoes_versoes estado mutacao_proposta). */
  mutacaoProposta: { tipo: Exclude<TipoVariacao, 'igual'>; texto: string; id: string } | null
  /** Clones vivos ainda em prova (da última ninhada). */
  ninhadaEmProva: boolean
  /** Textos de variação já usados pelos filhos (para não repetir). */
  variacoesUsadas: string[]
  /** Nº de filhos já nascidos (para o número do código). */
  filhos: number
  codigosUsados: string[]
}

export interface CloneAPlanear {
  paiId: string
  paiNome: string
  codigo: string
  nome: string
  geracao: number
  variacao: TipoVariacao
  variacaoTexto: string | null
  origemVariacao: 'pai' | 'catalogo' | 'nenhuma'
  propostaId: string | null
  instrucoes: string
  familia: string
  especializacao: string | null
}

export interface PlanoClonagem {
  ninhadas: Array<{ paiId: string; paiNome: string; proof: number; banda: Banda; clones: CloneAPlanear[] }>
  esperam: Array<{ nome: string; porque: string }>
  capacidade: { ciclosDia: number; procuraAntes: number; procuraDepois: number; limite: number }
}

/** Formato do código de um clone: `AG-<pai sem AG->-<n>`; tem de passar `pareceCodigoDeAgente`. */
export function codigoDoClone(codigoPai: string, n: number): string {
  const base = String(codigoPai ?? '').trim().toUpperCase().replace(/^AG-/, '')
  return `AG-${base}-${Math.max(1, Math.floor(n))}`
}

export function nClones(a: Pick<AgenteClonavel, 'banda' | 'amostraOk' | 'clonagemValidada'>, c: ConfigProof): number {
  if (!a.amostraOk) return 0
  if (a.banda === 'escalar') return c.clones.escalar
  if (a.banda === 'clonar') return c.clones.clonar
  if (a.banda === 'candidato' && a.clonagemValidada) return 2
  return 0
}

/** Procura de ciclos/dia de uma população (quem trabalha). */
export function procuraCiclos(pop: Array<{ ciclo: Ciclo; recursosMult: number; ceo: boolean }>): number {
  return pop.filter((a) => CICLOS_QUE_TRABALHAM.includes(a.ciclo)).reduce((s, a) => s + ciclosDiaPedidos(a.ciclo, a.recursosMult, a.ceo), 0)
}

export function planearClonagem(entrada: {
  agentes: AgenteClonavel[]
  config: ConfigProof
  /** Ciclos/dia que a quota aguenta hoje (motor/regras.py `capacidade_ciclos`). */
  capacidadeCiclosDia: number
  pareceCodigo: (c: string) => boolean
  validarInstrucoes: (antes: string, depois: string) => { aceita: boolean; texto: string; motivo: string }
  agora?: Date
}): PlanoClonagem {
  const { agentes, config } = entrada
  const agora = entrada.agora ?? new Date()
  const cap = Math.max(0, Math.floor(entrada.capacidadeCiclosDia))
  const limite = Math.floor(cap * 1.25)
  const procuraAntes = procuraCiclos(agentes)
  let procura = procuraAntes
  const esperam: PlanoClonagem['esperam'] = []
  const ninhadas: PlanoClonagem['ninhadas'] = []
  const usados = new Set(agentes.flatMap((a) => [a.codigo.toUpperCase(), ...a.codigosUsados.map((x) => x.toUpperCase())]))
  const pedidoPorClone = ciclosDiaPedidos('PROVING', 1, false)

  // Os melhores primeiro: quando a quota aperta, é o maior Proof que tem o lugar.
  const candidatos = agentes
    .filter((a) => !a.ceo && CICLOS_QUE_TRABALHAM.includes(a.ciclo) && nClones(a, config) > 0)
    .sort((x, y) => y.proof - x.proof)

  for (const pai of candidatos) {
    if (pai.ninhadaEmProva) { esperam.push({ nome: pai.nome, porque: 'A ninhada anterior ainda está em prova: os clones competem antes da geração seguinte.' }); continue }
    let n = Math.min(nClones(pai, config), TECTOS_DUROS.clonesPorNinhada)
    const cabem = Math.floor((limite - procura) / pedidoPorClone)
    if (cabem <= 0) { esperam.push({ nome: pai.nome, porque: `Quota: a população já pede ${procura} ciclos/dia e a capacidade é ${cap} (+25 % de fila).` }); continue }
    if (cabem < n) n = Math.max(1, cabem)

    // Variações: a do pai primeiro, depois o catálogo sem repetir irmãos nem a própria.
    const vars: Array<{ tipo: TipoVariacao; texto: string | null; origem: CloneAPlanear['origemVariacao']; id: string | null }> = [
      { tipo: 'igual', texto: null, origem: 'nenhuma', id: null },
    ]
    if (pai.mutacaoProposta) vars.push({ tipo: pai.mutacaoProposta.tipo, texto: pai.mutacaoProposta.texto, origem: 'pai', id: pai.mutacaoProposta.id })
    for (const v of VARIACOES_CATALOGO) {
      if (vars.length >= n) break
      if (pai.variacoesUsadas.some((t) => t.includes(v.texto)) || pai.instrucoes.includes(v.texto)) continue
      if (vars.some((x) => x.tipo === v.tipo)) continue
      vars.push({ tipo: v.tipo, texto: v.texto, origem: 'catalogo', id: null })
    }
    const clones: CloneAPlanear[] = []
    let k = pai.filhos
    for (const v of vars.slice(0, n)) {
      let codigo = codigoDoClone(pai.codigo, ++k)
      while (usados.has(codigo)) codigo = codigoDoClone(pai.codigo, ++k)
      if (!entrada.pareceCodigo(codigo)) { esperam.push({ nome: pai.nome, porque: `Código «${codigo}» fora da forma do ?ag= (linhagem demasiado funda): clona-se a partir da DNA dominante.` }); break }
      const geracao = pai.geracao + 1
      const instrucoes =
        pai.instrucoes.trim() +
        `\n\nCLONE (geração ${geracao}, nasceste de ${pai.nome} a ${agora.toISOString().slice(0, 10)}, proof do pai ${pai.proof}). ` +
        (v.tipo === 'igual' ? 'És a cópia IGUAL (o controlo da ninhada).' : `VARIAÇÃO ${v.tipo}: ${v.texto}`) +
        `\nO TEU CÓDIGO é ${codigo}: põe-no em todos os links (?ag=${codigo}). Competes com os teus irmãos; a receita do teu pai não é tua.`
      const g = entrada.validarInstrucoes(pai.instrucoes, instrucoes)
      if (!g.aceita) { esperam.push({ nome: pai.nome, porque: `Instruções do clone recusadas pela guarda: ${g.motivo.slice(0, 200)}` }); continue }
      usados.add(codigo)
      clones.push({
        paiId: pai.id, paiNome: pai.nome, codigo, nome: `${pai.nome} · G${geracao}.${k}`, geracao,
        variacao: v.tipo, variacaoTexto: v.texto, origemVariacao: v.origem, propostaId: v.id,
        instrucoes: g.texto, familia: pai.familia, especializacao: pai.especializacao,
      })
    }
    if (!clones.length) continue
    procura += clones.length * pedidoPorClone
    ninhadas.push({ paiId: pai.id, paiNome: pai.nome, proof: pai.proof, banda: pai.banda, clones })
  }
  return { ninhadas, esperam, capacidade: { ciclosDia: cap, procuraAntes, procuraDepois: procura, limite } }
}

/**
 * A COMPETIÇÃO de uma ninhada fechada: a melhor variante (com amostra) passa a DNA dominante se
 * bater o pai. Pura. As perdedoras seguem o ciclo de vida normal (sem valor → … → ARCHIVED).
 */
export function decidirNinhada(
  pai: { id: string; proof: number },
  clones: Array<{ id: string; nome: string; proof: number; amostraOk: boolean; variacao: string }>,
): { dominanteId: string | null; porque: string } {
  const validos = clones.filter((c) => c.amostraOk).sort((a, b) => b.proof - a.proof)
  const melhor = validos[0]
  if (!melhor) return { dominanteId: null, porque: 'Nenhum clone com amostra: a DNA do pai continua dominante.' }
  if (melhor.proof <= pai.proof) return { dominanteId: null, porque: `O melhor clone (${melhor.nome}, ${melhor.proof}) não bate o pai (${pai.proof}).` }
  return { dominanteId: melhor.id, porque: `${melhor.nome} (variação ${melhor.variacao}) tem proof ${melhor.proof} > pai ${pai.proof}: passa a DNA dominante.` }
}
