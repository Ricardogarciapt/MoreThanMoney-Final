"use client"

import type { carregarFunded } from "@/lib/admin-centro/servidor/outros"
import MtmFundedManager from "@/components/admin/mtmfunded-manager"

import { useCentroCtx } from "../contexto"
import { Azulejo, BotaoLer, Recolhivel, fmtNum, useCentro } from "../ui"

type Funded = Awaited<ReturnType<typeof carregarFunded>>

export default function SeccaoFunded({ aoVerContas }: { aoVerContas: () => void }) {
  const ctx = useCentroCtx()
  const { dados: f, erro, aCarregar, recarregar, lidoEm } = useCentro<Funded>(`/api/admin/centro/funded?v=${ctx.versao}`, 30_000)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <Azulejo rotulo="Equidade MTM (casa)" valor={f?.equidadeCasa.pendente ? "—" : `$${fmtNum(f?.equidadeCasa.equity, 0)}`} sub={f?.equidadeCasa.nota} tom={f?.equidadeCasa.pendente ? "neutro" : "ok"} className="md:col-span-2" />
        <Azulejo rotulo="Contas de clientes" valor={f?.clientes ?? "—"} sub={`${f?.contas.length ?? "—"} no total · ${Object.entries(f?.porEstado ?? {}).map(([k, v]) => `${k} ${v}`).join(" · ")}`} />
        <Azulejo rotulo="Mestres de estratégia" valor={f?.mestres.length ?? "—"} sub={(f?.mestres ?? []).map((m) => `${m.rotulo.replace("Mestre · ", "")} ${m.login ?? ""} (${m.modo})`).join(" · ") || "contas SIM da casa que o motor copia"} />
        <Azulejo rotulo="Seguem estratégia" valor={f?.seguidoras ?? "—"} />
        <Azulejo rotulo="Programas" valor={f?.programas.length ?? "—"} sub={`${(f?.programas ?? []).filter((p) => p.ativo === true).length} à venda`} />
      </div>

      {/* As contas Funded já estão na lista «Todas as contas» lá em cima, uma vez cada, e a gaveta delas
          abre a ficha completa. Uma segunda tabela aqui era a mesma informação em dobro. */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[11px] text-zinc-400">
        {erro && <span className="text-rose-300">{erro}</span>}
        <button type="button" onClick={aoVerContas} className="rounded border border-[#D2A63C]/40 px-2 py-0.5 text-[#E9C46A] hover:bg-[#D2A63C]/10">Ver as contas Funded na lista ↑</button>
        <BotaoLer onClick={recarregar} aCarregar={aCarregar} lidoEm={lidoEm} />
      </div>

      <Recolhivel titulo="Gestor MTM Funded completo" descricao="Resumo, lançamento, torneios, participantes, contas, programas, levantamentos, certificados, regras. É o MESMO gestor de /admin › MTM Funded &amp; Torneios.">
        <MtmFundedManager />
      </Recolhivel>

    </div>
  )
}
