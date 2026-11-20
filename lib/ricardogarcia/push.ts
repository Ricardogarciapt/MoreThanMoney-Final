// Notificações push da app Missão. Usa o mesmo projecto Firebase da app MTM (FCM web push), mas
// com tokens próprios (rg_app_push), porque a app Missão tem sessão e service worker próprios.
// A mensagem vai só com «data»: é o service worker da app que a mostra, com o ícone e o link certos.
import { db } from '@/lib/ricardogarcia/app'
import { lerContaFirebase } from '@/lib/firebase-conta'

export type TipoPush = 'missao' | 'chat' | 'serie' | 'ricardo'

export function configPush() {
  const e = (k: string) => (process.env[k] || '').trim()
  const cfg = { apiKey: e('NEXT_PUBLIC_FIREBASE_API_KEY'), authDomain: e('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'), projectId: e('NEXT_PUBLIC_FIREBASE_PROJECT_ID'), messagingSenderId: e('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'), appId: e('NEXT_PUBLIC_FIREBASE_APP_ID') }
  const vapid = e('NEXT_PUBLIC_FIREBASE_VAPID_KEY')
  return cfg.apiKey && cfg.projectId && cfg.messagingSenderId && cfg.appId && vapid ? { firebase: cfg, vapid } : null
}

let adminApp: any = null
async function mensageiro() {
  if (adminApp) return adminApp.messaging()
  const mod = (await import('firebase-admin')) as any
  const admin = mod.default ?? mod
  const conta = lerContaFirebase()
  if (!conta) return null
  adminApp = admin.apps.find((a: any) => a?.name === 'missao') || admin.initializeApp({ credential: admin.credential.cert(conta) }, 'missao')
  return adminApp.messaging()
}

export async function guardarToken(membroId: string, token: string) {
  if (!/^[\w:-]{100,4096}$/.test(token || '')) return false
  await db().from('rg_app_push').upsert({ token, membro_id: membroId, visto: new Date().toISOString() }, { onConflict: 'token' })
  return true
}
export async function tirarToken(membroId: string, token?: string) {
  let q = db().from('rg_app_push').delete().eq('membro_id', membroId)
  if (token) q = q.eq('token', token)
  await q
}

/** Envia a quem tem a app com notificações ligadas e não desligou este tipo. Devolve quantos telemóveis receberam. */
export async function enviarPush(membroIds: string[], tipo: TipoPush, msg: { titulo: string; corpo: string; url?: string; tag?: string }) {
  if (!membroIds.length) return 0
  const { data: prefs } = await db().from('rg_app_membros').select('id, push_prefs').in('id', membroIds)
  const ok = new Set((prefs || []).filter(p => tipo === 'ricardo' || (p.push_prefs || {})[tipo] !== false).map(p => p.id))
  const { data: toks } = await db().from('rg_app_push').select('token, membro_id').in('membro_id', [...ok])
  const tokens = (toks || []).map(t => t.token)
  if (!tokens.length) return 0
  const m = await mensageiro()
  if (!m) return 0
  let enviados = 0
  const mortos: string[] = []
  for (let i = 0; i < tokens.length; i += 500) {
    const lote = tokens.slice(i, i + 500)
    const r = await m.sendEachForMulticast({
      tokens: lote,
      data: { titulo: msg.titulo.slice(0, 80), corpo: msg.corpo.slice(0, 180), url: msg.url || '/ricardogarcia/app', tag: msg.tag || tipo, tipo },
      webpush: { headers: { TTL: '21600', Urgency: tipo === 'chat' ? 'high' : 'normal' } },
    })
    enviados += r.successCount
    r.responses.forEach((x: any, k: number) => { const c = x.error?.code || ''; if (/registration-token-not-registered|invalid-registration-token|invalid-argument/.test(c)) mortos.push(lote[k]) })
  }
  if (mortos.length) await db().from('rg_app_push').delete().in('token', mortos)
  return enviados
}
