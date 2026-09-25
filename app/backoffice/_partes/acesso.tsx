/**
 * A FECHADURA das páginas do backoffice — a mesma que as rotas usam.
 *
 * PORQUE É QUE ISTO NÃO É UM `if (pode(...))` EM CADA PÁGINA
 * As rotas de API já decidem com `exigirCapacidade`. Se as páginas decidissem com uma verificação
 * escrita à mão, passariam a existir DUAS definições de «pode entrar» — e a que fosse corrigida
 * seria uma só. Por isso a página chama exactamente a mesma função e traduz a recusa num ecrã.
 *
 * `exigirCapacidade` devolve uma `NextResponse` quando recusa. Numa página isso não se envia: lê-se
 * o estado (401 = não há sessão, 403 = há sessão e falta o papel) e mostra-se a frase certa. Não
 * são a mesma coisa e não se resolvem da mesma maneira: um manda entrar, o outro manda falar com
 * o Ricardo.
 *
 * O ecrã de recusa NÃO reencaminha. Um `redirect` daqui para `/backoffice` parece limpo até ao dia
 * em que a entrada também recusa — e aí o browser anda à roda. E, sobretudo: em Agosto 48 pessoas
 * ficaram bloqueadas sem uma frase a dizer porquê e 43 desapareceram. Uma porta fechada em silêncio
 * é o mesmo erro outra vez.
 */
import { NextResponse } from 'next/server'
import { exigirCapacidade, type ContextoBackoffice } from '@/lib/backoffice-sessao'
import type { Capacidade } from '@/lib/backoffice-papeis'

export type Acesso =
  | { ok: true; ctx: ContextoBackoffice }
  | { ok: false; motivo: 'sem_sessao' | 'sem_papel' }

/** Abre uma página do backoffice, ou diz porque não. */
export async function abrirPagina(capacidade: Capacidade): Promise<Acesso> {
  const resultado = await exigirCapacidade(undefined, capacidade)
  if (resultado instanceof NextResponse) {
    return { ok: false, motivo: resultado.status === 401 ? 'sem_sessao' : 'sem_papel' }
  }
  return { ok: true, ctx: resultado }
}

/** O ecrã de recusa. Diz o que falta e o passo seguinte — nunca só «sem acesso». */
export function SemAcesso({ motivo, oQue }: { motivo: 'sem_sessao' | 'sem_papel'; oQue: string }) {
  if (motivo === 'sem_sessao') {
    return (
      <div className="mx-auto max-w-xl space-y-4 rounded-xl border border-gray-800 bg-gray-900/40 p-6">
        <h1 className="text-xl font-bold text-white">Entra primeiro</h1>
        <p className="text-sm leading-relaxed text-gray-400">
          A tua sessão expirou ou nunca começou neste endereço. O backoffice usa o mesmo login do
          site.
        </p>
        <a
          href="/login"
          className="inline-block rounded-lg bg-[#D2A63C] px-4 py-2 text-sm font-semibold text-gray-950 transition-opacity hover:opacity-90"
        >
          Entrar
        </a>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 rounded-xl border border-gray-800 bg-gray-900/40 p-6">
      <h1 className="text-xl font-bold text-white">Esta página não é para o teu papel</h1>
      <p className="text-sm leading-relaxed text-gray-400">
        {oQue} A tua conta está válida — só não tem o papel que abre esta parte.
      </p>
      <p className="text-sm leading-relaxed text-gray-400">
        Se devias ter acesso, fala com o Ricardo. O que a tua conta abre hoje está na{' '}
        <a href="/backoffice" className="text-[#D2A63C] hover:underline">
          entrada do backoffice
        </a>
        .
      </p>
    </div>
  )
}
