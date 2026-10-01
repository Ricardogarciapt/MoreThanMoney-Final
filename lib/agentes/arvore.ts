/**
 * A ÁRVORE DA EQUIPA — quem está debaixo de quem, e o RELÓGIO de cada um.
 *
 * ═══ PORQUE É QUE ISTO É UM MÓDULO PURO E NÃO TRÊS `map` NO ECRÃ ═══════════════════════════
 *
 * Nada aqui rebenta. Todas as decisões deste ficheiro erram DESENHADAS, com bom aspecto, e é por
 * isso que estão aqui em vez de estarem espalhadas pelo `.tsx`:
 *
 *  · **a árvore perde um filho em silêncio.** O desenho normal — `agentes.filter(a => a.pai_id ===
 *    pai.id)` — faz um filho cujo `pai_id` aponta para um agente que já não existe (apagado,
 *    renomeado, de outro ambiente) DESAPARECER do ecrã. Não dá erro: dá uma árvore com seis filhos
 *    em vez de sete, e ninguém conta. Aqui um pai que não bate NÃO esconde o filho: promove-o a
 *    raiz e declara-o em {@link Arvore.orfaos} com o motivo;
 *  · **as horas até ao juízo desenham-se positivas quando são negativas.** Quem já passou a
 *    carência tem horas negativas, e `Math.abs`, `toFixed` ou um `Math.round` numa barra pintam
 *    «faltam 12 h» a um agente que está a ser julgado desde ontem. O relógio deste ficheiro não
 *    devolve números com sinal para o ecrã decidir: devolve uma FASE, e cada fase tem uma frase;
 *  · **um agente parado aparece vivo.** A base tem duas colunas — `estado` e `pausado` — e nada
 *    garante que concordem. Uma linha com `estado='vivo'` e `pausado=true` pintava-se de verde num
 *    painel que lê só `estado`. {@link estadoNoEcra} resolve o conflito num sítio só, e a
 *    supervisão do dono ganha sempre à coluna de estado;
 *  · **a receita por atribuir esconde-se.** É o que faz a equipa parecer morta quando só não está
 *    medida. {@link resumoDaEquipa} obriga a declarar o valor e, quando ele não vem, diz que não
 *    vem — em vez de assumir zero. Zero e «não medido» não são a mesma coisa: ver o cabeçalho de
 *    `lib/agentes/receita.ts`.
 *
 * A guarda é `arvore.check.ts` (`npx tsx lib/agentes/arvore.check.ts`) e prova sobretudo o caso
 * mau: o pai que não existe, o ciclo, o parado pintado de vivo, o relógio negativo.
 */
import { CARENCIA_HORAS, type EstadoAgente } from './vida'

/** O mínimo que um agente precisa de ter para entrar na árvore. */
export interface NoBruto {
  id: string
  nome?: string | null
  pilar?: string | null
  pai_id?: string | null
  estado?: string | null
  pausado?: boolean | null
  criado_em?: string | null
}

export type PorqueEOrfao = 'pai_inexistente' | 'ciclo'

export interface Orfao {
  id: string
  nome: string
  paiPedido: string
  porque: PorqueEOrfao
  /** Em português, para o ecrã poder mostrar isto a quem olha. */
  texto: string
}

export interface No<T extends NoBruto> {
  agente: T
  filhos: Array<No<T>>
  /** 0 = raiz. O ecrã usa isto para indentar sem ter de andar a contar pais. */
  profundidade: number
  /** Verdadeiro quando este nó só é raiz porque o pai dele não foi encontrado. */
  orfao: boolean
}

export interface Arvore<T extends NoBruto> {
  raizes: Array<No<T>>
  /**
   * Os filhos que a árvore teria perdido. Vazio é a situação normal; não-vazio é um defeito de
   * dados que o ecrã TEM de mostrar, porque é a diferença entre «temos seis agentes» e «temos
   * sete e um não aparece».
   */
  orfaos: Orfao[]
  /** Quantos agentes entraram, para o ecrã poder comparar com o que recebeu. */
  total: number
}

/** A ordem dos pilares no ecrã. O CEO primeiro porque é o topo, não por ordem alfabética. */
export const ORDEM_PILARES = ['ceo', 'trading', 'educacao', 'desenvolvimento'] as const

