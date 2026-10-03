"use client"

import SincronizacaoCopia from "@/components/admin/mtmauto-copia/sincronizacao"
import { CONFIRMACOES } from "@/lib/admin-centro/regras"
import { useCentroCtx } from "../contexto"
import { Aviso, BotaoLer, Botao, Painel, Pilula, Tabela, Vazio, fmtQuando, pedirCentro, pedirPalavra, td, th, useCentro } from "../ui"

type Auditoria = { linhas: { origem: "centro" | "mtmfunded"; id: string; quem: string; acao: string; alvo: string | null; ok: boolean; detalhe: unknown; em: string }[]; centroPendente: boolean; fundedPendente: boolean }

export default function SeccaoSincronizacao() {
  const ctx = useCentroCtx()
  const aud = useCentro<Auditoria>(`/api/admin/centro/auditoria?v=${ctx.versao}`, 30_000)
  const flag = useCentro<{ padrao: boolean; porEnv: boolean }>(`/api/admin/centro/acoes?v=${ctx.versao}`, 60_000)

  const alternarFlag = async () => {
    if (!flag.dados) return
    const ligar = !flag.dados.padrao
    const palavra = pedirPalavra(ligar ? "Tornar o Centro de Controlo a página por defeito: /admin/mtmcopy passa a redireccionar para /admin/centro." : "Voltar a abrir a página antiga em /admin/mtmcopy.", CONFIRMACOES.flag_padrao)
    if (!palavra) return
    const r = await pedirCentro("/api/admin/centro/acoes", { method: "POST", body: { acao: "flag_padrao", ligado: ligar, confirmacao: palavra } })
    if (!r.success) alert(r.error)
    ctx.depoisDeAcao()
  }

  return (
    <div className="space-y-4">
      <Painel titulo="Transição" sub="Flag site_settings.admin_centro_padrao (ou env ADMIN_CENTRO_PADRAO=1).">
        <div className="flex flex-wrap items-center gap-2">
          <Pilula tom={flag.dados?.padrao ? "ok" : "neutro"}>{flag.dados?.padrao ? "/admin/mtmcopy → /admin/centro" : "página antiga activa"}</Pilula>
          {flag.dados?.porEnv && <Pilula tom="info">forçado por env</Pilula>}
          <Botao tom="ouro" onClick={alternarFlag} disabled={!flag.dados || flag.dados.porEnv}>{flag.dados?.padrao ? "Voltar à página antiga" : "Tornar o Centro a página por defeito"}</Botao>
        </div>
      </Painel>

      <Painel titulo="Sincronizar tudo" sub="Pré-visualiza órfãs, estratégias mortas, duplicados e quota (lê a MetaApi/CopyFactory quando pedes); aplica só o que escolheres.">
        <SincronizacaoCopia />
      </Painel>

      <Painel titulo="Auditoria do admin" sub="Acções do Centro (095) + gestão das contas MTM Funded (079)." accao={<BotaoLer onClick={aud.recarregar} aCarregar={aud.aCarregar} lidoEm={aud.lidoEm} />}>
        {aud.dados?.centroPendente && <div className="mb-2"><Aviso tom="info">Tabela admin_centro_auditoria (095) por aplicar: as acções do Centro ficam só nos logs da Vercel.</Aviso></div>}
        {!aud.dados ? <Vazio>A ler…</Vazio> : aud.dados.linhas.length === 0 ? <Vazio>Sem registos.</Vazio> : (
          <Tabela min={760}>
            <thead><tr><th className={th}>Quando</th><th className={th}>Quem</th><th className={th}>Origem</th><th className={th}>Acção</th><th className={th}>Alvo</th><th className={th}>Resultado</th></tr></thead>
            <tbody>
              {aud.dados.linhas.map((l) => (
                <tr key={`${l.origem}:${l.id}`}>
                  <td className={`${td} font-mono whitespace-nowrap`}>{fmtQuando(l.em)}</td>
                  <td className={td}>{l.quem}</td>
                  <td className={td}>{l.origem}</td>
                  <td className={td}>{l.acao}</td>
                  <td className={`${td} font-mono text-[10.5px]`}>
                    {l.alvo && /^(site|auto|wt|funded):/.test(l.alvo) ? <button type="button" className="hover:text-[#E9C46A]" onClick={() => ctx.abrir({ tipo: "conta", id: l.alvo! })}>{l.alvo}</button> : l.alvo ?? "—"}
                  </td>
                  <td className={td}><Pilula tom={l.ok ? "ok" : "grave"}>{l.ok ? "ok" : "falhou"}</Pilula> <span className="text-[10.5px] text-zinc-500">{typeof l.detalhe === "string" ? l.detalhe : (l.detalhe as { mensagem?: string } | null)?.mensagem ?? ""}</span></td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Painel>
    </div>
  )
}
