#!/usr/bin/env node
/**
 * VIDEOCLIPER — o braço que corta, no VPS.
 *
 * O site decide; esta máquina faz. Ela é que tem o ffmpeg, o yt-dlp e o disco, e é a única que
 * pode descarregar duas horas de vídeo sem estourar um tempo limite de função serverless.
 *
 * Faz POLL ao site, nunca o contrário: está atrás de NAT, sem porta aberta, e abrir uma para o
 * mundo por causa disto seria a pior parte deste sistema.
 *
 * Dois trabalhos, e o balcão do site decide qual vem primeiro:
 *  · «transcrever» — descarrega o vídeo, extrai o áudio, manda ao ASR com tempos POR PALAVRA.
 *  · «render»      — corta o excerto, faz o 9:16, queima as legendas, sobe e APAGA.
 *
 * ── A REGRA DO DISCO ─────────────────────────────────────────────────────────
 *
 * Nada fica aqui. Cada trabalho corre numa pasta temporária que é apagada no fim, aconteça o
 * que acontecer — e o clipe só é apagado depois de o site CONFIRMAR que gravou o endereço.
 * Apagar assim que o upload devolve 200, sem essa confirmação, era arriscar perder o clipe
 * entre as duas coisas; e o vídeo original pode já não existir para o voltar a cortar.
 */

const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawn } = require("node:child_process")

const API = (process.env.MTM_API_BASE || "https://www.morethanmoney.pt").replace(/\/+$/, "")
const SEGREDO = process.env.LMS_CAPTION_WORKER_SECRET || ""
const ESPERA = Number(process.env.POLL_SECONDS || 20) * 1000
const NOME = process.env.WORKER_NAME || `vps-${os.hostname()}`

/** Groq primeiro: é o mesmo Whisper, com tempos por palavra, e sem custo. */
const ASR_URL = process.env.CAPTION_ASR_URL || "https://api.groq.com/openai/v1/audio/transcriptions"
const ASR_KEY = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || ""
const ASR_MODELO = process.env.CAPTION_ASR_MODEL || "whisper-large-v3-turbo"

const YTDLP = process.env.YTDLP_BIN || "/usr/local/bin/yt-dlp"

/**
 * Os cookies do YouTube, se existirem.
 *
 * O YouTube recusa descargas de IPs de datacenter — «confirma que não és um robô» — e nenhum
 * `player_client` alternativo contorna isso hoje. Um ficheiro de cookies exportado de um browser
 * com sessão resolve, e é a única forma que resta para vídeos que não sejam nossos.
 *
 * As NOSSAS sessões não passam por aqui: são cortadas do ficheiro que já está em /mnt/dvr.
 */
function cookiesDoYoutube() {
  const f = process.env.YOUTUBE_COOKIES_FILE
  return f && fs.existsSync(f) ? ["--cookies", f] : []
}

/**
 * DESCARREGAR um vídeo de um link.
 *
 * Três caminhos, e a ordem importa:
 *
 * 1. Ficheiro DIRECTO (`.mp4`, `.mov`, `.webm`, ou um servidor que diga `video/`): puxa-se com
 *    um pedido normal. Nenhum extractor pelo meio, nada que se possa partir — e é o que serve
 *    para links de Drive partilhados, S3, a nossa própria gaveta, ou o DVR público.
 * 2. Um site que o yt-dlp saiba extrair (Vimeo, Twitch, Facebook, TikTok…). A maioria não tem
 *    verificação de robô e funciona de primeira.
 * 3. YouTube. Recusa o IP do datacenter — «confirma que não és um robô» — e só passa com um
 *    ficheiro de cookies em `YOUTUBE_COOKIES_FILE`.
 *
 * Tentar o directo primeiro poupa o extractor quando ele não é preciso, e é o unico caminho
 * que nao depende de ninguem.
 */
