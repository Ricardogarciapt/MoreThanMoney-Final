/**
 * AS AULAS, ARRUMADAS POR ACADEMIA — a decisão de o que se mostra e por que ordem.
 *
 * O tab da app chamava-se «Ao vivo» e era uma grelha achatada de salas: tudo ao mesmo nível, sem
 * forma de escolher uma academia, e as gravações só apareciam depois de entrar numa sala. Quem
 * queria rever uma aula tinha de saber de cor em que sala ela estava.
 *
 * Isto arruma: academias primeiro, salas dentro, e as gravações ao lado de cada sala — como no
 * site. A parte que erra em silêncio é esta, e por isso está aqui e não espalhada pelo ecrã:
 *
 *  · uma sala sem academia DESAPARECER da lista. Acontece com as salas de serviço, e desaparecer
 *    sem erro é a pior forma de uma sala deixar de existir;
 *  · uma sala a que a pessoa não tem acesso ser ESCONDIDA. Esconder parece respeitar o nível, e o
 *    que faz é tirar da montra o que ainda está por vender: quem nunca vê a sala VIP nunca sabe
 *    que ela existe. Mostra-se com cadeado — a decisão de abrir é do `podeAcederAoTier`, não daqui.
 */

export type Nivel = 'free' | 'all' | 'app_member' | 'premium' | 'vip'

export interface SalaDeAula {
  id: string
  title: string
  is_live?: boolean | null
  access_tier?: string | null
  thumbnail_url?: string | null
  playlist_url?: string | null
  playlist_title?: string | null
  playlist_access_tier?: string | null
  educator?: { id?: string; display_name?: string | null; avatar_url?: string | null } | null
  academy?: { id?: string; name?: string | null; slug?: string | null } | null
  scheduled_start_at?: string | null
  /** Os anexos da sala (211). Chegam na mesma resposta que a sala — ver `entregarMateriais`. */
  materiais?: MaterialDaSala[] | null
}

/** O que um anexo de sala pode ser (211). Igual ao `check` da coluna `tipo`. */
export const TIPOS_DE_MATERIAL = ['pdf', 'video', 'link'] as const
export type TipoDeMaterial = (typeof TIPOS_DE_MATERIAL)[number]

/**
 * UM ANEXO DE UMA SALA — o guia em PDF de uma estratégia, uma playlist a mais, um link.
 *
 * `url: null` quer dizer FECHADO: o servidor tirou o link porque a pessoa não tem o nível das
 * gravações da sala. O título fica — é montra, como a sala fechada que se mostra com cadeado.
 */
export interface MaterialDaSala {
  id: string
  titulo: string
  descricao?: string | null
  url: string | null
  tipo: TipoDeMaterial
  ordem?: number | null
  bloqueado?: boolean
}

/**
 * Valida o que o admin escreveu antes de ir para a base.
 *
 * Só https: um `http://` abre com aviso de inseguro no telemóvel, e um `javascript:` posto num
 * `href` corria no browser de quem carregasse. O tipo desconhecido não se adivinha — recusa-se.
 */
export function materialParaGravar(
  b: Record<string, unknown>,
): { ok: true; material: { titulo: string; descricao: string | null; url: string; tipo: TipoDeMaterial; ordem: number } } | { ok: false; erro: string } {
  const titulo = String(b?.titulo ?? '').trim().slice(0, 200)
  if (!titulo) return { ok: false, erro: 'Dá um título ao material.' }
  const url = String(b?.url ?? '').trim()
  let valido = false
  try { valido = new URL(url).protocol === 'https:' } catch { valido = false }
  if (!valido) return { ok: false, erro: 'O link tem de começar por https://' }
  const tipo = String(b?.tipo ?? '').trim().toLowerCase() as TipoDeMaterial
  if (!TIPOS_DE_MATERIAL.includes(tipo)) return { ok: false, erro: 'Tipo inválido (pdf, video ou link).' }
  const n = Math.round(Number(b?.ordem))
  return {
    ok: true,
    material: {
      titulo,
      descricao: String(b?.descricao ?? '').trim().slice(0, 500) || null,
      url,
      tipo,
      ordem: Number.isFinite(n) ? Math.min(999, Math.max(0, n)) : 0,
    },
  }
}

