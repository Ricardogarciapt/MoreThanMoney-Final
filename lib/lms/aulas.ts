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
}

export interface AcademiaComSalas {
  /** O slug quando existe; senão o nome. Serve de chave do filtro. */
  chave: string
  nome: string
  salas: SalaDeAula[]
  /** Quantas estão ao vivo agora. É o que põe a academia no topo. */
  aoVivo: number
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
export function porAcademia(salas: SalaDeAula[]): AcademiaComSalas[] {
  const grupos = new Map<string, AcademiaComSalas>()

  for (const s of salas) {
    if (!s?.id) continue
    const nome = String(s.academy?.name ?? '').trim() || SEM_ACADEMIA
    const chave = String(s.academy?.slug ?? '').trim() || nome
    const g = grupos.get(chave) ?? { chave, nome, salas: [], aoVivo: 0 }
    g.salas.push(s)
    if (s.is_live) g.aoVivo += 1
    grupos.set(chave, g)
  }

  for (const g of grupos.values()) g.salas = ordenarSalas(g.salas)

  return [...grupos.values()].sort((a, b) => {
    if (a.aoVivo !== b.aoVivo) return b.aoVivo - a.aoVivo
    // «Outras salas» vai sempre para o fim: é o caixote, não uma academia.
    if ((a.nome === SEM_ACADEMIA) !== (b.nome === SEM_ACADEMIA)) return a.nome === SEM_ACADEMIA ? 1 : -1
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
