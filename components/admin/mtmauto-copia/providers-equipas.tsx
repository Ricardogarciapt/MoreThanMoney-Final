"use client"

import { Aviso, BotaoRecarregar, Etiqueta, Tabela, td, th, useDadosAdmin } from "./comum"

interface Provider { id: string; nome: string; slug: string; tipo: string; ativo: boolean; espelhar: boolean; conta: string | null; chave: "casa" | "equipa" | "—"; fonteDeCopia: boolean; rotas: number; partilhadaCom: string[]; fonteExecucao: "mestre" | "espelho" }
interface Equipa { tenantId: string | null; nome: string; temChaveMetaApi: boolean; quotaProvidersMetaApi: number | null; providersMetaApi: number; providers: Provider[] }

const TIPO: Record<string, string> = { metaapi: "MT4/MT5", mtmfunded: "MTM Funded", tradelocker: "TradeLocker", mtm_t2t: "Fonte MTM", telegram: "Telegram" }

/**
 * Providers por equipa MTM Auto — só leitura. Cria-se e edita-se no admin da equipa (app MTM Auto →
 * Definições → Admin). «Fonte de cópia» = a conta pode ser origem de rotas (prov:), partilhando a
 * ligação com a entrega aos seguidores.
 */
export default function ProvidersEquipas() {
  const { dados, erro, aCarregar, recarregar } = useDadosAdmin<{ equipas: Equipa[] }>("/api/admin/mtmauto-copia/providers")
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-zinc-500">Contas de estratégia de cada equipa. Nenhuma chave nem credencial sai do servidor.</p>
        <BotaoRecarregar onClick={() => void recarregar()} aCarregar={aCarregar} />
      </div>
      {erro && <Aviso tom="grave">{erro}</Aviso>}
      {(dados?.equipas ?? []).map((e) => (
        <div key={e.tenantId ?? "casa"} className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-200">
            {e.nome}
            {e.tenantId && <Etiqueta tom={e.temChaveMetaApi ? "ok" : "neutro"}>{e.temChaveMetaApi ? "chave MetaApi própria" : "usa a chave da casa"}</Etiqueta>}
            {e.tenantId && <Etiqueta tom={e.quotaProvidersMetaApi != null && e.providersMetaApi > e.quotaProvidersMetaApi ? "aviso" : "neutro"}>MetaApi {e.providersMetaApi}/{e.quotaProvidersMetaApi ?? 3}</Etiqueta>}
          </div>
          {e.providers.length === 0 ? (
            <p className="text-xs text-zinc-500">Sem providers.</p>
          ) : (
            <Tabela>
              <thead><tr><th className={th}>Estratégia</th><th className={th}>Tipo</th><th className={th}>Conta</th><th className={th}>Chave</th><th className={th}>Fonte</th><th className={th}>Estado</th><th className={th}>Cópia</th><th className={th}>Partilhada com</th></tr></thead>
              <tbody>
                {e.providers.map((p) => (
                  <tr key={p.id}>
                    <td className={td}><span className="text-zinc-200">{p.nome}</span><span className="block text-[10px] text-zinc-500">{p.slug}</span></td>
                    <td className={td}>{TIPO[p.tipo] ?? p.tipo}</td>
                    <td className={td}>{p.conta ?? "—"}</td>
                    <td className={td}>{p.chave}</td>
                    <td className={td}><Etiqueta tom={p.fonteExecucao === "espelho" ? "info" : "neutro"}>{p.fonteExecucao}</Etiqueta></td>
                    <td className={td}><Etiqueta tom={p.ativo ? "ok" : "neutro"}>{p.ativo ? "activa" : "inactiva"}</Etiqueta> {p.espelhar && <Etiqueta tom="info">espelha</Etiqueta>}</td>
                    <td className={td}>{p.fonteDeCopia ? <Etiqueta tom="ouro">fonte · {p.rotas} rota(s)</Etiqueta> : "—"}</td>
                    <td className={td}>{p.partilhadaCom.join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          )}
        </div>
      ))}
    </div>
  )
}
