import { redirect } from 'next/navigation'

/** A «área do dono» passou a chamar-se Gestão (23/10/2026). Os favoritos antigos seguem para lá. */
export default async function DonoAntigo({
  params,
  searchParams,
}: {
  params: Promise<{ resto?: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { resto = [] } = await params
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(await searchParams)) for (const x of [v].flat()) if (x != null) q.append(k, x)
  const modulo = resto[0] === 'gestao' ? 'dashboard' : resto[0]
  redirect(`/backoffice/gestao${modulo ? `/${modulo}` : ''}${q.size ? `?${q}` : ''}`)
}
