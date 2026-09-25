/**
 * A ENTRADA do backoffice — e o único sítio que responde às duas situações:
 * quem faz parte da equipa, e quem não faz.
 *
 * É aqui que tem de estar a explicação de quem não tem acesso, e não numa `/sem-acesso` própria:
 * essa herdava o layout do backoffice, o layout exige papéis, e o encaminhamento andava à roda.
 *
 * E há uma segunda razão, que não é técnica. Em Agosto 48 pessoas ficaram bloqueadas no site e
 * ninguém lhes disse nada — 43 desapareceram sem saber porquê. Uma porta que se fecha sem uma frase
 * a dizer o que fazer a seguir é o mesmo erro outra vez, em sítio diferente.
 */
import { contextoBackoffice } from '@/lib/backoffice-sessao'
import { pode, capacidadesDoPapel, PAPEL_NOME } from '@/lib/backoffice-papeis'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Backoffice · MoreThanMoney' }

export default async function BackofficeEntradaPage() {
  const ctx = await contextoBackoffice()

  if (!ctx || !pode(ctx.capacidades, 'bo.entrar')) {
    return (
      <div className="mx-auto max-w-xl space-y-4 rounded-xl border border-gray-800 bg-gray-900/40 p-6">
        <h1 className="text-xl font-bold text-white">Esta conta não faz parte da equipa</h1>
        <p className="text-sm leading-relaxed text-gray-400">
          O backoffice é para quem trabalha nas vendas da MoreThanMoney: afiliados, setters, closers,
          prospectores e responsáveis de equipa. A tua conta existe e está válida — só não tem nenhum
          desses papéis atribuído.
        </p>
        <p className="text-sm leading-relaxed text-gray-400">
          Se devias ter acesso, fala com o Ricardo para te atribuir o papel. Se és cliente, é na{' '}
          <a href="https://www.morethanmoney.pt/member-area" className="text-[#D2A63C] hover:underline">
            área de membro
          </a>{' '}
          que tens tudo o que te diz respeito.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">
          Bem-vindo{ctx.papeis.length ? ` , ${ctx.papeis.map((p) => PAPEL_NOME[p]).join(' · ')}` : ''}
        </h1>
        <p className="mt-2 text-sm text-gray-400">
          Aqui vês o teu percurso, as tuas tarefas e o teu extracto — o teu, e só o teu.
        </p>
      </div>

      {/* O que cada papel dá, escrito à pessoa. Saber o que se pode ver evita metade das perguntas,
          e torna visível um papel que falta (ou um que sobra) sem ninguém ter de ir à base. */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Os teus papéis</h2>
        {ctx.papeis.length === 0 && ctx.admin && (
          <p className="text-sm text-gray-400">
            Não tens papéis atribuídos — vês tudo porque és o dono da casa.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {ctx.atribuicoes.map((a) => (
            <div key={a.papel} className="rounded-lg border border-gray-800 bg-gray-900/40 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-[#D2A63C]">{PAPEL_NOME[a.papel]}</span>
                {a.atribuidoAt && (
                  <span className="text-xs text-gray-500">
                    desde {new Date(a.atribuidoAt).toLocaleDateString('pt-PT')}
                  </span>
                )}
              </div>
              <ul className="mt-2 space-y-0.5 text-xs text-gray-400">
                {capacidadesDoPapel(a.papel).map((c) => (
                  <li key={c}>· {c}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Honestidade sobre o que ainda não existe: o pipeline, as tarefas e o cálculo das comissões
          são construídos do outro lado da casa. Prometer aqui um número que ninguém calcula ainda
          era pior do que dizer que falta. */}
      <section className="rounded-lg border border-gray-800 bg-gray-900/20 p-4 text-sm text-gray-400">
        O pipeline, as tarefas e os valores a receber entram aqui à medida que forem ligados. O que já
        funciona é o acesso: entras pelo teu login do site, e o que vês depende dos papéis acima.
      </section>
    </div>
  )
}
