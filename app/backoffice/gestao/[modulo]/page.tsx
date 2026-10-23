import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { moduloGestao } from '@/lib/backoffice-gestao'
import { contextoBackoffice } from '@/lib/backoffice-sessao'
import { pode } from '@/lib/backoffice-papeis'
import Modulo from './modulo'

export default async function PaginaModulo({ params }: { params: Promise<{ modulo: string }> }) {
  const { modulo } = await params
  const m = moduloGestao(modulo)
  const ctx = await contextoBackoffice()
  if (!m || !ctx || !pode(ctx.capacidades, m.exige)) notFound()
  return (
    <Suspense>
      <Modulo slug={m.slug} />
    </Suspense>
  )
}
