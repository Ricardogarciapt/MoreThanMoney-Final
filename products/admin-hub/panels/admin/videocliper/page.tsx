import type { Metadata } from 'next'
import PainelVideocliper from './painel'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Videocliper · Admin' }

export default function PaginaVideocliper() {
  return <PainelVideocliper />
}
