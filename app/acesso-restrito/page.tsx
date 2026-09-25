/**
 * «Esta área não está incluída no teu acesso.»
 *
 * O middleware reescreve para cá quando alguém abre uma área do site que a lista de acessos dela não
 * inclui (`backoffice_acessos_site`). Reescreve, não redirecciona: o endereço que a pessoa escreveu
 * fica na barra, e ela percebe que foi ESTA página que não abriu.
 *
 * Existe para a recusa ter voz. Um `redirect` silencioso para a homepage é indistinguível de uma
 * avaria — e foi assim que, em Agosto, 43 pessoas ficaram de fora do site sem saber porquê.
 */
import Link from 'next/link'
import { AREA_NOME, ehAreaSite } from '@/lib/backoffice-acessos-site'

export const metadata = { title: 'Acesso restrito · MoreThanMoney' }

export default async function AcessoRestritoPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string }>
}) {
  const { area } = await searchParams
  const nome = ehAreaSite(area) ? AREA_NOME[area] : null

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
      <div className="max-w-lg space-y-4 rounded-xl border border-gray-800 bg-gray-900/40 p-6">
        <h1 className="text-xl font-bold text-white">
          {nome ? `${nome} não está incluída no teu acesso` : 'Esta área não está incluída no teu acesso'}
        </h1>
        <p className="text-sm leading-relaxed text-gray-400">
          A tua conta está activa — o que falta não é o pagamento, é esta área em concreto não estar
          ligada para ti. Quem define isso é o Ricardo, no painel de acessos.
        </p>
        <p className="text-sm leading-relaxed text-gray-400">
          Se precisas dela para o teu trabalho, pede-lhe que a ligue. Não há nada a fazer do teu lado.
        </p>
        <div className="flex flex-wrap gap-3 pt-2 text-sm">
          <Link href="/member-area" className="text-[#D2A63C] hover:underline">
            Área de membro
          </Link>
          <Link href="/backoffice" className="text-[#D2A63C] hover:underline">
            Backoffice
          </Link>
        </div>
      </div>
    </div>
  )
}
