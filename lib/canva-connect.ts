import { uploadBufferToBucket } from '@/lib/instagram/publish'

/**
 * Canva Connect API (headless) — autofill de um brand template + export → imagem no bucket.
 * DORMENTE até estar configurado. Requer:
 *   - CANVA_CONNECT_TOKEN   : access token OAuth do Canva Connect (plano pago).
 *   - CANVA_BRAND_TEMPLATE_ID: id do brand template COM dataset (campos de texto).
 *   - CANVA_FIELDS (opcional): JSON a mapear {hook,cta,proof} → nomes dos campos do template.
 *                              default: {"hook":"hook","cta":"cta","proof":"proof"}.
 *
 * Se algo faltar/falhar, devolve null → o chamador cai no card gerado (lib/social-card).
 * Nota: o autofill do Canva exige plano pago (Pro/Teams/Enterprise); no plano free a API devolve
 * "requires a Canva paid plan".
 */
const BASE = 'https://api.canva.com/rest/v1'

export function canvaConfigured(): boolean {
  return Boolean(process.env.CANVA_CONNECT_TOKEN?.trim() && process.env.CANVA_BRAND_TEMPLATE_ID?.trim())
}

function fieldMap(): { hook: string; cta: string; proof: string } {
  try {
    const m = JSON.parse(process.env.CANVA_FIELDS || '{}')
    return { hook: m.hook || 'hook', cta: m.cta || 'cta', proof: m.proof || 'proof' }
  } catch {
    return { hook: 'hook', cta: 'cta', proof: 'proof' }
  }
}

async function api(path: string, init?: RequestInit): Promise<any> {
  const token = process.env.CANVA_CONNECT_TOKEN!.trim()
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`Canva ${r.status}: ${JSON.stringify(j).slice(0, 160)}`)
  return j
}

/** Espera um job (autofill/export) concluir. Devolve o objeto job ou lança. */
async function pollJob(getPath: string, tries = 8): Promise<any> {
  for (let i = 0; i < tries; i++) {
    const j = await api(getPath)
    const job = j.job || j
    const status = job.status
    if (status === 'success') return job
    if (status === 'failed') throw new Error(`job falhou: ${JSON.stringify(job.error || {}).slice(0, 120)}`)
    await new Promise((res) => setTimeout(res, 1500))
  }
  throw new Error('job não concluiu a tempo')
}

/**
 * Autofila o brand template com o gancho/CTA, exporta PNG e devolve o URL público (bucket).
 * null em qualquer falha (→ fallback para o card gerado).
 */
export async function canvaAutofillImage(hook: string, cta: string): Promise<string | null> {
  if (!canvaConfigured()) return null
  try {
    const f = fieldMap()
    const data: Record<string, unknown> = {
      [f.hook]: { type: 'text', text: hook },
      [f.cta]: { type: 'text', text: cta ? `Comenta «${cta}»` : '' },
      [f.proof]: { type: 'text', text: '675 trades · 63% win rate · +7.060€' },
    }
    // 1) autofill → design
    const start = await api('/autofills', {
      method: 'POST',
      body: JSON.stringify({ brand_template_id: process.env.CANVA_BRAND_TEMPLATE_ID!.trim(), data }),
    })
    const jobId = (start.job || start).id
    const done = await pollJob(`/autofills/${jobId}`)
    const designId = done.result?.design?.id || done.design?.id
    if (!designId) return null

    // 2) export PNG
    const exp = await api('/exports', {
      method: 'POST',
      body: JSON.stringify({ design_id: designId, format: { type: 'png' } }),
    })
    const expId = (exp.job || exp).id
    const expDone = await pollJob(`/exports/${expId}`)
    const url: string | undefined = (expDone.urls || expDone.result?.urls || [])[0]
    if (!url) return null

    // 3) re-hospeda no bucket estável
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return await uploadBufferToBucket(buf, 'image/png', 'canva')
  } catch (e) {
    console.error('[canva-connect] falhou (fallback p/ card):', e instanceof Error ? e.message : e)
    return null
  }
}
