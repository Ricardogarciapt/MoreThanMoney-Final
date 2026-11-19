"use client"

import type { CadeiaLida } from "@/lib/copia-contas/servidor/cadeia"
import GestorRotas from "@/components/admin/copia-cadeia/gestor-rotas"
import { useCentroCtx } from "../contexto"
import { Aviso, BotaoLer, useCentro } from "../ui"

/**
 * GESTOR DE ROTAS (19/11/2026) — a porta simples da cópia. O avançado (lista detalhada, quadro livre,
 * rotas conta→conta, eventos, sincronização) continua em «Cópia (avançado)».
 */
export default function SeccaoRotas() {
  const ctx = useCentroCtx()
  const { dados, erro, aCarregar, recarregar, lidoEm } = useCentro<CadeiaLida>(`/api/admin/mtmauto-copia/cadeia?v=${ctx.versao}`, 30_000)
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><BotaoLer onClick={recarregar} aCarregar={aCarregar} lidoEm={lidoEm} /></div>
      {dados?.avisos?.map((a, i) => <Aviso key={i} tom="grave">{a}</Aviso>)}
      {erro && <Aviso tom="grave">{erro}</Aviso>}
      {!dados && !erro && <p className="text-[12px] text-zinc-500">A ler as estratégias e as contas…</p>}
      {dados && <GestorRotas c={dados} recarregar={() => ctx.depoisDeAcao()} />}
    </div>
  )
}