function textoDoPilar(p: string | null | undefined): string {
  switch (String(p ?? '')) {
    case 'ceo':
      return 'CEO'
    case 'trading':
      return 'Trading'
    case 'educacao':
      return 'Educação'
    case 'desenvolvimento':
      return 'Desenvolvimento'
    default:
      return 'Sem pilar'
  }
}
export { textoDoPilar }

/**
 * MONTAR A ÁRVORE.
 *
 * Duas passagens, de propósito: primeiro indexa-se por `id`, só depois se liga. Ligar na mesma
 * passagem fazia a ordem das linhas que vêm da base decidir se um filho encontrava o pai — um pai
 * que viesse DEPOIS do filho ficava sem ele, e a base não garante ordem nenhuma.
 */
export function montarArvore<T extends NoBruto>(agentes: readonly T[]): Arvore<T> {
  const lista = (agentes ?? []).filter((a) => a && String(a.id ?? '').trim() !== '')
  const porId = new Map<string, T>()
  for (const a of lista) porId.set(String(a.id), a)

  const orfaos: Orfao[] = []

  /**
   * O pai REAL deste agente, ou `null` com o motivo escrito.
   *
   * O ciclo não é paranóia: basta um `pai_id` trocado à mão no Supabase para A ser pai de B e B de
   * A. Sem este teste a montagem entra em recursão infinita e o painel fica em branco — uma página
   * branca não diz a ninguém que o problema é um `pai_id`.
   */
  function paiDe(a: T): { pai: T | null; orfao: Orfao | null } {
    const pedido = String(a.pai_id ?? '').trim()
    if (!pedido) return { pai: null, orfao: null }

    const pai = porId.get(pedido)
    if (!pai) {
      return {
        pai: null,
        orfao: {
          id: String(a.id),
          nome: String(a.nome ?? a.id),
          paiPedido: pedido,
          porque: 'pai_inexistente',
          texto:
            `«${String(a.nome ?? a.id)}» aponta para o pai ${pedido}, que não está nesta lista. ` +
            'Aparece no topo para não desaparecer do ecrã — a hierarquia dele é que não se pode desenhar.',
        },
      }
    }

    // Subir até à raiz: se voltarmos a este agente, há ciclo.
    const vistos = new Set<string>([String(a.id)])
    let subir: T | undefined = pai
    while (subir) {
      const sid = String(subir.id)
      if (vistos.has(sid)) {
        return {
          pai: null,
          orfao: {
            id: String(a.id),
            nome: String(a.nome ?? a.id),
            paiPedido: pedido,
            porque: 'ciclo',
            texto:
              `«${String(a.nome ?? a.id)}» e «${String(subir.nome ?? sid)}» são pai um do outro. ` +
              'Um ciclo deixava a árvore a montar-se para sempre e o painel em branco; fica no topo com o defeito à vista.',
          },
        }
      }
      vistos.add(sid)
      const pp = String(subir.pai_id ?? '').trim()
      subir = pp ? porId.get(pp) : undefined
    }

    return { pai, orfao: null }
  }

  const filhosDe = new Map<string, T[]>()
  const raizesBrutas: Array<{ a: T; orfao: boolean }> = []

  for (const a of lista) {
    const { pai, orfao } = paiDe(a)
    if (orfao) {
      orfaos.push(orfao)
      raizesBrutas.push({ a, orfao: true })
      continue
    }
    if (!pai) {
      raizesBrutas.push({ a, orfao: false })
      continue
    }
    const atual = filhosDe.get(String(pai.id)) ?? []
    atual.push(a)
    filhosDe.set(String(pai.id), atual)
  }

  const ordenar = (xs: readonly T[]): T[] =>
    [...xs].sort((x, y) => {
      const px = ORDEM_PILARES.indexOf(String(x.pilar ?? '') as (typeof ORDEM_PILARES)[number])
      const py = ORDEM_PILARES.indexOf(String(y.pilar ?? '') as (typeof ORDEM_PILARES)[number])
      // Um pilar desconhecido vai para o fim em vez de para o início: assim aparece, e aparece
      // onde se nota, em vez de encabeçar a lista como se fosse o topo da casa.
      const ax = px < 0 ? ORDEM_PILARES.length : px
      const ay = py < 0 ? ORDEM_PILARES.length : py
      if (ax !== ay) return ax - ay
      return String(x.nome ?? '').localeCompare(String(y.nome ?? ''), 'pt-PT')
    })

  function construir(a: T, profundidade: number, orfao: boolean, vistos: Set<string>): No<T> {
    const id = String(a.id)
    const seguintes = new Set(vistos)
    seguintes.add(id)
    const filhos = ordenar(filhosDe.get(id) ?? [])
      // O ciclo já foi apanhado em `paiDe`; este `filter` é o cinto de segurança para o caso de
      // uma lista futura chegar aqui por outro caminho. Custa nada e evita a página branca.
      .filter((f) => !seguintes.has(String(f.id)))
      .map((f) => construir(f, profundidade + 1, false, seguintes))
    return { agente: a, filhos, profundidade, orfao }
  }

  const raizes = raizesBrutas
    .sort((x, y) => {
      // Um órfão nunca encabeça a árvore: o CEO é que está no topo. Os órfãos ficam depois das
      // raízes legítimas, para não parecerem o topo da casa.
      if (x.orfao !== y.orfao) return x.orfao ? 1 : -1
      const px = ORDEM_PILARES.indexOf(String(x.a.pilar ?? '') as (typeof ORDEM_PILARES)[number])
      const py = ORDEM_PILARES.indexOf(String(y.a.pilar ?? '') as (typeof ORDEM_PILARES)[number])
      const ax = px < 0 ? ORDEM_PILARES.length : px
      const ay = py < 0 ? ORDEM_PILARES.length : py
      if (ax !== ay) return ax - ay
      return String(x.a.nome ?? '').localeCompare(String(y.a.nome ?? ''), 'pt-PT')
    })
    .map((r) => construir(r.a, 0, r.orfao, new Set<string>()))

  return { raizes, orfaos, total: lista.length }
}

