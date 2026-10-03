"use client"

import { useState } from "react"

/**
 * ESCREVER A ALGUÉM POR WHATSAPP — o ecrã.
 *
 * O motor já existia e não tinha interface: falar com uma pessoa obrigava a chamar código. O que
 * este ecrã acrescenta não é uma caixa de texto — é SABER, antes de escrever, o que vai acontecer.
 *
 * Primeiro procura-se o número e o ecrã responde: a janela das 24 horas está aberta? há
 * consentimento? a pessoa pediu para sair? Só depois se escreve. Sem esta ordem, isto seria uma
 * caixa que às vezes envia e às vezes não, e quem a usa aprende a não confiar nela — que dá no
 * mesmo que não existir.
 *
 * A decisão mostrada aqui vem do servidor, da MESMA função que decide no envio. Duplicá-la no
 * browser fazia o ecrã mentir exactamente no caso difícil.
 */

interface Estado {
  e164: string
  estado: { ultimaEntrada: string | null; janelaAberta: boolean; retirou: boolean; baseLegal: string | null; canal: string | null }
  pode: { textoLivre: { pode: boolean; porque: string }; campanha: { pode: boolean; porque: string } }
  credenciais: string
  janelaHoras: number
  historico: Array<{ direcao: string; texto: string | null; template: string | null; estado: string; motivo: string | null; criado_em: string }>
}

const CAIXA = "w-full rounded-lg border border-gray-700 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-[#D2A63C]"

