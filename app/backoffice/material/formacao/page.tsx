/**
 * ACADEMIA DE VENDAS — o curso da equipa (funcionários e IBs), dentro de Materiais, em PT e EN.
 *
 * O conteúdo inteiro vive em `lib/backoffice-formacao.ts` (fonte única: esta página, os vídeos e o
 * manual saem todos dali). Aqui só se desenha: a lista de aulas, e a aula aberta com o vídeo (quando
 * já está no YouTube, não listado), o mind map, os passos, os guiões para copiar, o quiz e a tarefa.
 *
 * Sem vídeo ainda? A aula continua inteira em texto e esquemas — não se mostra um «em breve».
 * O endereço guarda a língua e a aula (`?l=en&a=4`) para se poder mandar a um colega a aula certa.
 */
import Link from 'next/link'
import { abrirPagina, SemAcesso } from '../../_partes/acesso'
import { Cabecalho } from '../../_partes/blocos'
import { Copiar } from '../../_partes/copiar'
import { AULAS, CURSO, NOME_PAPEL, aulasPara, type Aula, type Cena, type Lingua } from '@/lib/backoffice-formacao'
import { Quiz } from './quiz'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Academia de Vendas · Backoffice MTM' }

type Props = { searchParams: Promise<{ l?: string; a?: string }> }

const TXT = {
  pt: {
    sub: 'Oito aulas curtas, narradas pelo Ricardo: o back-office, cada papel e os guiões para converter.',
    tuas: 'As tuas aulas', todas: 'Todas as aulas', objetivo: 'Objetivo', tarefa: 'Tarefa da aula',
    guiao: 'Guião', quando: 'Quando', aula: 'Aula', imprimir: 'Imprimir / guardar PDF',
    playlist: 'Playlist no YouTube', semVideo: 'O vídeo desta aula ainda não está no YouTube: tens aqui a aula completa, cena a cena.',
    exemplo: 'Ecrã do back-office', anterior: '← Aula anterior', seguinte: 'Aula seguinte →', quiz: 'Verifica o que ficou',
    voltar: '← Materiais',
  },
  en: {
    sub: 'Eight short lessons, narrated by Ricardo: the back office, each role and the scripts to convert.',
    tuas: 'Your lessons', todas: 'All lessons', objetivo: 'Goal', tarefa: 'Lesson task',
    guiao: 'Script', quando: 'When', aula: 'Lesson', imprimir: 'Print / save PDF',
    playlist: 'YouTube playlist', semVideo: 'This lesson’s video is not on YouTube yet: the full lesson is here, scene by scene.',
    exemplo: 'Back-office screen', anterior: '← Previous lesson', seguinte: 'Next lesson →', quiz: 'Check what you learned',
    voltar: '← Materials',
  },
} as const

