/**
 * A MINHA EQUIPA — e, hoje, a página honesta sobre o que ainda não existe.
 *
 * O modelo de «quem lidera quem» está a ser construído noutra frente. Enquanto não existir, esta
 * página tem três maneiras de se comportar e só uma delas é aceitável:
 *
 *  · adivinhar a equipa (pela árvore binária do MLM, ou por quem aparece nos negócios) — dava
 *    dinheiro de estranhos a ver, porque o patrocinador de alguém na árvore não é o responsável de
 *    equipa dele e a árvore coloca por spillover;
 *  · mostrar uma lista vazia — lê-se como «a minha equipa não fez nada», que é o contrário da
 *    verdade e é a pior coisa que se pode dizer a um responsável;
 *  · dizer o que se passa, mostrar o que já se sabe (a própria pessoa e os papéis dela), e
 *    prometer nada.
 *
 * É a terceira. E é por isso que esta página, hoje, tem mais texto do que dados: a informação que
 * falta é a informação.
 */
import { pode, PAPEL_NOME, capacidadesDoPapel } from '@/lib/backoffice-papeis'
import { lideradosDe } from '@/lib/backoffice-equipa'
import { abrirPagina, SemAcesso } from '../_partes/acesso'
import { Aviso, Cabecalho, Etiqueta } from '../_partes/blocos'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'A minha equipa · Backoffice MTM' }

export default async function EquipaPage() {
  const acesso = await abrirPagina('bo.extracto_equipa')
  if (!acesso.ok) {
    return (
      <SemAcesso
        motivo={acesso.motivo}
        oQue="Esta página é de quem responde por uma equipa. Quem vende sozinho vê o seu percurso no pipeline e o seu dinheiro no extracto."
      />
    )
  }
  const { ctx } = acesso

  const liderados = await lideradosDe(ctx)
  const veTudo = pode(ctx.capacidades, 'bo.extracto_todos')

  return (
    <div className="space-y-8">
      <Cabecalho
        titulo="A minha equipa"
        sub="Quem responde a ti, o que cada um está a trabalhar, e o que cada um ganhou."
      />

      {liderados.length === 0 && (
        <Aviso>
          <strong className="text-[#D2A63C]">Ainda não tens equipa montada.</strong> O sistema não tem
          ninguém registado como teu liderado. Não quer dizer que a tua equipa não tenha resultados —
          quer dizer que ela ainda não foi montada no admin. Fala com o Ricardo.
        </Aviso>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">O que já se sabe</h2>
        <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-white">Tu</span>
            {ctx.admin && <Etiqueta tom="aviso">Dono</Etiqueta>}
            {ctx.papeis.map((p) => (
              <Etiqueta key={p}>{PAPEL_NOME[p]}</Etiqueta>
            ))}
          </div>
          <p className="mt-3 text-sm leading-relaxed text-gray-400">
            {liderados.length === 0
              ? 'O sistema não tem, neste momento, ninguém registado como teu liderado. Não é um resultado — é a ligação que ainda não existe na base.'
              : `O sistema conhece ${liderados.length} pessoa(s) sob a tua responsabilidade.`}
          </p>
          {veTudo && (
            <p className="mt-2 text-sm leading-relaxed text-gray-400">
              Como dono, o teu extracto já mostra todas as comissões da casa — é lá que vês o dinheiro
              de toda a gente enquanto as equipas não estiverem montadas.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          O que esta página vai mostrar
        </h2>
        <ul className="space-y-2 text-sm leading-relaxed text-gray-400">
          <li className="rounded-lg border border-gray-800/70 bg-gray-900/20 p-4">
            <strong className="text-gray-300">Quem responde a ti</strong> — a lista das pessoas da tua
            equipa, com o papel de cada uma.
          </li>
          <li className="rounded-lg border border-gray-800/70 bg-gray-900/20 p-4">
            <strong className="text-gray-300">O que cada um está a trabalhar</strong> — os negócios
            deles, pelos mesmos estados do teu pipeline.
          </li>
          <li className="rounded-lg border border-gray-800/70 bg-gray-900/20 p-4">
            <strong className="text-gray-300">O que cada um ganhou</strong> — o extracto deles, com a
            mesma conta do teu.
          </li>
        </ul>
        <p className="text-xs leading-relaxed text-gray-600">
          As três leituras já estão escritas e já filtram pela lista de pessoas que tu podes ver
          (`ambitoDeLeitura`). O que falta é a própria lista: quando o admin souber quem lidera quem,
          estas páginas passam a mostrar a equipa sem se lhes tocar.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Os teus papéis dão-te isto
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {ctx.atribuicoes.map((a) => (
            <div key={a.papel} className="rounded-lg border border-gray-800 bg-gray-900/40 p-4">
              <span className="font-semibold text-[#D2A63C]">{PAPEL_NOME[a.papel]}</span>
              <ul className="mt-2 space-y-0.5 text-xs text-gray-400">
                {capacidadesDoPapel(a.papel).map((c) => (
                  <li key={c}>· {c}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
