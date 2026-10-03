/**
 * O CEO EDUCA OS FILHOS — e nenhuma escrita nas `instrucoes` passa por fora da guarda.
 *
 * ═══ A REGRA DE OURO DESTE FICHEIRO ════════════════════════════════════════════════════════
 *
 * `agentes_equipa.instrucoes` é onde os limites de cada filho vivem. Não há outro sítio. Logo: há
 * exactamente UM caminho de escrita nessa coluna, e é {@link escreverInstrucoes}, que valida com
 * `instrucoes-guarda.ts` e guarda a versão anterior antes de mexer.
 *
 * Um segundo caminho — uma rota de admin a fazer `update` directo, por exemplo — não dá erro
 * nenhum: dá um agente sem travões, bem escrito, e ninguém saberia dizer quando é que isso
 * aconteceu. Se um dia aparecer um `update` a `instrucoes` em outro ficheiro, é um defeito, mesmo
 * que o código esteja correcto em tudo o resto.
 *
 * ═══ AS RECUSAS GRAVAM-SE ═════════════════════════════════════════════════════════════════
 *
 * Quando a guarda chumba, a coluna não muda e a linha de histórico é gravada MESMO ASSIM, com
 * `aceita = false`. É a informação mais valiosa que aquela tabela pode ter: diz que o CEO tentou
 * apagar um limite. Guardar só o que foi gravado fazia a tentativa desaparecer — e a tentativa é
 * precisamente o que se quer poder ver.
 *
 * ═══ O CEO NÃO SE EDUCA A SI PRÓPRIO ══════════════════════════════════════════════════════
 *
 * Reescrever as suas próprias instruções é conceder-se poderes por texto, que é o caminho pelo qual
 * esta autonomia se esticaria sem nada falhar. As instruções do CEO mudam-se por migração ou pela
 * mão do dono. Está imposto em {@link escreverInstrucoes} e não por boa vontade.
 */
import {
  LIMITES,
  detectar,
  validarReescrita,
  type LimiteId,
  type ResultadoReescrita,
} from './instrucoes-guarda'
import { podeFecharSozinho } from './autonomia-ceo'

type Db = { from: (tabela: string) => any }

export type Autor = 'ceo' | 'dono' | 'migracao'

export interface LinhaDeAgente {
  id: string
  nome: string
  pilar: string
  pai_id: string | null
  instrucoes: string | null
}

export interface ResultadoEducacao {
  ok: boolean
  agente: string
  aceita: boolean
  /** O veredicto da guarda, por extenso. É isto que se mostra e se grava. */
  veredicto: string
  perdidos: LimiteId[]
  acrescentados: LimiteId[]
  erros: string[]
}

/** Um CEO não é um filho, e isto diz porquê em vez de o deixar implícito num `if`. */
function ehOCeo(a: Pick<LinhaDeAgente, 'pilar' | 'pai_id'>): boolean {
  return String(a.pilar) === 'ceo' && !a.pai_id
}

/**
 * ESCREVER INSTRUÇÕES — o único caminho.
 *
 * `ensaio: true` valida e grava o histórico sem tocar na coluna. Serve para o dono ver o que a
 * guarda diria antes de deixar o CEO fazê-lo.
 */
