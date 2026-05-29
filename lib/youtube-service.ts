// Tipos para os dados da playlist
export interface VideoItem {
  id: string
  title: string
  description: string
  thumbnail: string
  position: number
  publishedAt: string
}

export interface Module {
  title: string
  videos: VideoItem[]
}

// Função para extrair o módulo do título do vídeo
export function extractModuleInfo(title: string): { moduleNumber: number; moduleTitle: string } {
  // Padrão: "Módulo X - Título" ou "Módulo X: Título" ou apenas título normal
  const moduleRegex = /^(?:Módulo|Module)\s*(\d+)[\s:-]+(.+)$/i
  const match = title.match(moduleRegex)

  if (match) {
    return {
      moduleNumber: Number.parseInt(match[1], 10),
      moduleTitle: match[2].trim(),
    }
  }

  // Se não encontrar o padrão, assume que é parte do módulo 1
  return {
    moduleNumber: 1,
    moduleTitle: "Introdução ao Trading",
  }
}

// Função para organizar vídeos em módulos
export function organizeVideosByModules(videos: VideoItem[]): Module[] {
  const moduleMap = new Map<number, { title: string; videos: VideoItem[] }>()

  // Primeiro, agrupa os vídeos por módulo
  videos.forEach((video) => {
    const { moduleNumber, moduleTitle } = extractModuleInfo(video.title)

    if (!moduleMap.has(moduleNumber)) {
      moduleMap.set(moduleNumber, {
        title: `Módulo ${moduleNumber}: ${moduleTitle}`,
        videos: [],
      })
    }

    moduleMap.get(moduleNumber)?.videos.push(video)
  })

  // Ordena os módulos por número e os vídeos por posição na playlist
  const modules = Array.from(moduleMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([_, module]) => ({
      ...module,
      videos: module.videos.sort((a, b) => a.position - b.position),
    }))

  return modules
}
