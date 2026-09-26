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
import { ambitoDaPagina } from '@/lib/backoffice-equipa'
import { OMeuDia } from './_partes/o-meu-dia'

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
          Bem-vindo{ctx.papeis.length ? `, ${ctx.papeis.map((p) => PAPEL_NOME[p]).join(' · ')}` : ''}
        </h1>
        <p className="mt-2 text-sm text-gray-400">
          Aqui vês o teu percurso, as tuas tarefas e o teu extracto — o teu, e só o teu.
        </p>
      </div>

      {/*
        O DIA VEM PRIMEIRO, antes dos papéis e antes de tudo.

        A entrada do backoffice explicava quem a pessoa é e o que pode ver. Faltava-lhe a única
        pergunta que ela traz quando abre isto de manhã: «o que é que eu faço agora?». Uma página
        que responde a tudo menos a essa é uma página que se visita uma vez.
      */}
      <OMeuDia ids={(await ambitoDaPagina(ctx, 'tarefas')).ambito.ids} pessoaId={ctx.userId} />

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

      {/*
        Este bloco dizia «o pipeline, as tarefas e os valores a receber entram aqui à medida que
        forem ligados» — e isso deixou de ser verdade a 25/09, quando as três páginas passaram a ler
        da base. Uma promessa que ficou verdadeira e não foi apagada é pior do que uma promessa: diz
        a quem entra que o sistema ainda não serve, e quem lê isso não vai às páginas.

        O que substitui não é publicidade: é a distinção que fica sempre por explicar, e que tem de
        estar dita no primeiro ecrã porque é a que dá discussões — um negócio ganho não é dinheiro.
      */}
      <section className="space-y-2 rounded-lg border border-gray-800 bg-gray-900/20 p-4 text-sm leading-relaxed text-gray-400">
        <p>
          As páginas em cima lêem da base a sério: o pipeline são os negócios em que participas, as
          tarefas são as tuas, o extracto é o teu. Tudo filtrado pelo teu papel — ninguém vê o
          trabalho nem o dinheiro de quem não lidera.
        </p>
        <p>
          <span className="text-gray-300">Ganho não é pago.</span> Mover um negócio para «ganho»
          muda o negócio e mais nada; a comissão nasce do pagamento confirmado, e é aí que aparece no
          teu extracto.
        </p>
      </section>
    </div>
  )
}
