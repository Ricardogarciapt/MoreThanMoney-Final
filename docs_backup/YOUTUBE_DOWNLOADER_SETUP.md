# 📥 YouTube Downloader - Guia de Implementação Completa

## 🎯 Visão Geral

Este guia explica como implementar completamente o sistema de download de vídeos do YouTube, inspirado no projeto [YoutubePlaylistDownloader](https://github.com/shaked6540/YoutubePlaylistDownloader).

## ✅ O Que Já Está Implementado

- ✅ Interface de usuário completa e responsiva
- ✅ Seleção de tipo (Vídeo, Áudio, Playlist)
- ✅ Opções de qualidade e formato
- ✅ Barra de progresso animada
- ✅ Sistema de alertas e feedback
- ✅ API endpoint estruturado (`/api/download-youtube`)

## ⚠️ O Que Precisa Ser Implementado

### 1. Backend com yt-dlp

**Instalar yt-dlp no servidor:**

```bash
# Opção 1: Via pip (Python)
pip install yt-dlp

# Opção 2: Via npm (wrapper Node.js)
npm install youtube-dl-exec

# Opção 3: Binário direto
# Download: https://github.com/yt-dlp/yt-dlp/releases
```

### 2. Dependências Node.js Necessárias

```bash
npm install youtube-dl-exec
npm install bull bull-board  # Para sistema de filas
npm install redis            # Para armazenamento de filas
```

### 3. Configuração do Redis (para filas)

```bash
# Instalar Redis
# macOS
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt-get install redis-server
sudo systemctl start redis

# Docker
docker run -d -p 6379:6379 redis:alpine
```

### 4. Implementação da API Real

**Atualizar `/app/api/download-youtube/route.ts`:**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import youtubedl from 'youtube-dl-exec'
import Queue from 'bull'
import path from 'path'
import fs from 'fs'

// Criar fila de downloads
const downloadQueue = new Queue('youtube-downloads', {
  redis: { host: 'localhost', port: 6379 }
})

// Processar downloads na fila
downloadQueue.process(async (job) => {
  const { url, type, quality, audioFormat, outputPath } = job.data
  
  const options: any = {
    output: outputPath,
    format: type === 'audio' ? 'bestaudio' : 'bestvideo+bestaudio/best',
    noCheckCertificates: true,
    noWarnings: true,
    preferFreeFormats: true,
  }

  if (type === 'audio') {
    options.extractAudio = true
    options.audioFormat = audioFormat || 'mp3'
    options.audioQuality = 0
  }

  if (quality && quality !== 'best') {
    const height = quality.replace('p', '')
    options.format = `bestvideo[height<=${height}]+bestaudio/best`
  }

  // Atualizar progresso
  job.progress(50)

  await youtubedl(url, options)

  job.progress(100)

  return { success: true, outputPath }
})

export async function POST(request: NextRequest) {
  try {
    const { url, type, quality, audioFormat } = await request.json()

    // Validar URL
    if (!url.match(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/)) {
      return NextResponse.json(
        { error: 'URL inválido do YouTube' },
        { status: 400 }
      )
    }

    // Obter informações do vídeo
    const info = await youtubedl(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
    })

    // Criar pasta de downloads se não existir
    const downloadsDir = path.join(process.cwd(), 'public', 'downloads')
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true })
    }

    // Definir caminho de saída
    const fileName = `${info.id}.${type === 'audio' ? audioFormat || 'mp3' : 'mp4'}`
    const outputPath = path.join(downloadsDir, fileName)

    // Adicionar à fila
    const job = await downloadQueue.add({
      url,
      type,
      quality,
      audioFormat,
      outputPath,
    })

    return NextResponse.json({
      success: true,
      jobId: job.id,
      title: info.title,
      duration: info.duration,
      thumbnail: info.thumbnail,
    })

  } catch (error: any) {
    console.error('Erro no download:', error)
    return NextResponse.json(
      { error: 'Erro ao processar download', details: error.message },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get('jobId')

  if (!jobId) {
    return NextResponse.json({ error: 'Job ID não fornecido' }, { status: 400 })
  }

  const job = await downloadQueue.getJob(jobId)

  if (!job) {
    return NextResponse.json({ error: 'Job não encontrado' }, { status: 404 })
  }

  const state = await job.getState()
  const progress = job.progress()

  return NextResponse.json({
    jobId,
    status: state,
    progress,
    ...(state === 'completed' && {
      downloadUrl: `/downloads/${path.basename(job.returnvalue.outputPath)}`
    })
  })
}
```

### 5. Atualizar Frontend para Usar API Real

**Atualizar `/app/download-videos/page.tsx`:**

```typescript
const handleDownload = async () => {
  // ... validações ...

  try {
    setIsProcessing(true)
    setStatus('Iniciando download...')

    // Chamar API
    const response = await fetch('/api/download-youtube', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, type: downloadType, quality, audioFormat })
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Erro no download')
    }

    // Monitorar progresso
    const jobId = data.jobId
    const interval = setInterval(async () => {
      const statusRes = await fetch(`/api/download-youtube?jobId=${jobId}`)
      const statusData = await statusRes.json()

      setProgress(statusData.progress)
      setStatus(`Processando... ${statusData.progress}%`)

      if (statusData.status === 'completed') {
        clearInterval(interval)
        setSuccess(true)
        
        // Iniciar download no navegador
        const link = document.createElement('a')
        link.href = statusData.downloadUrl
        link.download = ''
        link.click()
        
        setStatus('Download concluído!')
      }
    }, 1000)

  } catch (err: any) {
    setError(err.message)
  } finally {
    setIsProcessing(false)
  }
}
```

### 6. Sistema de Limpeza Automática

**Criar `/scripts/cleanup-downloads.ts`:**

```typescript
import fs from 'fs'
import path from 'path'

