'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { authHeaders } from '@/lib/auth-token'

/**
 * REDES NOVAS — TikTok, YouTube Shorts e LinkedIn. Cada marca liga as suas contas aqui (OAuth da
 * própria rede) e, a partir daí, os reels que saem no Instagram da marca voltam a sair nelas,
 * sozinhos, de hora a hora. Os carrosséis diários não entram.
 */

type Rede = 'tiktok' | 'youtube' | 'linkedin'
type Marca = 'morethanmoney' | 'ricardo-garcia'
type Conta = { id: string; rede: Rede; marca: Marca; nome: string | null; expira_em: string | null; refresh_expira_em: string | null; renova: boolean; ativa: boolean; nota: string | null }
type Linha = { id: string; conta_id: string; estado: string; url: string | null; nota: string | null; erro: string | null; tentativas: number; criado_em: string }
type Estado = {
  espelho: Record<Marca, boolean>
  apps: Record<Rede, { pronta: boolean; falta: string[]; callback: string }>
  contas: Conta[]
  fila: Linha[]
}

const REDES: { id: Rede; nome: string }[] = [
  { id: 'tiktok', nome: 'TikTok' },
  { id: 'youtube', nome: 'YouTube Shorts' },
  { id: 'linkedin', nome: 'LinkedIn' },
]
const MARCAS: { id: Marca; nome: string; nota: string }[] = [
  { id: 'morethanmoney', nome: 'More Than Money', nota: 'Espelha os reels de @morethanmoney.pt. No LinkedIn liga à página da empresa.' },
  { id: 'ricardo-garcia', nome: 'Ricardo Garcia', nota: 'Marca pessoal (desenvolvimento e trading). Desligada até decidires.' },
]
const ESTADO: Record<string, string> = { na_fila: 'Na fila', a_publicar: 'A publicar', publicado: 'Publicado', erro: 'Erro' }

async function api(init?: RequestInit) {
  const r = await fetch('/api/admin/redes', { cache: 'no-store', ...init, headers: { 'content-type': 'application/json', ...(await authHeaders()) } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.erro || j.error || `Erro ${r.status}`)
  return j
}

const data = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }) : '—')

