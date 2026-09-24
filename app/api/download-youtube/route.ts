import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface DownloadRequest {
  url: string
  type: 'video' | 'audio' | 'playlist'
  quality?: string
  audioFormat?: string
}

/**
 * API para download de vídeos do YouTube
 * 
 * NOTA IMPORTANTE: Esta é uma implementação de exemplo.
 * Para funcionar em produção, você precisaria:
 * 
 * 1. Instalar yt-dlp ou youtube-dl no servidor
 * 2. Implementar processamento assíncrono (filas)
 * 3. Armazenamento temporário para arquivos
 * 4. Sistema de limpeza automática
 * 5. Rate limiting e proteção contra abuso
 * 6. Respeitar Termos de Serviço do YouTube
 * 
 * Exemplo de instalação do yt-dlp:
 * - npm install youtube-dl-exec
 * - ou usar spawn/exec para chamar binário yt-dlp
 */

export async function POST(request: NextRequest) {
  try {
    const body: DownloadRequest = await request.json()
    const { url, type, quality, audioFormat } = body

    // Validação básica
    if (!url || !url.match(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/)) {
      return NextResponse.json(
        { error: 'URL inválido do YouTube' },
        { status: 400 }
      )
    }

    // Aqui você implementaria a lógica real de download
    // Exemplo com yt-dlp (requer instalação):
    
    /*
    import youtubedl from 'youtube-dl-exec'
    
    const options = {
      format: type === 'audio' ? 'bestaudio' : 'bestvideo+bestaudio',
      output: '/tmp/%(title)s.%(ext)s',
      ...(type === 'audio' && {
        extractAudio: true,
        audioFormat: audioFormat || 'mp3',
        audioQuality: 0
      }),
      ...(quality && quality !== 'best' && {
        format: `bestvideo[height<=${quality.replace('p', '')}]+bestaudio`
      })
    }

    const info = await youtubedl(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true
    })

    // Iniciar download
    await youtubedl(url, options)
    
    return NextResponse.json({
      success: true,
      title: info.title,
      duration: info.duration,
      downloadPath: `/downloads/${info.title}`
    })
    */

    // Implementação de exemplo (simulação)
    console.log('📥 Download solicitado:', { url, type, quality, audioFormat })

    // Simular processamento
    await new Promise(resolve => setTimeout(resolve, 2000))

    return NextResponse.json({
      success: true,
      message: 'Download iniciado com sucesso',
      info: {
        url,
        type,
        quality: quality || 'best',
        format: type === 'audio' ? audioFormat : 'mp4',
        status: 'processing'
      },
      note: 'Esta é uma resposta simulada. Para funcionar de verdade, implemente yt-dlp no backend.'
    })

  } catch (error: any) {
    console.error('❌ Erro no download:', error)
    
    return NextResponse.json(
      { 
        error: 'Erro ao processar download',
        details: error.message 
      },
      { status: 500 }
    )
  }
}

/**
 * Exemplo de implementação real com yt-dlp:
 * 
 * 1. Instalar yt-dlp:
 *    npm install youtube-dl-exec
 * 
 * 2. Usar spawn para controle de processo:
 * 
 * import { spawn } from 'child_process'
 * 
 * const downloadVideo = (url: string, options: any) => {
 *   return new Promise((resolve, reject) => {
 *     const args = [
 *       url,
 *       '-f', options.format,
 *       '-o', options.output,
 *       '--no-warnings',
 *       '--progress'
 *     ]
 * 
 *     if (options.extractAudio) {
 *       args.push('-x', '--audio-format', options.audioFormat)
 *     }
 * 
 *     const ytdlp = spawn('yt-dlp', args)
 * 
 *     ytdlp.stdout.on('data', (data) => {
 *       console.log(`Progresso: ${data}`)
 *     })
 * 
 *     ytdlp.on('close', (code) => {
 *       if (code === 0) resolve(true)
 *       else reject(new Error(`Processo terminou com código ${code}`))
 *     })
 *   })
 * }
 * 
 * 3. Implementar sistema de filas (Bull, BullMQ):
 * 
 * import Queue from 'bull'
 * 
 * const downloadQueue = new Queue('youtube-downloads', {
 *   redis: { host: 'localhost', port: 6379 }
 * })
 * 
 * downloadQueue.process(async (job) => {
 *   const { url, options } = job.data
 *   await downloadVideo(url, options)
 *   return { success: true }
 * })
 */

// Endpoint para verificar status de download
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const jobId = searchParams.get('jobId')

  if (!jobId) {
    return NextResponse.json(
      { error: 'Job ID não fornecido' },
      { status: 400 }
    )
  }

  // A fila de downloads nunca chegou a ser construida (ver o docblock acima).
  // Ate la, esta rota respondia `status: 'completed'` com um `downloadUrl` a
  // apontar para /downloads/exemplo.mp4 — um ficheiro que nao existe em /public.
  // Qualquer cliente que acreditasse na resposta ia bater num 404. Mais vale
  // dizer a verdade: o trabalho nao existe.
  return NextResponse.json(
    {
      jobId,
      status: 'not_implemented',
      error: 'A fila de downloads ainda nao esta implementada.',
    },
    { status: 501 },
  )
}

