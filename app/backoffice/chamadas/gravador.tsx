'use client'

/**
 * A SALA DE CHAMADAS: abre o Google Meet, grava (com consentimento) o som do separador do Meet e o
 * teu microfone, transcreve em blocos de 5 minutos e, no fim, pede o resumo à IA.
 *
 * Porque blocos: um ficheiro de 1 hora não passa no limite da transcrição (8 MB) e, se a rede
 * falhar a meio, perde-se tudo. Assim cada bloco é transcrito enquanto a chamada continua, e o áudio
 * desaparece logo a seguir — nada de áudio fica guardado, só o texto.
 *
 * Guardar no negócio e criar tarefas são toques de «Confirmar» que chamam as rotas de sempre.
 */
import { useEffect, useRef, useState } from 'react'
import { TIPOS_CHAMADA, type TipoChamada } from '@/lib/backoffice-chamada'

type Negocio = { id: string; nome: string; estado: string }
type Tarefa = { titulo: string; prazo: string | null }
type Resumo = {
  resumo: string
  objecoes: string[]
  proximos_passos: string[]
  tarefas: Tarefa[]
  cortada: boolean
  negocio: { id: string; nome: string } | null
  nota_sugerida: string | null
}

const OURO = '#D2A63C'
const BLOCO_MS = 5 * 60 * 1000
const CAMPO = 'w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-white/30'