/**
 * A ÁRVORE EM LINHA, pela ordem em que se desenha.
 *
 * Existe para quem não consegue desenhar recursão: o `dashboard.html` do AIOS é HTML à mão, e o
 * `getEquipa` tem de entregar JSON que o AIOS leia sem reconstruir hierarquia nenhuma. Se cada
 * ecrã derivasse a sua própria árvore, um deles acabava a perder um filho — e seria o que ninguém
 * está a olhar.
 */
export function achatar<T extends NoBruto>(arvore: Arvore<T>): Array<No<T>> {
  const fora: Array<No<T>> = []
  const andar = (ns: Array<No<T>>) => {
    for (const n of ns) {
      fora.push(n)
      andar(n.filhos)
    }
  }
  andar(arvore.raizes)
  return fora
}

// ═══ O RELÓGIO ════════════════════════════════════════════════════════════════════════════════

export type FaseDoRelogio =
  /** Pausado ou parado pelo dono: a regra das 48 h não corre. O relógio está DESLIGADO. */
  | 'suspenso'
  /** Sem data de nascimento legível: não há janela, logo não há relógio. */
  | 'sem_data'
  /** Ainda não foi julgado nenhuma vez. `horas` são as que FALTAM. */
  | 'carencia'
  /** A carência passou: é julgado a cada passagem do cron. `horas` são as que JÁ PASSARAM. */
  | 'em_julgamento'

export interface Relogio {
  fase: FaseDoRelogio
  /**
   * Sempre POSITIVO ou nulo, e o significado depende da fase. Isto é a correcção do defeito: o
   * campo `horasAteAoJuizo` que existia antes ficava negativo depois da carência, e qualquer
   * desenho que o tratasse como uma contagem decrescente mostrava o inverso da verdade.
   */
  horas: number | null
  /** A frase que vai para o ecrã. Vem daqui para os dois painéis dizerem o mesmo. */
  texto: string
}

