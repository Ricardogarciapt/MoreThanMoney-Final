import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { lerFunis, type Funil, type NoDoFunil } from '@/lib/funis'
import { lerMensagem } from '@/lib/mensagens-funil'

/**
 * O motor que CORRE os funis desenhados no mapa.
 *
 * Até aqui o mapa desenhava e o código do Telegram executava — duas descrições do mesmo funil,
 * a divergir em silêncio. Agora o desenho é a coisa que corre.
 *
 * ── Executar e ensaiar lado a lado ────────────────────────────────────────────────────────────
 * Cada ação tem duas metades: o que faz e o que DIRIA que faz. É a ideia que o openfunnels usa no
 * `ActionRegistry` (`execute` e `simulate` na mesma classe), e é o que torna um motor destes
 * seguro de ligar: percorre-se o funil inteiro com uma pessoa a fingir, vê-se o caminho passo a
 * passo, e só depois se deixa tocar em alguém.
 *
 * Ficam juntas de propósito. Um simulador escrito à parte descreve o funil que quem o escreveu
 * julga ter — e a primeira vez que divergem é a única em que se precisava dele.
 *
 * ── Uma passagem não corre o funil todo ───────────────────────────────────────────────────────
 * Anda até encontrar uma espera ou o fim. Uma espera de um dia é uma linha na base com hora
 * marcada, não uma função a dormir — e é o que permite ao funil sobreviver a um deploy.
 */

export interface Contexto {
  /** Quem, com o canal no prefixo: "telegram:12345". */
  pessoa: string
  /** O que se sabe da pessoa. Os blocos leem daqui e escrevem aqui. */
  dados: Record<string, unknown>
}

export interface PassoDado {
  no: string
  tipo: string
  titulo: string
  /** O que aconteceu, em palavras. Em ensaio, o que TERIA acontecido. */
  fez: string
  em: string
}

/** O que o motor precisa de saber fazer no mundo real. Injetado para o ensaio poder não fazer nada. */
export interface Braços {
  enviar(pessoa: string, canal: string, texto: string, botoes: Array<{ texto: string; url?: string }>): Promise<void>
  etiquetar(pessoa: string, etiquetas: string[]): Promise<void>
  mudarEtapa(pessoa: string, etapa: string): Promise<void>
  darCupao(pessoa: string, codigo: string): Promise<void>
  chamar(url: string, metodo: string, corpo: string, cabecalhos: Record<string, string>): Promise<void>
  avisarAdmin(texto: string): Promise<void>
  /** Lê um campo da pessoa para as condições. */
  lerCampo(pessoa: string, campo: string): Promise<unknown>
}

const cfg = (n: NoDoFunil): Record<string, unknown> => n.config ?? {}
const txt = (v: unknown): string => (v == null ? '' : String(v))

/**
 * A condição é verdadeira para esta pessoa?
 *
 * As verificações adicionais (`mais`) são um E com a principal: quem acrescenta uma segunda
 * verificação está a apertar, não a alargar. Se quisesse alargar, punha dois blocos.
 */
async function condicaoBate(no: NoDoFunil, ctx: Contexto, braços: Braços): Promise<boolean> {
  const c = cfg(no)
  const uma = async (campo: string, operador: string, valor: string): Promise<boolean> => {
    if (!campo) return true
    const atual = await braços.lerCampo(ctx.pessoa, campo)
    const vazio = atual == null || atual === '' || atual === false
    switch (operador) {
      case 'existe': return !vazio
      case 'vazio': return vazio
      case 'nao_e': return txt(atual) !== valor
      default: return txt(atual) === valor
    }
  }

  const valorPrincipal =
    txt(c.valor_stage) || txt(c.valor_interesse) || txt(c.valor_passo) || txt(c.valor)
  if (!(await uma(txt(c.campo), txt(c.operador) || 'e', valorPrincipal))) return false

  for (const extra of (c.mais as Array<Record<string, unknown>>) ?? []) {
    if (!(await uma(txt(extra.campo), txt(extra.operador) || 'e', txt(extra.valor)))) return false
  }
  return true
}