function relogio(s: number) {
  const m = Math.floor(s / 60)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function SalaDeChamadas() {
  const [tipo, setTipo] = useState<TipoChamada>('followup')
  const [procura, setProcura] = useState('')
  const [candidatos, setCandidatos] = useState<Negocio[]>([])
  const [negocio, setNegocio] = useState<Negocio | null>(null)
  const [consentimento, setConsentimento] = useState(false)
  const [comMeet, setComMeet] = useState(true)
  const [estado, setEstado] = useState<'parado' | 'a-gravar' | 'a-resumir'>('parado')
  const [segundos, setSegundos] = useState(0)
  const [pendentes, setPendentes] = useState(0)
  const [transcricao, setTranscricao] = useState('')
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [feitos, setFeitos] = useState<string[]>([])

  const fluxos = useRef<MediaStream[]>([])
  const contexto = useRef<AudioContext | null>(null)
  const destino = useRef<MediaStream | null>(null)
  const gravador = useRef<MediaRecorder | null>(null)
  const temporizador = useRef<ReturnType<typeof setInterval> | null>(null)
  const ativo = useRef(false)

  // Procura de negócio (só no teu âmbito — o servidor filtra).
  useEffect(() => {
    if (negocio || procura.trim().length < 2) {
      setCandidatos([])
      return
    }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/backoffice/chamada/negocios?q=${encodeURIComponent(procura.trim())}`).catch(() => null)
      const j = r?.ok ? ((await r.json()) as { negocios: Negocio[] }) : { negocios: [] }
      setCandidatos(j.negocios)
    }, 300)
    return () => clearTimeout(t)
  }, [procura, negocio])

  useEffect(() => () => pararTudo(), []) // eslint-disable-line react-hooks/exhaustive-deps

  async function transcreverBloco(blob: Blob, tipoMime: string) {
    if (blob.size < 2000) return
    setPendentes((n) => n + 1)
    try {
      const form = new FormData()
      form.append('audio', blob, tipoMime.includes('webm') ? 'bloco.webm' : 'bloco.m4a')
      const r = await fetch('/api/backoffice/voz', { method: 'POST', body: form })
      const j = (await r.json().catch(() => ({}))) as { texto?: string; error?: string }
      if (r.ok && j.texto) setTranscricao((t) => (t ? `${t}\n${j.texto}` : j.texto!))
      else if (r.status !== 422) setErro(j.error ?? 'Um bloco não foi transcrito.')
    } catch {
      setErro('Sem ligação: um bloco não foi transcrito.')
    } finally {
      setPendentes((n) => n - 1)
    }
  }

  function novoBloco() {
    if (!destino.current || !ativo.current) return
    const tipoMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/mp4'
    const rec = new MediaRecorder(destino.current, { mimeType: tipoMime, audioBitsPerSecond: 32_000 })
    const pedacos: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && pedacos.push(e.data)
    rec.onstop = () => {
      void transcreverBloco(new Blob(pedacos, { type: tipoMime }), tipoMime)
      if (ativo.current) novoBloco()
    }
    gravador.current = rec
    rec.start()
    setTimeout(() => rec.state === 'recording' && rec.stop(), BLOCO_MS)
  }

  async function comecar() {
    setErro(null)
    setResumo(null)
    setFeitos([])
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      fluxos.current = [mic]
      if (comMeet) {
        // O Chrome pede para escolher o separador do Meet e marcar «Partilhar áudio do separador».
        const ecra = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        ecra.getVideoTracks().forEach((t) => t.stop())
        if (!ecra.getAudioTracks().length) {
          mic.getTracks().forEach((t) => t.stop())
          setErro('Não veio som do separador. Escolhe o separador do Meet e marca «Partilhar áudio do separador».')
          return
        }
        fluxos.current.push(ecra)
      }
      const ctxAudio = new AudioContext()
      const saida = ctxAudio.createMediaStreamDestination()
      fluxos.current.forEach((f) => ctxAudio.createMediaStreamSource(f).connect(saida))
      contexto.current = ctxAudio
      destino.current = saida.stream
      ativo.current = true
      setSegundos(0)
      temporizador.current = setInterval(() => setSegundos((s) => s + 1), 1000)
      setEstado('a-gravar')
      novoBloco()
    } catch {
      pararTudo()
      setErro('O browser não deu acesso ao microfone ou ao separador. Usa o Chrome no computador, ou cola a transcrição em baixo.')
    }
  }

  function pararTudo() {
    ativo.current = false
    if (gravador.current?.state === 'recording') gravador.current.stop()
    gravador.current = null
    fluxos.current.forEach((f) => f.getTracks().forEach((t) => t.stop()))
    fluxos.current = []
    void contexto.current?.close().catch(() => {})
    contexto.current = null
    destino.current = null
    if (temporizador.current) clearInterval(temporizador.current)
    temporizador.current = null
    setEstado((e) => (e === 'a-gravar' ? 'parado' : e))
  }

  async function resumir() {
    setErro(null)
    setEstado('a-resumir')
    try {
      const r = await fetch('/api/backoffice/chamada/resumo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, transcricao, negocio_id: negocio?.id ?? null }),
      })
      const j = (await r.json().catch(() => ({}))) as Resumo & { error?: string }
      if (!r.ok) setErro(j.error ?? 'O resumo falhou.')
      else setResumo(j)
    } catch {
      setErro('Sem ligação. Tenta outra vez.')
    } finally {
      setEstado('parado')
    }
  }

  async function confirmar(chave: string, url: string, metodo: 'PATCH' | 'POST', corpo: Record<string, unknown>) {
    const r = await fetch(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).catch(() => null)
    const j = r ? ((await r.json().catch(() => ({}))) as { error?: string; detalhe?: string }) : {}
    if (r?.ok) setFeitos((f) => [...f, chave])
    else setErro(j.detalhe ?? j.error ?? 'Não foi possível.')
  }

  const gravando = estado === 'a-gravar'

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-2xl border border-white/[0.06] bg-zinc-950/70 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-zinc-400">
            Tipo de chamada
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoChamada)} className={CAMPO} disabled={gravando}>
              {Object.entries(TIPOS_CHAMADA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <div className="relative space-y-1 text-xs text-zinc-400">
            Negócio (opcional)
            {negocio ? (
              <div className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-100">
                {negocio.nome}
                <button type="button" className="text-zinc-500 hover:text-zinc-200" onClick={() => setNegocio(null)} aria-label="Tirar negócio">
                  ✕
                </button>
              </div>
            ) : (
              <input value={procura} onChange={(e) => setProcura(e.target.value)} placeholder="Nome do cliente" className={CAMPO} />
            )}
            {!negocio && candidatos.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-white/10 bg-[#0d1016] p-1 shadow-xl">
                {candidatos.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      setNegocio(n)
                      setProcura('')
                    }}
                    className="block w-full rounded px-3 py-2 text-left text-sm text-zinc-200 hover:bg-white/5"
                  >
                    {n.nome} <span className="text-zinc-500">· {n.estado}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href="https://meet.new"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-zinc-950"
            style={{ background: OURO }}
          >
            1 · Abrir Google Meet
          </a>
          <span className="self-center text-xs text-zinc-500">Abre uma sala nova num separador. Copia o link do Meet e envia-o ao cliente.</span>
        </div>

        <label className="flex items-start gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={consentimento} onChange={(e) => setConsentimento(e.target.checked)} disabled={gravando} className="mt-1" />
          <span>
            Avisei os participantes de que a chamada vai ser transcrita para um resumo, e concordaram. <span className="text-zinc-500">(Obrigatório. O áudio não fica guardado: só o texto.)</span>
          </span>
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input type="checkbox" checked={comMeet} onChange={(e) => setComMeet(e.target.checked)} disabled={gravando} />
          Apanhar também o som do separador do Meet (sem isto, só o teu microfone)
        </label>

        <div className="flex flex-wrap items-center gap-3">
          {!gravando ? (
            <button
              type="button"
              disabled={!consentimento || estado !== 'parado'}
              onClick={() => void comecar()}
              className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-40"
              style={{ borderColor: OURO, color: OURO }}
            >
              2 · Começar a transcrever
            </button>
          ) : (
            <button type="button" onClick={pararTudo} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white">
              ■ Terminar ({relogio(segundos)})
            </button>
          )}
          {pendentes > 0 && <span className="text-xs text-zinc-500">A transcrever {pendentes} bloco(s)…</span>}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-white/[0.06] bg-zinc-950/70 p-5">
        <h2 className="text-sm font-semibold text-white">Transcrição</h2>
        <textarea
          value={transcricao}
          onChange={(e) => setTranscricao(e.target.value)}
          rows={8}
          placeholder="Vai aparecendo aqui de 5 em 5 minutos. Também podes colar a transcrição ou as notas do próprio Meet."
          className={CAMPO}
        />
        <button
          type="button"
          disabled={gravando || pendentes > 0 || estado !== 'parado' || transcricao.trim().length < 40}
          onClick={() => void resumir()}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-40"
          style={{ background: OURO }}
        >
          {estado === 'a-resumir' ? 'A resumir…' : '3 · Resumir com IA'}
        </button>
      </section>

      {erro && <p className="text-sm text-red-400">{erro}</p>}

      {resumo && (
        <section className="space-y-4 rounded-2xl border p-5" style={{ borderColor: `${OURO}55` }}>
          <div>
            <h2 className="mb-1 text-sm font-semibold" style={{ color: OURO }}>
              Resumo
            </h2>
            <p className="whitespace-pre-line text-sm text-zinc-200">{resumo.resumo}</p>
            {resumo.cortada && <p className="mt-1 text-xs text-zinc-500">A chamada era longa: a IA leu o início e o fim.</p>}
          </div>
          {resumo.objecoes.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Objeções</h3>
              <ul className="list-disc pl-5 text-sm text-zinc-300">{resumo.objecoes.map((o) => <li key={o}>{o}</li>)}</ul>
            </div>
          )}
          {resumo.proximos_passos.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Próximos passos</h3>
              <ul className="list-disc pl-5 text-sm text-zinc-300">{resumo.proximos_passos.map((o) => <li key={o}>{o}</li>)}</ul>
            </div>
          )}

          {resumo.negocio && resumo.nota_sugerida && (
            <button
              type="button"
              disabled={feitos.includes('nota')}
              onClick={() => void confirmar('nota', `/api/backoffice/negocios/${resumo.negocio!.id}`, 'PATCH', { nota: resumo.nota_sugerida })}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-950 disabled:opacity-50"
              style={{ background: OURO }}
            >
              {feitos.includes('nota') ? `✓ Resumo guardado na nota de ${resumo.negocio.nome}` : `Guardar o resumo na nota de ${resumo.negocio.nome}`}
            </button>
          )}

          {resumo.tarefas.map((t, i) => {
            const chave = `t${i}`
            return (
              <button
                key={chave}
                type="button"
                disabled={feitos.includes(chave)}
                onClick={() =>
                  void confirmar(chave, '/api/backoffice/tarefas', 'POST', {
                    titulo: t.titulo,
                    prazo: t.prazo,
                    ...(resumo.negocio ? { negocio_id: resumo.negocio.id } : {}),
                  })
                }
                className="block w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm text-zinc-200 hover:border-white/30 disabled:opacity-50"
              >
                {feitos.includes(chave) ? '✓ Tarefa criada: ' : 'Criar tarefa: '}
                {t.titulo}
                {t.prazo && <span className="text-zinc-500"> · {t.prazo}</span>}
              </button>
            )
          })}
        </section>
      )}
    </div>
  )
}
