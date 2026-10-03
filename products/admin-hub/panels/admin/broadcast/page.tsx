"use client"

import { useState } from "react"

const TEMPLATES = [
  { id: "android_beta", label: "📲 Convite beta Android (teste fechado Play)" },
  { id: "app_review", label: "⭐ Review da app + desafio do mês" },
  { id: "monthly_challenge", label: "🎁 Desafio do mês" },
  { id: "founder_conversion", label: "⏳ Conversão Fundador (31/08)" },
]

export default function AdminBroadcastPage() {
  const [template, setTemplate] = useState("android_beta")
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>([])

  const push = (m: string) => setLog((l) => [`${new Date().toLocaleTimeString()} — ${m}`, ...l])

  async function call(body: Record<string, unknown>, label: string) {
    setBusy(true)
    push(`${label}…`)
    try {
      const r = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ template, ...body }),
      })
      const j = await r.json()
      if (!r.ok) push(`❌ ${r.status}: ${j.error || JSON.stringify(j)}`)
      else push(`✅ ${JSON.stringify(j)}`)
    } catch (e) {
      push(`❌ ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function sendAll() {
    if (!confirm("Enviar este email a TODA a comunidade (profiles com email)? Ação irreversível.")) return
    // Envia em lotes até done.
    let offset = 0
    setBusy(true)
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        push(`A enviar lote (offset ${offset})…`)
        const r = await fetch("/api/admin/broadcast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ template, offset, limit: 200 }),
        })
        const j = await r.json()
        if (!r.ok) { push(`❌ ${r.status}: ${j.error || JSON.stringify(j)}`); break }
        push(`✅ lote: enviados=${j.sent} falhas=${j.failed} (${j.nextOffset}/${j.total})`)
        if (j.done) { push(`🏁 Concluído. Total enviados até ${j.total}.`); break }
        offset = j.nextOffset
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 20, color: "#eaeaea", fontFamily: "system-ui" }}>
      <h1 style={{ color: "#D2A63C" }}>Broadcast à comunidade</h1>
      <p style={{ color: "#9a9aa5", fontSize: 13 }}>
        Envia emails em massa via Gmail do site. Requer sessão de admin. Faz sempre <b>Contar</b> e <b>Testar</b> antes de enviar a todos.
      </p>

      <label style={{ display: "block", margin: "18px 0 6px", fontSize: 13, color: "#9a9aa5" }}>Template</label>
      <select
        value={template}
        onChange={(e) => setTemplate(e.target.value)}
        disabled={busy}
        style={{ width: "100%", padding: 10, background: "#15151d", color: "#eaeaea", border: "1px solid #26263a", borderRadius: 8 }}
      >
        {TEMPLATES.map((t) => (
          <option key={t.id} value={t.id}>{t.label}</option>
        ))}
      </select>

      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <button onClick={() => call({ dryRun: true }, "Contar destinatários")} disabled={busy}
          style={btn("#26263a")}>Contar destinatários</button>
        <button onClick={() => call({ test: true }, "Enviar teste a mim")} disabled={busy}
          style={btn("#2a3a5a")}>Enviar teste a mim</button>
        <button onClick={sendAll} disabled={busy}
          style={btn("#7a5a12", "#f6c85a")}>ENVIAR A TODOS</button>
      </div>

      <div style={{ marginTop: 24, background: "#0f0f16", border: "1px solid #26263a", borderRadius: 10, padding: 14, minHeight: 120, fontSize: 13, whiteSpace: "pre-wrap" }}>
        {log.length === 0 ? <span style={{ color: "#6a6a78" }}>Sem atividade ainda.</span> : log.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  )
}

function btn(bg: string, fg = "#eaeaea"): React.CSSProperties {
  return { padding: "10px 18px", background: bg, color: fg, border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }
}