function Painel() {
  const params = useSearchParams()
  const [e, setE] = useState<Estado | null>(null)
  const [msg, setMsg] = useState<string | null>(params.get('ok') || params.get('erro'))
  const [aCorrer, setACorrer] = useState(false)

  const carregar = useCallback(async () => {
    try { setE(await api()) } catch (err) { setMsg(err instanceof Error ? err.message : 'Não consegui carregar.') }
  }, [])
  useEffect(() => { void carregar() }, [carregar])

  const ligar = async (rede: Rede, marca: Marca) => {
    try {
      const j = await api({ method: 'POST', body: JSON.stringify({ accao: 'ligar', rede, marca }) })
      window.location.href = j.url
    } catch (err) { setMsg(err instanceof Error ? err.message : 'Não deu.') }
  }
  const desligar = async (rede: Rede, marca: Marca) => {
    await api({ method: 'POST', body: JSON.stringify({ accao: 'desligar', rede, marca }) }).catch(() => null)
    void carregar()
  }
  const espelho = async (marca: Marca, ligado: boolean) => {
    await api({ method: 'POST', body: JSON.stringify({ accao: 'espelho', marca, ligado }) }).catch(() => null)
    void carregar()
  }
  const correr = async () => {
    setACorrer(true)
    try {
      const j = await api({ method: 'POST', body: JSON.stringify({ accao: 'correr' }) })
      setMsg(`${j.novas} novas na fila · ${j.feitas.length} tentadas agora`)
    } catch (err) { setMsg(err instanceof Error ? err.message : 'Não deu.') }
    setACorrer(false)
    void carregar()
  }

  const contaDe = (rede: Rede, marca: Marca) => e?.contas.find((c) => c.rede === rede && c.marca === marca && c.ativa)
  const nomeConta = (id: string) => {
    const c = e?.contas.find((x) => x.id === id)
    return c ? `${REDES.find((r) => r.id === c.rede)?.nome} · ${c.nome ?? ''}` : '—'
  }

  return (
    <main className="min-h-screen bg-[#0b0b0c] px-4 py-8 text-neutral-100">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin/comando" className="text-xs text-neutral-400 underline">← Comando</Link>
        <h1 className="mt-2 text-2xl font-semibold text-[#E9C46A]">Redes novas</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">
          Liga aqui o TikTok, o YouTube e o LinkedIn de cada marca. Os reels que saem no Instagram passam a sair também nestas redes,
          sozinhos, de hora a hora (no máximo 3 por conta e por dia). Os carrosséis diários não mudam.
        </p>
        {msg && <p className="mt-4 rounded-lg border border-[#D2A63C]/40 bg-[#D2A63C]/10 px-3 py-2 text-sm">{msg}</p>}

        {MARCAS.map((m) => (
          <section key={m.id} className="mt-8 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-medium">{m.nome}</h2>
              <label className="ml-auto flex items-center gap-2 text-sm text-neutral-300">
                <input type="checkbox" checked={Boolean(e?.espelho[m.id])} onChange={(ev) => espelho(m.id, ev.target.checked)} />
                Espelhar os reels
              </label>
            </div>
            <p className="mt-1 text-xs text-neutral-500">{m.nota}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {REDES.map((r) => {
                const c = contaDe(r.id, m.id)
                const app = e?.apps[r.id]
                return (
                  <div key={r.id} className="rounded-lg border border-neutral-800 p-3">
                    <div className="text-sm font-medium">{r.nome}</div>
                    {c ? (
                      <>
                        <div className="mt-1 text-sm text-[#E9C46A]">{c.nome}</div>
                        <div className="mt-1 text-xs text-neutral-500">
                          {c.renova ? 'Renova sozinho' : `Token até ${data(c.expira_em)}: volta a ligar antes`}
                        </div>
                        {c.nota && <div className="mt-1 text-xs text-neutral-500">{c.nota}</div>}
                        <div className="mt-2 flex gap-2">
                          <button className="rounded bg-neutral-800 px-2 py-1 text-xs" onClick={() => ligar(r.id, m.id)}>Voltar a ligar</button>
                          <button className="rounded bg-neutral-800 px-2 py-1 text-xs text-red-300" onClick={() => desligar(r.id, m.id)}>Desligar</button>
                        </div>
                      </>
                    ) : app && !app.pronta ? (
                      <p className="mt-1 text-xs text-amber-300">
                        Falta a app: {app.falta.join(' e ')} na Vercel. URL de retorno: <code className="break-all">{app.callback}</code>
                      </p>
                    ) : (
                      <button className="mt-2 rounded bg-[#D2A63C] px-3 py-1.5 text-sm font-medium text-black" onClick={() => ligar(r.id, m.id)} disabled={!e}>
                        Ligar
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        ))}

        <section className="mt-8">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-medium">Fila</h2>
            <button className="ml-auto rounded bg-neutral-800 px-3 py-1.5 text-xs" onClick={correr} disabled={aCorrer}>
              {aCorrer ? 'A correr…' : 'Correr agora'}
            </button>
          </div>
          <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900 text-left text-xs text-neutral-400">
                <tr><th className="p-2">Quando</th><th className="p-2">Conta</th><th className="p-2">Estado</th><th className="p-2">Nota</th></tr>
              </thead>
              <tbody>
                {(e?.fila ?? []).map((l) => (
                  <tr key={l.id} className="border-t border-neutral-800">
                    <td className="p-2 text-neutral-400">{data(l.criado_em)}</td>
                    <td className="p-2">{nomeConta(l.conta_id)}</td>
                    <td className="p-2">{l.url ? <a className="text-[#E9C46A] underline" href={l.url} target="_blank" rel="noreferrer">{ESTADO[l.estado] ?? l.estado}</a> : ESTADO[l.estado] ?? l.estado}</td>
                    <td className="p-2 text-xs text-neutral-400">{l.erro || l.nota || ''}</td>
                  </tr>
                ))}
                {!e?.fila.length && <tr><td className="p-3 text-neutral-500" colSpan={4}>Ainda nada. Liga uma conta e o próximo reel entra aqui.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}

export default function PaginaRedes() {
  return <Suspense><Painel /></Suspense>
}
