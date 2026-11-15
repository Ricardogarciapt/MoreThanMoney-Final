import { redirect } from 'next/navigation'

/** O Conteúdo Magnético passou para o separador «Criar» do Estúdio (10/11). Links antigos chegam lá. */
export default function PaginaConteudoMagnetico() {
  redirect('/estudio?tab=criar')
}
