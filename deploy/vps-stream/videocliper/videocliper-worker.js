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

const log = (...a) => console.log(new Date().toISOString(), "[videocliper]", ...a)

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
      // `bv*+ba/b` com tecto de 720p: o que interessa é o ÁUDIO para transcrever. Puxar 4K de
      // uma sessão de duas horas enche o disco por nada.
      await correr(YTDLP, [
        "-f", "bv*[height<=720]+ba/b[height<=720]/b",
        "--merge-output-format", "mp4",
        ...cookiesDoYoutube(),
        "-o", video,
        trabalho.youtubeUrl,
      ])
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
    form.append("model", ASR_MODELO)
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
      // `--download-sections` descarrega SÓ o pedaço preciso. Puxar o vídeo inteiro para cortar
      // trinta segundos é minutos de espera e gigabytes de disco por clipe.
      await correr(YTDLP, [
        "-f", "bv*[height<=1080]+ba/b",
        "--download-sections", `*${Math.max(0, trabalho.inicioSeg - 1)}-${trabalho.fimSeg + 1}`,
        "--force-keyframes-at-cuts",
        "--merge-output-format", "mp4",
        ...cookiesDoYoutube(),
        "-o", fonte,
        trabalho.youtubeUrl,
      ])
      // O pedaço descarregado começa um segundo antes do ponto pedido.
      recuo = 1
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
    await correr("ffmpeg", [
      "-y",
      "-ss", String(recuo), "-t", String(duracao),
      "-i", fonte,
      "-vf",
      `crop='min(iw,ih*9/16)':ih,scale=${L}:${A}:force_original_aspect_ratio=increase,crop=${L}:${A},ass='${ass.replace(/'/g, "\\'")}'`,
      "-c:v", "libx264", "-preset", "medium", "-crf", "21",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      saida,
    ])

    const capa = path.join(tmp, "capa.jpg")
    await correr("ffmpeg", ["-y", "-ss", "1", "-i", saida, "-frames:v", "1", "-q:v", "3", capa]).catch(() => {})

    const bytes = fs.readFileSync(saida)
    log(`clipe pronto: ${(bytes.length / 1024 / 1024).toFixed(1)} MB`)

    const fd = new FormData()
    fd.append("clipId", trabalho.clipId)
    fd.append("video", new Blob([bytes], { type: "video/mp4" }), "clipe.mp4")
    if (fs.existsSync(capa)) fd.append("capa", new Blob([fs.readFileSync(capa)], { type: "image/jpeg" }), "capa.jpg")

    const up = await api("/api/videocliper/upload", { method: "POST", body: fd })
    if (!up.ok) throw new Error(`upload ${up.status}: ${(await up.text()).slice(0, 200)}`)
    const resp = await up.json()

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
  } catch (e) {
    log("falhou:", e.message)
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

async function ciclo() {
  if (!SEGREDO) { console.error("LMS_CAPTION_WORKER_SECRET em falta"); process.exit(1) }
  log(`a correr · ${API} · de ${ESPERA / 1000}s em ${ESPERA / 1000}s`)
  for (;;) {
    // Uma passagem que rebenta não pode matar o ciclo: a máquina ficaria parada até alguém dar
    // por isso, e ninguém dá por isso.
    await umaPassagem().catch((e) => log("passagem falhou:", e.message))
    await new Promise((r) => setTimeout(r, ESPERA))
  }
}

ciclo()