async function descarregarDeLink(url, destino, seccao) {
  const directo = /\.(mp4|mov|m4v|webm)(\?|$)/i.test(url)
  if (directo) {
    log("a puxar ficheiro directo")
    const r = await fetch(url, { redirect: "follow" })
    if (!r.ok) throw new Error(`o link respondeu ${r.status}`)
    const tipo = r.headers.get("content-type") || ""
    if (tipo && !tipo.startsWith("video/") && !tipo.includes("octet-stream")) {
      throw new Error(`o link nao devolveu video (${tipo})`)
    }
    const buf = Buffer.from(new Uint8Array(await r.arrayBuffer()))
    if (buf.length < 100_000) throw new Error("o ficheiro veio vazio ou e demasiado pequeno")
    fs.writeFileSync(destino, buf)
    return
  }

  // Pelo extractor. Os cookies so existem para o YouTube e sao opcionais.
  await correr(YTDLP, [
    "-f", "bv*[height<=1080]+ba/b[height<=1080]/b",
    ...(seccao ? ["--download-sections", seccao, "--force-keyframes-at-cuts"] : []),
    "--merge-output-format", "mp4",
    ...cookiesDoYoutube(),
    "-o", destino,
    url,
  ])
}

const log = (...a) => console.log(new Date().toISOString(), "[videocliper]", ...a)

/* ─────────────────────────────────────────────────────────────────────────────
 * O SHORT VAI DAQUI PARA O YOUTUBE.
 *
 * O site também sabe fazê-lo, mas para isso tinha de descarregar o MP4 da gaveta e voltar a
 * enviá-lo — um vídeo inteiro a atravessar uma função serverless com tecto de memória e de
 * tempo, por nada. O ficheiro já está nesta máquina, e as credenciais do YouTube também: são as
 * mesmas que o worker do DVR usa há meses.
 *
 * A gaveta continua a receber o clipe — o Instagram precisa de um endereço público para ir
 * buscar o Reel, e é lá que o clipe vive depois de sair daqui.
 * ────────────────────────────────────────────────────────────────────────────*/

async function tokenYoutube() {
  const cid = process.env.YOUTUBE_CLIENT_ID
  const secret = process.env.YOUTUBE_CLIENT_SECRET
  const refresh = process.env.YOUTUBE_REFRESH_TOKEN
  if (!cid || !secret || !refresh) throw new Error("credenciais YOUTUBE_* em falta")
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cid, client_secret: secret, refresh_token: refresh, grant_type: "refresh_token" }),
  })
  const j = await r.json().catch(() => ({}))
  if (!j.access_token) throw new Error("nao foi possivel renovar o token do YouTube")
  return j.access_token
}

/** A playlist dos cortes, procurada pelo titulo para nao se criarem dez iguais. */
async function playlistDosCortes(token) {
  const TITULO = "MTM · Cortes"
  try {
    let pagina = ""
    do {
      const r = await fetch(
        `https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=50${pagina ? `&pageToken=${pagina}` : ""}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!r.ok) return null
      const j = await r.json()
      const achada = (j.items || []).find((p) => p.snippet && p.snippet.title === TITULO)
      if (achada) return achada.id
      pagina = j.nextPageToken || ""
    } while (pagina)

    const criada = await fetch("https://www.googleapis.com/youtube/v3/playlists?part=snippet,status", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        snippet: { title: TITULO, description: "Momentos das sessoes ao vivo da More Than Money." },
        status: { privacyStatus: "public" },
      }),
    })
    if (!criada.ok) return null
    return (await criada.json()).id || null
  } catch {
    // Sem playlist o Short publica-se na mesma. Falhar a arrumacao nao trava a publicacao.
    return null
  }
}

async function publicarShort(caminho, titulo, descricao) {
  const token = await tokenYoutube()
  const tamanho = fs.statSync(caminho).size

  const abrir = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "X-Upload-Content-Type": "video/mp4",
      "X-Upload-Content-Length": String(tamanho),
    },
    body: JSON.stringify({
      snippet: {
        // O `#Shorts` no titulo e o que faz o YouTube trata-lo como Short. Nao ha campo para isso.
        title: `${String(titulo).slice(0, 90)} #Shorts`,
        description: String(descricao || "").slice(0, 4900),
        categoryId: "22",
      },
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
    }),
  })
  if (!abrir.ok) throw new Error(`YouTube ${abrir.status}: ${(await abrir.text()).slice(0, 200)}`)

  const destino = abrir.headers.get("location")
  if (!destino) throw new Error("o YouTube nao devolveu destino de upload")

  // O ficheiro sobe em STREAM. Lê-lo todo para memória por causa de um Short de 60s seria
  // desnecessário — e um dia alguem manda um de dez minutos por engano.
  const enviar = await fetch(destino, {
    method: "PUT",
    headers: { "content-type": "video/mp4", "content-length": String(tamanho) },
    body: fs.createReadStream(caminho),
    duplex: "half",
  })
  if (!enviar.ok) throw new Error(`upload ${enviar.status}: ${(await enviar.text()).slice(0, 200)}`)

  const j = await enviar.json()
  if (!j.id) throw new Error("o upload nao devolveu id de video")

  const playlist = await playlistDosCortes(token)
  if (playlist) {
    await fetch("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ snippet: { playlistId: playlist, resourceId: { kind: "youtube#video", videoId: j.id } } }),
    }).catch(() => {})
  }

  return { videoId: j.id, url: `https://www.youtube.com/shorts/${j.id}` }
}