/** O texto que um bloco de mensagem envia — da mensagem editável, ou do que lá está escrito. */
async function textoDaMensagem(no: NoDoFunil, ctx: Contexto): Promise<string> {
  const c = cfg(no)
  const chave = txt(c.mensagem) || txt(no.mensagem)
  if (chave) {
    // As mensagens do funil já sabem substituir {{nome}} e companhia.
    return await lerMensagem(chave, { nome: txt(ctx.dados.nome) })
  }
  return txt(c.texto)
}

/**
 * Corre um bloco e diz qual é o seguinte.
 *
 * `esperarAte` não-nulo é o motor a dizer "aqui paro". Devolver o nó seguinte E uma hora seria
 * ambíguo: ou se avança, ou se espera.
 */
async function correrNo(
  no: NoDoFunil,
  funil: Funil,
  ctx: Contexto,
  braços: Braços,
  ensaio: boolean,
): Promise<{ seguinte: string | null; fez: string; esperarAte?: string }> {
  const c = cfg(no)
  const seguinte = (i = 0) => no.seguintes[i] ?? null

  switch (no.tipo) {
    case 'entrada':
      return { seguinte: seguinte(), fez: 'entrou no funil' }

    case 'mensagem': {
      const texto = await textoDaMensagem(no, ctx)
      const botoes = ((c.botoes as Array<Record<string, unknown>>) ?? []).map((b) => ({
        texto: txt(b.texto),
        url: txt(b.url) || undefined,
      }))
      if (!texto.trim()) return { seguinte: seguinte(), fez: 'bloco de mensagem sem texto — saltado' }
      if (!ensaio) await braços.enviar(ctx.pessoa, txt(c.canal) || 'telegram', texto, botoes)
      return {
        seguinte: seguinte(),
        fez: `${ensaio ? 'enviaria' : 'enviou'} por ${txt(c.canal) || 'telegram'}: "${texto.slice(0, 60)}${texto.length > 60 ? '…' : ''}"` +
          (botoes.length ? ` (${botoes.length} botões)` : ''),
      }
    }

    case 'espera': {
      const min = Number(c.minutos) || 0
      if (min <= 0) return { seguinte: seguinte(), fez: 'espera de zero — seguiu' }
      // Em ensaio a espera não pára nada: o objectivo é VER o caminho todo de uma vez.
      if (ensaio) return { seguinte: seguinte(), fez: `esperaria ${min} min` }
      return {
        seguinte: seguinte(),
        fez: `à espera ${min} min`,
        esperarAte: new Date(Date.now() + min * 60_000).toISOString(),
      }
    }

    case 'condicao': {
      const bateu = await condicaoBate(no, ctx, braços)
      // Por convenção do mapa: a primeira seta é o "sim", a segunda o "não".
      return { seguinte: bateu ? seguinte(0) : seguinte(1), fez: bateu ? 'sim' : 'não' }
    }

    case 'divisao': {
      const pctA = Number(c.percentagem_a) || 50
      // Divide pela PESSOA e não à sorte: assim a mesma pessoa cai sempre no mesmo lado, e um
      // teste A/B em que alguém vê as duas versões não mede nada.
      let h = 0
      for (const ch of ctx.pessoa) h = (h * 31 + ch.charCodeAt(0)) % 100
      const vaiA = h < pctA
      return { seguinte: vaiA ? seguinte(0) : seguinte(1), fez: vaiA ? txt(c.nome_a) || 'A' : txt(c.nome_b) || 'B' }
    }

    case 'acao': {
      const acao = txt(c.acao)
      const descreve: Record<string, string> = {
        etiquetar: `etiquetas: ${((c.etiquetas as Array<Record<string, unknown>>) ?? []).map((e) => txt(e.nome)).join(', ')}`,
        mudar_etapa: `etapa → ${txt(c.etapa)}`,
        dar_cupao: `cupão ${txt(c.cupao)}`,
        dar_grupos: 'liberta os grupos de sinais',
        avisar_admin: 'avisa-nos',
        marcar_interesse: 'marca o interesse',
        marcar_passo: 'marca o passo',
      }
      if (!ensaio) {
        if (acao === 'etiquetar') {
          await braços.etiquetar(ctx.pessoa, ((c.etiquetas as Array<Record<string, unknown>>) ?? []).map((e) => txt(e.nome)).filter(Boolean))
        } else if (acao === 'mudar_etapa' && c.etapa) {
          await braços.mudarEtapa(ctx.pessoa, txt(c.etapa))
        } else if (acao === 'dar_cupao' && c.cupao) {
          await braços.darCupao(ctx.pessoa, txt(c.cupao))
        } else if (acao === 'avisar_admin') {
          await braços.avisarAdmin(`Funil ${funil.nome}: ${ctx.pessoa} chegou a "${no.titulo}"`)
        }
      }
      return { seguinte: seguinte(), fez: `${ensaio ? "faria" : "fez"} — ${descreve[acao] ?? (acao || "nada configurado")}` }
    }

    case 'webhook': {
      const url = txt(c.url)
      if (!url) return { seguinte: seguinte(), fez: 'automação sem endereço — saltada' }
      const cab: Record<string, string> = {}
      for (const h of (c.cabecalhos as Array<Record<string, unknown>>) ?? []) {
        if (h.nome) cab[txt(h.nome)] = txt(h.valor)
      }
      if (!ensaio) await braços.chamar(url, txt(c.metodo) || 'POST', txt(c.corpo), cab)
      return { seguinte: seguinte(), fez: `${ensaio ? 'chamaria' : 'chamou'} ${txt(c.metodo) || 'POST'} ${url}` }
    }

    case 'ia': {
      /**
       * O passo que pensa.
       *
       * `modo` decide o que se faz com a resposta: responder à pessoa, escolher o caminho, ou as
       * duas. Escolher o caminho é o que faz um funil ter conversa em vez de guião — deixa de ser
       * preciso prever cada frase que alguém possa escrever.
       *
       * Em ensaio NÃO se chama o modelo: um ensaio que gasta chamadas e demora deixa de ser feito,
       * e o que interessa ver é o CAMINHO, não a redação exacta. Diz o que faria e segue pelo
       * primeiro ramo.
       */
      const modo = txt(c.modo) || 'responder'
      const ramos = ((c.ramos as Array<Record<string, unknown>>) ?? []).map((r) => txt(r.nome)).filter(Boolean)

      if (ensaio) {
        return {
          seguinte: seguinte(),
          fez: `a IA ${modo === 'classificar' ? 'escolheria o caminho' : 'responderia'}: "${txt(c.objetivo).slice(0, 50)}"`,
        }
      }

      const { pensar } = await import('./funis-ia')
      const r = await pensar({
        objetivo: txt(c.objetivo),
        modo: modo as 'responder' | 'classificar' | 'ambos',
        ramos,
        doCliente: txt(ctx.dados.ultimaMensagem),
        reserva: txt(c.reserva),
      })

      if (r.texto && modo !== 'classificar') {
        await braços.enviar(ctx.pessoa, txt(c.canal) || 'telegram', r.texto, [])
      }

      // O ramo escolhido decide a seta. Fora da lista = segue a primeira, que é o caminho normal.
      const i = r.ramo != null && r.ramo >= 0 && r.ramo < no.seguintes.length ? r.ramo : 0
      return {
        seguinte: seguinte(i),
        fez: [r.texto ? `respondeu: "${r.texto.slice(0, 50)}"` : null, ramos[i] ? `caminho: ${ramos[i]}` : null]
          .filter(Boolean)
          .join(' · ') || 'a IA não devolveu nada',
      }
    }

    case 'irpara':
      // Saltar de funil termina este percurso; quem entra no outro é quem o inicia.
      return { seguinte: null, fez: `salta para o funil "${txt(c.funil)}"` }

    case 'destino':
      return { seguinte: seguinte(), fez: `chegou: ${txt(c.conta_como) || 'destino'}` }

    case 'saida':
      return { seguinte: null, fez: `perdeu-se: ${txt(c.motivo) || 'sem motivo escrito'}` }

    default:
      return { seguinte: seguinte(), fez: `tipo desconhecido (${no.tipo}) — saltado` }
  }
}

