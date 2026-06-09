import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface VideoLink {
  id: string
  title: string
  description: string
  youtubeUrl: string
  location: string
  thumbnail?: string
  active: boolean
  lastUpdated: string
}

interface VideoStore {
  videos: VideoLink[]
  addVideo: (video: Omit<VideoLink, "id" | "lastUpdated">) => void
  updateVideo: (id: string, video: Partial<Omit<VideoLink, "id" | "lastUpdated">>) => void
  deleteVideo: (id: string) => void
  getVideoByLocation: (location: string) => VideoLink | undefined
}

// Dados iniciais para os vídeos
const initialVideos: VideoLink[] = [
  {
    id: "scanner-intro",
    title: "Conhece tudo sobre os Scanner's",
    description: "Vídeo de introdução aos scanners MTM",
    youtubeUrl: "https://youtube.com/shorts/ILjVnVMPjRE?si=Tt18wqfvMUMpH9AS",
    location: "home-scanner-intro",
    active: true,
    lastUpdated: new Date().toISOString(),
  },
  {
    id: "landing-presentation",
    title: "Apresentação MoreThanMoney",
    description: "Vídeo de apresentação principal",
    youtubeUrl: "https://youtu.be/7Ip2w9bKxVw",
    location: "new-landing-presentation",
    active: true,
    lastUpdated: new Date().toISOString(),
  },
  {
    id: "jifu-education",
    title: "JIFU Education",
    description: "Vídeo sobre a plataforma educacional JIFU",
    youtubeUrl: "https://youtu.be/iV6M9weCnmA",
    location: "jifu-education-intro",
    active: true,
    lastUpdated: new Date().toISOString(),
  },
]

// Função para extrair o ID do vídeo do YouTube de uma URL
export function extractYoutubeVideoId(url: string): string | null {
  // Padrão para URLs padrão do YouTube
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/
  const match = url.match(regExp)

  // Padrão para URLs de shorts do YouTube
  const shortsRegExp = /^.*(youtube.com\/shorts\/)([^#&?]*).*/
  const shortsMatch = url.match(shortsRegExp)

  return match && match[2].length === 11
    ? match[2]
    : shortsMatch && shortsMatch[2].length === 11
      ? shortsMatch[2]
      : null
}

// Função para gerar uma URL de thumbnail do YouTube
export function getYoutubeThumbnail(url: string): string {
  const videoId = extractYoutubeVideoId(url)
  return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : ""
}

// Função para converter URL do YouTube para URL de incorporação
export function getYoutubeEmbedUrl(url: string): string {
  const videoId = extractYoutubeVideoId(url)
  return videoId ? `https://www.youtube.com/embed/${videoId}` : ""
}

// Criar a store com persistência
export const useVideoStore = create(
  persist<VideoStore>(
    (set, get) => ({
      videos: initialVideos,
      addVideo: (video) => {
        const newVideo: VideoLink = {
          ...video,
          id: `video-${Date.now()}`,
          lastUpdated: new Date().toISOString(),
        }
        set((state) => ({
          videos: [...state.videos, newVideo],
        }))
      },
      updateVideo: (id, videoUpdate) => {
        set((state) => ({
          videos: state.videos.map((video) =>
            video.id === id
              ? {
                  ...video,
                  ...videoUpdate,
                  lastUpdated: new Date().toISOString(),
                }
              : video,
          ),
        }))
      },
      deleteVideo: (id) => {
        set((state) => ({
          videos: state.videos.filter((video) => video.id !== id),
        }))
      },
      getVideoByLocation: (location) => {
        return get().videos.find((video) => video.location === location && video.active)
      },
    }),
    {
      name: "videos-storage",
    },
  ),
)

// Função para obter um vídeo por localização
export function getVideoByLocation(location: string): VideoLink | undefined {
  // Se estiver no servidor, retorna undefined
  if (typeof window === "undefined") {
    return initialVideos.find((video) => video.location === location)
  }

  // Se estiver no cliente, tenta obter do store
  return useVideoStore.getState().getVideoByLocation(location)
}

// Função para atualizar um vídeo
export function updateVideo(id: string, videoUpdate: Partial<Omit<VideoLink, "id" | "lastUpdated">>): void {
  useVideoStore.getState().updateVideo(id, videoUpdate)
}