export default async function AcademiaPage({ searchParams }: Props) {
  const acesso = await abrirPagina('bo.material')
  if (!acesso.ok) {
    return <SemAcesso motivo={acesso.motivo} oQue="A Academia de Vendas é para toda a equipa: qualquer papel tem acesso." />
  }
  const { ctx } = acesso
  const sp = await searchParams
  const L: Lingua = sp.l === 'en' ? 'en' : 'pt'
  const t = TXT[L]
  const todas = ctx.admin || ctx.papeis.includes('team_leader')
  const minhas = aulasPara(ctx.papeis, todas)
  const aberta = AULAS.find((a) => a.numero === Number(sp.a)) ?? minhas[0] ?? AULAS[0]
  const href = (a: number, l: Lingua = L) => `?l=${l}&a=${a}`
  const pos = AULAS.indexOf(aberta)

  return (
    <div className="space-y-8 print:space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/backoffice/material" className="text-sm text-zinc-400 hover:text-[#E9C46A]">{t.voltar}</Link>
        <div className="flex gap-1 rounded-lg border border-white/[0.08] p-1 text-sm">
          {(['pt', 'en'] as const).map((l) => (
            <Link key={l} href={href(aberta.numero, l)} className={`rounded-md px-3 py-1 ${l === L ? 'bg-[#D2A63C]/15 font-semibold text-[#E9C46A]' : 'text-zinc-400'}`}>
              {l.toUpperCase()}
            </Link>
          ))}
        </div>
      </div>

      <Cabecalho titulo={CURSO.titulo[L]} sub={t.sub} />

      <nav className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 print:hidden" aria-label={t.todas}>
        {AULAS.map((a) => {
          const minha = minhas.includes(a)
          return (
            <Link
              key={a.slug}
              href={href(a.numero)}
              className={`rounded-xl border p-3 transition-colors ${a === aberta ? 'border-[#D2A63C]/50 bg-[#D2A63C]/10' : 'border-white/[0.06] bg-zinc-950/70 hover:border-[#D2A63C]/30'} ${minha ? '' : 'opacity-60'}`}
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                {t.aula} {a.numero} · {NOME_PAPEL[a.papel][L]}
              </div>
              <div className="mt-1 text-sm font-medium text-white">{a.titulo[L]}</div>
            </Link>
          )
        })}
      </nav>

      {CURSO.playlist[L] && (
        <a href={`https://www.youtube.com/playlist?list=${CURSO.playlist[L]}`} target="_blank" rel="noreferrer" className="inline-block text-sm text-[#D2A63C] hover:underline print:hidden">
          {t.playlist} ↗
        </a>
      )}

      <AulaAberta aula={aberta} L={L} />

      <div className="flex justify-between gap-3 border-t border-white/[0.06] pt-4 text-sm print:hidden">
        {pos > 0 ? <Link href={href(AULAS[pos - 1].numero)} className="text-zinc-400 hover:text-[#E9C46A]">{t.anterior}</Link> : <span />}
        {pos < AULAS.length - 1 ? <Link href={href(AULAS[pos + 1].numero)} className="text-zinc-400 hover:text-[#E9C46A]">{t.seguinte}</Link> : <span />}
      </div>
      <p className="text-xs text-zinc-500">{CURSO.aviso[L]}</p>
    </div>
  )
}

function AulaAberta({ aula, L }: { aula: Aula; L: Lingua }) {
  const t = TXT[L]
  const video = aula.youtube[L]
  return (
    <article className="space-y-6">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D2A63C]">
          {t.aula} {aula.numero} · {NOME_PAPEL[aula.papel][L]}
        </div>
        <h2 className="mt-1 text-2xl font-bold text-white">{aula.titulo[L]}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-300">
          <span className="font-semibold text-zinc-100">{t.objetivo}:</span> {aula.objetivo[L]}
        </p>
      </header>

      {video ? (
        <div className="aspect-video w-full overflow-hidden rounded-xl border border-white/[0.06] bg-black print:hidden">
          <iframe
            className="h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${video}?rel=0`}
            title={aula.titulo[L]}
            allow="accelerometer; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <p className="rounded-xl border border-white/[0.06] bg-zinc-950/70 p-3 text-xs text-zinc-500 print:hidden">{t.semVideo}</p>
      )}

      <ol className="space-y-4">
        {aula.cenas.map((c, i) => (
          <li key={i} className="break-inside-avoid">
            <CenaBloco cena={c} L={L} />
          </li>
        ))}
      </ol>

      <section className="rounded-xl border border-[#D2A63C]/40 bg-[#D2A63C]/[0.06] p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#E9C46A]">{t.tarefa}</h3>
        <p className="mt-1 text-sm leading-relaxed text-zinc-100">{aula.tarefa[L]}</p>
      </section>

      {aula.quiz.length > 0 && (
        <section className="space-y-2 print:hidden">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t.quiz}</h3>
          <Quiz
            perguntas={aula.quiz.map((q) => ({ pergunta: q.pergunta[L], opcoes: q.opcoes.map((o) => o[L]), certa: q.certa, porque: q.porque[L] }))}
            textos={L === 'pt' ? { certo: 'Certo.', errado: 'Ainda não.' } : { certo: 'Correct.', errado: 'Not quite.' }}
          />
        </section>
      )}
    </article>
  )
}