function api(caminho, opcoes = {}) {
  return fetch(`${API}${caminho}`, {
    ...opcoes,
    headers: { "x-caption-secret": SEGREDO, ...(opcoes.headers || {}) },
  })
}

function correr(cmd, args, opcoes = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opcoes })
    let err = ""
    p.stderr.on("data", (d) => { err += d.toString().slice(0, 2000) })
    p.on("error", reject)
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} saiu com ${code}: ${err.slice(-600)}`)),
    )
  })
}

/* ─────────────────────────────────────────────────────────────────────────────
 * LEGENDAS EM ASS — palavra a palavra, ao estilo CapCut.
 *
 * Porquê ASS e não `drawtext`: o karaoke precisa de a palavra falada mudar de cor enquanto as
 * vizinhas ficam brancas, e com `drawtext` isso seria um filtro por palavra — centenas deles
 * numa linha de comando quilométrica que o ffmpeg recusa.
 *
 * Duas a três palavras por ecrã é o que mantém o ritmo. Uma linha cheia obriga a ler em vez de
 * acompanhar, e quem lê deixa de ouvir.
 * ────────────────────────────────────────────────────────────────────────────*/
function construirASS(palavras, estilo) {
  const L = estilo.largura || 1080
  const A = estilo.altura || 1920
  const porEcra = estilo.palavrasPorEcra || 3

  // O ASS mede a margem inferior a partir do fundo; a posição vem de cima.
  const margemBaixo = Math.round(A * (1 - (estilo.posicaoY ?? 0.68)))

  const cor = (hex, prefixo = "&H00") => {
    const h = String(hex || "#FFFFFF").replace("#", "")
    // O ASS escreve as cores em BGR, ao contrário do HTML. Trocar isto dá um amarelo azul.
    return `${prefixo}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`
  }

  const cabecalho = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${L}`,
    `PlayResY: ${A}`,
    "WrapStyle: 2",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: MTM,${estilo.fonte || "Montserrat Black"},${estilo.tamanho || 96},` +
      `${cor(estilo.corBase)},${cor(estilo.corDestaque)},${cor(estilo.contorno)},&H64000000,` +
      `-1,0,0,0,100,100,0,0,1,${estilo.contornoPx || 8},3,2,80,80,${margemBaixo},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ]

  const tempo = (s) => {
    const t = Math.max(0, s)
    const h = Math.floor(t / 3600)
    const m = Math.floor((t % 3600) / 60)
    const seg = t % 60
    return `${h}:${String(m).padStart(2, "0")}:${seg.toFixed(2).padStart(5, "0")}`
  }

  const escapar = (s) => String(s).replace(/[{}\\]/g, "").trim()

  const linhas = []
  for (let i = 0; i < palavras.length; i += porEcra) {
    const grupo = palavras.slice(i, i + porEcra)
    if (!grupo.length) continue
    const inicio = grupo[0].inicio
    const fim = grupo[grupo.length - 1].fim

    // Um evento por PALAVRA do grupo: a que está a ser dita sai a dourado, as outras a branco.
    // O grupo inteiro fica no ecrã o tempo todo — é isso que dá a leitura antecipada.
    for (const p of grupo) {
      const texto = grupo
        .map((g) => (g === p
          ? `{\\c${cor(estilo.corDestaque)}}${escapar(g.palavra)}{\\c${cor(estilo.corBase)}}`
          : escapar(g.palavra)))
        .join(" ")
      linhas.push(`Dialogue: 0,${tempo(p.inicio)},${tempo(p.fim)},MTM,,0,0,0,,${texto}`)
    }
    // Depois da última palavra, o grupo fica mais meio segundo sem destaque — cortar a seco no
    // fim da fala faz a legenda piscar.
    const parado = grupo.map((g) => escapar(g.palavra)).join(" ")
    linhas.push(`Dialogue: 0,${tempo(fim)},${tempo(fim + 0.4)},MTM,,0,0,0,,${parado}`)
  }

  return [...cabecalho, ...linhas].join("\n")
}


