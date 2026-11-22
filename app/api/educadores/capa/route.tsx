/**
 * CAPAS DO CONTEÚDO DOS EDUCADORES — geradas ao vivo (next/og), estilo MTM: ouro sobre carvão,
 * foto real do educador, título grande. Usadas na página do pacote (/educadores/conteudo/<id>),
 * de onde o educador as descarrega para a conta dele.
 *
 * ?e=ruben&t=Título&s=Subtítulo&f=reel|post|story&n=1/6&fo=nome
 *  - fo: foto REAL em public/educadores/<e>/fotos/<nome>.jpg (só letras, números e hífen).
 *  - reel/story: 1080×1920 · post (carrossel): 1080×1350 (4:5).
 * Pública de propósito (é só uma imagem com texto), como /api/flyer/weekly.
 */
import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const OURO = '#D2A63C'
const OURO_CLARO = '#E9C46A'
const CARVAO = '#0b0b0d'

const EDUCADORES: Record<string, { nome: string; foto: string; selo: string }> = {
  ruben: { nome: 'Ruben Pereira', foto: '/educadores/ruben/retrato.jpg', selo: 'CRYPTO · MÉTHODE' },
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const ed = EDUCADORES[q.get('e') ?? 'ruben'] ?? EDUCADORES.ruben
  const titulo = (q.get('t') ?? '').slice(0, 90)
  const sub = (q.get('s') ?? '').slice(0, 120)
  const formato = q.get('f') === 'post' ? 'post' : q.get('f') === 'story' ? 'story' : 'reel'
  const n = (q.get('n') ?? '').slice(0, 8)
  const W = 1080
  const H = formato === 'post' ? 1350 : 1920
  const fo = (q.get('fo') ?? '').toLowerCase()
  const slug = q.get('e') && EDUCADORES[q.get('e')!] ? q.get('e')! : 'ruben'
  const foto = new URL(/^[a-z0-9-]{1,60}$/.test(fo) ? `/educadores/${slug}/fotos/${fo}.jpg` : ed.foto, req.nextUrl.origin).toString()
  const tam = titulo.length > 55 ? 76 : titulo.length > 32 ? 92 : 112
  const comFoto = !n || n.startsWith('1/') || !!fo

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', position: 'relative', background: CARVAO, fontFamily: 'sans-serif' }}>
        {comFoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto} alt="" width={W} height={H} style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, objectFit: 'cover', opacity: 0.55 }} />
        ) : null}
        <div
          style={{
            position: 'absolute', top: 0, left: 0, width: W, height: H, display: 'flex',
            backgroundImage: comFoto ? 'linear-gradient(180deg, rgba(11,11,13,0.25) 0%, rgba(11,11,13,0.55) 45%, rgba(11,11,13,0.97) 78%)' : 'radial-gradient(circle at 80% 10%, rgba(210,166,60,0.18), rgba(11,11,13,1) 60%)',
          }}
        />
        <div style={{ position: 'absolute', top: 70, left: 70, right: 70, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', border: `2px solid ${OURO}`, color: OURO, fontSize: 26, letterSpacing: 4, padding: '10px 22px', borderRadius: 999 }}>{ed.selo}</div>
          {n ? <div style={{ display: 'flex', color: OURO_CLARO, fontSize: 30 }}>{n}</div> : null}
        </div>
        <div style={{ position: 'absolute', left: 70, right: 70, bottom: formato === 'post' ? 110 : 260, display: 'flex', flexDirection: 'column', gap: 26 }}>
          <div style={{ display: 'flex', width: 120, height: 8, background: OURO, borderRadius: 4 }} />
          <div style={{ display: 'flex', color: '#fff', fontSize: tam, fontWeight: 800, lineHeight: 1.05, fontStyle: 'italic' }}>{titulo}</div>
          {sub ? <div style={{ display: 'flex', color: OURO_CLARO, fontSize: 40, lineHeight: 1.25 }}>{sub}</div> : null}
          <div style={{ display: 'flex', color: '#bdbdbd', fontSize: 28, marginTop: 10 }}>{`${ed.nome} · MoreThanMoney`}</div>
        </div>
      </div>
    ),
    { width: W, height: H },
  )
}
