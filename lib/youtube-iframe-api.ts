/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Carregador único da IFrame Player API do YouTube.
 *
 * O script só pode entrar na página uma vez, e `onYouTubeIframeAPIReady` é um único slot global —
 * dois carregadores independentes na mesma página tiram-se o ready um ao outro. Por isso há um só,
 * partilhado por todos os leitores (playlist das salas, leitor de introdução).
 */
let promessa: Promise<any> | null = null

export function carregarApiYouTube(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('sem window'))
  const w = window as any
  if (w.YT?.Player) return Promise.resolve(w.YT)
  if (promessa) return promessa

  promessa = new Promise((resolve) => {
    const anterior = w.onYouTubeIframeAPIReady
    w.onYouTubeIframeAPIReady = () => {
      anterior?.()
      resolve(w.YT)
    }
    if (!document.getElementById('yt-iframe-api')) {
      const s = document.createElement('script')
      s.id = 'yt-iframe-api'
      s.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(s)
    }
  })
  return promessa
}
