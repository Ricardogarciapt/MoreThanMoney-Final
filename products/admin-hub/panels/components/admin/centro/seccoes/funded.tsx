"use client"

import { useState } from "react"
import type { carregarFunded } from "@/lib/admin-centro/servidor/outros"
import MtmFundedManager from "@/components/admin/mtmfunded-manager"
import ContaModal from "@/components/admin/mtmfunded-conta-modal"

import { useCentroCtx } from "../contexto"
import { tomEstadoConta } from "./contas"
import { Azulejo, BotaoLer, Lista, Painel, Pilula, Recolhivel, Tabela, fmtNum, td, th, trClic, useCentro } from "../ui"

type Funded = Awaited<ReturnType<typeof carregarFunded>>

export default function SeccaoFunded() {
  const ctx = useCentroCtx()
  const { dados: f, erro, aCarregar, recarregar, lidoEm } = useCentro<Funded>(`/api/admin/centro/funded?v=${ctx.versao}`, 30_000)
  const [modal, setModal] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <Azulejo rotulo="Equidade MTM (casa)" valor={f?.equidadeCasa.pendente ? "—" : `$${fmtNum(f?.equidadeCasa.equity, 0)}`} sub={f?.equidadeCasa.nota} tom={f?.equidadeCasa.pendente ? "neutro" : "ok"} className="md:col-span-2" />
        <Azulejo rotulo="Contas de clientes" valor={f?.clientes ?? "—"} sub={`${f?.contas.length ?? "—"} no total · ${Object.entries(f?.porEstado ?? {}).map(([k, v]) => `${k} ${v}`).join(" · ")}`} />
        <Azulejo rotulo="Mestres de estratégia" valor={f?.mestres.length ?? "—"} sub={(f?.mestres ?? []).map((m) => `${m.rotulo.replace("Mestre · ", "")} ${m.login ?? ""} (${m.modo})`).join(" · ") || "contas SIM da casa que o motor copia"} />
        <Azulejo rotulo="Seguem estratégia" valor={f?.seguidoras ?? "—"} />
        <Azulejo rotulo="Programas" valor={f?.programas.length ?? "—"} sub={`${(f?.programas ?? []).filter((p) => p.ativo === true).length} à venda`} />
      </div>

      <Painel titulo="Contas MTM Funded" sub="Clica para abrir a ficha completa (resumo, métricas, posições, histórico, gestão, levantamentos, auditoria)." accao={<BotaoLer onClick={recarregar} aCarregar={aCarregar} lidoEm={lidoEm} />}>
        <Lista dados={f} erro={erro} vazio={f?.contas.length === 0} textoVazio="Ainda não há contas MTM Funded emitidas.">
          <Tabela min={820}>
            <thead><tr><th className={th}>Login</th><th className={th}>Etiqueta</th><th className={th}>Tipo</th><th className={th}>Dono</th><th className={th}>Estado</th><th className={th}>Saldo / equity</th><th className={th}>Usos</th></tr></thead>
            <tbody>
              {(f?.contas ?? []).map((c) => (
                <tr key={c.ref} className={trClic} onClick={() => setModal(c.ref.slice(7))}>
                  <td className={`${td} font-mono text-zinc-100`}>{c.login ?? "por emitir"}</td>
                  <td className={`${td} text-[#E9C46A]`}>{c.etiquetaDoDono ?? "—"}</td>
                  <td className={td}>
                    {c.mestreDe && <span className="mr-1"><Pilula tom="info" title={`Conta SIM da casa: o motor das mestres copia-a para os clientes (${c.mestreDe.modo}). Não é conta de cliente.`}>{c.mestreDe.rotulo}</Pilula></span>}
                    {c.mestreDe ? c.rotulo?.replace(`${c.mestreDe.rotulo} · `, "") : c.rotulo}
                  </td>
                  <td className={td}>{c.userId ? <button type="button" className="hover:text-[#E9C46A]" onClick={(e) => { e.stopPropagation(); ctx.abrir({ tipo: "utilizador", id: c.userId! }) }}>{c.email ?? c.userId.slice(0, 8)}</button> : "—"}</td>
                  <td className={td}><Pilula tom={tomEstadoConta(c)}>{c.estado}</Pilula>{c.erro && <p className="mt-0.5 text-[10px] text-rose-300">{c.erro}</p>}</td>
                  <td className={`${td} font-mono`}>{fmtNum(c.saldo, 2)} / {fmtNum(c.equity, 2)}</td>
                  <td className={`${td} text-[10.5px] text-zinc-400`}>{c.usos.join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        </Lista>
      </Painel>

      <Recolhivel titulo="Gestor MTM Funded completo" descricao="Resumo, lançamento, torneios, participantes, contas, programas, levantamentos, certificados, regras. É o MESMO gestor de /admin › MTM Funded &amp; Torneios.">
        <MtmFundedManager />
      </Recolhivel>

      {modal && <ContaModal contaId={modal} aoFechar={() => setModal(null)} aoMudar={() => { ctx.depoisDeAcao(); void recarregar() }} />}
    </div>
  )
}
