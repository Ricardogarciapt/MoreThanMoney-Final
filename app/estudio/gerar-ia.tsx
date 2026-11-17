'use client'

/**
 * «Gerar com IA» num cartão de /estudio → Ativos: pede ao motor de ativos próprio
 * (/api/estudio/geracao, worker GPU em services/motor-ativos) uma imagem noutro cenário, outro
 * ângulo, um vídeo com movimento de câmara ou o clone a falar, a partir deste ativo. A saída chega
 * como ativo novo na biblioteca; enquanto a GPU estiver desligada o pedido fica na fila.
 */
import { useEffect, useRef, useState } from 'react'
import { Loader2, Sparkles, X } from 'lucide-react'
import { authHeaders } from '@/lib/auth-token'
import { AZIMUTES, DESCRICAO_TIPOS, DISTANCIAS, ELEVACOES, MOVIMENTOS, type TipoGeracao } from '@/lib/estudio/geracao'

type Estado = { id: string; estado: string; erro?: string | null; motor_online?: boolean }

const ROTULO: Record<TipoGeracao, string> = { cena: 'Outro cenário', angulo: 'Outro ângulo', mover: 'Mexer a câmara', voz: 'Voz', falar: 'Clone a falar' }
const ESTADO_PT: Record<string, string> = { fila: 'Na fila', a_gerar: 'A gerar…', pronto: 'Pronto', erro: 'Erro', cancelado: 'Cancelado' }
const campo = 'min-h-9 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-xs'

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { cache: 'no-store', ...init, headers: { 'content-type': 'application/json', ...(await authHeaders()) } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.erro || j.error || `Erro ${r.status}`)
  return j
}