/* ─────────────────────────────────────────────────────────────────────────────
 * A-ROLL + B-ROLL
 *
 * O A-roll é a pessoa a falar; o B-roll são imagens de apoio que cobrem o ecrã 2 a 4 segundos
 * enquanto a voz continua — é o que dá ritmo a um clipe e segura quem está a deslizar.
 *
 * As imagens vêm de um gerador GRATUITO (Pollinations, sem chave) e entram com zoom lento
 * (Ken Burns): uma fotografia parada parece um erro, uma que se mexe parece montagem.
 * Uma imagem que não chegue não trava o clipe: esse momento fica com a cara, e segue.
 * ────────────────────────────────────────────────────────────────────────────*/
async function imagensDoBroll(broll, pasta, L, A) {
  // Em PARALELO: o gerador demora o mesmo para uma ou para quatro, e em série eram minutos por
  // clipe à espera da fila dele.
  const resultados = await Promise.all((broll || []).map(async (b, i) => {
    try {
      const prompt = `${b.descricao}, vertical 9:16 cinematic photograph, shallow depth of field, moody natural light, no text, no letters, no logos, no money, no banknotes`
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${Math.round(L / 1.5)}&height=${Math.round(A / 1.5)}&seed=${Math.floor(Math.random() * 1e6)}&nologo=true&model=flux`
      const r = await fetch(url, { signal: AbortSignal.timeout(120_000) })
      if (!r.ok) throw new Error(`gerador ${r.status}`)
      const buf = Buffer.from(new Uint8Array(await r.arrayBuffer()))
      if (buf.length < 4096) throw new Error("imagem vazia")
      const f = path.join(pasta, `broll-${i}.jpg`)
      fs.writeFileSync(f, buf)
      return { ...b, ficheiro: f }
    } catch (e) {
      log("b-roll saltado:", e.message)
      return null
    }
  }))
  return resultados.filter(Boolean)
}

/** Monta os argumentos do ffmpeg: fonte cortada a 9:16, B-roll por cima, legendas no topo. */
function argsDaMontagem({ fonte, recuo, duracao, L, A, ass, broll }) {
  const entradas = ["-ss", String(recuo), "-t", String(duracao), "-i", fonte]
  const partes = [`[0:v]crop='min(iw,ih*9/16)':ih,scale=${L}:${A}:force_original_aspect_ratio=increase,crop=${L}:${A},setsar=1[v0]`]
  let atual = "v0"
  broll.forEach((b, i) => {
    entradas.push("-i", b.ficheiro)
    const dur = Math.max(0.5, b.fim - b.inicio)
    const frames = Math.round(dur * 30)
    partes.push(
      // O gerador gratuito carimba o nome no rodapé: os últimos 8% da imagem ficam de fora.
      `[${i + 1}:v]crop=iw:ih*0.92:0:0,scale=${Math.round(L * 1.25)}:${Math.round(A * 1.25)}:force_original_aspect_ratio=increase,crop=${Math.round(L * 1.25)}:${Math.round(A * 1.25)},` +
      // 1,25× chega para um zoom de 12% sem se ver o píxel — o dobro custava minutos de CPU.
      `zoompan=z='min(zoom+0.0012,1.12)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${L}x${A}:fps=30,` +
      `setsar=1,setpts=PTS-STARTPTS+${b.inicio}/TB[b${i}]`,
      `[${atual}][b${i}]overlay=enable='between(t,${b.inicio},${b.fim})':eof_action=pass[v${i + 1}]`,
    )
    atual = `v${i + 1}`
  })
  partes.push(`[${atual}]ass='${ass.replace(/'/g, "\\'")}'[vout]`)
  return [...entradas, "-filter_complex", partes.join(";"), "-map", "[vout]", "-map", "0:a?"]
}

/* ─────────────────────────────────────────────────────────────────────────────
 * TRANSCREVER
 * ────────────────────────────────────────────────────────────────────────────*/
async function transcrever(trabalho) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vc-"))
  try {
    const video = path.join(tmp, "fonte.mp4")

    await api("/api/videocliper/worker", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resultado: "progresso", jobId: trabalho.jobId, progresso: "a descarregar" }),
    })

    /**
     * O ficheiro LOCAL primeiro.
     *
     * Uma gravação nossa já está nesta máquina, em /mnt/dvr. Mandá-la ao YouTube para a voltar a
     * descarregar era pagar duas viagens por um ficheiro que está ali ao lado — e o YouTube
     * recusa descargas deste IP («confirma que não és um robô»), por ser um datacenter.
     */
    let fonteDoAudio = trabalho.ficheiroLocal
    if (fonteDoAudio && fs.existsSync(fonteDoAudio)) {
      log("a usar a gravação do DVR:", fonteDoAudio)
    } else {
      if (!trabalho.youtubeUrl) throw new Error("sem ficheiro local nem link para descarregar")
      await descarregarDeLink(trabalho.youtubeUrl, video, null)
      fonteDoAudio = video
    }

    const audio = path.join(tmp, "audio.m4a")
    await correr("ffmpeg", ["-y", "-i", fonteDoAudio, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "aac", "-b:a", "64k", audio])

    await api("/api/videocliper/worker", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resultado: "progresso", jobId: trabalho.jobId, progresso: "a transcrever" }),
    })

    const form = new FormData()
    form.append("file", new Blob([fs.readFileSync(audio)]), "audio.m4a")
    form.append("model", (trabalho.asr && trabalho.asr.modelo) || ASR_MODELO)
    if (trabalho.asr && trabalho.asr.prompt) form.append("prompt", String(trabalho.asr.prompt).slice(0, 800))
    form.append("response_format", "verbose_json")
    // ISTO é o ponto todo. Sem tempos por palavra não há legenda a acender palavra a palavra,
    // e o estilo que foi pedido deixa de ser possível.
    form.append("timestamp_granularities[]", "word")
    if (trabalho.idioma) form.append("language", trabalho.idioma)

    const r = await fetch(ASR_URL, { method: "POST", headers: { Authorization: `Bearer ${ASR_KEY}` }, body: form })
    if (!r.ok) throw new Error(`ASR ${r.status}: ${(await r.text()).slice(0, 300)}`)
    const j = await r.json()

    const palavras = (j.words || []).map((w) => ({
      palavra: String(w.word || "").trim(),
      inicio: Number(w.start),
      fim: Number(w.end),
    })).filter((w) => w.palavra && Number.isFinite(w.inicio) && Number.isFinite(w.fim))

    if (!palavras.length) throw new Error("o ASR não devolveu tempos por palavra")

    await api("/api/videocliper/worker", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resultado: "transcricao",
        jobId: trabalho.jobId,
        palavras,
        duracaoSeg: Math.round(Number(j.duration) || palavras[palavras.length - 1].fim),
        titulo: trabalho.titulo || undefined,
      }),
    })
    log(`transcrito: ${palavras.length} palavras`)
  } finally {
    // Acontece o que acontecer, a pasta vai-se. É esta linha que impede o disco de encher.
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * CORTAR
 * ────────────────────────────────────────────────────────────────────────────*/
async function render(trabalho) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vc-"))
  try {
    const duracao = Number(trabalho.fimSeg) - Number(trabalho.inicioSeg)

    // Do disco, quando o ficheiro é nosso: sem descarga, o `-ss` do ffmpeg salta direito ao
    // ponto e o corte demora segundos em vez de minutos.
    let fonte = trabalho.ficheiroLocal
    let recuo = 0
    if (fonte && fs.existsSync(fonte)) {
      recuo = Number(trabalho.inicioSeg)
      log("a cortar da gravação do DVR")
    } else {
      if (!trabalho.youtubeUrl) throw new Error("sem ficheiro local nem link para descarregar")
      fonte = path.join(tmp, "fonte.mp4")
      // `--download-sections` puxa SÓ o pedaço preciso, quando o extractor o permite. Num
      // ficheiro directo nao ha como pedir um pedaco — vem inteiro e o ffmpeg salta la dentro.
      const seccao = `*${Math.max(0, trabalho.inicioSeg - 1)}-${trabalho.fimSeg + 1}`
      const eDirecto = /\.(mp4|mov|m4v|webm)(\?|$)/i.test(trabalho.youtubeUrl)
      await descarregarDeLink(trabalho.youtubeUrl, fonte, eDirecto ? null : seccao)
      // Vindo inteiro, salta-se ao ponto; vindo em pedaço, ele começa um segundo antes.
      recuo = eDirecto ? Number(trabalho.inicioSeg) : 1
    }

    const ass = path.join(tmp, "legendas.ass")
    fs.writeFileSync(ass, construirASS(trabalho.legendas || [], trabalho.estilo || {}), "utf8")

    const saida = path.join(tmp, "clipe.mp4")
    const L = (trabalho.estilo && trabalho.estilo.largura) || 1080
    const A = (trabalho.estilo && trabalho.estilo.altura) || 1920

    /**
     * O 9:16 a partir de um vídeo horizontal.
     *
     * `crop` ao centro e não `pad` com barras: as barras pretas comem metade do ecrã no
     * telemóvel e o clipe parece uma gravação de ecrã. O orador está quase sempre ao centro num
     * enquadramento de sessão — e um corte que engana às vezes é melhor do que barras que
     * estragam sempre.
     */
    const broll = await imagensDoBroll(trabalho.broll, tmp, L, A)
    await correr("ffmpeg", [
      "-y",
      ...argsDaMontagem({ fonte, recuo, duracao, L, A, ass, broll }),
      "-c:v", "libx264", "-preset", "medium", "-crf", "21",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      saida,
    ])

    const capa = path.join(tmp, "capa.jpg")
    await correr("ffmpeg", ["-y", "-ss", "1", "-i", saida, "-frames:v", "1", "-q:v", "3", capa]).catch(() => {})

    log(`clipe pronto: ${(fs.statSync(saida).size / 1024 / 1024).toFixed(1)} MB`)

    // Direto para o storage: pela rota do site o corpo tem tecto de 4,5 MB e um clipe HD passa.
    const videoUrl = await subirDireto(saida, "mp4", "clips")
    const thumbnailUrl = fs.existsSync(capa) ? await subirDireto(capa, "jpg", "clips").catch(() => null) : null

    const up = await api("/api/videocliper/worker", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resultado: "render", clipId: trabalho.clipId, videoUrl, thumbnailUrl }),
    })
    if (!up.ok) throw new Error(`registo do clipe ${up.status}: ${(await up.text()).slice(0, 200)}`)
    const resp = await up.json()

    /**
     * O Short sai daqui, se o trabalho o pedir.
     *
     * Falhar o YouTube NAO estraga o clipe: ele ja esta na gaveta e o Reel do Instagram sai na
     * mesma. Reportar erro aqui punha o clipe inteiro a vermelho por causa de metade.
     */
    if (trabalho.publicarYoutube && process.env.YOUTUBE_REFRESH_TOKEN) {
      try {
        const yt = await publicarShort(saida, trabalho.titulo || "Corte MTM", trabalho.caption || "")
        log("short publicado:", yt.url)
        await api("/api/videocliper/worker", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ resultado: "youtube", clipId: trabalho.clipId, ...yt }),
        })
      } catch (e) {
        log("youtube falhou:", e.message)
        await api("/api/videocliper/worker", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ resultado: "youtube", clipId: trabalho.clipId, erro: e.message }),
        }).catch(() => {})
      }
    }

    /**
     * Só agora se pode apagar.
     *
     * O site confirmou que gravou o endereço. Apagar antes disto era arriscar perder o clipe
     * entre o upload e a escrita — e o excerto do vídeo original já cá não está para o refazer.
     */
    if (!resp.podeApagar) log("o site não confirmou — o ficheiro fica para a próxima passagem")
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

