import type { SupabaseClient } from '@supabase/supabase-js'
import type { EstadoPipeline } from '@/lib/backoffice-vista'
import { ESTADO_PIPELINE_NOME } from '@/lib/backoffice-vista'
import { PAPEL_NOME, type Papel } from '@/lib/backoffice-papeis'
import {
  PAPEL_DO_ESTADO,
  cadenciaDoEstado,
  chaveTarefaDoDia,
  diaEmLisboa,
  ehDiaUtil,
  encherODia,
  estadoEstaVivo,
  precisaAccao,
  precisaEscalar,
  prioridade,
  proximaAccao,
  type Cadencia,
  type MedidaDeEstado,
} from '@/lib/backoffice-dia-regras'
import { ingerirLeads, type Ingerido } from '@/lib/backoffice-dia-ingestao'

/**
 * O MOTOR DO DIA — o que transforma um pipeline parado em trabalho começado.
 *
 * Corre uma vez por manhã e faz, por esta ordem:
 *
 *   1. INGERE  — pega em quem está à espera nas fontes e põe no pipeline (ver `…-ingestao`).
 *   2. MEDE    — vê quanto tempo os negócios GANHOS levaram em cada estado. É daqui que sai a
 *                cadência, e é isto que faz o sistema ser evolutivo em vez de ter números fixos
 *                escritos por mim num dia em que não sabia nada sobre este negócio.
 *   3. DECIDE  — pontua cada negócio vivo, escolhe o que cabe no dia de cada pessoa e escreve a
 *                tarefa com o que fazer e PORQUÊ HOJE.
 *   4. ESCALA  — o que está encravado há três cadências vai ao team leader, uma vez só.
 *   5. AVISA   — cada pessoa recebe o seu resumo. Quem não tiver Telegram vê no backoffice.
 *
 * A FRONTEIRA QUE NÃO SE ATRAVESSA
 * Este motor NÃO fala com clientes. Prepara trabalho para pessoas; quem escreve ao cliente é a
 * pessoa. Isso é deliberado: um sistema que manda mensagens sozinho a cem pessoas por dia acaba
 * sempre da mesma maneira — alguém recebe a mensagem errada no momento errado e perde-se um
 * cliente que já estava ganho, ou queima-se um número de telefone que levou meses a conquistar.
 * A IA aqui redige e propõe; nunca envia.
 */

export interface ResultadoDoDia {
  dia: string
  ligado: boolean
  saltouPorSerFimDeSemana?: boolean
  ingestao: Ingerido[]
  cadencias: Array<{ estado: EstadoPipeline; dias: number; fonte: Cadencia['fonte'] }>
  tarefasCriadas: number
  escalados: number
  pessoasAvisadas: number
  semResponsavel: number
  avisos: string[]
}

interface NegocioVivo {
  id: string
  nome: string
  estado: EstadoPipeline
  origem: string | null
  pack_previsto: string | null
  atualizado_em: string
  prospector_id: string | null
  setter_id: string | null
  closer_id: string | null
  team_leader_id: string | null
}

const COLUNA_DO_PAPEL: Record<Papel, string | null> = {
  prospector: 'prospector_id',
  setter: 'setter_id',
  closer: 'closer_id',
  team_leader: 'team_leader_id',
  afiliado: null,
}

function diasDesde(iso: string, agora: Date): number {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return 0
  return Math.max(0, Math.floor((agora.getTime() - t) / 86_400_000))
}

// ── 2. A MEDIÇÃO — de onde vem a cadência ────────────────────────────────────

/**
 * Quanto tempo é que os negócios GANHOS passaram em cada estado.
 *
 * Mede-se pelos ganhos e não por todos de propósito: a média de todos inclui os que apodreceram, e
 * aprender com eles ensinaria o sistema a ser lento. Aprende-se com quem ganhou.
 *
 * Usa-se a MEDIANA e não a média porque um negócio que esteve dois meses parado num estado e
 * fechou na mesma puxa uma média inteira para cima — e nós queremos o comportamento típico, não o
 * excepcional.
 */
