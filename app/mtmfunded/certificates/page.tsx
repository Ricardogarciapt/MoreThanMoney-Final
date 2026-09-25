import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import VitrineCertificados, { type CertificadoVitrine } from '@/components/mtmfunded/vitrine-certificados'
import ProcurarCertificado from './procurar'
import { comTecto, TECTO_PAGINA_MS } from '@/lib/com-tecto'

/**
 * FORA DA PRÉ-GERAÇÃO, de propósito.
 *
 * Estas páginas lêem a base de dados, e uma compilação não pode depender de a base estar boa —
 * a 25/09 dois deploys seguidos abortaram por isso, e a correcção do 504 ficou retida enquanto
 * membros com conta eram mandados registar-se.
 *
 * Aqui não se usa o truque das outras páginas (construir com valores de recuo e deixar a
 * revalidação preencher): a /mtmfunded decide um REDIRECCIONAMENTO a partir da configuração, e
 * construí-la sem poder lê-la deixaria esse redireccionamento cozido no ficheiro gerado. Uma
 * página que redirecciona para o torneio porque a base estava lenta durante o build é pior do
 * que uma página que demora um pouco mais a abrir.
 *
 * As leituras têm tecto (ver `comTecto`), por isso uma base lenta atrasa-as — não as pendura.
 */
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Certificados' }

/**
 * A casa dos certificados do MTM Funded.
 *
 * Faz duas coisas que não se estorvam: mostra os últimos emitidos, para quem chega por
 * curiosidade, e deixa procurar um código, para quem chega com um certificado na mão. Uma
 * página que só validasse códigos era uma página em branco para quase toda a gente que a abre.
 */
export default async function CertificadosPage() {
  // TECTO: sem resposta a vitrine enche-se com os exemplares marcados como tal — o caminho que já
  // existia para quando não há certificados emitidos que cheguem.
  const { data: emitidos } = await comTecto(
    getSupabaseAdmin()
      .from('mtm_certificates')
      .select('codigo, tipo, nome, emitido_em')
      .order('emitido_em', { ascending: false })
      .limit(6)
      .then((r) => ({ data: r.data })),
    { data: null },
    TECTO_PAGINA_MS,
  )

  const vitrine: CertificadoVitrine[] = (emitidos ?? []).map((c) => ({
    codigo: c.codigo as string,
    tipo: c.tipo as string,
    nome: c.nome as string,
    emitidoEm: c.emitido_em as string,
  }))
  const EXEMPLOS = ['financiado', 'desafio', 'classificacao', 'participacao', 'payout', 'financiado']
  while (vitrine.length < 6) {
    vitrine.push({
      codigo: `EXEMPLAR-${String(vitrine.length + 1).padStart(2, '0')}`,
      tipo: EXEMPLOS[vitrine.length],
      nome: 'O teu nome aqui',
      emitidoEm: new Date().toISOString(),
      exemplar: true,
    })
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-16 text-white">
      <p className="kicker r">MTM Funded</p>
      <h1 className="r d1 mt-4 text-[clamp(32px,5vw,52px)] font-extrabold">Certificados</h1>
      <p className="r d2 mt-4 text-[#a9a49a]">
        Cada certificado tem um código que qualquer pessoa pode verificar, sem conta e sem pedir
        nada a ninguém. É isso que o faz valer alguma coisa fora daqui.
      </p>

      <div className="r d3 mt-8">
        <ProcurarCertificado />
      </div>

      <div className="r d4 mt-14">
        <h2 className="mb-6 text-sm uppercase tracking-[0.22em] text-[#7b756a]">Últimos emitidos</h2>
        <VitrineCertificados certificados={vitrine} />
      </div>

      <div className="r mt-14 text-center">
        <Link href="/mtmfunded" className="btn g">Ver os programas</Link>
      </div>
    </main>
  )
}