export function relogioDoJuizo(
  a: Pick<NoBruto, 'criado_em' | 'estado' | 'pausado'>,
  agora: Date = new Date(),
  carenciaHoras: number = CARENCIA_HORAS,
): Relogio {
  const estado = String(a.estado ?? '')
  if (a.pausado === true || estado === 'pausado') {
    return { fase: 'suspenso', horas: null, texto: 'Relógio parado — pausado pelo dono.' }
  }
  if (estado === 'parado') {
    return { fase: 'suspenso', horas: null, texto: 'Relógio parado — o agente já parou.' }
  }
  if (estado === 'reformado') {
    return { fase: 'suspenso', horas: null, texto: 'Relógio parado — reformado, passou o testemunho a um filho.' }
  }

  const t = Date.parse(String(a.criado_em ?? ''))
  if (!Number.isFinite(t)) {
    return {
      fase: 'sem_data',
      horas: null,
      texto: 'Sem data de criação legível — não há janela para julgar, e por isso não é julgado.',
    }
  }

  const idade = (agora.getTime() - t) / 3_600_000
  if (idade < 0) {
    // Nascido no futuro é relógio trocado. Dizer-se, em vez de dar uma carência eterna.
    return {
      fase: 'sem_data',
      horas: null,
      texto: 'A data de criação está no futuro — relógio trocado. Não se julga por uma data que não pode ser.',
    }
  }

  if (idade < carenciaHoras) {
    const faltam = Math.max(0, Math.ceil(carenciaHoras - idade))
    return {
      fase: 'carencia',
      horas: faltam,
      texto: `Faltam ${faltam} h para o primeiro juízo (nasceu há ${Math.floor(idade)} h).`,
    }
  }

  const desde = Math.floor(idade - carenciaHoras)
  return {
    fase: 'em_julgamento',
    horas: desde,
    texto:
      desde <= 0
        ? 'A carência acabou agora — é julgado na próxima passagem.'
        : `Já passou a carência há ${desde} h: é julgado a cada passagem, não há contagem decrescente.`,
  }
}

/**
 * O ESTADO QUE SE PINTA.
 *
 * A base tem `estado` e `pausado` e nada as obriga a concordar. Quando discordam, ganha `pausado`:
 * é a supervisão humana, e é a mesma ordem que `julgar()` usa (ver `lib/agentes/vida.ts`). Se o
 * painel pintasse `estado` e o cron obedecesse a `pausado`, o dono via verde num agente que a
 * regra tinha suspendido.
 */
export function estadoNoEcra(a: Pick<NoBruto, 'estado' | 'pausado'>): {
  estado: EstadoAgente
  /** Não-nulo quando as duas colunas discordavam. O ecrã mostra-o: um dado torto que se cala volta. */
  conflito: string | null
} {
  const bruto = String(a.estado ?? '')
  const conhecido = (['vivo', 'em_risco', 'parado', 'pausado', 'reformado'] as const).includes(
    bruto as EstadoAgente,
  )
    ? (bruto as EstadoAgente)
    : null

  if (a.pausado === true) {
    return {
      estado: 'pausado',
      conflito:
        conhecido && conhecido !== 'pausado'
          ? `A base diz estado «${conhecido}» e pausado=true ao mesmo tempo. Vale pausado — a supervisão do dono ganha à coluna de estado.`
          : null,
    }
  }

  if (!conhecido) {
    // Um estado que não se reconhece NÃO se pinta de vivo. Vivo é a cor que diz «está a trabalhar
    // e a pagar-se», e é a última coisa que se deve assumir por omissão.
    return {
      estado: 'parado',
      conflito: `Estado «${bruto || 'vazio'}» não é reconhecido. Mostra-se como parado, porque assumir «vivo» era pintar de verde um agente de que não se sabe nada.`,
    }
  }

  return { estado: conhecido, conflito: null }
}

// ═══ O RESUMO ═════════════════════════════════════════════════════════════════════════════════

export interface ResumoEquipa {
  total: number
  vivos: number
  emRisco: number
  parados: number
  pausados: number
  reformados: number
  /** Agentes com receita medida a ZERO. Não é o mesmo que agentes que não venderam. */
  semReceitaMedida: number
  orfaos: number
  /** O que não se conseguiu ligar a ninguém, em cêntimos. `null` = não foi medido. */
  porAtribuirCents: number | null
  /** A frase que o painel mostra sobre a receita por atribuir. Nunca vazia. */
  porAtribuirTexto: string
}