export async function medirCadencias(db: SupabaseClient): Promise<MedidaDeEstado[]> {
  const { data: ganhos } = await db
    .from('vendas_negocios')
    .select('id')
    .eq('estado', 'ganho')
    .order('fechado_em', { ascending: false })
    .limit(300)

  const ids = (ganhos ?? []).map((r) => String((r as { id: string }).id))
  if (!ids.length) return []

  const { data: eventos } = await db
    .from('vendas_negocio_eventos')
    .select('negocio_id, de, para, em')
    .in('negocio_id', ids)
    .order('em', { ascending: true })

  // Para cada negócio, o tempo entre entrar num estado e sair dele.
  const porEstado = new Map<string, number[]>()
  const entrada = new Map<string, { estado: string; em: number }>()

  for (const r of eventos ?? []) {
    const e = r as { negocio_id: string; de: string | null; para: string; em: string }
    const t = Date.parse(e.em)
    if (!Number.isFinite(t)) continue
    const anterior = entrada.get(e.negocio_id)
    if (anterior && anterior.estado === e.de) {
      const dias = Math.max(0, (t - anterior.em) / 86_400_000)
      const lista = porEstado.get(anterior.estado) ?? []
      lista.push(dias)
      porEstado.set(anterior.estado, lista)
    }
    entrada.set(e.negocio_id, { estado: e.para, em: t })
  }

  const medidas: MedidaDeEstado[] = []
  for (const [estado, lista] of porEstado) {
    if (!estadoEstaVivo(estado)) continue
    const ordenada = [...lista].sort((a, b) => a - b)
    const meio = Math.floor(ordenada.length / 2)
    const mediana =
      ordenada.length % 2 ? ordenada[meio] : (ordenada[meio - 1] + ordenada[meio]) / 2
    medidas.push({ estado, diasMedianos: mediana, amostra: ordenada.length })
  }
  return medidas
}

// ── Quem faz o quê ───────────────────────────────────────────────────────────

/**
 * Quem tem cada papel, e por que ordem se distribui.
 *
 * Distribuição à vez (round-robin) e não «o primeiro que aparecer»: sem isto, a mesma pessoa
 * apanhava sempre tudo e as outras nunca teriam nada — que é a forma mais rápida de uma equipa
 * deixar de acreditar no sistema.
 */
async function quemTemCadaPapel(db: SupabaseClient): Promise<Map<Papel, string[]>> {
  const { data } = await db
    .from('backoffice_papeis')
    .select('user_id, papel, atribuido_at')
    .is('retirado_at', null)
    .order('atribuido_at', { ascending: true })

  const mapa = new Map<Papel, string[]>()
  for (const r of data ?? []) {
    const p = r as { user_id: string; papel: string }
    const papel = p.papel as Papel
    const lista = mapa.get(papel) ?? []
    if (!lista.includes(p.user_id)) lista.push(p.user_id)
    mapa.set(papel, lista)
  }
  return mapa
}

/**
 * O responsável por este negócio, neste estado.
 *
 * Se já houver alguém na coluna do papel, é essa pessoa — nunca se rouba um negócio a quem já o
 * está a trabalhar. Só quando está vazio é que se atribui, e aí à vez.
 */
function responsavelPor(
  n: NegocioVivo,
  papel: Papel,
  porPapel: Map<Papel, string[]>,
  contador: Map<Papel, number>,
): string | null {
  const coluna = COLUNA_DO_PAPEL[papel]
  if (coluna) {
    const jaTem = (n as unknown as Record<string, string | null>)[coluna]
    if (jaTem) return jaTem
  }
  const candidatos = porPapel.get(papel) ?? []
  if (candidatos.length) {
    const i = contador.get(papel) ?? 0
    contador.set(papel, i + 1)
    return candidatos[i % candidatos.length]
  }

  /**
   * NINGUÉM TEM ESTE PAPEL — cai no team leader.
   *
   * Hoje (25/09) a equipa tem dois afiliados e um team leader, e mais ninguém: não há um único
   * setter, closer ou prospector nomeado. Sem esta saída, o motor olhava para cem leads, não
   * encontrava a quem os dar, e não fazia nada — silencioso, a parecer avariado, enquanto o
   * trabalho continuava a não ser feito.
   *
   * O team leader é o destino certo porque é quem pode fazer as duas coisas que isto exige:
   * trabalhar o negócio agora, ou nomear alguém para o fazer. E o resultado do motor conta
   * quantas caíram aqui (`semResponsavel`), para que a falta de equipa apareça como um número em
   * vez de se esconder num pipeline calado.
   */
  const lideres = porPapel.get('team_leader') ?? []
  if (!lideres.length) return null
  const j = contador.get('team_leader') ?? 0
  contador.set('team_leader', j + 1)
  return lideres[j % lideres.length]
}