/**
 * Os materiais de uma sala, já com o nível aplicado — a decisão que a rota toma por linha.
 *
 * Usa o MESMO nível das gravações (`playlist_access_tier ?? access_tier`, como `oQuePodeFazer`):
 * o guia em PDF acompanha as aulas gravadas, e abrir um sem o outro não faz sentido. Quem não tem
 * o nível recebe o título com `url: null` — o link nunca sai do servidor para quem não o pagou.
 */
export function entregarMateriais(
  materiais: MaterialDaSala[],
  podeRever: boolean,
): MaterialDaSala[] {
  const ordenados = [...materiais].sort(
    (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || String(a.titulo).localeCompare(String(b.titulo), 'pt'),
  )
  return podeRever ? ordenados : ordenados.map((m) => ({ ...m, url: null, bloqueado: true }))
}

export interface AcademiaComSalas {
  /** O slug quando existe; senão o nome. Serve de chave do filtro. */
  chave: string
  nome: string
  salas: SalaDeAula[]
  /** Quantas estão ao vivo agora. É o que põe a academia no topo. */
  aoVivo: number
  /** A capa 16:9, quando a academia tem uma. */
  capa?: string | null
}

/**
 * UMA ACADEMIA DO CATÁLOGO, venha ela com salas ou sem nenhuma.
 *
 * Existe porque agrupar só pelas salas fazia desaparecer do ecrã qualquer academia que ainda não
 * tenha educador — e uma academia que existe no catálogo e não aparece na montra é uma área que a
 * casa deixou de vender sem ninguém decidir isso. Ver a regra do dono de 28/09: as áreas estão
 * TODAS prontas, e nenhuma diz o que lhe falta.
 */
export interface AcademiaDoCatalogo {
  slug?: string | null
  name?: string | null
  cover_url?: string | null
}

/** O nome de quem fica sem academia. Não é um erro — há salas que não pertencem a nenhuma. */
export const SEM_ACADEMIA = 'Outras salas'

/**
 * Agrupa as salas por academia.
 *
 * NENHUMA SALA SE PERDE: as que não têm academia caem todas num grupo próprio, em vez de serem
 * filtradas por um `if (s.academy)` que ninguém vê a acontecer.
 *
 * A ordem é: as academias com algo ao vivo primeiro, depois as que têm mais salas, e o desempate
 * é pelo nome — para a lista não dançar entre duas leituras só porque a base devolveu outra ordem.
 */
export function porAcademia(
  salas: SalaDeAula[],
  catalogo: AcademiaDoCatalogo[] = [],
): AcademiaComSalas[] {
  const grupos = new Map<string, AcademiaComSalas>()

  /**
   * O CATÁLOGO ENTRA PRIMEIRO, e com salas vazias.
   *
   * Assim uma academia sem educador continua a ter lugar e capa, em vez de sumir. As salas que
   * chegarem a seguir caem no grupo que já existe; as que vierem de uma academia que não está no
   * catálogo criam o grupo delas, porque perder uma sala é pior do que mostrar uma academia a mais.
   */
  for (const a of catalogo) {
    const nome = String(a?.name ?? '').trim()
    if (!nome) continue
    const chave = String(a?.slug ?? '').trim() || nome
    grupos.set(chave, { chave, nome, salas: [], aoVivo: 0, capa: a?.cover_url ?? null })
  }

  for (const s of salas) {
    if (!s?.id) continue
    const nome = String(s.academy?.name ?? '').trim() || SEM_ACADEMIA
    const chave = String(s.academy?.slug ?? '').trim() || nome
    const g = grupos.get(chave) ?? { chave, nome, salas: [], aoVivo: 0, capa: null }
    g.salas.push(s)
    if (s.is_live) g.aoVivo += 1
    grupos.set(chave, g)
  }

  for (const g of grupos.values()) g.salas = ordenarSalas(g.salas)

  return [...grupos.values()].sort((a, b) => {
    if (a.aoVivo !== b.aoVivo) return b.aoVivo - a.aoVivo
    // «Outras salas» vai sempre para o fim: é o caixote, não uma academia.
    if ((a.nome === SEM_ACADEMIA) !== (b.nome === SEM_ACADEMIA)) return a.nome === SEM_ACADEMIA ? 1 : -1
    // Uma academia sem salas mostra-se, mas depois das que têm: quem chega quer ver o que pode
    // abrir já. Não é «a abrir» — é só ordem.
    if ((a.salas.length === 0) !== (b.salas.length === 0)) return a.salas.length === 0 ? 1 : -1
    if (a.salas.length !== b.salas.length) return b.salas.length - a.salas.length
    return a.nome.localeCompare(b.nome, 'pt')
  })
}

/** Quão aberta é uma sala. Menor = mais aberta. Igual a `lib/pilares.ts`, e é de propósito. */
const ABERTURA: Record<string, number> = { free: 0, all: 1, app_member: 2, premium: 3, vip: 4 }

/**
 * Dentro de uma academia: ao vivo primeiro, depois as mais abertas, depois por nome.
 *
 * As mais abertas à frente porque é por elas que se entra. Uma lista que abrisse pela «Mentoria
 * VIP» dava um cadeado logo na primeira linha a quem ainda está a decidir se isto é para ele.
 */
export function ordenarSalas(salas: SalaDeAula[]): SalaDeAula[] {
  return [...salas].sort((a, b) => {
    if (Boolean(a.is_live) !== Boolean(b.is_live)) return a.is_live ? -1 : 1
    const da = ABERTURA[String(a.access_tier ?? '').toLowerCase()] ?? 5
    const dbb = ABERTURA[String(b.access_tier ?? '').toLowerCase()] ?? 5
    if (da !== dbb) return da - dbb
    return String(a.title ?? '').localeCompare(String(b.title ?? ''), 'pt')
  })
}

/** Esta sala tem gravações para rever? */
export function temGravacoes(sala: SalaDeAula): boolean {
  return Boolean(String(sala?.playlist_url ?? '').trim())
}

/**
 * O que a pessoa pode fazer com esta sala, já com o nível dela decidido por quem chamou.
 *
 * `podeEntrar` e `podeRever` são SEPARADOS porque os níveis são separados na base: há salas cuja
 * emissão é VIP e cujas gravações abrem a membros. Tratá-los como um só fechava gravações que
 * estão pagas, e isso não dá erro — a pessoa só vê um cadeado onde devia ter aula.
 */
export function oQuePodeFazer(
  sala: SalaDeAula,
  podeNivel: (tier: string | null | undefined) => boolean,
): { podeEntrar: boolean; podeRever: boolean; temGravacoes: boolean } {
  const gravacoes = temGravacoes(sala)
  return {
    podeEntrar: podeNivel(sala.access_tier),
    // Sem nível próprio, a gravação segue o da sala — que é o que a base faz hoje.
    podeRever: gravacoes && podeNivel(sala.playlist_access_tier ?? sala.access_tier),
    temGravacoes: gravacoes,
  }
}

/** O nome do parâmetro que diz qual a pasta aberta. Um só, partilhado pelo site e pela app. */
export const PARAM_ACADEMIA = 'academia'

/**
 * QUAL A PASTA ABERTA, a partir do que vem na URL (`?academia=<slug>`).
 *
 * As academias passaram a ser PASTAS: fechado vê-se a grelha de capas, e só se abre a que se
 * escolhe. Esse estado tem de ser endereçável — um deep-link de notificação («nova aula na
 * Academia Forex») tem de cair já dentro da pasta, e o botão «voltar» do telefone tem de dar a
 * grelha outra vez. É por isso que a verdade está na URL e não só num `useState`.
 *
 * O CASO MAU que esta função existe para não deixar acontecer: um slug que não resolve — a
 * academia foi renomeada, o link é antigo, ou alguém escreveu o nome à mão. Devolve `null`, e
 * `null` lê-se como «mostra a grelha». A alternativa silenciosa era ficar um ecrã em branco com o
 * filtro aplicado a uma academia que não existe, e ninguém percebe porque não há salas.
 *
 * Aceita o slug, o nome, e qualquer dos dois com outra caixa, porque os links vêm de sítios que
 * não controlamos (emails, Telegram, notificações antigas) e falhar por causa de uma maiúscula é
 * perder a pessoa à porta.
 */
export function resolverAcademia(
  pedida: string | null | undefined,
  grupos: AcademiaComSalas[],
): AcademiaComSalas | null {
  const alvo = String(pedida ?? '').trim().toLowerCase()
  if (!alvo) return null
  return (
    grupos.find((g) => g.chave.toLowerCase() === alvo) ??
    grupos.find((g) => g.nome.toLowerCase() === alvo) ??
    null
  )
}
