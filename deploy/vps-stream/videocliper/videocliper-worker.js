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
 * LEGENDAS EM ASS — palavra a palavra, ao estilo Captions / CapCut.
 *
 * Porquê ASS e não `drawtext`: o karaoke precisa de a palavra falada mudar de cor enquanto as
 * vizinhas ficam brancas, e com `drawtext` isso seria um filtro por palavra — centenas deles
 * numa linha de comando quilométrica que o ffmpeg recusa.
 *
 * Duas a três palavras por ecrã é o que mantém o ritmo. Uma linha cheia obriga a ler em vez de
 * acompanhar, e quem lê deixa de ouvir.
 *
 * O ESTILO vem do site (lib/videocliper/estilos.ts). Os efeitos só ligam quando o estilo traz
 * `efeitos`: um trabalho de um site antigo continua a sair com a legenda simples de sempre.
 * ────────────────────────────────────────────────────────────────────────────*/

/** A pasta das fontes que viajam com o worker (Anton não existe no sistema do VPS). */
const PASTA_FONTES = path.join(__dirname, "fonts")

/** Comparar palavras sem acentos, maiúsculas nem pontuação: «Risco,» e «risco» são a mesma. */
const normalizar = (s) => String(s || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9%]/g, "")

/**
 * Parte as palavras em ECRÃS.
 *
 * Um ecrã fecha quando: chega às N palavras, a linha passaria dos 80% da largura, há uma pausa
 * na fala, ou a frase acaba. Uma palavra-chave fica SOZINHA no seu ecrã, maior e na cor de
 * ênfase — é o que o olho apanha mesmo sem som.
 *
 * Usado pela legenda E pelo zoom: o punch-in cai em cima do mesmo momento em que a palavra-chave
 * aparece.
 */
function ecrasDaLegenda(palavras, estilo, enfase) {
  const L = estilo.largura || 1080
  const tam = estilo.tamanho || 96
  const porEcra = estilo.palavrasPorEcra || 3
  const fator = estilo.fatorLargura || 0.45
  const limite = (estilo.larguraMaxima || 0.8) * L
  const maius = estilo.maiusculas !== false

  const chaves = new Map()
  for (const e of enfase || []) {
    const n = normalizar(e && e.palavra)
    if (n && !chaves.has(n)) chaves.set(n, e)
  }
  const usadas = new Set()

  const texto = (p) => {
    // Vírgulas e pontos finais saem: numa legenda de ecrã lêem-se como gralha. «?» e «!» ficam.
    const t = String(p.palavra || "").replace(/[{}\\]/g, "").trim().replace(/[.,;:…]+$/, "")
    return maius ? t.toLocaleUpperCase("pt-PT") : t
  }
  const largura = (ws, escala = 1) =>
    ws.reduce((s, w) => s + texto(w).length, 0) * tam * fator * escala + Math.max(0, ws.length - 1) * tam * fator * 0.55 * escala

  const ecras = []
  let atual = []
  const fechar = () => { if (atual.length) ecras.push({ palavras: atual, enfase: null }); atual = [] }

  for (const p of palavras || []) {
    if (!texto(p)) continue
    const n = normalizar(p.palavra)
    // Só a PRIMEIRA vez que a palavra-chave é dita: repetida cinco vezes a grande deixava de ser
    // ênfase e passava a ruído.
    if (chaves.has(n) && !usadas.has(n)) {
      usadas.add(n)
      fechar()
      ecras.push({ palavras: [p], enfase: chaves.get(n) })
      continue
    }
    const ultimo = atual[atual.length - 1]
    const pausa = ultimo ? p.inicio - ultimo.fim : 0
    if (atual.length >= porEcra || pausa > 0.6 || (atual.length && largura([...atual, p]) > limite)) fechar()
    atual.push(p)
    if (/[.!?…]$/.test(String(p.palavra).trim())) fechar()
  }
  fechar()

  for (const e of ecras) {
    e.inicio = e.palavras[0].inicio
    e.fim = e.palavras[e.palavras.length - 1].fim
    const escala = e.enfase ? (estilo.escalaEnfase || 1.3) : 1
    // O que não cabe encolhe. Uma palavra comprida («responsabilidade») sozinha no ecrã passava
    // das margens e era cortada pelo telemóvel.
    e.ajuste = Math.min(1, limite / Math.max(1, largura(e.palavras, escala * (estilo.escalaActiva || 1))))
    e.texto = e.palavras.map(texto)
  }
  return ecras
}