/** Quantos passos no máximo numa passagem. Um ciclo que o validador não apanhou pára aqui. */
const TETO_PASSOS = 40

export interface Resultado {
  passos: PassoDado[]
  /** Onde ficou. Null = acabou. */
  parouEm: string | null
  acordarEm: string | null
  terminou: boolean
}

/**
 * Anda com uma pessoa pelo funil, a partir de onde estiver.
 *
 * `ensaio` é a única diferença entre ver e fazer — e por isso está no mesmo caminho de código.
 * Um simulador à parte descreveria o funil que quem o escreveu julga ter.
 */
export async function andar(
  funil: Funil,
  ctx: Contexto,
  braços: Braços,
  opts: { desde?: string | null; ensaio?: boolean } = {},
): Promise<Resultado> {
  const ensaio = opts.ensaio === true
  const porId = new Map(funil.nos.map((n) => [n.id, n]))
  const passos: PassoDado[] = []

  let atual: string | null =
    opts.desde ?? funil.nos.find((n) => n.tipo === 'entrada')?.id ?? funil.nos[0]?.id ?? null

  for (let i = 0; i < TETO_PASSOS && atual; i++) {
    const no = porId.get(atual)
    if (!no) {
      passos.push({ no: atual, tipo: '?', titulo: '—', fez: 'este bloco já não existe', em: new Date().toISOString() })
      return { passos, parouEm: null, acordarEm: null, terminou: true }
    }

    const r = await correrNo(no, funil, ctx, braços, ensaio)
    passos.push({ no: no.id, tipo: no.tipo, titulo: no.titulo, fez: r.fez, em: new Date().toISOString() })

    if (r.esperarAte) {
      // Pára AQUI, no bloco de espera: quando acordar, é o seguinte deste que corre.
      return { passos, parouEm: r.seguinte, acordarEm: r.esperarAte, terminou: false }
    }
    atual = r.seguinte
  }

  if (atual) {
    passos.push({ no: atual, tipo: '?', titulo: '—', fez: `parou aos ${TETO_PASSOS} passos — há um ciclo`, em: new Date().toISOString() })
  }
  return { passos, parouEm: null, acordarEm: null, terminou: true }
}