const DOWNLOADS_DIR = path.join(process.cwd(), 'public', 'downloads')
const MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 horas

export function cleanupOldDownloads() {
  if (!fs.existsSync(DOWNLOADS_DIR)) return

  const files = fs.readdirSync(DOWNLOADS_DIR)
  const now = Date.now()

  files.forEach(file => {
    const filePath = path.join(DOWNLOADS_DIR, file)
    const stats = fs.statSync(filePath)
    const age = now - stats.mtimeMs

    if (age > MAX_AGE_MS) {
      fs.unlinkSync(filePath)
      console.log(`🗑️ Arquivo removido: ${file}`)
    }
  })
}

// Executar a cada hora
setInterval(cleanupOldDownloads, 60 * 60 * 1000)
```

### 7. Rate Limiting

**Atualizar middleware.ts:**

```typescript
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 h'), // 10 downloads por hora
})

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/download-youtube')) {
    const ip = request.ip ?? '127.0.0.1'
    const { success } = await ratelimit.limit(ip)

    if (!success) {
      return NextResponse.json(
        { error: 'Limite de downloads excedido. Tente novamente mais tarde.' },
        { status: 429 }
      )
    }
  }

  return NextResponse.next()
}
```

## 📋 Checklist de Implementação

- [ ] Instalar yt-dlp no servidor
- [ ] Instalar dependências npm (youtube-dl-exec, bull, redis)
- [ ] Configurar Redis
- [ ] Implementar API real de download
- [ ] Implementar sistema de filas
- [ ] Atualizar frontend para usar API real
- [ ] Implementar limpeza automática de arquivos
- [ ] Implementar rate limiting
- [ ] Adicionar logs e monitoramento
- [ ] Testar com vídeos, áudios e playlists
- [ ] Configurar HTTPS (obrigatório para produção)
- [ ] Adicionar termos de uso e disclaimer

## ⚖️ Considerações Legais

**IMPORTANTE:** Antes de implementar em produção:

1. ✅ Respeite os Termos de Serviço do YouTube
2. ✅ Não permita download de conteúdo protegido por direitos autorais
3. ✅ Adicione disclaimer sobre uso pessoal apenas
4. ✅ Implemente verificação de idade para conteúdo restrito
5. ✅ Considere pedir permissão aos criadores de conteúdo

## 🚀 Deploy em Produção

### Vercel (Não Recomendado para Downloads Pesados)
- Limite de 50MB por arquivo
- Timeout de 10 segundos (Hobby) / 60 segundos (Pro)

### Melhor Opção: VPS/Servidor Dedicado
```bash
# Exemplo com PM2
npm install -g pm2
pm2 start npm --name "youtube-downloader" -- start
pm2 startup
pm2 save
```

### Docker (Recomendado)
```dockerfile
FROM node:18-alpine

RUN apk add --no-cache python3 py3-pip ffmpeg

RUN pip3 install yt-dlp

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
```

## 📊 Monitoramento

- Use Bull Board para visualizar filas: `http://localhost:3000/admin/queues`
- Configure logs com Winston ou Pino
- Monitore uso de disco (downloads podem ocupar muito espaço)

## 🎯 Funcionalidades Adicionais Sugeridas

1. **Histórico de Downloads** - Salvar no banco de dados
2. **Conversão de Formato** - Usar FFmpeg
3. **Download de Canal Completo** - Iterar sobre vídeos
4. **Legendas** - Baixar .srt/.vtt
5. **Miniaturas** - Extrair thumbnails
6. **Metadados** - Adicionar tags ID3

## 📚 Recursos

- [yt-dlp Documentation](https://github.com/yt-dlp/yt-dlp)
- [youtube-dl-exec npm](https://www.npmjs.com/package/youtube-dl-exec)
- [Bull Queue](https://optimalbits.github.io/bull/)
- [FFmpeg](https://ffmpeg.org/)

---

**Página criada:** `/download-videos`  
**API criada:** `/api/download-youtube`

Para acessar: **http://localhost:3002/download-videos**

