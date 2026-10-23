import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { moduloDono } from '@/lib/backoffice-dono'
import Modulo from './modulo'

export default async function PaginaModulo({ params }: { params: Promise<{ modulo: string }> }) {
  const { modulo } = await params
  const m = moduloDono(modulo)
  if (!m) notFound()
  return (
    <Suspense>
      <Modulo slug={m.slug} />
    </Suspense>
  )
}
