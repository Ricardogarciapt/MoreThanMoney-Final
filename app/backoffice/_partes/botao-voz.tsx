'use client'

/**
 * O MICROFONE DO BACKOFFICE. Um botão fixo: toca para falar, toca outra vez para parar.
 * Também aceita escrever (para quem está numa sala onde não pode falar).
 *
 * Ler (procurar, tarefas, números) aparece logo. Mudar (mover um negócio, criar uma tarefa) aparece
 * num cartão e só acontece no toque em «Confirmar», que chama as rotas de sempre do backoffice.
 */
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Negocio = { id: string; nome: string; estado: string }
type Tarefa = { id: string; titulo: string; prazo: string | null }
type Proposta =
  | { tipo: 'mover_negocio'; estado: string; motivo_perda: string | null; candidatos: Negocio[] }
  | { tipo: 'criar_tarefa'; titulo: string; prazo: string | null; negocio: string | null; candidatos: Negocio[] }
  | { tipo: 'mudar_funil'; funil: string | null; nome_funil: string; candidatos: Negocio[] }
  | { tipo: 'nota_negocio'; texto: string; candidatos: (Negocio & { nota_nova: string })[] }
  | { tipo: 'concluir_tarefa'; tarefas: Tarefa[] }
  | { tipo: 'adiar_tarefa'; prazo: string; tarefas: Tarefa[] }
type Resultado = {
  texto?: string
  resposta?: string
  navegar?: string
  negocios?: Negocio[]
  tarefas?: Tarefa[]
  proposta?: Proposta
  ligacoes?: { href: string; nome: string; rotulo?: string }[]
  rascunho?: { canal: 'whatsapp' | 'email'; texto: string; abrir: string | null }
  error?: string
}

const OURO = '#D2A63C'

