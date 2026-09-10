import type { Metadata } from 'next'
import NavegacaoFunded from '@/components/mtmfunded/navegacao'
import RodapeFunded from '@/components/mtmfunded/rodape'
import Atmosfera from '@/components/mtmfunded/atmosfera'

export const metadata: Metadata = {
  title: { default: 'MTM Funded', template: '%s · MTM Funded' },
  description:
    'Avaliação de traders em contas simuladas. Torneios trimestrais e programas de avaliação da MTM Funded.',
}

/**
 * O MTM Funded corre com casa própria: navegação, rodapé, FAQ e políticas só dele.
 *
 * O layout global do site fica de fora — `/mtmfunded` está na lista de rotas autónomas do
 * `conditional-navbar-footer`. São dois negócios com riscos e obrigações diferentes, e uma
 * navbar partilhada dizia ao visitante que é tudo a mesma coisa. Num produto onde se avalia
 * traders com contas e prémios pelo meio, confundir quem responde pelo quê custa caro.
 */
export default function LayoutFunded({ children }: { children: React.ReactNode }) {
  return (
    <Atmosfera>
      <div className="flex min-h-screen flex-col">
        <NavegacaoFunded />
        <div className="flex-1">{children}</div>
        <RodapeFunded />
      </div>
    </Atmosfera>
  )
}