// ── O motor ──────────────────────────────────────────────────────────────────

export interface OpcoesDoDia {
  /** Corre sem escrever nada. Serve para ver o que ACONTECERIA antes de ligar o motor a sério. */
  ensaio?: boolean
  /** Quem avisa as pessoas. Fora daqui para o motor poder ser corrido sem mandar mensagens. */
  avisar?: (chatId: string, texto: string) => Promise<void>
  agora?: Date
}

export async function correrDia(
  db: SupabaseClient,
  opcoes: OpcoesDoDia = {},
): Promise<ResultadoDoDia> {
  const agora = opcoes.agora ?? new Date()
  const dia = diaEmLisboa(agora)
  const avisos: string[] = []

  const base: ResultadoDoDia = {
    dia,
    ligado: true,
    ingestao: [],
    cadencias: [],
    tarefasCriadas: 0,
    escalados: 0,
    pessoasAvisadas: 0,
    semResponsavel: 0,
    avisos,
  }

  // Ao fim-de-semana não se prepara o dia de ninguém. Ver `ehDiaUtil`.
  if (!ehDiaUtil(dia)) return { ...base, saltouPorSerFimDeSemana: true }

  // 1. INGERIR
  base.ingestao = opcoes.ensaio ? [] : await ingerirLeads(db)

  // 2. MEDIR
  const medidas = await medirCadencias(db)

  // 3. DECIDIR
  const { data: vivosRaw } = await db
    .from('vendas_negocios')
    .select(
      'id, nome, estado, origem, pack_previsto, atualizado_em, prospector_id, setter_id, closer_id, team_leader_id',
    )
    .not('estado', 'in', '("ganho","perdido")')
    .order('atualizado_em', { ascending: true })
    .limit(1000)

  const vivos = (vivosRaw ?? []) as unknown as NegocioVivo[]

  // Quantas vezes já se tocou em cada negócio — é isto que faz a mensagem mudar de tom.
  const toques = new Map<string, number>()
  if (vivos.length) {
    const { data: tarefasAntigas } = await db
      .from('vendas_tarefas')
      .select('negocio_id')
      .in('negocio_id', vivos.map((v) => v.id))
      .not('chave', 'is', null)
    for (const r of tarefasAntigas ?? []) {
      const id = String((r as { negocio_id: string }).negocio_id)
      toques.set(id, (toques.get(id) ?? 0) + 1)
    }
  }

  const cadenciaPorEstado = new Map<EstadoPipeline, Cadencia>()
  const porPapel = await quemTemCadaPapel(db)
  const contador = new Map<Papel, number>()

  interface Planeada {
    negocio: NegocioVivo
    papel: Papel
    responsavel: string
    prioridade: number
    diasParado: number
    titulo: string
    porque: string
    escalar: boolean
  }

  const planeadas: Planeada[] = []

  for (const n of vivos) {
    if (!estadoEstaVivo(n.estado)) continue
    const papel = PAPEL_DO_ESTADO[n.estado]
    if (!papel) continue

    let cad = cadenciaPorEstado.get(n.estado)
    if (!cad) {
      cad = cadenciaDoEstado(n.estado, medidas)
      cadenciaPorEstado.set(n.estado, cad)
    }

    const diasParado = diasDesde(n.atualizado_em, agora)
    const jaTocado = (toques.get(n.id) ?? 0) > 0
    if (!precisaAccao(diasParado, cad.dias, jaTocado)) continue

    // Conta-se ANTES de atribuir: o que interessa saber é quantos negócios precisam de um papel
    // que ninguém desempenha. Se ficasse a zero por o team leader ter apanhado tudo, a falta de
    // equipa desaparecia dos números — e é justamente o que o Ricardo precisa de ver.
    if (!(porPapel.get(papel) ?? []).length) base.semResponsavel++

    const responsavel = responsavelPor(n, papel, porPapel, contador)
    if (!responsavel) continue

    const acc = proximaAccao(n.estado, toques.get(n.id) ?? 0)
    planeadas.push({
      negocio: n,
      papel,
      responsavel,
      prioridade: prioridade({
        estado: n.estado,
        diasParado,
        cadenciaDias: cad.dias,
        packPrevisto: n.pack_previsto,
        origem: n.origem,
      }),
      diasParado,
      titulo: `${acc.titulo} — ${n.nome}`,
      porque: `${acc.porque} (${ESTADO_PIPELINE_NOME[n.estado]}, parado há ${diasParado}d)`,
      escalar: precisaEscalar(diasParado, cad.dias),
    })
  }

  base.cadencias = [...cadenciaPorEstado.entries()].map(([estado, c]) => ({
    estado,
    dias: c.dias,
    fonte: c.fonte,
  }))

  // Cortar pelo tecto de cada pessoa. Ver `TECTO_DIARIO`: uma lista impossível não se cumpre.
  const porPessoa = new Map<string, Planeada[]>()
  for (const p of planeadas) {
    const lista = porPessoa.get(p.responsavel) ?? []
    lista.push(p)
    porPessoa.set(p.responsavel, lista)
  }

  const aEscrever: Planeada[] = []
  for (const [pessoa, lista] of porPessoa) {
    // `encherODia` e não um tecto fixo: sem setters nem closers nomeados, a mesma pessoa cobre
    // três papéis no mesmo dia, e cada tipo de tarefa custa-lhe um tempo diferente.
    const doDia = encherODia(lista)
    porPessoa.set(pessoa, doDia)
    aEscrever.push(...doDia)
  }

  if (opcoes.ensaio) {
    return { ...base, tarefasCriadas: aEscrever.length, escalados: aEscrever.filter((p) => p.escalar).length }
  }

  // Escrever as tarefas. A chave impede repetidos se isto correr duas vezes no mesmo dia.
  if (aEscrever.length) {
    const linhas = aEscrever.map((p) => ({
      chave: chaveTarefaDoDia(p.negocio.id, dia),
      titulo: p.titulo,
      descricao: p.porque,
      responsavel_id: p.responsavel,
      negocio_id: p.negocio.id,
      papel: p.papel,
      prazo: dia,
      estado: 'aberta',
    }))
    const { error, count } = await db
      .from('vendas_tarefas')
      .upsert(linhas, { onConflict: 'chave', ignoreDuplicates: true, count: 'exact' })
    if (error) avisos.push(`tarefas: ${error.message}`)
    else base.tarefasCriadas = count ?? linhas.length
  }

  // 4. ESCALAR — uma linha só para o team leader, com o que está encravado.
  const encravados = aEscrever.filter((p) => p.escalar)
  base.escalados = encravados.length

  // 5. AVISAR
  if (opcoes.avisar && porPessoa.size) {
    const { data: contactos } = await db
      .from('backoffice_contactos')
      .select('user_id, telegram_chat_id, avisos_ligados')
      .in('user_id', [...porPessoa.keys()])

    const canal = new Map<string, string>()
    for (const r of contactos ?? []) {
      const c = r as { user_id: string; telegram_chat_id: string | null; avisos_ligados: boolean }
      if (c.avisos_ligados && c.telegram_chat_id) canal.set(c.user_id, c.telegram_chat_id)
    }

    for (const [pessoa, lista] of porPessoa) {
      const chat = canal.get(pessoa)
      if (!chat || !lista.length) continue
      try {
        await opcoes.avisar(chat, textoDoDia(lista, dia))
        base.pessoasAvisadas++
      } catch (e) {
        avisos.push(`aviso a ${pessoa}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  return base
}

/**
 * O resumo que a pessoa recebe de manhã.
 *
 * Três tarefas e não a lista toda. A lista toda está no backoffice; o que chega ao telemóvel é o
 * que faz a pessoa começar — e ninguém começa a olhar para doze linhas. O total vai no fim para
 * ninguém pensar que são só três.
 */
export function textoDoDia(
  lista: ReadonlyArray<{ titulo: string; porque: string; papel: Papel; escalar: boolean }>,
  dia: string,
): string {
  const topo = [...lista].slice(0, 3)
  const linhas = topo.map((p, i) => `${i + 1}. <b>${p.titulo}</b>\n   ${p.porque}`)
  const encravados = lista.filter((p) => p.escalar).length

  return [
    `<b>O teu dia — ${dia}</b>`,
    `${PAPEL_NOME[lista[0].papel]} · ${lista.length} ${lista.length === 1 ? 'tarefa' : 'tarefas'}`,
    '',
    ...linhas,
    '',
    encravados ? `⚠️ ${encravados} parado(s) há demasiado tempo — vê primeiro esses.` : '',
    `O resto está em backoffice.morethanmoney.pt`,
  ]
    .filter(Boolean)
    .join('\n')
}