export default function EcraWhatsApp() {
  const [numero, setNumero] = useState("")
  const [dados, setDados] = useState<Estado | null>(null)
  const [texto, setTexto] = useState("")
  const [templateNome, setTemplateNome] = useState("")
  const [parametros, setParametros] = useState("")
  const [aCarregar, setACarregar] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  async function procurar() {
    setACarregar(true); setAviso(null); setDados(null)
    try {
      const r = await fetch(`/api/admin/whatsapp?telefone=${encodeURIComponent(numero)}`)
      const j = await r.json()
      if (!r.ok) { setAviso(j?.porque || j?.erro || "Número inválido."); return }
      setDados(j as Estado)
    } catch { setAviso("Não consegui falar com o servidor.") }
    setACarregar(false)
  }

  async function enviar(finalidade: "servico" | "campanha") {
    if (!dados) return
    setACarregar(true); setAviso(null)
    try {
      const corpo = finalidade === "campanha" || !dados.pode.textoLivre.pode
        ? { para: dados.e164, finalidade, template: { nome: templateNome, idioma: "pt_PT", parametros: parametros.split("|").map((s) => s.trim()).filter(Boolean) } }
        : { para: dados.e164, finalidade, texto }
      const r = await fetch("/api/admin/whatsapp", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
      })
      const j = await r.json()
      setAviso(j.ok ? "✅ Enviada." : `⛔ Não saiu: ${j.porque ?? j.erro ?? "motivo desconhecido"}`)
      if (j.ok) { setTexto(""); void procurar() }
    } catch { setAviso("Não consegui falar com o servidor.") }
    setACarregar(false)
  }

  const janelaAberta = dados?.pode.textoLivre.pode === true

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6 text-white">
      <div>
        <h1 className="text-xl font-semibold">WhatsApp — escrever a alguém</h1>
        <p className="mt-1 text-sm text-gray-400">
          Procura o número primeiro. O ecrã diz o que podes enviar antes de escreveres.
        </p>
      </div>

      <div className="flex gap-2">
        <input className={CAIXA} placeholder="912 345 678 ou +351912345678" value={numero}
          onChange={(e) => setNumero(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void procurar() }} />
        <button onClick={() => void procurar()} disabled={aCarregar || !numero.trim()}
          className="shrink-0 rounded-lg bg-[#D2A63C] px-4 py-2 text-sm font-semibold text-black disabled:opacity-40">
          Procurar
        </button>
      </div>

      {aviso && <p className="rounded-lg border border-gray-700 bg-black/30 px-3 py-2 text-sm">{aviso}</p>}

      {dados && (
        <>
          <section className="space-y-2 rounded-xl border border-gray-800 bg-gray-900/40 p-4 text-sm">
            <p className="font-medium">{dados.e164}</p>
            {dados.credenciais !== "ok" && (
              <p className="text-red-400">⚠️ Credenciais do WhatsApp {dados.credenciais} — nada sai daqui até isso estar feito.</p>
            )}
            <p className={dados.estado.retirou ? "text-red-400" : janelaAberta ? "text-emerald-400" : "text-amber-400"}>
              {dados.estado.retirou
                ? "⛔ Esta pessoa pediu para não receber mensagens. Não se escreve."
                : janelaAberta
                  ? `✅ Janela aberta — podes escrever texto livre (fecha ${dados.janelaHoras}h depois da última mensagem dela).`
                  : "⏳ Janela fechada — só sai por template aprovado."}
            </p>
            <p className="text-gray-400">
              Última mensagem dela: {dados.estado.ultimaEntrada ? new Date(dados.estado.ultimaEntrada).toLocaleString("pt-PT") : "nunca"}
              {" · "}Consentimento: {dados.estado.baseLegal === "consentimento" ? `sim (${dados.estado.canal ?? "—"})` : "não registado"}
            </p>
            {!dados.pode.campanha.pode && <p className="text-gray-500">Campanha: {dados.pode.campanha.porque}</p>}
          </section>

          {!dados.estado.retirou && (
            <section className="space-y-3 rounded-xl border border-gray-800 bg-gray-900/40 p-4">
              {janelaAberta ? (
                <>
                  <label className="text-xs uppercase tracking-wide text-gray-500">Mensagem</label>
                  <textarea className={`${CAIXA} min-h-[120px]`} value={texto} onChange={(e) => setTexto(e.target.value)}
                    placeholder="Escreve como falarias com ela." />
                  <button onClick={() => void enviar("servico")} disabled={aCarregar || !texto.trim()}
                    className="rounded-lg bg-[#D2A63C] px-4 py-2 text-sm font-semibold text-black disabled:opacity-40">
                    Enviar
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-400">
                    Fora da janela a Meta só aceita <b>templates aprovados</b>. Escrever texto livre aqui seria
                    uma tentativa recusada — e são essas que fazem um número ser marcado como spam.
                  </p>
                  <label className="text-xs uppercase tracking-wide text-gray-500">Nome do template</label>
                  <input className={CAIXA} value={templateNome} onChange={(e) => setTemplateNome(e.target.value)} placeholder="ex.: lembrete_sessao" />
                  <label className="text-xs uppercase tracking-wide text-gray-500">Parâmetros (separados por |)</label>
                  <input className={CAIXA} value={parametros} onChange={(e) => setParametros(e.target.value)} placeholder="Ricardo | quinta-feira às 21h" />
                  <button onClick={() => void enviar(dados.pode.campanha.pode ? "campanha" : "servico")}
                    disabled={aCarregar || !templateNome.trim()}
                    className="rounded-lg bg-[#D2A63C] px-4 py-2 text-sm font-semibold text-black disabled:opacity-40">
                    Enviar template
                  </button>
                </>
              )}
            </section>
          )}

          <section className="space-y-2">
            <h2 className="text-xs uppercase tracking-wide text-gray-500">Conversa</h2>
            {!dados.historico.length && <p className="text-sm text-gray-500">Ainda não há nada com este número.</p>}
            {dados.historico.map((m, i) => (
              <div key={i} className="rounded-lg border border-gray-800 bg-black/30 p-3 text-sm">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{m.direcao === "entrada" ? "← dela" : "→ nossa"} · {m.estado}</span>
                  <span>{new Date(m.criado_em).toLocaleString("pt-PT")}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-gray-200">{m.texto || m.template || "—"}</p>
                {m.motivo && <p className="mt-1 text-xs text-amber-400">{m.motivo}</p>}
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  )
}
