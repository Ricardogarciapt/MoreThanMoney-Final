"use client"

interface YouTubePlayerProps {
  videoId: string
  title?: string
  autoplay?: boolean
  controls?: boolean
  className?: string
}

export default function YouTubePlayer({
  videoId,
  title = "Video",
  autoplay = false,
  controls = true,
  className = ""
}: YouTubePlayerProps) {
  // Extrair ID do vídeo se for uma URL completa
  const extractVideoId = (input: string): string => {
    if (input.includes('youtube.com') || input.includes('youtu.be')) {
      const urlParams = new URLSearchParams(input.split('?')[1])
      return urlParams.get('v') || input.split('/').pop()?.split('?')[0] || input
    }
    return input
  }

  const cleanVideoId = extractVideoId(videoId)
  
  // Parâmetros otimizados para esconder branding do YouTube
  const params = new URLSearchParams({
    autoplay: autoplay ? '1' : '0',
    controls: controls ? '1' : '0',
    showinfo: '0',
    rel: '0',
    modestbranding: '1',
    iv_load_policy: '3',
    fs: '1',
    playsinline: '1',
    enablejsapi: '1'
  })

  const embedUrl = `https://www.youtube.com/embed/${cleanVideoId}?${params.toString()}`

  return (
    <div className={`video-container ${className}`}>
      <iframe
        src={embedUrl}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        className="absolute inset-0 w-full h-full"
        style={{ border: 'none' }}
      />
    </div>
  )
}

// Componente para vídeo com playlist
interface YouTubePlaylistPlayerProps {
  videoId: string
  playlistId?: string
  title?: string
  autoplay?: boolean
  controls?: boolean
  className?: string
}

export function YouTubePlaylistPlayer({
  videoId,
  playlistId,
  title = "Video",
  autoplay = false,
  controls = true,
  className = ""
}: YouTubePlaylistPlayerProps) {
  const params = new URLSearchParams({
    autoplay: autoplay ? '1' : '0',
    controls: controls ? '1' : '0',
    showinfo: '0',
    rel: '0',
    modestbranding: '1',
    iv_load_policy: '3',
    fs: '1',
    playsinline: '1',
    enablejsapi: '1'
  })

  if (playlistId) {
    params.append('list', playlistId)
  }

  const embedUrl = `https://www.youtube.com/embed/${videoId}?${params.toString()}`

  return (
    <div className={`video-container ${className}`}>
      <iframe
        src={embedUrl}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        className="absolute inset-0 w-full h-full"
        style={{ border: 'none' }}
      />
    </div>
  )
}