/** Braços que não fazem nada. É o que o ensaio usa — e a razão de o ensaio não poder tocar em ninguém. */
export const bracosDeEnsaio: Braços = {
  async enviar() {},
  async etiquetar() {},
  async mudarEtapa() {},
  async darCupao() {},
  async chamar() {},
  async avisarAdmin() {},
  async lerCampo(pessoa, campo) {
    // Em ensaio lê-se a pessoa a sério: o interesse de um ensaio é ver o caminho que ESTA pessoa
    // faria, e com dados inventados o caminho seria inventado também.
    return await lerCampoReal(pessoa, campo)
  },
}

/** O valor de um campo da pessoa, das tabelas onde ele vive mesmo. */
export async function lerCampoReal(pessoa: string, campo: string): Promise<unknown> {
  const [canal, ...resto] = pessoa.split(':')
  const id = resto.join(':')
  const db = getSupabaseAdmin()

  if (canal === 'telegram') {
    const { data } = await db
      .from('telegram_leads')
      .select('stage, interesse, mtmauto_passo, broker_uid, granted_at, message_count')
      .eq('chat_id', id)
      .maybeSingle()
    if (!data) return null
    if (campo === 'respondeu') return Number(data.message_count ?? 0) > 0
    if (campo === 'subscricao' || campo === 'tem_conta_site') {
      // Estes dois vivem noutra tabela: o lead do Telegram não sabe do site.
      return null
    }
    return (data as Record<string, unknown>)[campo] ?? null
  }

  return null
}

