"use client"

import { useEffect, useState } from "react"

/**
 * LIGAR O SKOOL — um ecrã só para o dono colar a sessão do Skool.
 *
 * O Skool não tem API pública: o ciclo automático (desafios, bootcamp, respostas, acessos) fala com
 * ele com a sessão da conta de dono. O cookie principal é httpOnly, por isso só quem está no browser
 * o pode copiar. Fica guardado em integracoes_privadas e nunca volta a aparecer aqui.
 */

interface Estado {
  sessao: { existe: boolean; atualizadaEm?: string; funciona?: boolean; conta?: string; erro?: string }
  ciclo: { ultimaCorrida: string | null; ultimoErro: string | null }
}

const quando = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" }) : "nunca")

export default function LigarSkool() {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [cookie, setCookie] = useState("")
  const [aGravar, setAGravar] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const ler = async () => {
    const r = await fetch("/api/admin/skool/sessao", { cache: "no-store" })
    if (r.ok) setEstado(await r.json())
    else setAviso("Este ecrã é só para o super admin.")
  }
  useEffect(() => { void ler() }, [])

  const gravar = async () => {
    setAGravar(true)
    setAviso(null)
    try {
      const r = await fetch("/api/admin/skool/sessao", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cookie }) })
      const j = await r.json()
      if (!r.ok) setAviso(j.erro ?? "Não consegui guardar.")
      else {
        setEstado(j)
        setCookie("")
        setAviso(j.sessao?.funciona ? "Ligado. O ciclo do Skool arranca na próxima hora." : "Guardei, mas o Skool não aceitou. Volta a copiar o cookie.")
      }
    } finally {
      setAGravar(false)
    }
  }

  const s = estado?.sessao
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6 text-white">
      <div>
        <h1 className="text-2xl font-bold text-[#E9C46A]">Ligar o Skool</h1>
        <p className="mt-1 text-sm text-gray-400">A comunidade só corre sozinha com a tua sessão de dono do Skool guardada aqui.</p>
      </div>

      <div className="rounded-xl border border-gray-800 bg-black/40 p-4 text-sm">
        {!estado ? "A ler…" : s?.existe ? (
          <div className="space-y-1">
            <div>Estado: {s.funciona ? <b className="text-green-400">ligado{s.conta ? ` como ${s.conta}` : ""}</b> : <b className="text-red-400">a sessão já não funciona</b>}</div>
            <div className="text-gray-400">Guardada a {quando(s.atualizadaEm)}</div>
            <div className="text-gray-400">Última corrida do ciclo: {quando(estado.ciclo.ultimaCorrida)}</div>
            {estado.ciclo.ultimoErro && <div className="text-amber-400">Último erro: {estado.ciclo.ultimoErro.slice(0, 200)}</div>}
          </div>
        ) : <b className="text-amber-400">Ainda sem sessão guardada.</b>}
      </div>

      <ol className="list-decimal space-y-2 pl-5 text-sm text-gray-300">
        <li>No Chrome, abre <a className="text-[#E9C46A] underline" href="https://www.skool.com/morethanmoney-1132" target="_blank" rel="noreferrer">a comunidade no Skool</a> com a tua conta de dono.</li>
        <li>Carrega em <b>Cmd + Option + I</b>, separador <b>Network</b>, e recarrega a página.</li>
        <li>Clica no primeiro pedido (morethanmoney-1132), procura <b>Request Headers → cookie</b> e copia o valor todo.</li>
        <li>Cola aqui em baixo e grava. Repete quando este ecrã disser que a sessão já não funciona (a firewall do Skool renova a cada 3 a 4 dias).</li>
      </ol>

      <textarea value={cookie} onChange={(e) => setCookie(e.target.value)} rows={5} placeholder="cookie: …"
        className="w-full rounded-lg border border-gray-700 bg-black/40 px-3 py-2 font-mono text-xs text-white outline-none focus:border-[#D2A63C]" />
      <button onClick={gravar} disabled={aGravar || cookie.length < 20}
        className="rounded-lg bg-[#D2A63C] px-5 py-2 font-semibold text-black disabled:opacity-40">
        {aGravar ? "A gravar…" : "Gravar e testar"}
      </button>
      {aviso && <p className="text-sm text-[#E9C46A]">{aviso}</p>}
    </div>
  )
}
