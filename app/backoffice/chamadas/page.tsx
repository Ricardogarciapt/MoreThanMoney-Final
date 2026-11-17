/**
 * CHAMADAS — Google Meet com resumo por IA, para apresentações, onboardings, follow-ups, apoio 1:1
 * e reuniões de equipa. A sala é sempre o Google Meet (decisão do dono, 17/11: sem Zoom).
 *
 * Esta página não guarda nada sozinha: transcrição e resumo vivem no ecrã até alguém tocar em
 * «Guardar» ou «Criar tarefa», que chamam as rotas de sempre do pipeline e das tarefas.
 */
import { abrirPagina, SemAcesso } from '../_partes/acesso'
import { Cabecalho } from '../_partes/blocos'
import { SalaDeChamadas } from './gravador'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Chamadas · Backoffice MTM' }

export default async function PaginaChamadas() {
  const acesso = await abrirPagina('bo.pipeline_proprio')
  if (!acesso.ok) return <SemAcesso motivo={acesso.motivo} oQue="as chamadas" />
  return (
    <div className="space-y-6">
      <Cabecalho
        titulo="Chamadas"
        sub="Abre o Meet, transcreve com consentimento e sai com resumo, objeções e tarefas ligadas ao negócio."
      />
      <SalaDeChamadas />
    </div>
  )
}