export async function funilPorId(id: string): Promise<Funil | null> {
  return (await lerFunis()).find((f) => f.id === id) ?? null
}

// ── Percursos: pôr pessoas a andar, e voltar a elas ─────────────────────────────────────────

/**
 * Põe uma pessoa a andar num funil.
 *
 * Repetir não faz nada de propósito. Alguém que escreve três vezes seguidas entraria três vezes e
 * receberia tudo a triplicar — e essa pessoa não volta. O índice único na base é a rede; isto é a
 * verificação amável que evita chegar lá.
 */
export async function iniciarPercurso(
  funilId: string,
  pessoa: string,
  dados: Record<string, unknown> = {},
): Promise<{ iniciou: boolean; motivo?: string }> {
  const db = getSupabaseAdmin()

  const { data: jaAnda } = await db
    .from('funil_percursos')
    .select('id')
    .eq('funil_id', funilId)
    .eq('pessoa', pessoa)
    .is('terminado_em', null)
    .eq('ensaio', false)
    .maybeSingle()
  if (jaAnda) return { iniciou: false, motivo: 'já anda neste funil' }

  const { error } = await db.from('funil_percursos').insert({
    funil_id: funilId,
    pessoa,
    contexto: dados,
    acordar_em: new Date().toISOString(),
  })
  return error ? { iniciou: false, motivo: error.message } : { iniciou: true }
}

/**
 * Uma passagem do motor: pega em quem está pronto e anda com cada um.
 *
 * O limite existe porque uma passagem que trata de tudo é uma passagem que às vezes não acaba —
 * e um motor que não acaba não volta a correr. Quem sobra é apanhado na passagem seguinte.
 */
export async function correrPercursos(
  braços: Braços,
  limite = 25,
): Promise<{ andaram: number; terminaram: number; passos: number }> {
  const db = getSupabaseAdmin()
  const { data: prontos } = await db
    .from('funil_percursos')
    .select('id, funil_id, pessoa, no_atual, contexto, historico')
    .is('terminado_em', null)
    .eq('ensaio', false)
    .lte('acordar_em', new Date().toISOString())
    .order('acordar_em')
    .limit(limite)

  if (!prontos?.length) return { andaram: 0, terminaram: 0, passos: 0 }

  const funis = await lerFunis()
  let terminaram = 0
  let passos = 0

  for (const p of prontos) {
    const funil = funis.find((f) => f.id === p.funil_id)
    if (!funil) {
      // O funil foi apagado debaixo dos pés de quem lá andava. Fechar é mais honesto do que
      // deixar a linha a acordar todos os minutos para não encontrar nada.
      await db.from('funil_percursos').update({ terminado_em: new Date().toISOString() }).eq('id', p.id)
      terminaram++
      continue
    }

    const r = await andar(
      funil,
      { pessoa: String(p.pessoa), dados: (p.contexto as Record<string, unknown>) ?? {} },
      braços,
      { desde: p.no_atual as string | null },
    )
    passos += r.passos.length

    const historico = [...((p.historico as PassoDado[]) ?? []), ...r.passos].slice(-60)
    await db
      .from('funil_percursos')
      .update({
        no_atual: r.parouEm,
        acordar_em: r.acordarEm,
        terminado_em: r.terminou ? new Date().toISOString() : null,
        historico,
        mexido_em: new Date().toISOString(),
      })
      .eq('id', p.id)

    if (r.terminou) terminaram++
  }

  return { andaram: prontos.length, terminaram, passos }
}
