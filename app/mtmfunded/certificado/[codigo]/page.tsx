import { redirect } from 'next/navigation'

/**
 * O endereço antigo de validação.
 *
 * Há certificados já emitidos — e impressos — com este endereço no QR. Encaminha-se para a
 * casa nova em vez de os deixar a apontar para uma página que deixou de existir: um QR que
 * dá 404 estraga exactamente o documento que devia provar.
 */
export default async function ValidarAntigo({
  params,
}: {
  params: Promise<{ codigo: string }>
}) {
  const { codigo } = await params
  redirect(`/mtmfunded/certificates/${encodeURIComponent(codigo ?? '')}`)
}
