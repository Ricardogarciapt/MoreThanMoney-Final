"use client"

import { useEffect, useState } from "react"

/**
 * /admin/mentor — o que os alunos dizem ao Mentor, arrumado para quem decide:
 * pauta da reunião de educação, quem precisa de uma pessoa, interesse em upgrade e testemunhos
 * autorizados. Lê `/api/admin/mentor` (protegido como o resto do /admin).
 */
type Linha = { id: string; tipo: string; tema: string | null; resumo: string | null; idioma: string | null; created_at: string; aluno: { nome: string | null; email: string | null } | null }
type Dados = {
  ok: boolean
  erro?: string
  dias: number
  alunosAtivos: number
  mensagensDeAlunos: number
  porTipo: Record<string, number>
  idiomas: Record<string, number>
  pautaEducacao: { tema: string; n: number }[]
  acompanhamento: Linha[]
  upgrade: Linha[]
  testemunhos: Linha[]
  feedbackProduto: Linha[]
}

const ROTULO: Record<string, string> = {
  duvida_educativa: "Dúvidas de aula",
  bloqueio: "Bloqueios",
  emocao: "Emoção",
  risco: "Risco",
  interesse_upgrade: "Interesse em upgrade",
  pedido_humano: "Pediu uma pessoa",
  resultado: "Resultados contados",
  testemunho_possivel: "Testemunhos",
  feedback_produto: "Feedback de produto",
}

export default function AdminMentorPage() {
  const [dias, setDias] = useState(30)
  const [d, setD] = useState<Dados | null>(null)

  const carregar = () =>
    fetch(`/api/admin/mentor?dias=${dias}`, { cache: "no-store" })
      .then((r) => r.json())
      .then(setD)
      .catch(() => setD({ ok: false, erro: "Sem ligação" } as Dados))

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias])

  const tratar = async (id: string) => {
    await fetch("/api/admin/mentor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "tratar", id }) })
    carregar()
  }

  const Lista = ({ titulo, linhas }: { titulo: string; linhas: Linha[] }) => (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="text-sm font-semibold text-[#E9C46A] mb-3">
        {titulo} <span className="text-gray-500 font-normal">({linhas.length})</span>
      </h2>
      {linhas.length === 0 ? (
        <p className="text-xs text-gray-500">Nada por tratar.</p>
      ) : (
        <ul className="space-y-2">
          {linhas.map((l) => (
            <li key={l.id} className="text-xs text-gray-300 border-b border-white/5 pb-2 flex gap-3 justify-between">
              <div className="min-w-0">
                <p className="text-white">
                  {l.aluno?.nome || "Aluno"} <span className="text-gray-500">{l.aluno?.email}</span>
                </p>
                <p>
                  <span className="text-[#D2A63C]">{ROTULO[l.tipo] || l.tipo}</span> · {l.tema} {l.idioma ? `· ${l.idioma}` : ""}
                </p>
                <p className="text-gray-400">{l.resumo}</p>
              </div>
              <button onClick={() => tratar(l.id)} className="shrink-0 self-start rounded-lg border border-white/15 px-2 py-1 text-[11px] hover:border-[#D2A63C]">
                Tratado
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )

  return (
    <div className="min-h-screen bg-[#0b0b0d] text-white px-4 py-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold">Mentor · o que os alunos dizem</h1>
          <p className="text-xs text-gray-400">Para as reuniões de educação, o onboarding, o follow-up, o upgrade e os testemunhos.</p>
        </div>
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="bg-black border border-white/15 rounded-lg px-2 py-1 text-sm">
          {[7, 30, 90].map((n) => (
            <option key={n} value={n}>
              {n} dias
            </option>
          ))}
        </select>
      </div>

      {!d ? (
        <p className="text-sm text-gray-400">A carregar…</p>
      ) : !d.ok ? (
        <p className="text-sm text-red-400">{d.erro}</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Kpi t="Alunos a falar com o Mentor" v={d.alunosAtivos} />
            <Kpi t="Mensagens de alunos" v={d.mensagensDeAlunos} />
            <Kpi t="Pediram uma pessoa" v={d.porTipo.pedido_humano || 0} />
            <Kpi t="Interesse em upgrade" v={d.porTipo.interesse_upgrade || 0} />
          </div>
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <h2 className="text-sm font-semibold text-[#E9C46A] mb-3">Pauta da reunião de educação (dúvidas mais repetidas)</h2>
            {d.pautaEducacao.length === 0 ? (
              <p className="text-xs text-gray-500">Ainda sem dúvidas registadas.</p>
            ) : (
              <ol className="list-decimal pl-5 text-sm text-gray-200 space-y-1">
                {d.pautaEducacao.map((p) => (
                  <li key={p.tema}>
                    {p.tema} <span className="text-gray-500">×{p.n}</span>
                  </li>
                ))}
              </ol>
            )}
            {Object.keys(d.idiomas).length > 0 && (
              <p className="mt-3 text-[11px] text-gray-500">
                Línguas: {Object.entries(d.idiomas).map(([l, n]) => `${l} ${n}`).join(" · ")}
              </p>
            )}
          </section>
          <Lista titulo="Acompanhamento humano (pediu uma pessoa, emoção, risco, bloqueio)" linhas={d.acompanhamento} />
          <Lista titulo="Interesse em upgrade" linhas={d.upgrade} />
          <Lista titulo="Resultados e testemunhos autorizados para contacto" linhas={d.testemunhos} />
          <Lista titulo="Feedback de produto" linhas={d.feedbackProduto} />
          <p className="text-[11px] text-gray-500">
            Testemunho autorizado = o aluno aceitou ser contactado. Publicar exige o texto final e o nome/foto aprovados por ele.
          </p>
        </div>
      )}
    </div>
  )
}

function Kpi({ t, v }: { t: string; v: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[11px] text-gray-400">{t}</p>
      <p className="text-2xl font-bold text-[#D2A63C]">{v}</p>
    </div>
  )
}
