import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** O cortador passou para o Estúdio (separador «Cortes»), onde a equipa com acesso também o usa. */
export default function PaginaVideocliper() {
  redirect('/estudio?tab=cortes')
}