/**
 * O RESUMO, COM A RECEITA POR ATRIBUIR SEMPRE À VISTA.
 *
 * `porAtribuirCents` é `number | null` e não `number` de propósito: um `?? 0` em quem chama
 * transformava «ninguém mediu» em «não há nada por atribuir». São as duas leituras opostas do mesmo
 * ecrã — uma diz que a equipa não vendeu, a outra diz que não se sabe — e a regra de vida mata
 * agentes com base nisto.
 */
export function resumoDaEquipa<T extends NoBruto & { receita?: number | null }>(
  arvore: Arvore<T>,
  porAtribuirCents: number | null | undefined,
): ResumoEquipa {
  const nos = achatar(arvore)
  const conta = (e: EstadoAgente) => nos.filter((n) => estadoNoEcra(n.agente).estado === e).length

  const cents = porAtribuirCents == null || !Number.isFinite(Number(porAtribuirCents))
    ? null
    : Math.round(Number(porAtribuirCents))

  const porAtribuirTexto =
    cents == null
      ? 'Receita por atribuir: NÃO MEDIDA nesta leitura. Não se lê como zero — zero diria que a equipa não vendeu, e o que isto diz é que ninguém contou.'
      : cents > 0
        ? `${(cents / 100).toLocaleString('pt-PT', { minimumFractionDigits: 2 })} € entraram e não se conseguiram ligar a nenhum agente. Não se reparte: um agente medido a adivinhar é pior do que um agente não medido.`
        : 'Nada por atribuir nesta leitura: toda a receita lida foi ligada a um agente ou declarada com motivo.'

  return {
    total: arvore.total,
    vivos: conta('vivo'),
    emRisco: conta('em_risco'),
    parados: conta('parado'),
    pausados: conta('pausado'),
    reformados: conta('reformado'),
    semReceitaMedida: nos.filter((n) => Number(n.agente.receita ?? 0) === 0).length,
    orfaos: arvore.orfaos.length,
    porAtribuirCents: cents,
    porAtribuirTexto,
  }
}

// ═══ A ESCALA DE VIDA ═════════════════════════════════════════════════════════════════════════

/**
 * DEZ CASAS, DE 0 A 9, COM OS CORTES TIRADOS DO CÓDIGO.
 *
 * A ideia vem de uma referência que o dono trouxe: uma escala de dez casas com os cortes tirados do
 * código da aplicação, e não escolhidos a olho. Aqui os cortes são os de `julgar()` em
 * `lib/agentes/vida.ts`, pela mesma ordem e com os mesmos limiares:
 *
 *   0–2  pára      — sem lucro na janela e sem orçamento
 *   3–5  em risco  — sem lucro, mas ainda tem orçamento para virar o jogo
 *   6–9  paga-se   — lucro na janela
 *
 * Se estes cortes deixarem de bater com `julgar()`, a escala passa a desenhar uma coisa e o cron a
 * fazer outra. É por isso que `arvore.check.ts` compara a banda da escala com a decisão de
 * `julgar()` nos mesmos factos: a guarda apanha a divergência, não o olho de quem lê o painel.
 *
 * ═══ A CASA QUE NÃO EXISTE: «NÃO MEDIDO» ═══════════════════════════════════════════════════
 *
 * Um agente sem código `?ag=` NÃO tem nível. Não tem zero — não tem nenhum. Nenhuma venda se liga
 * a ele, por isso o que a escala mediria seria a ausência de contador, não a ausência de trabalho.
 * Desenhar-lhe um zero era a mentira exacta que o dono quer evitar: é um agente que parece o pior
 * da equipa e pode ser o melhor. Por isso `nivel` é `null` e a banda diz-se — e o ecrã desenha
 * essas dez casas riscadas, como a referência risca os passos que não existem.
 */
export type BandaDaEscala =
  /** Não há contador: sem código `?ag=` nenhuma venda se liga a este agente. */
  | 'nao_medido'
  /** Pausado, parado ou reformado: a regra não corre, logo não há nível. */
  | 'suspenso'
  /** Ainda não foi julgado uma primeira vez. */
  | 'carencia'
  | 'para'
  | 'risco'
  | 'paga_se'