/** Uma cena do vídeo, em versão de página: o mesmo esquema que se vê no ecrã, sem animação. */
function CenaBloco({ cena: c, L }: { cena: Cena; L: Lingua }) {
  const t = TXT[L]
  const caixa = 'rounded-xl border border-white/[0.06] bg-zinc-950/70 p-4'
  if (c.tipo === 'capa') return null
  if (c.tipo === 'lista' || c.tipo === 'regra') {
    const nunca = c.tipo === 'regra'
    return (
      <div className={caixa}>
        <h3 className="font-semibold text-white">{c.titulo[L]}</h3>
        <ul className="mt-3 space-y-2">
          {c.itens.map((it) => (
            <li key={it.pt} className="flex gap-3 text-sm leading-relaxed text-zinc-300">
              <span className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded text-xs font-bold ${nunca ? 'bg-red-500/15 text-red-400' : 'bg-[#D2A63C]/15 text-[#D2A63C]'}`}>{nunca ? '✕' : '✓'}</span>
              {it[L]}
            </li>
          ))}
        </ul>
      </div>
    )
  }
  if (c.tipo === 'fluxo') {
    return (
      <div className={caixa}>
        <h3 className="font-semibold text-white">{c.titulo[L]}</h3>
        <ol className="mt-3 grid gap-2 sm:grid-flow-col sm:auto-cols-fr">
          {c.passos.map((p, i) => (
            <li key={p.pt} className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3 text-sm text-zinc-200 sm:flex-col sm:text-center">
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-gradient-to-br from-[#E9C46A] to-[#D2A63C] text-sm font-bold text-zinc-950">{i + 1}</span>
              {p[L]}
            </li>
          ))}
        </ol>
      </div>
    )
  }
  if (c.tipo === 'mapa') {
    return (
      <div className={caixa}>
        <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#E9C46A] to-[#D2A63C] p-2 text-center text-sm font-bold leading-tight text-zinc-950 shadow-[0_0_40px_rgba(210,166,60,.35)]">
          {c.centro[L]}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {c.ramos.map((r) => (
            <div key={r.nome.pt} className="rounded-lg border border-[#D2A63C]/40 bg-zinc-900/60 p-3">
              <div className="font-semibold text-[#E9C46A]">{r.nome[L]}</div>
              <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                {r.folhas.map((f) => <li key={f.pt}>• {f[L]}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (c.tipo === 'ecra') {
    return (
      <div className={caixa}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{t.exemplo}</div>
        <h3 className="mt-1 font-semibold text-white">{c.titulo[L]}</h3>
        <ol className="mt-3 space-y-2">
          {c.destaques.map((d, i) => (
            <li key={d.pt} className="flex gap-3 border-l-2 border-[#D2A63C] pl-3 text-sm leading-relaxed text-zinc-300">
              <span className="font-bold text-[#D2A63C]">{i + 1}</span>{d[L]}
            </li>
          ))}
        </ol>
      </div>
    )
  }
  if (c.tipo === 'guiao') {
    return (
      <div className={caixa}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{t.guiao}</div>
            <h3 className="mt-1 font-semibold text-white">{c.titulo[L]}</h3>
            <p className="mt-1 text-xs text-zinc-500">{t.quando}: {c.quando[L]}</p>
          </div>
          <span className="print:hidden"><Copiar texto={c.texto[L]} /></span>
        </div>
        <p className="mt-3 whitespace-pre-wrap rounded-lg bg-emerald-900/30 p-3 text-sm leading-relaxed text-zinc-100">{c.texto[L]}</p>
      </div>
    )
  }
  if (c.tipo === 'fim') return null
  return null
}