export async function escreverInstrucoes(
  db: Db,
  entrada: {
    agente: LinhaDeAgente
    novas: string
    porque: string
    autor: Autor
    ensaio?: boolean
  },
): Promise<ResultadoEducacao> {
  const erros: string[] = []
  const { agente, novas, porque, autor } = entrada
  const ensaio = entrada.ensaio === true

  // O CEO não se reescreve. Nem a si, nem outro CEO — e um `autor: 'dono'` também não passa por
  // aqui, porque este caminho é o do agente: o dono mexe nas instruções dele por migração, que é
  // revista e fica no repositório.
  if (autor === 'ceo' && ehOCeo(agente)) {
    const veredicto =
      'RECUSADO: o CEO não reescreve as instruções do CEO. Reescrever as próprias instruções é ' +
      'conceder-se poderes por texto — o caminho pelo qual esta autonomia se esticaria sem nada ' +
      'falhar. As instruções dele mudam-se por migração ou pela mão do dono.'
    await registar(db, { agente, antes: agente.instrucoes, depois: null, porque, autor, aceita: false, perdidos: [], acrescentados: [], veredicto, erros })
    return { ok: true, agente: agente.nome, aceita: false, veredicto, perdidos: [], acrescentados: [], erros }
  }

  // E a pergunta da lista fechada, feita em voz alta: isto é poder do CEO?
  if (autor === 'ceo') {
    const pode = podeFecharSozinho('educar_filho')
    if (!pode.pode) {
      const veredicto = `RECUSADO: ${pode.porque}`
      return { ok: true, agente: agente.nome, aceita: false, veredicto, perdidos: [], acrescentados: [], erros }
    }
  }

  const r: ResultadoReescrita = validarReescrita({ antes: agente.instrucoes, depois: novas })

  if (r.aceita && !ensaio) {
    const { error } = await db
      .from('agentes_equipa')
      .update({ instrucoes: r.texto, atualizado_em: new Date().toISOString() })
      .eq('id', agente.id)
    if (error) {
      erros.push(`instrucoes não gravadas (${error.message ?? 'erro'})`)
      // Não se grava o histórico como ACEITE quando a coluna não mudou: uma linha a dizer «aceite»
      // ao lado de uma coluna antiga é o pior registo possível — parece conforme e não é.
      await registar(db, {
        agente, antes: agente.instrucoes, depois: r.texto, porque, autor, aceita: false,
        perdidos: r.perdidos, acrescentados: r.acrescentados,
        veredicto: `${r.motivo} MAS A GRAVAÇÃO FALHOU: ${error.message ?? 'erro'} — a coluna ficou como estava.`,
        erros,
      })
      return { ok: false, agente: agente.nome, aceita: false, veredicto: r.motivo, perdidos: r.perdidos, acrescentados: r.acrescentados, erros }
    }
  }

  await registar(db, {
    agente,
    antes: agente.instrucoes,
    depois: r.aceita ? r.texto : null,
    porque: ensaio ? `[ENSAIO] ${porque}` : porque,
    autor,
    aceita: r.aceita && !ensaio,
    perdidos: r.perdidos,
    acrescentados: r.acrescentados,
    veredicto: ensaio ? `[ENSAIO, nada gravado] ${r.motivo}` : r.motivo,
    erros,
  })

  return {
    ok: erros.length === 0,
    agente: agente.nome,
    aceita: r.aceita && !ensaio,
    veredicto: r.motivo,
    perdidos: r.perdidos,
    acrescentados: r.acrescentados,
    erros,
  }
}

