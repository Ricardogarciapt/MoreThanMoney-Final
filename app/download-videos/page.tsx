'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Download, 
  Youtube, 
  Video, 
  Music, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  List,
  FileVideo,
  FileAudio,
  Sparkles
} from 'lucide-react'
import Link from 'next/link'

type DownloadType = 'video' | 'audio' | 'playlist'
type Quality = '1080p' | '720p' | '480p' | '360p' | 'best'
type AudioFormat = 'mp3' | 'wav' | 'aac' | 'flac'

export default function DownloadVideosPage() {
  const [url, setUrl] = useState('')
  const [downloadType, setDownloadType] = useState<DownloadType>('video')
  const [quality, setQuality] = useState<Quality>('best')
  const [audioFormat, setAudioFormat] = useState<AudioFormat>('mp3')
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleDownload = async () => {
    if (!url.trim()) {
      setError('Por favor, insira um URL válido')
      return
    }

    // Validar se é URL do YouTube
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/
    if (!youtubeRegex.test(url)) {
      setError('Por favor, insira um URL válido do YouTube')
      return
    }

    setIsProcessing(true)
    setError('')
    setSuccess(false)
    setProgress(0)
    setStatus('Processando URL...')

    try {
      // Simular progresso (na implementação real, isso viria do backend)
      const progressSteps = [
        { percent: 20, message: 'Analisando URL...' },
        { percent: 40, message: 'Obtendo informações do vídeo...' },
        { percent: 60, message: 'Preparando download...' },
        { percent: 80, message: 'Processando...' },
        { percent: 100, message: 'Download concluído!' }
      ]

      for (const step of progressSteps) {
        await new Promise(resolve => setTimeout(resolve, 1000))
        setProgress(step.percent)
        setStatus(step.message)
      }

      // Aqui você chamaria a API real de download
      // const response = await fetch('/api/download-youtube', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ url, type: downloadType, quality, audioFormat })
      // })

      setSuccess(true)
      setStatus('Download iniciado! Verifique a pasta de downloads.')

      // Nota: Para implementação real, você precisaria de:
      // 1. Backend API que usa youtube-dl ou yt-dlp
      // 2. Servidor para processar downloads
      // 3. Sistema de filas para múltiplos downloads
      
      console.log('Download simulado:', { url, downloadType, quality, audioFormat })

    } catch (err: any) {
      console.error('Erro no download:', err)
      setError('Erro ao processar download. Tente novamente.')
    } finally {
      setIsProcessing(false)
    }
  }

  const resetForm = () => {
    setUrl('')
    setProgress(0)
    setStatus('')
    setError('')
    setSuccess(false)
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Youtube className="w-12 h-12 text-red-500" />
            <h1 className="text-4xl font-bold text-[#D2A63C]">
              YouTube Downloader
            </h1>
          </div>
          <p className="text-gray-400 text-lg">
            Baixe vídeos, playlists e áudio do YouTube de forma fácil e rápida
          </p>
        </div>

        {/* Main Card */}
        <Card className="bg-gray-900/50 border-[#D2A63C]/30 mb-8">
          <CardHeader>
            <CardTitle className="text-[#D2A63C] flex items-center gap-2">
              <Download className="w-5 h-5" />
              Download de Conteúdo
            </CardTitle>
            <CardDescription className="text-gray-400">
              Cole o URL do YouTube abaixo e escolha suas opções
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* URL Input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                URL do YouTube
              </label>
              <div className="relative">
                <Youtube className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <Input
                  type="text"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isProcessing}
                  className="pl-10 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
                />
              </div>
            </div>

            {/* Download Type */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">
                Tipo de Download
              </label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setDownloadType('video')}
                  disabled={isProcessing}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    downloadType === 'video'
                      ? 'border-[#D2A63C] bg-[#D2A63C]/10'
                      : 'border-gray-700 bg-gray-800 hover:border-[#D2A63C]/50'
                  }`}
                >
                  <FileVideo className="w-6 h-6 mx-auto mb-2" />
                  <p className="text-sm font-semibold">Vídeo</p>
                </button>

                <button
                  onClick={() => setDownloadType('audio')}
                  disabled={isProcessing}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    downloadType === 'audio'
                      ? 'border-[#D2A63C] bg-[#D2A63C]/10'
                      : 'border-gray-700 bg-gray-800 hover:border-[#D2A63C]/50'
                  }`}
                >
                  <FileAudio className="w-6 h-6 mx-auto mb-2" />
                  <p className="text-sm font-semibold">Áudio</p>
                </button>

                <button
                  onClick={() => setDownloadType('playlist')}
                  disabled={isProcessing}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    downloadType === 'playlist'
                      ? 'border-[#D2A63C] bg-[#D2A63C]/10'
                      : 'border-gray-700 bg-gray-800 hover:border-[#D2A63C]/50'
                  }`}
                >
                  <List className="w-6 h-6 mx-auto mb-2" />
                  <p className="text-sm font-semibold">Playlist</p>
                </button>
              </div>
            </div>

            {/* Quality/Format Options */}
            {downloadType === 'video' && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Qualidade do Vídeo
                </label>
                <select
                  value={quality}
                  onChange={(e) => setQuality(e.target.value as Quality)}
                  disabled={isProcessing}
                  className="w-full p-3 rounded-lg bg-gray-800 border border-gray-700 text-white"
                >
                  <option value="best">Melhor Qualidade</option>
                  <option value="1080p">1080p (Full HD)</option>
                  <option value="720p">720p (HD)</option>
                  <option value="480p">480p</option>
                  <option value="360p">360p</option>
                </select>
              </div>
            )}

            {downloadType === 'audio' && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Formato de Áudio
                </label>
                <select
                  value={audioFormat}
                  onChange={(e) => setAudioFormat(e.target.value as AudioFormat)}
                  disabled={isProcessing}
                  className="w-full p-3 rounded-lg bg-gray-800 border border-gray-700 text-white"
                >
                  <option value="mp3">MP3 (Recomendado)</option>
                  <option value="aac">AAC</option>
                  <option value="wav">WAV (Alta Qualidade)</option>
                  <option value="flac">FLAC (Sem Perda)</option>
                </select>
              </div>
            )}

            {/* Progress Bar */}
            {isProcessing && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">{status}</span>
                  <span className="text-[#D2A63C] font-semibold">{progress}%</span>
                </div>
                <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#D2A63C] to-[#BB8525] transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Alerts */}
            {error && (
              <Alert className="bg-red-500/20 border-red-500/50">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <AlertDescription className="text-red-200">{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="bg-green-500/20 border-green-500/50">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <AlertDescription className="text-green-200">{status}</AlertDescription>
              </Alert>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              {!success ? (
                <Button
                  onClick={handleDownload}
                  disabled={isProcessing || !url}
                  className="flex-1 bg-gradient-to-r from-[#D2A63C] to-[#BB8525] hover:from-[#BB8525] hover:to-[#D2A63C] text-black font-semibold"
                  size="lg"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5 mr-2" />
                      Baixar Agora
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={resetForm}
                  className="flex-1 bg-gradient-to-r from-[#D2A63C] to-[#BB8525] hover:from-[#BB8525] hover:to-[#D2A63C] text-black font-semibold"
                  size="lg"
                >
                  <Sparkles className="w-5 h-5 mr-2" />
                  Novo Download
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <Card className="bg-gray-900/50 border-gray-700">
            <CardContent className="pt-6 text-center">
              <Video className="w-8 h-8 text-[#D2A63C] mx-auto mb-3" />
              <h3 className="font-semibold mb-2">Alta Qualidade</h3>
              <p className="text-sm text-gray-400">
                Baixe vídeos em até 1080p Full HD
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900/50 border-gray-700">
            <CardContent className="pt-6 text-center">
              <Music className="w-8 h-8 text-[#D2A63C] mx-auto mb-3" />
              <h3 className="font-semibold mb-2">Múltiplos Formatos</h3>
              <p className="text-sm text-gray-400">
                Converta para MP3, AAC, WAV e mais
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900/50 border-gray-700">
            <CardContent className="pt-6 text-center">
              <List className="w-8 h-8 text-[#D2A63C] mx-auto mb-3" />
              <h3 className="font-semibold mb-2">Playlists Completas</h3>
              <p className="text-sm text-gray-400">
                Baixe playlists inteiras de uma vez
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Important Note */}
        <Alert className="bg-blue-500/10 border-blue-500/30">
          <AlertCircle className="h-4 w-4 text-blue-400" />
          <AlertDescription className="text-blue-200">
            <strong>Nota Importante:</strong> Esta é uma demonstração da interface. Para funcionar completamente, 
            é necessário implementar um backend com ferramentas como <code className="bg-blue-500/20 px-1 rounded">yt-dlp</code> ou 
            <code className="bg-blue-500/20 px-1 rounded">youtube-dl</code>. Certifique-se de respeitar os Termos de Serviço do YouTube 
            e as leis de direitos autorais ao usar esta ferramenta.
          </AlertDescription>
        </Alert>

        {/* Back Link */}
        <div className="text-center mt-8">
          <Link href="/new-landing" className="text-sm text-gray-400 hover:text-[#D2A63C]">
            ← Voltar à página inicial
          </Link>
        </div>
      </div>
    </div>
  )
}

