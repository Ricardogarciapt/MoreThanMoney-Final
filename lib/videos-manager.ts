export interface VideoConfig {
  id: string
  title: string
  description: string
  location: string
  youtubeUrl: string
  embedUrl: string
  thumbnail: string
  active: boolean
  lastUpdated: string
}

// Configurações padrão dos vídeos
const defaultVideos: VideoConfig[] = [
  {
    id: "home-scanner-intro",
    title: "Conhece tudo sobre os Scanner's",
    description: "Vídeo de introdução aos scanners na página inicial",
    location: "home-scanner-section",
    youtubeUrl: "https://youtube.com/shorts/ILjVnVMPjRE?si=Tt18wqfvMUMpH9AS",
    embedUrl: "https://www.youtube.com/embed/ILjVnVMPjRE",
    thumbnail: "https://img.youtube.com/vi/ILjVnVMPjRE/hqdefault.jpg",
    active: true,
    lastUpdated: new Date().toISOString(),
  },
  {
    id: "new-landing-presentation",
    title: "Apresentação MoreThanMoney",
    description: "Vídeo de apresentação na página new-landing",
    location: "new-landing-intro",
    youtubeUrl: "https://youtu.be/7Ip2w9bKxVw",
    embedUrl: "https://www.youtube.com/embed/7Ip2w9bKxVw",
    thumbnail: "https://img.youtube.com/vi/7Ip2w9bKxVw/hqdefault.jpg",
    active: true,
    lastUpdated: new Date().toISOString(),
  },
  {
    id: "jifu-education-intro",
    title: "JIFU Education Apresentação",
    description: "Vídeo de apresentação na página JIFU Education",
    location: "jifu-education-page",
    youtubeUrl: "https://youtu.be/iV6M9weCnmA",
    embedUrl: "https://www.youtube.com/embed/iV6M9weCnmA",
    thumbnail: "https://img.youtube.com/vi/iV6M9weCnmA/hqdefault.jpg",
    active: true,
    lastUpdated: new Date().toISOString(),
  },
  {
    id: "scanner-access-section",
    title: "Scanner's MoreThanMoney - Acesso Exclusivo",
    description: "Vídeo de apresentação dos scanners na seção de acesso",
    location: "scanner-access-section",
    youtubeUrl: "https://youtube.com/shorts/ILjVnVMPjRE?si=Tt18wqfvMUMpH9AS",
    embedUrl: "https://www.youtube.com/embed/ILjVnVMPjRE",
    thumbnail: "https://img.youtube.com/vi/ILjVnVMPjRE/hqdefault.jpg",
    active: true,
    lastUpdated: new Date().toISOString(),
  },
  {
    id: "landing-page-main",
    title: "MoreThanMoney - Vídeo Principal",
    description: "Vídeo principal exibido na landing page após clicar em 'Começar Agora'",
    location: "landing-page-main",
    youtubeUrl: "https://youtu.be/dgd0-mLIrMw",
    embedUrl: "https://www.youtube.com/embed/dgd0-mLIrMw?autoplay=1",
    thumbnail: "https://img.youtube.com/vi/dgd0-mLIrMw/hqdefault.jpg",
    active: true,
    lastUpdated: new Date().toISOString(),
  },
  {
    id: "new-landing-scanners",
    title: "Scanners AI MoreThanMoney - Demonstração",
    description: "Vídeo demonstrativo dos scanners AI na seção 'Conhece tudo sobre os scanners'",
    location: "new-landing-scanners-section",
    youtubeUrl: "https://www.youtube.com/watch?v=EEX0EHTTePE",
    embedUrl: "https://www.youtube.com/embed/EEX0EHTTePE",
    thumbnail: "https://img.youtube.com/vi/EEX0EHTTePE/hqdefault.jpg",
    active: true,
    lastUpdated: new Date().toISOString(),
  },
  {
    id: "mtm-registration-modal",
    title: "MTM Registration - Apresentação Completa",
    description: "Vídeo de apresentação para o modal de registro MTM (a partir dos 23 segundos)",
    location: "mtm-registration-modal",
    youtubeUrl: "https://www.youtube.com/watch?v=CUl2_4MTSDo&t=23s",
    embedUrl: "https://www.youtube.com/embed/CUl2_4MTSDo?start=23",
    thumbnail: "https://img.youtube.com/vi/CUl2_4MTSDo/hqdefault.jpg",
    active: true,
    lastUpdated: new Date().toISOString(),
  },
]

