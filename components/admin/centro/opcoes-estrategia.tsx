"use client"

import { useEffect, useState } from "react"
import { CAMPOS_OPCOES, type CampoOpcao, type ChaveOpcao, type OpcoesEstrategia } from "@/lib/estrategias-admin/opcoes"
import { Aviso, Botao, Vazio, pedirCentro, pedirPalavra } from "./ui"

/**
 * AS OPÇÕES DE ADMIN DE UMA ESTRATÉGIA, dentro da gaveta dela.
 *
 * Até aqui, quem abria uma estratégia no Centro via tudo — quem executa, quem a segue, como correu
 * — e depois tinha de sair para o admin da MTM Auto só para mudar um número. Agora muda-se aqui, a
 * escrever na MESMA tabela (`mtmauto_providers`) e pela mesma regra
 * (`lib/estrategias-admin/opcoes.ts`), que é a que o ecrã da MTM Auto também usa.
 *
 * Os campos não estão escritos neste ficheiro: vêm da descrição partilhada. Acrescentar uma opção
 * é acrescentá-la lá, e ela aparece nos dois admins.
 */
type Ficha = {
  id: string
  slug: string
  nome: string
  tipo: string | null
  apagada: boolean
  opcoes: OpcoesEstrategia
  campos: CampoOpcao[]
  confirmacao: string
}

/** O valor no formulário: os números e as listas editam-se como texto, para «vazio» existir. */
type Rascunho = Record<ChaveOpcao, string | boolean>

function paraRascunho(o: OpcoesEstrategia): Rascunho {
  const r = {} as Rascunho
  for (const c of CAMPOS_OPCOES) {
    const v = o[c.chave]
    r[c.chave] = c.tipo === "interruptor" ? v === true : Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v)
  }
  return r
}

/** Só o que MUDOU segue no pedido — assim um campo esquecido nunca apaga o que lá estava. */
function corpoDoPedido(base: Rascunho, agora: Rascunho): Record<string, unknown> {
  const corpo: Record<string, unknown> = {}
  for (const c of CAMPOS_OPCOES) {
    if (base[c.chave] === agora[c.chave]) continue
    corpo[c.chave] = agora[c.chave]
  }
  return corpo
}

export default function OpcoesEstrategia({ providerId, versao, aoGravar }: { providerId: string; versao: number; aoGravar?: () => void }) {
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [base, setBase] = useState<Rascunho | null>(null)
  const [agora, setAgora] = useState<Rascunho | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)

  useEffect(() => {
    let vivo = true
    setErro(null)
    void pedirCentro<Ficha>(`/api/admin/centro/estrategia-opcoes?id=${encodeURIComponent(providerId)}&v=${versao}`).then((r) => {
      if (!vivo) return
      if (!r.success || !r.data) { setErro(r.error ?? "Não deu para ler as opções."); return }
      const rasc = paraRascunho(r.data.opcoes)
      setFicha(r.data); setBase(rasc); setAgora(rasc)
    })
    return () => { vivo = false }
  }, [providerId, versao])

  if (erro) return <Aviso tom="aviso">Opções da estratégia: {erro}</Aviso>
  if (!ficha || !base || !agora) return <Vazio>A ler as opções…</Vazio>

  const alterado = CAMPOS_OPCOES.some((c) => base[c.chave] !== agora[c.chave])

  const gravar = async () => {
    const corpo = corpoDoPedido(base, agora)
    const nomes = Object.keys(corpo).map((k) => CAMPOS_OPCOES.find((c) => c.chave === k)?.rotulo ?? k)
    const palavra = pedirPalavra(
      `Gravar em «${ficha.nome}»:\n· ${nomes.join("\n· ")}\n\nEscreve na mesma tabela que o admin da MTM Auto (mtmauto_providers).`,
      ficha.confirmacao,
    )
    if (!palavra) return
    setOcupado(true)
    const r = await pedirCentro<{ message?: string; opcoes?: OpcoesEstrategia }>("/api/admin/centro/estrategia-opcoes", {
      method: "POST",
      body: { providerId, confirmacao: palavra, ...corpo },
    })
    setOcupado(false)
    setMsg({ ok: r.success, texto: r.success ? r.data?.message ?? "gravado" : r.error ?? "falhou" })
    if (r.success && r.data?.opcoes) {
      const rasc = paraRascunho(r.data.opcoes)
      setBase(rasc); setAgora(rasc)
      aoGravar?.()
    }
  }

  return (
    <div className="rounded-xl border border-white/[0.06] p-3">
      <p className="mb-0.5 text-[10px] uppercase tracking-wider text-zinc-500">Opções da estratégia</p>
      <p className="mb-2 text-[10.5px] leading-snug text-zinc-500">
        As mesmas de <span className="text-zinc-300">/definicoes/admin</span> na MTM Auto, na mesma tabela e pela mesma
        regra. As contas e a fonte de execução não se mexem daqui — têm as rotas delas.
      </p>
      {ficha.apagada && <Aviso tom="grave">Estratégia apagada: as opções ficam como estão.</Aviso>}

      <div className="space-y-2">
        {ficha.campos.map((c) => {
          const v = agora[c.chave]
          const mudou = base[c.chave] !== v
          return (
            <label key={c.chave} className={`block rounded-lg border p-2 ${mudou ? "border-[#D2A63C]/40 bg-[#D2A63C]/[0.05]" : "border-white/[0.05]"}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11.5px] font-medium text-zinc-200">{c.rotulo}</span>
                {c.tipo === "interruptor" ? (
                  <input
                    type="checkbox" checked={v === true} disabled={ficha.apagada}
                    onChange={(e) => setAgora({ ...agora, [c.chave]: e.target.checked })}
                    className="h-4 w-4 accent-[#D2A63C]"
                  />
                ) : (
                  <input
                    type={c.tipo === "numero" ? "number" : "text"}
                    inputMode={c.tipo === "numero" ? "decimal" : undefined}
                    min={c.min} max={c.max} step={c.passo}
                    value={String(v ?? "")} disabled={ficha.apagada}
                    placeholder={c.tipo === "numero" ? "—" : "tudo"}
                    onChange={(e) => setAgora({ ...agora, [c.chave]: e.target.value })}
                    className="w-40 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-right font-mono text-[11.5px] text-zinc-100 outline-none focus:border-[#D2A63C] disabled:opacity-40"
                  />
                )}
              </div>
              <span className="mt-0.5 block text-[10.5px] leading-snug text-zinc-500">{c.nota}</span>
            </label>
          )
        })}
      </div>

      {msg && <div className="mt-2"><Aviso tom={msg.ok ? "info" : "grave"}>{msg.texto}</Aviso></div>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Botao tom="ouro" onClick={() => void gravar()} disabled={!alterado || ocupado || ficha.apagada}>
          {ocupado ? "A gravar…" : "Gravar opções"}
        </Botao>
        <Botao onClick={() => setAgora(base)} disabled={!alterado || ocupado}>Repor</Botao>
        {!alterado && <span className="text-[10.5px] text-zinc-600">Sem alterações por gravar.</span>}
      </div>
    </div>
  )
}