export default function GerarComIA({ ativoId, tipoAtivo, onPronto }: { ativoId: string; tipoAtivo: 'imagem' | 'video' | 'audio'; onPronto: () => void }) {
  const tipos: TipoGeracao[] = tipoAtivo === 'imagem' ? ['cena', 'angulo', 'mover', 'falar'] : tipoAtivo === 'video' ? ['falar'] : []
  const [aberto, setAberto] = useState(false)
  const [tipo, setTipo] = useState<TipoGeracao>(tipos[0] ?? 'cena')
  const [prompt, setPrompt] = useState('num estúdio de podcast, luz quente, microfone à frente')
  const [texto, setTexto] = useState('')
  const [movimento, setMovimento] = useState<string>('dolly-in')
  const [azimute, setAzimute] = useState<string>('front-right')
  const [elevacao, setElevacao] = useState<string>('eye')
  const [distancia, setDistancia] = useState<string>('medium')
  const [job, setJob] = useState<Estado | null>(null)
  const [aEnviar, setAEnviar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const avisado = useRef(false)

  // Acompanha o pedido até acabar (a cada 5 s); quando fica pronto, recarrega a biblioteca.
  useEffect(() => {
    if (!job || ['pronto', 'erro', 'cancelado'].includes(job.estado)) return
    const t = setTimeout(async () => {
      try {
        const j = await api(`/api/estudio/geracao?id=${job.id}`)
        setJob({ id: job.id, estado: j.estado, erro: j.erro, motor_online: j.motor_online })
        if (j.estado === 'pronto' && !avisado.current) { avisado.current = true; onPronto() }
      } catch (e) { setErro((e as Error).message) }
    }, 5000)
    return () => clearTimeout(t)
  }, [job, onPronto])

  if (!tipos.length) return null

  const enviar = async () => {
    setAEnviar(true); setErro(null); avisado.current = false
    try {
      const corpo: Record<string, unknown> = { tipo, ativo_id: ativoId, aspecto: '9:16', marca: 'ricardo-garcia', origem: 'estudio-ativos' }
      if (tipo === 'cena') corpo.prompt = prompt
      if (tipo === 'angulo') Object.assign(corpo, { azimute, elevacao, distancia })
      if (tipo === 'mover') Object.assign(corpo, { movimento, duracao_s: 5, prompt: prompt || undefined })
      if (tipo === 'falar') corpo.texto = texto
      const j = await api('/api/estudio/geracao', { method: 'POST', body: JSON.stringify(corpo) })
      setJob({ id: j.id, estado: j.estado, motor_online: j.motor_online })
      if (j.estado === 'pronto') onPronto()
    } catch (e) { setErro((e as Error).message) } finally { setAEnviar(false) }
  }

  const cancelar = async () => {
    if (!job) return
    try { await api(`/api/estudio/geracao?id=${job.id}`, { method: 'DELETE' }); setJob({ ...job, estado: 'cancelado' }) } catch (e) { setErro((e as Error).message) }
  }

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="flex min-h-9 w-full items-center justify-center gap-1 rounded-lg border border-[#D2A63C]/40 text-xs text-[#E9C46A] hover:bg-[#D2A63C]/10">
        <Sparkles className="h-3.5 w-3.5" aria-hidden /> Gerar com IA
      </button>
    )
  }

  const emCurso = job && ['fila', 'a_gerar'].includes(job.estado)
  return (
    <div className="space-y-2 rounded-lg border border-[#D2A63C]/30 bg-[#D2A63C]/[0.05] p-2">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1 text-xs font-semibold text-[#E9C46A]"><Sparkles className="h-3.5 w-3.5" aria-hidden /> Gerar com IA</p>
        <button type="button" aria-label="Fechar" onClick={() => setAberto(false)} className="text-zinc-500 hover:text-zinc-300"><X className="h-3.5 w-3.5" /></button>
      </div>
      <select aria-label="O que gerar" value={tipo} onChange={(e) => setTipo(e.target.value as TipoGeracao)} className={campo}>
        {tipos.map((t) => <option key={t} value={t}>{ROTULO[t]}</option>)}
      </select>
      <p className="text-[11px] leading-snug text-zinc-500">{DESCRICAO_TIPOS[tipo]}</p>
      {(tipo === 'cena' || tipo === 'mover') && (
        <textarea aria-label="Descrição" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} maxLength={400}
          placeholder={tipo === 'cena' ? 'Ex.: num estúdio de podcast' : 'O que acontece na cena (opcional)'} className={`${campo} py-1`} />
      )}
      {tipo === 'angulo' && (
        <div className="grid grid-cols-3 gap-1">
          <select aria-label="Lado" value={azimute} onChange={(e) => setAzimute(e.target.value)} className={campo}>{AZIMUTES.map((v) => <option key={v} value={v}>{v}</option>)}</select>
          <select aria-label="Altura" value={elevacao} onChange={(e) => setElevacao(e.target.value)} className={campo}>{ELEVACOES.map((v) => <option key={v} value={v}>{v}</option>)}</select>
          <select aria-label="Distância" value={distancia} onChange={(e) => setDistancia(e.target.value)} className={campo}>{DISTANCIAS.map((v) => <option key={v} value={v}>{v}</option>)}</select>
        </div>
      )}
      {tipo === 'mover' && (
        <select aria-label="Movimento de câmara" value={movimento} onChange={(e) => setMovimento(e.target.value)} className={campo}>
          {MOVIMENTOS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      )}
      {tipo === 'falar' && (
        <textarea aria-label="Texto a dizer" value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={1200}
          placeholder="O que o clone diz (com a tua voz)" className={`${campo} py-1`} />
      )}
      <button type="button" disabled={aEnviar || !!emCurso || (tipo === 'falar' && !texto.trim())} onClick={() => void enviar()}
        className="flex min-h-9 w-full items-center justify-center gap-1 rounded-lg bg-[#D2A63C] text-xs font-semibold text-black disabled:opacity-50">
        {aEnviar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Gerar
      </button>
      {job && (
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className={job.estado === 'erro' ? 'text-red-300' : job.estado === 'pronto' ? 'text-emerald-300' : 'text-zinc-400'}>
            {emCurso && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
            {ESTADO_PT[job.estado] ?? job.estado}
            {job.estado === 'pronto' && ' · já está na biblioteca'}
            {emCurso && job.motor_online === false && ' · a GPU está desligada; gera quando ligar'}
            {job.erro ? ` · ${job.erro}` : ''}
          </span>
          {emCurso && job.estado === 'fila' && <button type="button" onClick={() => void cancelar()} className="text-zinc-500 underline">Cancelar</button>}
        </div>
      )}
      {erro && <p className="text-[11px] text-red-300">{erro}</p>}
    </div>
  )
}