// Função para extrair ID do vídeo do YouTube
export function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match && match[1]) {
      return match[1]
    }
  }
  return null
}

// Função para gerar URL de embed
export function generateEmbedUrl(youtubeUrl: string): string {
  const videoId = extractYouTubeVideoId(youtubeUrl)
  return videoId ? `https://www.youtube.com/embed/${videoId}` : ""
}

// Função para gerar URL de thumbnail
export function generateThumbnailUrl(youtubeUrl: string): string {
  const videoId = extractYouTubeVideoId(youtubeUrl)
  return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : ""
}

// Classe para gerenciar vídeos
class VideoManager {
  private videos: VideoConfig[] = []
  private storageKey = "mtm-videos-config"

  constructor() {
    this.loadVideos()
  }

  private loadVideos(): void {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(this.storageKey)
      if (stored) {
        try {
          this.videos = JSON.parse(stored)
        } catch {
          this.videos = [...defaultVideos]
          this.saveVideos()
        }
      } else {
        this.videos = [...defaultVideos]
        this.saveVideos()
      }
    } else {
      this.videos = [...defaultVideos]
    }
  }

  private saveVideos(): void {
    if (typeof window !== "undefined") {
      localStorage.setItem(this.storageKey, JSON.stringify(this.videos))
    }
  }

  getAllVideos(): VideoConfig[] {
    return [...this.videos]
  }

  getVideoByLocation(location: string): VideoConfig | null {
    return this.videos.find((video) => video.location === location && video.active) || null
  }

  getVideoById(id: string): VideoConfig | null {
    return this.videos.find((video) => video.id === id) || null
  }

  updateVideo(id: string, updates: Partial<Omit<VideoConfig, "id" | "lastUpdated">>): boolean {
    const index = this.videos.findIndex((video) => video.id === id)
    if (index === -1) return false

    // Se a URL do YouTube foi alterada, atualizar embed e thumbnail
    if (updates.youtubeUrl) {
      updates.embedUrl = generateEmbedUrl(updates.youtubeUrl)
      updates.thumbnail = generateThumbnailUrl(updates.youtubeUrl)
    }

    this.videos[index] = {
      ...this.videos[index],
      ...updates,
      lastUpdated: new Date().toISOString(),
    }

    this.saveVideos()
    return true
  }

  addVideo(video: Omit<VideoConfig, "id" | "lastUpdated">): string {
    const id = `video-${Date.now()}`
    const newVideo: VideoConfig = {
      ...video,
      id,
      embedUrl: generateEmbedUrl(video.youtubeUrl),
      thumbnail: generateThumbnailUrl(video.youtubeUrl),
      lastUpdated: new Date().toISOString(),
    }

    this.videos.push(newVideo)
    this.saveVideos()
    return id
  }

  deleteVideo(id: string): boolean {
    const index = this.videos.findIndex((video) => video.id === id)
    if (index === -1) return false

    this.videos.splice(index, 1)
    this.saveVideos()
    return true
  }

  resetToDefaults(): void {
    this.videos = [...defaultVideos]
    this.saveVideos()
  }
}

// Instância singleton
export const videoManager = new VideoManager()

// Hooks para React
export function useVideoManager() {
  return {
    getAllVideos: () => videoManager.getAllVideos(),
    getVideoByLocation: (location: string) => videoManager.getVideoByLocation(location),
    getVideoById: (id: string) => videoManager.getVideoById(id),
    updateVideo: (id: string, updates: Partial<Omit<VideoConfig, "id" | "lastUpdated">>) =>
      videoManager.updateVideo(id, updates),
    addVideo: (video: Omit<VideoConfig, "id" | "lastUpdated">) => videoManager.addVideo(video),
    deleteVideo: (id: string) => videoManager.deleteVideo(id),
    resetToDefaults: () => videoManager.resetToDefaults(),
  }
}