export function BotaoVoz() {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [estado, setEstado] = useState<'parado' | 'a-gravar' | 'a-pensar'>('parado')
  const [escrito, setEscrito] = useState('')
  const [res, setRes] = useState<Resultado | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  const gravador = useRef<MediaRecorder | null>(null)
  const pedacos = useRef<Blob[]>([])

  async function enviarTexto(texto: string) {
    setEstado('a-pensar')
    setFeito(null)
    try {
      const r = await fetch('/api/backoffice/comando', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto }),
      })
      const j = (await r.json()) as Resultado
      setRes(r.ok ? j : { error: j.error ?? 'Falhou.' })
      if (r.ok && j.navegar) router.push(j.navegar)
    } catch {
      setRes({ error: 'Sem ligação. Tenta outra vez.' })
    } finally {
      setEstado('parado')
    }
  }

  async function comecar() {
    setRes(null)
    setFeito(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const tipo = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      const rec = new MediaRecorder(stream, { mimeType: tipo })
      pedacos.current = []
      rec.ondataavailable = (e) => e.data.size && pedacos.current.push(e.data)
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setEstado('a-pensar')
        const blob = new Blob(pedacos.current, { type: tipo })
        const form = new FormData()
        form.append('audio', blob, tipo === 'audio/webm' ? 'comando.webm' : 'comando.m4a')
        try {
          const r = await fetch('/api/backoffice/voz', { method: 'POST', body: form })
          const j = (await r.json()) as { texto?: string; error?: string }
          if (!r.ok || !j.texto) {
            setRes({ error: j.error ?? 'Não se ouviu nada.' })
            setEstado('parado')
            return
          }
          await enviarTexto(j.texto)
        } catch {
          setRes({ error: 'Sem ligação. Tenta outra vez.' })
          setEstado('parado')
        }
      }
      gravador.current = rec
      rec.start()
      setEstado('a-gravar')
    } catch {
      setRes({ error: 'O browser não deu acesso ao microfone. Podes escrever em baixo.' })
    }
  }

  function parar() {
    gravador.current?.stop()
    gravador.current = null
  }

  async function confirmar(url: string, metodo: 'PATCH' | 'POST', corpo: Record<string, unknown>, sucesso: string) {
    setEstado('a-pensar')
    try {
      const r = await fetch(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
      const j = (await r.json().catch(() => ({}))) as { error?: string; detalhe?: string }
      if (!r.ok) {
        setRes((v) => ({ ...v, error: j.detalhe ?? j.error ?? 'Não foi possível.' }))
      } else {
        setFeito(sucesso)
        setRes((v) => (v ? { ...v, proposta: undefined } : v))
        router.refresh()
      }
    } finally {
      setEstado('parado')
    }
  }

  const p = res?.proposta
  const BOTAO = 'mb-1 block w-full rounded-lg px-3 py-2 text-left font-medium text-black disabled:opacity-50'

  return (
    <>
      <button
        type="button"
        aria-label={estado === 'a-gravar' ? 'Parar de gravar' : 'Falar com o backoffice'}
        onClick={() => {
          if (!aberto) setAberto(true)
          if (estado === 'a-gravar') parar()
          else if (estado === 'parado') void comecar()
        }}
        className="fixed bottom-5 right-5 z-50 grid h-14 w-14 place-items-center rounded-full shadow-lg shadow-black/50 transition active:scale-95"
        style={{ background: estado === 'a-gravar' ? '#dc2626' : OURO }}
      >
        {estado === 'a-pensar' ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-black/30 border-t-black" />
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={estado === 'a-gravar' ? '#fff' : '#0b0b0b'} strokeWidth="2" strokeLinecap="round">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        )}
      </button>

      {aberto && (
        <div className="fixed bottom-24 right-4 z-50 w-[min(92vw,380px)] rounded-2xl border border-white/10 bg-[#0d1016] p-4 text-sm text-zinc-200 shadow-2xl shadow-black/60">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: OURO }}>
              {estado === 'a-gravar' ? 'A ouvir… toca para parar' : estado === 'a-pensar' ? 'A tratar…' : 'Comando por voz'}
            </span>
            <button type="button" onClick={() => setAberto(false)} className="text-zinc-500 hover:text-zinc-200" aria-label="Fechar">
              ✕
            </button>
          </div>

          {res?.texto && <p className="mb-2 text-xs italic text-zinc-500">«{res.texto}»</p>}
          {res?.resposta && <p className="mb-2">{res.resposta}</p>}
          {res?.error && <p className="mb-2 text-red-400">{res.error}</p>}
          {feito && <p className="mb-2 text-emerald-400">✓ {feito}</p>}

          {res?.negocios?.map((n) => (
            <a key={n.id} href="/backoffice/pipeline" className="mb-1 block rounded-lg border border-white/5 px-3 py-2 hover:border-white/20">
              {n.nome} <span className="text-zinc-500">· {n.estado}</span>
            </a>
          ))}
          {res?.tarefas?.map((t) => (
            <div key={t.id} className="mb-1 rounded-lg border border-white/5 px-3 py-2">
              {t.titulo} {t.prazo && <span className="text-zinc-500">· {t.prazo}</span>}
            </div>
          ))}

          {p?.tipo === 'mover_negocio' &&
            p.candidatos.map((n) => (
              <button
                key={n.id}
                type="button"
                disabled={estado !== 'parado'}
                onClick={() =>
                  void confirmar(
                    `/api/backoffice/negocios/${n.id}`,
                    'PATCH',
                    { estado: p.estado, ...(p.motivo_perda ? { motivo_perda: p.motivo_perda } : {}) },
                    `${n.nome} passou para ${p.estado}.`,
                  )
                }
                className="mb-1 block w-full rounded-lg px-3 py-2 text-left font-medium text-black disabled:opacity-50"
                style={{ background: OURO }}
              >
                Confirmar: {n.nome} ({n.estado} → {p.estado})
              </button>
            ))}

          {p?.tipo === 'mudar_funil' &&
            p.candidatos.map((n) => (
              <button
                key={n.id}
                type="button"
                disabled={estado !== 'parado'}
                onClick={() =>
                  void confirmar(`/api/backoffice/negocios/${n.id}/funil`, 'PATCH', { funil: p.funil }, `${n.nome} ficou no funil ${p.nome_funil}.`)
                }
                className="mb-1 block w-full rounded-lg px-3 py-2 text-left font-medium text-black disabled:opacity-50"
                style={{ background: OURO }}
              >
                Confirmar: {n.nome} → {p.nome_funil}
              </button>
            ))}

          {p?.tipo === 'nota_negocio' &&
            p.candidatos.map((n) => (
              <button
                key={n.id}
                type="button"
                disabled={estado !== 'parado'}
                onClick={() => void confirmar(`/api/backoffice/negocios/${n.id}`, 'PATCH', { nota: n.nota_nova }, `Nota guardada em ${n.nome}.`)}
                className={BOTAO}
                style={{ background: OURO }}
              >
                Confirmar: nota em {n.nome}
              </button>
            ))}

          {(p?.tipo === 'concluir_tarefa' || p?.tipo === 'adiar_tarefa') &&
            p.tarefas.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={estado !== 'parado'}
                onClick={() =>
                  void confirmar(
                    '/api/backoffice/tarefas',
                    'PATCH',
                    p.tipo === 'concluir_tarefa' ? { id: t.id, estado: 'feita' } : { id: t.id, prazo: p.prazo },
                    p.tipo === 'concluir_tarefa' ? `«${t.titulo}» feita.` : `«${t.titulo}» passou para ${p.prazo}.`,
                  )
                }
                className={BOTAO}
                style={{ background: OURO }}
              >
                Confirmar: {t.titulo}
                {t.prazo ? ` (prazo ${t.prazo})` : ''}
              </button>
            ))}

          {res?.ligacoes?.map((l) => (
            <a key={l.href} href={l.href} className={BOTAO} style={{ background: OURO }}>
              {l.rotulo ?? `Abrir chamada com ${l.nome}`}
            </a>
          ))}

          {res?.rascunho && (
            <div className="rounded-lg border border-white/10 p-3">
              <p className="mb-2 whitespace-pre-wrap text-zinc-200">{res.rascunho.texto}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(res.rascunho!.texto).then(() => setFeito('Copiado.'))}
                  className="rounded-lg px-3 py-1.5 font-medium text-black"
                  style={{ background: OURO }}
                >
                  Copiar
                </button>
                {res.rascunho.abrir && (
                  <a href={res.rascunho.abrir} target="_blank" rel="noreferrer" className="rounded-lg border border-white/15 px-3 py-1.5 text-zinc-200 hover:border-white/40">
                    Abrir no {res.rascunho.canal === 'email' ? 'email' : 'WhatsApp'}
                  </a>
                )}
              </div>
            </div>
          )}

          {p?.tipo === 'criar_tarefa' && (
            <div className="rounded-lg border border-white/10 p-3">
              <p className="font-medium">{p.titulo}</p>
              <p className="mb-2 text-xs text-zinc-500">{p.prazo ? `Prazo ${p.prazo}` : 'Sem prazo'}</p>
              {(p.candidatos.length ? p.candidatos : [null]).map((n) => (
                <button
                  key={n?.id ?? 'sem'}
                  type="button"
                  disabled={estado !== 'parado'}
                  onClick={() =>
                    void confirmar(
                      '/api/backoffice/tarefas',
                      'POST',
                      { titulo: p.titulo, prazo: p.prazo, ...(n ? { negocio_id: n.id } : {}) },
                      'Tarefa criada.',
                    )
                  }
                  className="mb-1 block w-full rounded-lg px-3 py-2 text-left font-medium text-black disabled:opacity-50"
                  style={{ background: OURO }}
                >
                  Confirmar{n ? `, ligada a ${n.nome}` : ''}
                </button>
              ))}
            </div>
          )}

          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const t = escrito.trim()
              if (t && estado === 'parado') {
                setEscrito('')
                void enviarTexto(t)
              }
            }}
          >
            <input
              value={escrito}
              onChange={(e) => setEscrito(e.target.value)}
              placeholder="Ou escreve: «tarefas de hoje»"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-white/30"
            />
            <button type="submit" className="rounded-lg border border-white/10 px-3 text-zinc-300 hover:border-white/30">
              ↵
            </button>
          </form>
        </div>
      )}
    </>
  )
}