function construirASS(palavras, estilo, extras = {}) {
  const L = estilo.largura || 1080
  const A = estilo.altura || 1920
  const ef = estilo.efeitos || {}
  const tam = estilo.tamanho || 96
  const k = L / 1080

  const cor = (hex, prefixo = "&H00") => {
    const h = String(hex || "#FFFFFF").replace("#", "")
    // O ASS escreve as cores em BGR, ao contrário do HTML. Trocar isto dá um amarelo azul.
    return `${prefixo}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase()
  }
  const tag = (hex) => `&H${String(hex || "#FFFFFF").replace("#", "").replace(/^(..)(..)(..)$/, "$3$2$1")}&`.toUpperCase()

  const fonte = estilo.fonte || "Montserrat Black"
  const italico = estilo.italico ? -1 : 0
  const contornoPx = estilo.contornoPx || 8
  const sombraPx = estilo.sombraPx ?? 3

  const cabecalho = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${L}`,
    `PlayResY: ${A}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: MTM,${fonte},${tam},${cor(estilo.corBase)},${cor(estilo.corDestaque)},${cor(estilo.contorno)},&H78000000,` +
      `-1,${italico},0,0,100,100,0,0,1,${contornoPx},${sombraPx},5,0,0,0,1`,
    // O gancho: caixa cheia na cor de acento (BorderStyle 3 — a «borda» é a caixa), texto por dentro.
    `Style: Gancho,${fonte},${Math.round(tam * 0.7)},${cor(estilo.corTextoGancho || "#FFFFFF")},${cor(estilo.corTextoGancho || "#FFFFFF")},${cor(estilo.corAcento || estilo.corDestaque)},&H64000000,` +
      `-1,${italico},0,0,100,100,0,0,3,${Math.round(tam * 0.16)},0,5,0,0,0,1`,
    `Style: Assinatura,${fonte},${Math.round(tam * 0.22)},&H40FFFFFF,&H40FFFFFF,&H80000000,&H00000000,` +
      `0,0,0,0,100,100,${(1.5 * k).toFixed(1)},0,1,${Math.max(1, Math.round(2 * k))},0,5,0,0,0,1`,
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

  const linhas = []
  const cx = Math.round(L / 2)
  const cy = Math.round(A * (estilo.posicaoY ?? 0.68))

  // ── as legendas ─────────────────────────────────────────────────────────────
  const ecras = ecrasDaLegenda(palavras, estilo, extras.enfase)
  ecras.forEach((e, ie) => {
    const seguinte = ecras[ie + 1]
    // O ecrã fica até o próximo começar (no máximo +0,4s): cortar a seco no fim da fala faz a
    // legenda piscar, e passar por cima do próximo punha duas linhas uma em cima da outra.
    const fimVisivel = seguinte ? Math.min(e.fim + 0.4, Math.max(e.fim, seguinte.inicio)) : e.fim + 0.4
    const escalaBase = 100 * e.ajuste * (e.enfase ? (estilo.escalaEnfase || 1.3) : 1)

    e.palavras.forEach((p, j) => {
      const ini = j === 0 ? e.inicio : p.inicio
      // Cada palavra fica acesa até a seguinte começar: entre duas palavras não pode haver um
      // instante sem legenda — é o piscar que denuncia a montagem automática.
      const fim = j === e.palavras.length - 1 ? fimVisivel : e.palavras[j + 1].inicio
      if (!(fim > ini)) return

      const partes = e.texto.map((t, i) => {
        const activa = i === j
        const s = escalaBase * (activa && !e.enfase ? (estilo.escalaActiva || 1) : 1)
        const c = e.enfase ? (estilo.corEnfase || estilo.corDestaque) : activa ? estilo.corDestaque : estilo.corBase
        let escala = `\\fscx${s.toFixed(0)}\\fscy${s.toFixed(0)}`
        if (j === 0 && ef.pop) {
          // O «pop»: entra a 80%, passa dos 100% e assenta. 130ms — mais lento parece PowerPoint.
          escala = `\\fscx${(s * 0.8).toFixed(0)}\\fscy${(s * 0.8).toFixed(0)}` +
            `\\t(0,70,\\fscx${(s * 1.06).toFixed(0)}\\fscy${(s * 1.06).toFixed(0)})` +
            `\\t(70,130,\\fscx${s.toFixed(0)}\\fscy${s.toFixed(0)})`
        } else if (activa && !e.enfase && ef.pop) {
          const s0 = escalaBase
          escala = `\\fscx${s0.toFixed(0)}\\fscy${s0.toFixed(0)}\\t(0,80,\\fscx${s.toFixed(0)}\\fscy${s.toFixed(0)})`
        }
        return `{\\c${tag(c)}${escala}}${t}`
      })
      linhas.push(`Dialogue: 0,${tempo(ini)},${tempo(fim)},MTM,,0,0,0,,{\\an5\\pos(${cx},${cy})}${partes.join(" ")}`)
    })

    if (e.enfase && e.enfase.emoji && ef.emojis) {
      linhas.push(
        `Dialogue: 1,${tempo(e.inicio)},${tempo(fimVisivel)},MTM,,0,0,0,,` +
        `{\\an5\\pos(${cx},${Math.round(cy - tam * 0.95)})\\fscx70\\fscy70\\t(0,120,\\fscx100\\fscy100)}${e.enfase.emoji}`,
      )
    }
  })

  // ── o gancho, no terço de cima ──────────────────────────────────────────────
  const gancho = String(extras.gancho || "").replace(/[{}\\]/g, "").trim()
  if (ef.tituloGancho && gancho) {
    const maius = estilo.maiusculas !== false ? gancho.toLocaleUpperCase("pt-PT") : gancho
    const ws = maius.split(/\s+/).filter(Boolean).slice(0, 7)
    // Mais de três palavras vão em duas linhas equilibradas: uma faixa só, de ponta a ponta, lê-se
    // como um banner e não como um título.
    let texto = ws.join(" ")
    let maior = texto.length
    if (ws.length > 3) {
      const meio = Math.ceil(ws.length / 2)
      const a = ws.slice(0, meio).join(" ")
      const b = ws.slice(meio).join(" ")
      texto = `${a}\\N${b}`
      maior = Math.max(a.length, b.length)
    }
    const tamG = tam * 0.7
    const ajuste = Math.min(1, (0.84 * L) / Math.max(1, maior * tamG * (estilo.fatorLargura || 0.45)))
    const s = 100 * ajuste
    const dur = estilo.ganchoDuracao || 2.5
    const gy = Math.round(A * (estilo.posicaoGanchoY ?? 0.22))
    linhas.push(
      `Dialogue: 2,${tempo(0.05)},${tempo(dur)},Gancho,,0,0,0,,` +
      `{\\an5\\pos(${cx},${gy})\\fad(0,180)\\frz2` +
      `\\fscx${(s * 0.6).toFixed(0)}\\fscy${(s * 0.6).toFixed(0)}` +
      `\\t(0,120,\\fscx${(s * 1.05).toFixed(0)}\\fscy${(s * 1.05).toFixed(0)})` +
      `\\t(120,200,\\fscx${s.toFixed(0)}\\fscy${s.toFixed(0)})}${texto}`,
    )
  }

  // ── a assinatura, discreta ──────────────────────────────────────────────────
  if (ef.assinatura && estilo.assinatura && extras.duracao) {
    const ay = Math.round(A * 0.1)
    linhas.push(
      `Dialogue: 0,${tempo(0)},${tempo(extras.duracao + 1)},Assinatura,,0,0,0,,{\\an5\\pos(${cx},${ay})}` +
      String(estilo.assinatura).replace(/[{}\\]/g, ""),
    )
  }

  return [...cabecalho, ...linhas].join("\n")
}

/**
 * O PLANO DE ZOOM do A-roll, como uma expressão do ffmpeg sobre o tempo.
 *
 * Duas coisas somadas:
 *  · ENQUADRAMENTO ALTERNADO — a cada ~5s o plano passa de 1,00 para 1,07 e volta, SEM
 *    transição, no início de uma frase. É o «jump cut» dos editores: a mesma câmara parece duas.
 *  · PUNCH-IN — quando uma palavra-chave é dita, entra em 0,12s até +12%, segura ~0,9s e volta.
 *
 * Tudo em trapézios e degraus somados, sem `if` encadeados: uma expressão longa de somas avalia
 * depressa e não rebenta o analisador do ffmpeg com parêntesis a mais.
 */
function planoDeZoom(palavras, estilo, enfase, duracao) {
  const termos = []
  const ecras = ecrasDaLegenda(palavras, estilo, enfase)

  // Degraus: procura o início de ecrã mais próximo de cada múltiplo de 5s.
  const inicios = ecras.map((e) => e.inicio).filter((t) => t > 1.5 && t < duracao - 1)
  const cortes = []
  for (let alvo = 5; alvo < duracao - 1.5; alvo += 5) {
    const perto = inicios.reduce((m, t) => (Math.abs(t - alvo) < Math.abs(m - alvo) ? t : m), alvo)
    if (Math.abs(perto - alvo) <= 1.5 && (!cortes.length || perto - cortes[cortes.length - 1] >= 3)) cortes.push(perto)
  }
  cortes.push(duracao + 1)
  for (let i = 0; i < cortes.length - 1; i += 2) {
    termos.push(`0.07*between(T,${cortes[i].toFixed(2)},${cortes[i + 1].toFixed(2)})`)
  }

  // Duas palavras-chave seguidas davam dois punch-ins somados (+24%): juntam-se num só.
  const punches = []
  for (const e of ecras) {
    if (!e.enfase) continue
    const ini = e.inicio
    const fim = Math.max(e.fim, e.inicio + 0.6) + 0.5
    const ult = punches[punches.length - 1]
    if (ult && ini <= ult.fim + 0.3) ult.fim = Math.max(ult.fim, fim)
    else punches.push({ ini, fim })
  }
  for (const pu of punches) {
    termos.push(`0.12*max(0,min(1,min((T-${pu.ini.toFixed(2)})/0.12,(${pu.fim.toFixed(2)}-T)/0.15)))`)
  }
  if (!termos.length) return null
  return `min(1.2,1+${termos.join("+")})`.replace(/T/g, "(on/30)")
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
  // UMA de cada vez: o gerador gratuito só aceita um pedido em simultâneo por IP e responde 429
  // aos outros. Com 429 espera e tenta de novo (até 3 vezes) em vez de desistir da imagem.
  const prontas = []
  for (const [i, b] of (broll || []).entries()) {
    const prompt = `${b.descricao}, vertical 9:16 cinematic photograph, shallow depth of field, moody natural light, no text, no letters, no logos, no money, no banknotes`
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      try {
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${Math.round(L / 1.5)}&height=${Math.round(A / 1.5)}&seed=${Math.floor(Math.random() * 1e6)}&nologo=true&model=flux`
        const r = await fetch(url, { signal: AbortSignal.timeout(120_000) })
        if (r.status === 429 || r.status >= 500) {
          if (tentativa < 3) { await new Promise((ok) => setTimeout(ok, 6000 * tentativa)); continue }
          throw new Error(`gerador ${r.status}`)
        }
        if (!r.ok) throw new Error(`gerador ${r.status}`)
        const buf = Buffer.from(new Uint8Array(await r.arrayBuffer()))
        if (buf.length < 4096) throw new Error("imagem vazia")
        const f = path.join(pasta, `broll-${i}.jpg`)
        fs.writeFileSync(f, buf)
        prontas.push({ ...b, ficheiro: f })
        break
      } catch (e) {
        // Um tempo limite ou uma ligação que cai merecem outra tentativa; o resto não.
        if (tentativa < 3 && /timeout|aborted|fetch failed|ECONNRESET/i.test(String(e && e.message))) {
          await new Promise((ok) => setTimeout(ok, 4000 * tentativa))
          continue
        }
        log("b-roll saltado:", e.message)
        break
      }
    }
  }
  return prontas
}

/** Se a fonte tem faixa de áudio. Sem ela, o whoosh não tem com quê misturar. */
function temAudio(fonte) {
  return new Promise((resolve) => {
    const p = spawn("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", fonte])
    let out = ""
    p.stdout.on("data", (d) => { out += d.toString() })
    p.on("error", () => resolve(false))
    p.on("close", () => resolve(out.trim().length > 0))
  })
}

/**
 * Monta os argumentos do ffmpeg.
 *
 * A ordem das camadas: A-roll (9:16, zoom, cor) → B-roll com transições → legendas/gancho em ASS
 * → barra de progresso. O áudio é a voz, com o whoosh das transições misturado baixinho.
 *
 * Tudo num único filter_complex e num único encode: dois passes custavam o dobro da CPU num VPS
 * de dois núcleos que ainda grava as sessões.
 */
function argsDaMontagem({ fonte, recuo, duracao, L, A, ass, broll, estilo = {}, zoom = null, audio = true }) {
  const ef = estilo.efeitos || {}
  const acento = String(estilo.corAcento || estilo.corDestaque || "#FFD700").replace("#", "0x")
  const entradas = ["-ss", String(recuo), "-t", String(duracao), "-i", fonte]
  const partes = []

  // O 9:16 a partir do meio do plano; com zoom, o zoompan faz o corte E a escala de uma vez.
  const corte = "crop='min(iw,ih*9/16)':'min(ih,iw*16/9)'"
  if (ef.punchIn && zoom) {
    partes.push(
      `[0:v]fps=30,${corte},` +
      `zoompan=z='${zoom}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${L}x${A}:fps=30,setsar=1` +
      (ef.grade && estilo.grade ? `,eq=contrast=${estilo.grade.contraste}:saturation=${estilo.grade.saturacao}:brightness=${estilo.grade.brilho}` : "") +
      "[v0]",
    )
  } else {
    partes.push(
      `[0:v]${corte},scale=${L}:${A}:force_original_aspect_ratio=increase,crop=${L}:${A},setsar=1` +
      (ef.grade && estilo.grade ? `,eq=contrast=${estilo.grade.contraste}:saturation=${estilo.grade.saturacao}:brightness=${estilo.grade.brilho}` : "") +
      "[v0]",
    )
  }

  let atual = "v0"
  broll.forEach((b, i) => {
    entradas.push("-i", b.ficheiro)
    const dur = Math.max(0.5, b.fim - b.inicio)
    const frames = Math.round(dur * 30)
    const W = Math.round(L * 1.25)
    const H = Math.round(A * 1.25)
    const s = Number(b.inicio).toFixed(2)
    const e = Number(b.fim).toFixed(2)
    const desliza = ef.transicoesBroll && i % 2 === 1

    // Ímpares entram a deslizar; pares entram com um zoom que recua e assenta. Alternar é o que
    // impede a montagem de parecer um modelo repetido.
    const z = ef.transicoesBroll && !desliza
      ? "if(lt(on,8),1.18-0.18*on/8,min(1+0.0011*(on-8),1.12))"
      : "min(zoom+0.0012,1.12)"
    partes.push(
      // O gerador gratuito carimba o nome no rodapé: os últimos 8% da imagem ficam de fora.
      `[${i + 1}:v]crop=iw:ih*0.92:0:0,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
      // 1,25× chega para um zoom de 12% sem se ver o píxel — o dobro custava minutos de CPU.
      `zoompan=z='${z}':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${L}x${A}:fps=30,setsar=1` +
      (ef.grade && estilo.grade ? `,eq=contrast=${estilo.grade.contraste}:saturation=${estilo.grade.saturacao}` : "") +
      (ef.transicoesBroll
        ? `,format=yuva420p,fade=t=in:st=0:d=0.18:alpha=1,fade=t=out:st=${Math.max(0, dur - 0.18).toFixed(2)}:d=0.18:alpha=1`
        : "") +
      `,setpts=PTS-STARTPTS+${s}/TB[b${i}]`,
    )
    const x = desliza
      ? `'if(lt(t-${s},0.22),W*0.3*pow(1-(t-${s})/0.22,2),0)-if(gt(t,${e}-0.2),W*0.3*pow((t-(${e}-0.2))/0.2,2),0)'`
      : "0"
    partes.push(`[${atual}][b${i}]overlay=x=${x}:y=0:enable='between(t,${s},${e})':eof_action=pass[v${i + 1}]`)
    atual = `v${i + 1}`
  })

  const assEsc = ass.replace(/\\/g, "/").replace(/'/g, "\\'")
  const fontes = fs.existsSync(PASTA_FONTES) ? `:fontsdir='${PASTA_FONTES.replace(/'/g, "\\'")}'` : ""
  partes.push(`[${atual}]ass=filename='${assEsc}'${fontes}[vass]`)
  atual = "vass"

  if (ef.barraProgresso) {
    // Fina e na cor de acento: diz «falta pouco» sem roubar atenção à legenda.
    const h = Math.max(4, Math.round(A * 0.006))
    // O drawbox deste ffmpeg (6.1) não reavalia a largura por frame: a barra saía cheia desde o
    // primeiro segundo. Uma faixa de cor a deslizar por um `overlay` (esse avalia) faz o mesmo.
    const d = Number(duracao).toFixed(2)
    partes.push(
      `color=c=${acento}:s=${L}x${h}:r=30:d=${d}[pbar]`,
      `[${atual}]drawbox=x=0:y=ih-${h}:w=iw:h=${h}:color=black@0.35:t=fill[vtrk]`,
      `[vtrk][pbar]overlay=x='-w+w*min(1,t/${d})':y=H-h:eof_action=pass[vbar]`,
    )
    atual = "vbar"
  }

  const mapa = ["-map", `[${atual}]`]

  // O whoosh: ruído rosa filtrado e com envelope rápido — sintetizado aqui, sem ficheiros de fora.
  const whooshes = ef.whoosh && ef.transicoesBroll && audio ? broll.map((b) => Math.max(0, b.inicio - 0.22)) : []
  if (whooshes.length) {
    const n = whooshes.length
    partes.push(
      `anoisesrc=d=0.5:c=pink:r=48000:a=0.9,highpass=f=350,lowpass=f=5200,` +
      `afade=t=in:st=0:d=0.24:curve=exp,afade=t=out:st=0.24:d=0.26:curve=exp,` +
      `aphaser=in_gain=0.6:out_gain=0.9:delay=2:decay=0.5:speed=2,volume=0.6,` +
      `aformat=channel_layouts=stereo,asplit=${n}${whooshes.map((_, i) => `[w${i}]`).join("")}`,
    )
    whooshes.forEach((t, i) => {
      const ms = Math.round(t * 1000)
      partes.push(`[w${i}]adelay=delays=${ms}|${ms}[wd${i}]`)
    })
    partes.push(
      `[0:a]aformat=channel_layouts=stereo[voz];[voz]${whooshes.map((_, i) => `[wd${i}]`).join("")}` +
      `amix=inputs=${n + 1}:duration=first:normalize=0[aout]`,
    )
    mapa.push("-map", "[aout]")
  } else {
    mapa.push("-map", "0:a?")
  }

  return [...entradas, "-filter_complex", partes.join(";"), ...mapa]
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

    const estilo = trabalho.estilo || {}
    const extras = { gancho: trabalho.gancho || "", enfase: trabalho.enfase || [], duracao }
    const ass = path.join(tmp, "legendas.ass")
    fs.writeFileSync(ass, construirASS(trabalho.legendas || [], estilo, extras), "utf8")

    const saida = path.join(tmp, "clipe.mp4")
    const L = estilo.largura || 1080
    const A = estilo.altura || 1920

    /**
     * O 9:16 a partir de um vídeo horizontal.
     *
     * `crop` ao centro e não `pad` com barras: as barras pretas comem metade do ecrã no
     * telemóvel e o clipe parece uma gravação de ecrã. O orador está quase sempre ao centro num
     * enquadramento de sessão — e um corte que engana às vezes é melhor do que barras que
     * estragam sempre.
     */
    const broll = await imagensDoBroll(trabalho.broll, tmp, L, A)
    const zoom = planoDeZoom(trabalho.legendas || [], estilo, extras.enfase, duracao)
    const audio = await temAudio(fonte)
    await correr("ffmpeg", [
      "-y",
      ...argsDaMontagem({ fonte, recuo, duracao, L, A, ass, broll, estilo, zoom, audio }),
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

        // O estilo pode vir por clipe (sobrepõe o do vídeo) ou do trabalho inteiro.
        const estilo = c.estilo || trabalho.estilo || {}
        const extras = { gancho: c.gancho || "", enfase: c.enfase || [], duracao }
        const ass = path.join(pasta, "legendas.ass")
        fs.writeFileSync(ass, construirASS(c.legendas || [], estilo, extras), "utf8")
        const L = estilo.largura || 540
        const A = estilo.altura || 960

        const saida = path.join(pasta, "preview.mp4")
        const broll = await imagensDoBroll(c.broll, pasta, L, A)
        const zoom = planoDeZoom(c.legendas || [], estilo, extras.enfase, duracao)
        const audio = await temAudio(fonte)
        await correr("ffmpeg", [
          "-y", ...argsDaMontagem({ fonte, recuo, duracao, L, A, ass, broll, estilo, zoom, audio }),
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

// Importado (testes, harness de pré-visualização) não arranca o ciclo.
if (require.main === module) ciclo()
module.exports = { construirASS, ecrasDaLegenda, planoDeZoom, argsDaMontagem, imagensDoBroll, temAudio, correr }
