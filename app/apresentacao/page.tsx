import { MEMBRO_MENSAL_EUR, PREMIUM_1O_MES_EUR, PREMIUM_MENSAL_EUR } from "@/lib/escada-precos"
import { TRIAL_DAYS } from "@/lib/trial-access"
import ApresentacaoVsl from "@/components/apresentacao/apresentacao-vsl"

/**
 * /apresentacao — a página que um membro manda a um lead depois da conversa.
 *
 * Antes era só um iframe para o deck de 13 slides (public/apresentacoes/mtm-oportunidade.html),
 * que mistura produto e plano de carreira e acaba num «Começar Agora» sem destino claro. Agora
 * abre com o vídeo (PT e EN, voz do Ricardo) e tem um só caminho: /onboarding, com o trial.
 * O deck continua para quem apresenta numa chamada, ligado no fim da página.
 *
 * Os números vêm das fontes (escada-precos, trial-access): esta página não escreve preços à mão.
 */
export default function ApresentacaoPage() {
  return (
    <ApresentacaoVsl
      precos={{
        trialDias: TRIAL_DAYS,
        premium1oMes: PREMIUM_1O_MES_EUR,
        premiumMes: PREMIUM_MENSAL_EUR,
        membroMes: MEMBRO_MENSAL_EUR,
      }}
    />
  )
}
