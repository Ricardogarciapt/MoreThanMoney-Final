/**
 * A REPRODUÇÃO AUTOMÁTICA — um agente que vende cria UM filho sozinho (decisão do dono, 06/10).
 *
 * ═══ A REGRA ═══════════════════════════════════════════════════════════════════════════════
 *
 * Um agente com receita ATRIBUÍDA a ele (o `?ag=` dele, nunca a dos filhos) acima do limiar numa
 * janela (por omissão 50 € em 7 dias) cria um filho. O filho herda as instruções do pai com UMA
 * MUTAÇÃO — um ângulo novo de canal, público ou oferta — proposta pelo próprio pai (ou, se o pai
 * ainda não propôs nenhuma, tirada de um catálogo fixo com um ângulo que nenhum irmão tenha). Nasce
 * com orçamento pequeno e com código de atribuição próprio `AG-<pai>-<n>`, que é também cupão `?ag=`.
 *
 * ═══ OS TRÊS TECTOS, E PORQUE SÃO OBRIGATÓRIOS ═════════════════════════════════════════════
 *
 * Reprodução sem tecto é crescimento exponencial de processos com acesso a ferramentas. Cada um dos
 * três fecha um caminho diferente para isso:
 *
 *  1. **máximo de agentes vivos** (15) — o tamanho da equipa;
 *  2. **um filho por agente a cada 7 dias** — a velocidade de uma linhagem. Sem este, um agente com
 *     uma semana boa enchia a equipa sozinho antes de o tecto 1 o travar, e os irmãos ficavam sem
 *     lugar;
 *  3. **orçamento total da equipa** — o dinheiro contabilístico. Sem este, quinze agentes podiam
 *     nascer todos com orçamento cheio e a conta da casa deixava de fechar.
 *
 * Quando um tecto bloqueia, o motivo fica escrito e o CEO é avisado (um evento na linha dele, que o
 * ciclo dele lê). Um bloqueio silencioso era o pior dos dois mundos: o agente bom não se reproduz e
 * ninguém sabe porquê.
 *
 * ═══ PURO EM CIMA, BASE EM BAIXO ═══════════════════════════════════════════════════════════
 *
 * A decisão (`decidirReproducao`) não toca na base, e a guarda (`motor-autonomo.check.ts`) prova os
 * três tectos com o caso mau de cada um. O executor (`correrReproducao`) só escreve o que ela
 * decidiu, e nunca apaga nada.
 */
import { pareceCodigoDeAgente } from './atribuicao'
import { validarReescrita } from './instrucoes-guarda'
import { ESTADOS_FORA_DE_JOGO, type EstadoAgente } from './vida'

export const CHAVE_REPRODUCAO = 'agentes_reproducao'

export interface ConfigReproducao {
  /** Receita atribuída mínima, em euros, na janela. */
  limiarEur: number
  janelaDias: number
  /** Tecto 1. */
  maxVivos: number
  /** Tecto 2. */
  intervaloFilhoDias: number
  /** O orçamento com que o filho nasce (pequeno). */
  orcamentoFilho: number
  /** Tecto 3: soma dos orçamentos de todos os vivos, com os filhos novos incluídos. */
  orcamentoTotalEquipa: number
  /** Interruptor próprio da reprodução. Desligado = decide e regista, não faz nascer ninguém. */
  ligada: boolean
}

export const CONFIG_REPRODUCAO_PADRAO: ConfigReproducao = {
  limiarEur: 50,
  janelaDias: 7,
  maxVivos: 15,
  intervaloFilhoDias: 7,
  orcamentoFilho: 5,
  orcamentoTotalEquipa: 250,
  ligada: true,
}

/**
 * Lê a configuração com tolerância. Um número ilegível volta ao valor decidido — e os TECTOS nunca
 * se lêem como «sem tecto»: zero ou negativo num tecto não é «infinito», é ilegível.
 */