export interface Escala {
  /** 0 a 9, ou `null` quando não há nada que se possa medir. */
  nivel: number | null
  banda: BandaDaEscala
  /** Os cortes, escritos, para irem a par do desenho. */
  cortes: string
  /** O porquê desta casa, em português. */
  porque: string
}

export const CORTES_DA_ESCALA =
  '0–2 pára · 3–5 em risco · 6–9 paga-se — os mesmos limiares de julgar() em lib/agentes/vida.ts'

export interface FactosDaEscala {
  /** Receita menos gasto NA JANELA. É por este número que o agente vive. */
  resultado?: number | null
  /** O orçamento que lhe resta. */
  saldo?: number | null
  /** O código `?ag=`. Sem ele não há contador nenhum. */
  codigo?: string | null
  estado?: string | null
  pausado?: boolean | null
  criado_em?: string | null
}

/** Encaixa um valor numa das casas de uma banda, sem nunca sair dela. */
function casa(fraccao: number, min: number, max: number): number {
  const f = Number.isFinite(fraccao) ? Math.max(0, Math.min(1, fraccao)) : 0
  return Math.max(min, Math.min(max, min + Math.round(f * (max - min))))
}

export function escalaDeVida(
  a: FactosDaEscala,
  agora: Date = new Date(),
  orcamentoInicial = 10,
): Escala {
  // A ORDEM É A DE `julgar()`. Trocá-la dava uma escala que discorda da regra no caso difícil —
  // que é o único caso em que a escala interessa.
  const relogio = relogioDoJuizo(a, agora)
  if (relogio.fase === 'suspenso') {
    return { nivel: null, banda: 'suspenso', cortes: CORTES_DA_ESCALA, porque: relogio.texto }
  }

  const codigo = String(a.codigo ?? '').trim()
  if (!codigo) {
    return {
      nivel: null,
      banda: 'nao_medido',
      cortes: CORTES_DA_ESCALA,
      porque:
        'Sem código ?ag= nenhuma venda se liga a ele. Não tem nível — não tem zero, tem AUSÊNCIA DE CONTADOR. ' +
        'Um zero aqui dizia que ele não trouxe nada, quando o que se sabe é que ninguém contou.',
    }
  }

  if (relogio.fase === 'sem_data' || relogio.fase === 'carencia') {
    return {
      nivel: null,
      banda: 'carencia',
      cortes: CORTES_DA_ESCALA,
      porque: relogio.texto,
    }
  }

  const resultado = Number(a.resultado ?? 0)
  const saldo = Number(a.saldo ?? 0)
  const base = orcamentoInicial > 0 ? orcamentoInicial : 10

  if (resultado > 0) {
    // 6 a 9: quem se paga. O topo é quem gera, na janela, pelo menos o orçamento de um filho —
    // que é o mesmo limiar por que `podeClonar` deixa um agente multiplicar-se.
    return {
      nivel: casa(resultado / base, 6, 9),
      banda: 'paga_se',
      cortes: CORTES_DA_ESCALA,
      porque: `Pagou-se na janela: ${resultado.toFixed(2)} $. A casa 9 é quem gera, em 48 h, o orçamento de um filho (${base} $).`,
    }
  }

  if (saldo > 0) {
    // 3 a 5: sem lucro, mas com orçamento. Quanto mais orçamento resta, mais alto — é o tempo que
    // ainda tem para virar o jogo.
    return {
      nivel: casa(saldo / base, 3, 5),
      banda: 'risco',
      cortes: CORTES_DA_ESCALA,
      porque: `Sem lucro na janela (${resultado.toFixed(2)} $), mas ainda tem ${saldo.toFixed(2)} $ de orçamento. Em risco, não parado.`,
    }
  }

  // 0 a 2: sem lucro e sem orçamento. Mais fundo quanto maior o prejuízo.
  return {
    nivel: casa(1 - Math.min(1, Math.abs(resultado) / base), 0, 2),
    banda: 'para',
    cortes: CORTES_DA_ESCALA,
    porque: `Sem lucro (${resultado.toFixed(2)} $) e sem orçamento. É esta a casa em que a regra pára o agente.`,
  }
}
