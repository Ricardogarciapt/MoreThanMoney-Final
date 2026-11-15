/** Áreas do /estudio. Sem dependências de servidor: o backoffice (cliente) também as usa. */
export const AREAS_ESTUDIO = ['gravar', 'criar', 'ativos', 'editor', 'cortes'] as const
export type AreaEstudio = (typeof AREAS_ESTUDIO)[number]
export const NOMES_AREAS: Record<AreaEstudio, string> = {
  gravar: 'Gravar (teleprompter e takes)',
  criar: 'Criar (guiões, carrosséis, vídeos com voz)',
  ativos: 'Ativos (imagens, vídeos, músicas)',
  editor: 'Editor de vídeo',
  cortes: 'Cortes (YouTube e lives)',
}

export function normalizarAreas(v: unknown): AreaEstudio[] {
  if (!Array.isArray(v)) return []
  return AREAS_ESTUDIO.filter((a) => v.includes(a))
}