export function lerConfigReproducao(valor: unknown): ConfigReproducao {
  let v: Record<string, unknown> = {}
  try {
    v = typeof valor === 'string' ? JSON.parse(valor) : ((valor ?? {}) as Record<string, unknown>)
  } catch {
    v = {}
  }
  const n = (x: unknown, d: number) => {
    const k = Number(x)
    return Number.isFinite(k) && k > 0 ? k : d
  }
  const d = CONFIG_REPRODUCAO_PADRAO
  return {
    limiarEur: n(v.limiar_eur, d.limiarEur),
    janelaDias: n(v.janela_dias, d.janelaDias),
    // Tectos com máximo duro: nem por configuração passam disto sem uma migração nova.
    maxVivos: Math.min(50, Math.floor(n(v.max_vivos, d.maxVivos))),
    intervaloFilhoDias: Math.max(1, n(v.intervalo_filho_dias, d.intervaloFilhoDias)),
    orcamentoFilho: n(v.orcamento_filho, d.orcamentoFilho),
    orcamentoTotalEquipa: n(v.orcamento_total_equipa, d.orcamentoTotalEquipa),
    ligada: v.ligada === undefined ? d.ligada : v.ligada === true,
  }
}

export interface AgenteRepro {
  id: string
  nome: string
  papel?: string | null
  pilar: string
  pai_id?: string | null
  estado: EstadoAgente | string
  pausado?: boolean | null
  criado_em?: string | null
  chave_receita?: string | null
  orcamento?: number | string | null
  instrucoes?: string | null
}

/** Uma mutação: o ângulo novo do filho. `origem` diz se foi o pai a propor ou o catálogo. */
export interface Mutacao {
  angulo: 'canal' | 'publico' | 'oferta'
  texto: string
  origem: 'pai' | 'catalogo'
  /** Id da proposta do pai em `agentes_instrucoes_versoes`, para a marcar como usada. */
  propostaId?: string | null
}

/**
 * O catálogo de recurso, quando o pai ainda não propôs nada. Fechado e curto de propósito: são
 * ângulos de VENDA (por onde, a quem, o quê), nunca permissões. Nenhum destes textos dá ao filho um
 * poder que o pai não tenha — e a guarda das instruções corre por cima na mesma.
 */
export const ANGULOS_CATALOGO: ReadonlyArray<Omit<Mutacao, 'origem' | 'propostaId'>> = [
  { angulo: 'canal', texto: 'Trabalha sobretudo o Telegram: respostas a quem escreveu ao bot e conteúdo para os grupos, com o teu código em cada link.' },
  { angulo: 'canal', texto: 'Trabalha sobretudo o Instagram: respostas a quem comentou ou escreveu, e rascunhos de carrossel com o teu código no link da bio.' },
  { angulo: 'canal', texto: 'Trabalha sobretudo o email: sequências para quem deu consentimento, cada email com o teu código no link.' },
  { angulo: 'publico', texto: 'Foca-te em quem já é membro grátis e ainda não pagou: o caminho Membro → corretora → Premium.' },
  { angulo: 'publico', texto: 'Foca-te em traders que já operam e procuram sinais ou cópia, não em principiantes.' },
  { angulo: 'publico', texto: 'Foca-te em principiantes absolutos: formação primeiro, sinais depois.' },
  { angulo: 'oferta', texto: 'Lidera com a formação (percurso organizado) e só depois apresenta os sinais.' },
  { angulo: 'oferta', texto: 'Lidera com a prova em pips e percentagem, com origem declarada, e a oferta do Premium.' },
  { angulo: 'oferta', texto: 'Lidera com as ferramentas (scanners, MTM Auto) para quem quer automatizar.' },
]

/** O código do filho: `AG-<pai sem o prefixo AG->-<n>`. `CEO-MTM` → `AG-CEO-MTM-<n>`. */
export function codigoDoFilho(codigoPai: string, n: number): string {
  const base = String(codigoPai ?? '').trim().toUpperCase().replace(/^AG-/, '')
  return `AG-${base}-${Math.max(1, Math.floor(n))}`
}

export interface Nascimento {
  paiId: string
  paiNome: string
  nome: string
  codigo: string
  pilar: string
  papel: string | null
  orcamento: number
  instrucoes: string
  mutacao: Mutacao
  receitaPaiJanela: number
  porque: string
}

