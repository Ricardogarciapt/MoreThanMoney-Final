/**
 * OS DADOS DOS PILARES — quem dá cada área, lido da base.
 *
 * As áreas são escritas à mão (`lib/pilares.ts`, e lá está escrito porquê). O que vem daqui é
 * **quem as dá e que salas têm** — é isso que muda sozinho quando entra um educador novo, sem
 * ninguém ter de mexer no código. Era esse o pedido.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  areasDoPilar, montarArea, type AreaMontada, type EducadorPublico, type PilarId, type SalaPublica,
} from '@/lib/pilares'

export async function montarPilar(pilar: PilarId): Promise<AreaMontada[]> {
  const areas = areasDoPilar(pilar)
  const slugs = [...new Set(areas.flatMap((a) => a.academias))]
  if (!slugs.length) return areas.map((a) => montarArea(a, [], {}))

  const db = getSupabaseAdmin()
  const { data: academias } = await db.from('lms_academies').select('id, slug').in('slug', slugs)
  const idPorSlug = new Map((academias ?? []).map((a: any) => [String(a.id), String(a.slug)]))
  if (!idPorSlug.size) return areas.map((a) => montarArea(a, [], {}))

  const { data: salas } = await db
    .from('lms_streams')
    .select('id, title, access_tier, academy_id, educator_id')
    .in('academy_id', [...idPorSlug.keys()])

  const idsDeEducadores = [...new Set((salas ?? []).map((s: any) => s.educator_id).filter(Boolean))]
  const { data: educadores } = idsDeEducadores.length
    ? await db.from('lms_educators').select('id, display_name, specialty, avatar_url, is_active').in('id', idsDeEducadores)
    : { data: [] as any[] }

  /**
   * Um educador inactivo sai da montra. Não é cosmética: `is_active` é o interruptor com que a
   * casa tira alguém de circulação, e uma página pública a continuar a anunciá-lo mandava
   * visitantes para uma sala de quem já não dá aulas.
   */
  const porId = new Map(
    (educadores ?? []).filter((e: any) => e.is_active !== false).map((e: any) => [String(e.id), e as EducadorPublico]),
  )

  return areas.map((area) => {
    const idsDaArea = new Set(
      [...idPorSlug.entries()].filter(([, slug]) => area.academias.includes(slug)).map(([id]) => id),
    )
    const salasDaArea = (salas ?? []).filter((s: any) => idsDaArea.has(String(s.academy_id)))

    const salasPorEducador: Record<string, SalaPublica[]> = {}
    for (const s of salasDaArea) {
      const eid = String((s as any).educator_id ?? '')
      // Sala sem educador (a «Introdução», por exemplo) não cria uma ficha de ninguém.
      if (!eid || !porId.has(eid)) continue
      ;(salasPorEducador[eid] ??= []).push(s as SalaPublica)
    }

    const daArea = [...porId.values()].filter((e) => salasPorEducador[e.id]?.length)
    return montarArea(area, daArea, salasPorEducador)
  })
}