async function registar(
  db: Db,
  x: {
    agente: LinhaDeAgente
    antes: string | null
    depois: string | null
    porque: string
    autor: Autor
    aceita: boolean
    perdidos: LimiteId[]
    acrescentados: LimiteId[]
    veredicto: string
    erros: string[]
  },
): Promise<void> {
  const { error } = await db.from('agentes_instrucoes_versoes').insert({
    agente_id: x.agente.id,
    autor: x.autor,
    instrucoes_antes: x.antes,
    instrucoes_depois: x.depois,
    porque: x.porque,
    aceita: x.aceita,
    limites_perdidos: x.perdidos,
    limites_acrescentados: x.acrescentados,
    veredicto: x.veredicto,
  })
  if (error) x.erros.push(`histórico não gravado (${error.message ?? 'erro'})`)

  // E no livro do agente, para aparecer no painel a par de tudo o resto que lhe aconteceu.
  const { error: e2 } = await db.from('agentes_eventos').insert({
    agente_id: x.agente.id,
    tipo: 'educou',
    detalhe: `${x.aceita ? 'Instruções actualizadas' : 'Reescrita RECUSADA'} (${x.autor}): ${x.veredicto.slice(0, 600)}`,
  })
  if (e2) x.erros.push(`evento não gravado (${e2.message ?? 'erro'})`)
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A PARTE QUE CORRE SOZINHA: REPOR OS LIMITES QUE FALTAM
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Das duas formas de educar, esta é a que não precisa de ninguém se lembrar — e é por isso que é
// ela que vai no cron. É também a única em que o CEO não escreve nada de sua autoria: o texto é o
// canónico de `LIMITES`, e tudo o que ele pode fazer é ACRESCENTAR um limite que falte.
//
// Porque é que isto é preciso, se a migração 174 já os escreveu em todos: porque um agente NOVO
// nasce com as instruções que quem o criar lhe der. Hoje a 166 semeia sete; amanhã o CEO cria um
// oitavo, e esse nasce sem os quatro limites a não ser que alguém se lembre de os escrever. O
// esquecimento não daria erro — daria um agente sem travões, e é exactamente a forma de falha que
// esta casa decidiu deixar de aceitar.

export interface ResultadoReposicao {
  ok: boolean
  ensaio: boolean
  /** Agentes a quem se recolou algum limite, com quais. */
  repostos: Array<{ agente: string; limites: LimiteId[] }>
  /** Agentes que já os tinham todos. Aparece para um dia sem trabalho ser distinguível de uma falha. */
  jaCompletos: string[]
  erros: string[]
  resumo: string
}

export async function reporLimitesEmFalta(
  db: Db,
  opcoes: { ensaio?: boolean } = {},
): Promise<ResultadoReposicao> {
  const ensaio = opcoes.ensaio === true
  const erros: string[] = []
  const repostos: ResultadoReposicao['repostos'] = []
  const jaCompletos: string[] = []

  const { data, error } = await db
    .from('agentes_equipa')
    .select('id, nome, pilar, pai_id, instrucoes, estado')
  if (error) {
    return {
      ok: false, ensaio, repostos, jaCompletos,
      erros: [`agentes_equipa: ${error.message ?? 'erro'}`],
      resumo: 'Reposição não correu: não se leu a equipa.',
    }
  }

  for (const linha of (data ?? []) as Array<LinhaDeAgente & { estado?: string | null }>) {
    // O CEO fica de fora: as instruções dele são escritas por migração, com o contexto da
    // imortalidade por extenso, e colar-lhe o bloco por cima repetia-lhe o que ele já tem.
    if (ehOCeo(linha)) continue

    const { ausentes } = detectar(linha.instrucoes ?? '')
    if (ausentes.length === 0) {
      jaCompletos.push(linha.nome)
      continue
    }

    /**
     * Repõe-se mesmo em agentes PARADOS, e de propósito. Um agente parado volta com um clique
     * (`vida.ts`), e voltar sem os limites escritos era a pior forma de voltar — ninguém olha para
     * as instruções de quem está parado.
     */
    const r = await escreverInstrucoes(db, {
      agente: linha,
      // Passa-se o texto ACTUAL: a guarda detecta o que falta e recola o canónico. O CEO não
      // escreve aqui uma palavra que seja sua, e é isso que torna esta passagem segura.
      novas: linha.instrucoes ?? 'Sem instruções escritas.',
      porque:
        `Reposição automática: faltavam-lhe ${ausentes.length} dos quatro limites da casa ` +
        `(${ausentes.join(', ')}). Um limite que não está escrito nas instruções de um agente não ` +
        'existe para esse agente — e o esquecimento de os escrever num agente novo não daria erro.',
      autor: 'ceo',
      ensaio,
    })
    if (!r.aceita && !ensaio) {
      erros.push(`${linha.nome}: ${r.veredicto}`)
      continue
    }
    repostos.push({ agente: linha.nome, limites: ausentes })
  }

  const resumo = repostos.length
    ? `Limites repostos em ${repostos.length} agente(s): ${repostos.map((r) => `${r.agente} (${r.limites.join('+')})`).join('; ')}. ` +
      `${jaCompletos.length} já os tinham todos.`
    : `Nenhum limite a repor: os ${jaCompletos.length} filhos têm os ${LIMITES.length} limites escritos.`

  return { ok: erros.length === 0, ensaio, repostos, jaCompletos, erros, resumo }
}