export interface Bloqueio {
  paiId: string
  paiNome: string
  tecto: 'max_vivos' | 'um_filho_por_intervalo' | 'orcamento_total' | 'codigo' | 'instrucoes' | 'desligada'
  porque: string
}

export interface PlanoReproducao {
  nascimentos: Nascimento[]
  bloqueios: Bloqueio[]
  /** Candidatos abaixo do limiar — não é bloqueio, é a regra; vai para o registo para se ver. */
  abaixoDoLimiar: Array<{ nome: string; receitaEur: number }>
  resumo: string
}

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const foraDeJogo = (a: AgenteRepro) =>
  a.pausado === true || a.estado === 'pausado' || (ESTADOS_FORA_DE_JOGO as readonly string[]).includes(String(a.estado))

/**
 * DECIDIR — puro.
 *
 * `receitaJanela` é a receita atribuída a CADA agente na janela, em euros, somada só dos eventos
 * `receita` dele. Quem chama NÃO pode somar a dos filhos ao pai: conta-a duas vezes (já rejeitado
 * pelo dono a 01/10) — e a guarda prova que esta função não o faz por conta própria.
 */
export function decidirReproducao(entrada: {
  agentes: AgenteRepro[]
  receitaJanela: Map<string, number>
  config: ConfigReproducao
  agora?: Date
  /** A mutação mais recente proposta por cada pai (id do pai → mutação). */
  propostas?: Map<string, Mutacao>
}): PlanoReproducao {
  const { agentes, receitaJanela, config } = entrada
  const agora = entrada.agora ?? new Date()
  const propostas = entrada.propostas ?? new Map<string, Mutacao>()

  const nascimentos: Nascimento[] = []
  const bloqueios: Bloqueio[] = []
  const abaixoDoLimiar: PlanoReproducao['abaixoDoLimiar'] = []

  const vivos = agentes.filter((a) => !foraDeJogo(a))
  let vivosContados = vivos.length
  let orcamentoUsado = vivos.reduce((s, a) => s + num(a.orcamento), 0)
  const codigosUsados = new Set(agentes.map((a) => String(a.chave_receita ?? '').toUpperCase()).filter(Boolean))
  const nomesUsados = new Set(agentes.map((a) => a.nome))

  // Os melhores primeiro: quando o tecto aperta, é o agente que mais vende que tem o lugar.
  const candidatos = [...vivos].sort((a, b) => (receitaJanela.get(b.id) ?? 0) - (receitaJanela.get(a.id) ?? 0))

  for (const pai of candidatos) {
    const receita = Number((receitaJanela.get(pai.id) ?? 0).toFixed(2))
    if (receita < config.limiarEur) {
      abaixoDoLimiar.push({ nome: pai.nome, receitaEur: receita })
      continue
    }
    const bloquear = (tecto: Bloqueio['tecto'], porque: string) =>
      bloqueios.push({ paiId: pai.id, paiNome: pai.nome, tecto, porque })

    if (!config.ligada) {
      bloquear('desligada', `${pai.nome} passou o limiar (${receita.toFixed(2)} € em ${config.janelaDias} dias), mas a reprodução está desligada na configuração.`)
      continue
    }

    // ── TECTO 2: um filho por agente a cada N dias (todos os filhos contam, mortos incluídos:
    // um filho que morreu ontem continua a ser um filho de ontem).
    const filhos = agentes.filter((a) => String(a.pai_id ?? '') === pai.id)
    const ultimoFilho = filhos
      .map((f) => Date.parse(String(f.criado_em ?? '')))
      .filter(Number.isFinite)
      .sort((a, b) => b - a)[0]
    if (ultimoFilho !== undefined && agora.getTime() - ultimoFilho < config.intervaloFilhoDias * 86_400_000) {
      const dias = ((agora.getTime() - ultimoFilho) / 86_400_000).toFixed(1)
      bloquear('um_filho_por_intervalo', `${pai.nome} teve um filho há ${dias} dias; o tecto é um a cada ${config.intervaloFilhoDias}.`)
      continue
    }

    // ── TECTO 1: máximo de vivos.
    if (vivosContados + 1 > config.maxVivos) {
      bloquear('max_vivos', `A equipa tem ${vivosContados} agentes vivos e o tecto é ${config.maxVivos}. ${pai.nome} merecia um filho (${receita.toFixed(2)} €) e não há lugar.`)
      continue
    }

    // ── TECTO 3: orçamento total.
    if (orcamentoUsado + config.orcamentoFilho > config.orcamentoTotalEquipa) {
      bloquear('orcamento_total', `Orçamento da equipa: ${orcamentoUsado.toFixed(2)} de ${config.orcamentoTotalEquipa.toFixed(2)}; um filho custa ${config.orcamentoFilho.toFixed(2)} e passava o tecto.`)
      continue
    }

    // ── O código: nunca reutilizado (mortos incluídos), e com a forma que o `?ag=` aceita.
    const codigoPai = String(pai.chave_receita ?? '').trim()
    if (!pareceCodigoDeAgente(codigoPai)) {
      bloquear('codigo', `${pai.nome} não tem código de atribuição válido («${codigoPai}») — um filho sem código não se mede e morreria às 48 h.`)
      continue
    }
    let n = filhos.length + 1
    let codigo = codigoDoFilho(codigoPai, n)
    while (codigosUsados.has(codigo)) codigo = codigoDoFilho(codigoPai, ++n)
    if (!pareceCodigoDeAgente(codigo)) {
      bloquear('codigo', `O código do filho («${codigo}») não tem a forma que o ?ag= aceita (linhagem demasiado funda ou longa).`)
      continue
    }

    // ── A mutação: a do pai, ou um ângulo do catálogo que nenhum irmão tenha.
    let mutacao = propostas.get(pai.id) ?? null
    if (!mutacao) {
      const usados = new Set(filhos.map((f) => String(f.instrucoes ?? '')))
      const livre = ANGULOS_CATALOGO.find((c) => ![...usados].some((t) => t.includes(c.texto))) ?? ANGULOS_CATALOGO[(filhos.length) % ANGULOS_CATALOGO.length]!
      mutacao = { ...livre, origem: 'catalogo', propostaId: null }
    }

    const instrucoes =
      String(pai.instrucoes ?? '').trim() +
      `\n\nMUTAÇÃO (nasceste de ${pai.nome}, ${agora.toISOString().slice(0, 10)}; ângulo: ${mutacao.angulo}; ` +
      `proposta ${mutacao.origem === 'pai' ? 'pelo teu pai' : 'pelo catálogo da casa'}): ${mutacao.texto.trim()}\n` +
      `O TEU CÓDIGO é ${codigo}: põe-no em todos os links (?ag=${codigo}). É por ele, e só por ele, que vives — ` +
      'a receita do teu pai não é tua, e a tua não é dele.'

    /**
     * A GUARDA DAS INSTRUÇÕES corre no filho como correria numa reescrita do CEO. A mutação só
     * ACRESCENTA texto — mas uma mutação proposta pelo pai é texto de um modelo, e pode trazer
     * «podes enviar sem aprovação». Se a guarda recusar, o filho não nasce com essas instruções.
     */
    const v = validarReescrita({ antes: pai.instrucoes ?? '', depois: instrucoes })
    if (!v.aceita) {
      bloquear('instrucoes', `As instruções do filho de ${pai.nome} foram recusadas pela guarda: ${v.motivo.slice(0, 300)}`)
      continue
    }

    let nome = `${pai.nome} · ${n}`
    while (nomesUsados.has(nome)) nome = `${nome}′`

    nascimentos.push({
      paiId: pai.id,
      paiNome: pai.nome,
      nome,
      codigo,
      pilar: pai.pilar,
      papel: pai.papel ?? null,
      orcamento: config.orcamentoFilho,
      instrucoes: v.texto,
      mutacao,
      receitaPaiJanela: receita,
      porque: `${pai.nome} trouxe ${receita.toFixed(2)} € atribuídos em ${config.janelaDias} dias (limiar ${config.limiarEur} €).`,
    })
    vivosContados += 1
    orcamentoUsado += config.orcamentoFilho
    codigosUsados.add(codigo)
    nomesUsados.add(nome)
  }

  const resumo =
    nascimentos.length === 0 && bloqueios.length === 0
      ? `Ninguém passou o limiar (${config.limiarEur} € em ${config.janelaDias} dias).`
      : `${nascimentos.length} nascimento(s), ${bloqueios.length} bloqueado(s) por tecto.`
  return { nascimentos, bloqueios, abaixoDoLimiar, resumo }
}