/**
 * Sobe um ficheiro DIRETO para o storage do Supabase por um endereço assinado pedido ao site.
 * Devolve o endereço público.
 */
async function subirDireto(caminho, ext, pasta) {
  const r = await api("/api/videocliper/worker", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ resultado: "upload-url", ext, pasta }),
  })
  if (!r.ok) throw new Error(`upload-url ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const { signedUrl, publicUrl } = await r.json()
  const put = await fetch(signedUrl, {
    method: "PUT",
    headers: { "content-type": ext === "mp4" ? "video/mp4" : "image/jpeg", "x-upsert": "true" },
    body: fs.readFileSync(caminho),
  })
  if (!put.ok) throw new Error(`storage ${put.status}: ${(await put.text()).slice(0, 200)}`)
  return publicUrl
}

/* ─────────────────────────────────────────────────────────────────────────────
 * PRÉ-VISUALIZAR — frame + versão leve de cada clipe proposto
 *
 * Tudo numa pasta temporária que se apaga no fim: nada disto fica no disco do VPS.
 * ────────────────────────────────────────────────────────────────────────────*/
async function previews(trabalho) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vc-prev-"))
  const reportar = (corpo) => api("/api/videocliper/worker", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ resultado: "preview", ...corpo }),
  }).catch(() => {})

  try {
    const local = trabalho.ficheiroLocal && fs.existsSync(trabalho.ficheiroLocal) ? trabalho.ficheiroLocal : null
    const eDirecto = !local && /\.(mp4|mov|m4v|webm)(\?|$)/i.test(trabalho.youtubeUrl || "")

    // Um link directo vem inteiro de uma vez e serve os clips todos.
    let inteiro = local
    if (eDirecto) {
      inteiro = path.join(tmp, "fonte.mp4")
      await descarregarDeLink(trabalho.youtubeUrl, inteiro, null)
    }

    for (const c of trabalho.clips || []) {
      const pasta = fs.mkdtempSync(path.join(tmp, "c-"))
      try {
        const duracao = Number(c.fimSeg) - Number(c.inicioSeg)
        let fonte = inteiro
        let recuo = Number(c.inicioSeg)
        if (!fonte) {
          if (!trabalho.youtubeUrl) throw new Error("sem ficheiro local nem link")
          fonte = path.join(pasta, "fonte.mp4")
          await descarregarDeLink(trabalho.youtubeUrl, fonte, `*${Math.max(0, c.inicioSeg - 1)}-${c.fimSeg + 1}`)
          recuo = 1
        }

        const ass = path.join(pasta, "legendas.ass")
        fs.writeFileSync(ass, construirASS(c.legendas || [], trabalho.estilo || {}), "utf8")
        const L = (trabalho.estilo && trabalho.estilo.largura) || 540
        const A = (trabalho.estilo && trabalho.estilo.altura) || 960

        const saida = path.join(pasta, "preview.mp4")
        const broll = await imagensDoBroll(c.broll, pasta, L, A)
        await correr("ffmpeg", [
          "-y", ...argsDaMontagem({ fonte, recuo, duracao, L, A, ass, broll }),
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "30",
          "-c:a", "aac", "-b:a", "64k", "-ac", "1",
          "-movflags", "+faststart", saida,
        ])

        // O frame vem a 1,5s: já com a primeira legenda no ecrã, como o cartão do painel mostra.
        const frame = path.join(pasta, "frame.jpg")
        await correr("ffmpeg", ["-y", "-ss", String(Math.min(1.5, duracao / 2)), "-i", saida, "-frames:v", "1", "-q:v", "4", frame])

        const previewUrl = await subirDireto(saida, "mp4", "previews")
        const frameUrl = await subirDireto(frame, "jpg", "previews")
        await reportar({ clipId: c.clipId, previewUrl, frameUrl })
        log(`preview ${c.clipId}: ${(fs.statSync(saida).size / 1024 / 1024).toFixed(1)} MB`)
      } catch (e) {
        log("preview falhou:", c.clipId, e.message)
        await reportar({ clipId: c.clipId, erro: e.message })
      } finally {
        fs.rmSync(pasta, { recursive: true, force: true })
      }
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * O CICLO
 * ────────────────────────────────────────────────────────────────────────────*/
async function umaPassagem() {
  const r = await api(`/api/videocliper/worker?worker=${encodeURIComponent(NOME)}`)
  if (!r.ok) { log("balcão devolveu", r.status); return }
  const t = await r.json()
  if (t.tipo === "nada") return

  log("trabalho:", t.tipo, t.jobId || t.clipId)
  try {
    if (t.tipo === "transcrever") await transcrever(t)
    else if (t.tipo === "render") await render(t)
    else if (t.tipo === "previews") await previews(t)
  } catch (e) {
    log("falhou:", e.message)
    // Uma pré-visualização falhada não estraga o vídeo: marca só os clips, não o trabalho.
    if (t.tipo === "previews") {
      for (const c of t.clips || []) {
        await api("/api/videocliper/worker", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ resultado: "preview", clipId: c.clipId, erro: e.message }),
        }).catch(() => {})
      }
      return
    }
    await api("/api/videocliper/worker", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resultado: "erro",
        jobId: t.jobId || null,
        clipId: t.clipId || null,
        erro: e.message,
      }),
    }).catch(() => {})
  }
}

/**
 * Os vídeos que a ponte do Mac trouxe do YouTube ficam em /mnt/dvr/ponte-*.mp4 enquanto se
 * decide que clips cortar. Ao fim de 3 dias saem — o disco não é arquivo de vídeos alheios.
 */
let ultimaLimpeza = 0
function limparPonte() {
  if (Date.now() - ultimaLimpeza < 3600_000) return
  ultimaLimpeza = Date.now()
  try {
    for (const nome of fs.readdirSync("/mnt/dvr")) {
      if (!/^ponte-.*\.mp4$/.test(nome)) continue
      const f = path.join("/mnt/dvr", nome)
      if (Date.now() - fs.statSync(f).mtimeMs > 3 * 24 * 3600_000) {
        fs.rmSync(f, { force: true })
        log("ponte: apagado", nome)
      }
    }
  } catch (e) {
    log("ponte: limpeza falhou:", e.message)
  }
}

async function ciclo() {
  if (!SEGREDO) { console.error("LMS_CAPTION_WORKER_SECRET em falta"); process.exit(1) }
  log(`a correr · ${API} · de ${ESPERA / 1000}s em ${ESPERA / 1000}s`)
  for (;;) {
    limparPonte()
    // Uma passagem que rebenta não pode matar o ciclo: a máquina ficaria parada até alguém dar
    // por isso, e ninguém dá por isso.
    await umaPassagem().catch((e) => log("passagem falhou:", e.message))
    await new Promise((r) => setTimeout(r, ESPERA))
  }
}

ciclo()