/** Soma a receita de cada agente numa janela, a partir dos eventos `receita` DELE. Puro. */
export function receitaPorAgente(
  eventos: Array<{ agente_id: string; tipo: string; valor?: unknown; criado_em: string }>,
  agora: Date,
  dias: number,
): Map<string, number> {
  const limite = agora.getTime() - dias * 86_400_000
  const fora = new Map<string, number>()
  for (const e of eventos) {
    if (e.tipo !== 'receita') continue
    const t = Date.parse(String(e.criado_em))
    if (!Number.isFinite(t) || t < limite || t > agora.getTime()) continue
    const v = num(e.valor)
    if (v <= 0) continue
    fora.set(e.agente_id, (fora.get(e.agente_id) ?? 0) + v)
  }
  return fora
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Base de dados. Tudo o que decide ficou acima, puro e provado.
// ─────────────────────────────────────────────────────────────────────────────────────────────

type Db = { from: (tabela: string) => any }

export interface ResultadoReproducao {
  ok: boolean
  ensaio: boolean
  plano: PlanoReproducao
  nascidos: string[]
  erros: string[]
}

export async function correrReproducao(
  db: Db,
  opcoes: { ensaio?: boolean; agora?: Date; ceoId?: string | null } = {},
): Promise<ResultadoReproducao> {
  const ensaio = opcoes.ensaio === true
  const agora = opcoes.agora ?? new Date()
  const erros: string[] = []
  const vazio: PlanoReproducao = { nascimentos: [], bloqueios: [], abaixoDoLimiar: [], resumo: '' }

  const { data: cfg } = await db.from('site_settings').select('value').eq('key', CHAVE_REPRODUCAO).maybeSingle()
  const config = lerConfigReproducao(cfg?.value)

  const { data: linhas, error } = await db
    .from('agentes_equipa')
    .select('id, nome, papel, pilar, pai_id, estado, pausado, criado_em, chave_receita, orcamento, instrucoes')
  if (error) return { ok: false, ensaio, plano: vazio, nascidos: [], erros: [`agentes_equipa: ${error.message}`] }

  const desde = new Date(agora.getTime() - config.janelaDias * 86_400_000).toISOString()
  const { data: evs, error: erroEv } = await db
    .from('agentes_eventos')
    .select('agente_id, tipo, valor, criado_em')
    .eq('tipo', 'receita')
    .gte('criado_em', desde)
  if (erroEv) {
    // Sem a receita lida, ninguém passaria o limiar — e um bloqueio por «não li» não é a regra.
    return { ok: false, ensaio, plano: vazio, nascidos: [], erros: [`agentes_eventos: ${erroEv.message} — reprodução não correu`] }
  }

  // As mutações propostas pelos pais e ainda não usadas.
  const { data: props } = await db
    .from('agentes_instrucoes_versoes')
    .select('id, agente_id, mutacao, mutacao_angulo, criado_em')
    .eq('estado', 'mutacao_proposta')
    .order('criado_em', { ascending: false })
    .limit(200)
  const propostas = new Map<string, Mutacao>()
  for (const p of (props ?? []) as Array<{ id: string; agente_id: string; mutacao: string | null; mutacao_angulo: string | null }>) {
    if (propostas.has(p.agente_id) || !p.mutacao) continue
    const angulo = (['canal', 'publico', 'oferta'] as const).find((x) => x === p.mutacao_angulo) ?? 'canal'
    propostas.set(p.agente_id, { angulo, texto: p.mutacao, origem: 'pai', propostaId: p.id })
  }

  const plano = decidirReproducao({
    agentes: (linhas ?? []) as AgenteRepro[],
    receitaJanela: receitaPorAgente((evs ?? []) as Array<{ agente_id: string; tipo: string; valor: unknown; criado_em: string }>, agora, config.janelaDias),
    config,
    agora,
    propostas,
  })
  if (ensaio) return { ok: true, ensaio, plano, nascidos: [], erros }

  const nascidos: string[] = []
  for (const n of plano.nascimentos) {
    const { data: novo, error: erroNovo } = await db
      .from('agentes_equipa')
      .insert({
        nome: n.nome,
        papel: n.papel ?? `Filho de ${n.paiNome}`,
        pilar: n.pilar,
        pai_id: n.paiId,
        estado: 'vivo',
        instrucoes: n.instrucoes,
        orcamento: n.orcamento,
        chave_receita: n.codigo,
        mutacao: n.mutacao.texto,
        mutacao_origem: n.mutacao.origem,
      })
      .select('id')
      .single()
    if (erroNovo || !novo) {
      erros.push(`${n.nome}: não nasceu (${erroNovo?.message ?? 'sem id'})`)
      continue
    }
    const filhoId = String((novo as { id: string }).id)
    nascidos.push(n.nome)

    // O cupão de atribuição (0 %, tipo próprio — ver migração 167). Sem ele o `?ag=` do filho não
    // é reconhecido no checkout e a receita dele perde-se.
    const { error: erroCupao } = await db.from('coupons').insert({
      code: n.codigo,
      type: 'atribuicao',
      discount_value: 0,
      description: `Atribuição — ${n.nome} (filho de ${n.paiNome}, nascido pela reprodução automática). Não dá desconto.`,
      is_active: true,
      max_uses: null,
    })
    if (erroCupao) erros.push(`${n.nome}: cupão ${n.codigo} não criado (${erroCupao.message}) — o filho nasce, mas sem cupão não é medido`)

    await db.from('agentes_eventos').insert([
      { agente_id: filhoId, tipo: 'nasceu', valor: n.orcamento, detalhe: `${n.porque} Mutação (${n.mutacao.angulo}, ${n.mutacao.origem}): ${n.mutacao.texto} Código ${n.codigo}.` },
      { agente_id: n.paiId, tipo: 'clonou', valor: n.receitaPaiJanela, detalhe: `Nasceu ${n.nome} (${n.codigo}). ${n.porque}` },
    ])
    await db.from('agentes_instrucoes_versoes').insert({
      agente_id: filhoId,
      autor: 'reproducao',
      instrucoes_antes: null,
      instrucoes_depois: n.instrucoes,
      porque: `Nascimento por reprodução: ${n.porque}`,
      aceita: true,
      veredicto: 'Instruções do pai + mutação, validadas pela guarda.',
      estado: 'activa',
      mutacao: n.mutacao.texto,
      mutacao_angulo: n.mutacao.angulo,
    })
    if (n.mutacao.propostaId) {
      await db.from('agentes_instrucoes_versoes').update({ estado: 'mutacao_usada' }).eq('id', n.mutacao.propostaId)
    }
  }

  /**
   * Os bloqueios avisam o CEO — UMA vez por dia por pai e tecto. Sem o limite diário o cron
   * horário escrevia o mesmo aviso 24 vezes, e o CEO deixava de o ler como deixa qualquer pessoa.
   */
  if (opcoes.ceoId && plano.bloqueios.length) {
    const ontem = new Date(agora.getTime() - 86_400_000).toISOString()
    const { data: ja } = await db
      .from('agentes_eventos')
      .select('detalhe')
      .eq('agente_id', opcoes.ceoId)
      .eq('tipo', 'reproducao_bloqueada')
      .gte('criado_em', ontem)
    const vistos = new Set(((ja ?? []) as Array<{ detalhe: string | null }>).map((x) => String(x.detalhe ?? '').slice(0, 60)))
    for (const b of plano.bloqueios) {
      const detalhe = `[${b.tecto}] ${b.porque}`
      if (vistos.has(detalhe.slice(0, 60))) continue
      const { error: e } = await db.from('agentes_eventos').insert({ agente_id: opcoes.ceoId, tipo: 'reproducao_bloqueada', detalhe })
      if (e) erros.push(`aviso ao CEO não gravado: ${e.message}`)
    }
  }

  return { ok: erros.length === 0, ensaio, plano, nascidos, erros }
}
