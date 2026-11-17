/**
 * A FICHA ÚNICA DO CONTACTO (360°) — CRM Fase 3, 17/11/2026.
 *
 * Tudo o que a casa sabe desta pessoa, numa página: o negócio, o funil, o histórico, as tarefas,
 * a agenda, o WhatsApp, o Telegram, o Instagram, a conta no site, as vendas e o consentimento.
 * A leitura está em `lib/backoffice-ficha.ts`; aqui só se desenha.
 *
 * QUEM VÊ: quem participa no negócio (ou o lidera), e qualquer pessoa do pipeline quando o negócio
 * está na bolsa (sem dono). Quem não pode ver recebe a mesma página de «não encontrado» que um id
 * que não existe — não se confirma que o negócio existe a quem não participa nele.
 *
 * Escrever (mover, mudar o funil, contactar) faz-se com os mesmos componentes da lista: uma escrita,
 * um sítio. O consentimento aparece SEMPRE, porque contactar sem ele é a linha que não se passa.
 */
import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ambitoDaPagina, nomesDe } from '@/lib/backoffice-equipa'
import { ehUuid, papeisNoNegocio } from '@/lib/backoffice-negocios'
import { podeMexerNoNegocio } from '@/lib/backoffice-escrita'
import { estaSemDono, type DonosDoNegocio } from '@/lib/backoffice-bolsa'
import { ESTADO_PIPELINE_NOME, dataCurta, ehEstadoPipeline } from '@/lib/backoffice-vista'
import { diasParado, sugestaoPara } from '@/lib/backoffice-playbook'
import { lerFicha, lerNegocioDaFicha, type Bloco } from '@/lib/backoffice-ficha'
import { FUNIL_RESUMO, ehFunil } from '@/lib/backoffice-funis'
import { Contactar } from '@/components/backoffice-contactar'
import { abrirPagina, SemAcesso } from '../../../_partes/acesso'
import { Aviso, Cabecalho, Etiqueta, Falhou } from '../../../_partes/blocos'
import { Mover } from '../../mover'
import { EscolherFunil } from '../../funil'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Ficha do contacto · Backoffice MTM' }

function Seccao<T>({
  titulo,
  bloco,
  vazio,
  children,
}: {
  titulo: string
  bloco: Bloco<T>
  vazio: string
  children: (linhas: T[]) => React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{titulo}</h2>
      <div className="mt-2 text-sm text-zinc-300">
        {!bloco.ok ? (
          <p className="text-red-400">Não consegui ler: {bloco.erro}</p>
        ) : bloco.linhas.length === 0 ? (
          <p className="text-zinc-500">{vazio}</p>
        ) : (
          children(bloco.linhas)
        )}
      </div>
    </section>
  )
}

function quando(v: string | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return d.toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function estadoNome(v: string | null): string {
  if (!v) return '—'
  return ehEstadoPipeline(v) ? ESTADO_PIPELINE_NOME[v] : v
}

export default async function FichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const acesso = await abrirPagina('bo.pipeline_proprio')
  if (!acesso.ok) {
    return <SemAcesso motivo={acesso.motivo} oQue="A ficha do contacto é de quem trabalha os negócios." />
  }
  const { ctx } = acesso
  if (!ehUuid(id)) notFound()

  const db = getSupabaseAdmin()
  const { ambito } = await ambitoDaPagina(ctx, 'pipeline')
  const { negocio: n, semFunil, erro } = await lerNegocioDaFicha(db, id)
  if (erro) {
    return (
      <div className="space-y-6">
        <Cabecalho titulo="Ficha do contacto" sub="Tudo o que sabemos desta pessoa." />
        <Falhou oQue="Não consegui ler o negócio." detalhe={erro} />
      </div>
    )
  }
  if (!n || !(podeMexerNoNegocio(n, ambito) || estaSemDono(n as unknown as DonosDoNegocio))) notFound()

  const ficha = await lerFicha(db, n)

  const pessoas = [n.prospector_id, n.setter_id, n.closer_id, n.team_leader_id, n.afiliado_id].filter(Boolean) as string[]
  const quemFez = ficha.eventos.ok ? (ficha.eventos.linhas.map((e) => e.por).filter(Boolean) as string[]) : []
  const nomes = await nomesDe([...new Set([...pessoas, ...quemFez])])
  const meus = papeisNoNegocio(n as never, ctx.userId)
  const dias = diasParado(n.atualizado_em)
  const sugestao = ehEstadoPipeline(n.estado) ? sugestaoPara(n.estado) : null
  const papel = (label: string, v: string | null) => (v ? `${label}: ${nomes[v] ?? 'alguém da equipa'}` : null)
  const atribuicoes = [
    papel('Prospector', n.prospector_id),
    papel('Setter', n.setter_id),
    papel('Closer', n.closer_id),
    papel('Responsável', n.team_leader_id),
    papel('Afiliado', n.afiliado_id),
  ].filter(Boolean)
  const consentimentoActivo = ficha.consentimentos.ok && ficha.consentimentos.linhas.some((c) => !c.retirado_em)

  return (
    <div className="space-y-6">
      <p className="text-xs text-zinc-500">
        <a href="/backoffice/pipeline/quadro" className="text-[#D2A63C] hover:underline">← quadro</a>
        {' · '}
        <a href={`/backoffice/pipeline?negocio=${n.id}#negocio-${n.id}`} className="text-[#D2A63C] hover:underline">
          ver na lista
        </a>
      </p>

      <Cabecalho titulo={n.nome} sub="Ficha única: tudo o que a casa sabe deste contacto, de todos os canais." />

      {semFunil && <Aviso>Falta aplicar a migração 261 (coluna «funil»): o funil ainda não se pode escolher.</Aviso>}

      <section className="rounded-xl border border-[#D2A63C]/30 bg-[#D2A63C]/5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Etiqueta tom="aviso">{estadoNome(n.estado)}</Etiqueta>
          {!semFunil && <EscolherFunil id={n.id} funil={n.funil ?? null} />}
          {ehEstadoPipeline(n.estado) && <Mover id={n.id} estado={n.estado} nome={n.nome} />}
          {n.agente_id && <Etiqueta tom="aviso">Agente IA{n.agente_qualificacao ? ` · ${n.agente_qualificacao}` : ''}</Etiqueta>}
          {meus.map((p) => (
            <Etiqueta key={p}>{p}</Etiqueta>
          ))}
        </div>
        {ehFunil(n.funil) && <p className="mt-2 text-xs text-zinc-400">{FUNIL_RESUMO[n.funil]}</p>}
        {sugestao && (
          <div className="mt-3">
            <div className="text-sm font-semibold text-[#E9C46A]">Passo seguinte: {sugestao.passo}</div>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">{sugestao.porque}</p>
          </div>
        )}
        <div className="mt-3">
          <Contactar pessoa={n} />
        </div>
        <p className={`mt-3 text-xs ${consentimentoActivo ? 'text-emerald-400' : 'text-amber-400'}`}>
          {consentimentoActivo
            ? 'Tem consentimento activo para contacto.'
            : 'Sem consentimento registado: só se responde a quem nos escreve, nunca se contacta por iniciativa nossa.'}
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 text-sm text-zinc-300">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Contacto</h2>
          <dl className="mt-2 grid grid-cols-[7rem_1fr] gap-y-1 text-[13px]">
            <dt className="text-zinc-500">Email</dt><dd className="break-all">{n.email ?? '—'}</dd>
            <dt className="text-zinc-500">Telefone</dt><dd>{n.telefone ?? '—'}</dd>
            <dt className="text-zinc-500">Telegram</dt><dd>{n.telegram_username ? `@${n.telegram_username}` : n.telegram_id ?? '—'}</dd>
            <dt className="text-zinc-500">Instagram</dt><dd>{n.instagram_handle ? `@${n.instagram_handle.replace(/^@/, '')}` : '—'}</dd>
            <dt className="text-zinc-500">Origem</dt><dd>{n.origem ?? '—'}</dd>
            <dt className="text-zinc-500">Pack previsto</dt><dd>{n.pack_previsto ?? '—'}</dd>
            <dt className="text-zinc-500">Entrou</dt><dd>{dataCurta(n.criado_em)}</dd>
            <dt className="text-zinc-500">Mexeu</dt><dd>{dataCurta(n.atualizado_em)}{dias ? ` · há ${dias} dias` : ''}</dd>
          </dl>
          {atribuicoes.length > 0 ? (
            <p className="mt-3 text-xs text-zinc-400">{atribuicoes.join(' · ')}</p>
          ) : (
            <p className="mt-3 text-xs text-amber-400">Sem dono: está na bolsa de leads.</p>
          )}
          {n.nota && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-black/30 p-2 text-xs text-zinc-300">{n.nota}</p>}
          {n.motivo_perda && <p className="mt-2 text-xs text-red-400">Perdido: {n.motivo_perda}</p>}
        </section>

        <Seccao titulo="Conta no site" bloco={ficha.conta} vazio={n.email ? 'Este email não tem conta no site.' : 'Sem email, não dá para procurar a conta.'}>
          {(l) =>
            l.map((p) => (
              <dl key={p.id} className="grid grid-cols-[7rem_1fr] gap-y-1 text-[13px]">
                <dt className="text-zinc-500">Tipo</dt><dd>{p.user_type ?? '—'}</dd>
                <dt className="text-zinc-500">Subscrição</dt><dd>{[p.subscription_plan, p.subscription_status].filter(Boolean).join(' · ') || '—'}</dd>
                <dt className="text-zinc-500">Trial até</dt><dd>{quando(p.trial_expires_at)}</dd>
                <dt className="text-zinc-500">Corretora</dt><dd>{p.broker_verified ? 'validada' : 'por validar'}</dd>
                <dt className="text-zinc-500">Criada</dt><dd>{quando(p.created_at)}</dd>
                <dt className="text-zinc-500">Último login</dt><dd>{quando(p.last_login)}</dd>
              </dl>
            ))
          }
        </Seccao>

        <Seccao titulo="Tarefas" bloco={ficha.tarefas} vazio="Nenhuma tarefa ligada a este negócio.">
          {(l) => (
            <ul className="space-y-1.5">
              {l.map((t) => (
                <li key={t.id} className="flex items-baseline justify-between gap-2">
                  <span className={t.estado === 'feita' ? 'text-zinc-500 line-through' : ''}>{t.titulo}</span>
                  <span className="shrink-0 text-[11px] text-zinc-500">{t.prazo ?? 'sem prazo'}</span>
                </li>
              ))}
            </ul>
          )}
        </Seccao>

        <Seccao titulo="Agenda" bloco={ficha.agenda} vazio="Nenhuma reunião marcada.">
          {(l) => (
            <ul className="space-y-1.5">
              {l.map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-2">
                  <span>{quando(a.inicio)} · {a.estado}</span>
                  {a.join_url && (
                    <a href={a.join_url} target="_blank" rel="noreferrer" className="text-[11px] text-[#D2A63C] hover:underline">
                      entrar
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Seccao>

        <Seccao titulo="WhatsApp" bloco={ficha.whatsapp} vazio="Sem conversa de WhatsApp.">
          {(l) =>
            l.map((w) => (
              <p key={w.id} className="text-[13px]">
                {w.telefone} · {w.estado ?? '—'}
                {w.por_responder ? <span className="text-amber-400"> · {w.por_responder} por responder</span> : null}
                <span className="block text-[11px] text-zinc-500">
                  entrou {quando(w.ultima_entrada)} · saiu {quando(w.ultima_saida)}
                </span>
                <a href="/backoffice/gestao/whatsapp" className="text-[11px] text-[#D2A63C] hover:underline">abrir conversas</a>
              </p>
            ))
          }
        </Seccao>

        <Seccao titulo="Telegram" bloco={ficha.telegram} vazio="Sem lead no bot do Telegram.">
          {(l) =>
            l.map((t) => (
              <p key={String(t.chat_id)} className="text-[13px]">
                {t.username ? `@${t.username}` : t.chat_id} · etapa {t.stage ?? '—'}
                {t.interest ? ` · ${t.interest}` : ''}
                <span className="block text-[11px] text-zinc-500">
                  {t.message_count ?? 0} mensagens · {quando(t.updated_at)}
                  {t.broker_uid ? ' · UID da corretora enviado' : ''}
                </span>
              </p>
            ))
          }
        </Seccao>

        <Seccao titulo="Instagram" bloco={ficha.instagram} vazio="Sem comentários com palavra-chave.">
          {(l) => (
            <ul className="space-y-1.5">
              {l.map((c) => (
                <li key={c.comment_id} className="text-[13px]">
                  <strong className="text-[#E9C46A]">{c.keyword ?? c.intent ?? '—'}</strong> · {quando(c.created_at)}
                  {c.comment_text && <span className="block truncate text-[11px] text-zinc-500">«{c.comment_text}»</span>}
                  {c.dm_status && <span className="block text-[11px] text-zinc-500">DM: {c.dm_status}</span>}
                </li>
              ))}
            </ul>
          )}
        </Seccao>

        <Seccao titulo="Vendas" bloco={ficha.vendas} vazio="Ainda não comprou nada.">
          {(l) => (
            <ul className="space-y-1.5">
              {l.map((v) => (
                <li key={v.id} className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span>{v.pack ?? 'venda'}{v.estornada_em ? ' · estornada' : ''}</span>
                  <span className="text-zinc-400">
                    {v.valor_cents != null ? `${(v.valor_cents / 100).toLocaleString('pt-PT')} ${v.moeda ?? '€'}` : '—'} · {quando(v.pago_em)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Seccao>

        <Seccao titulo="Consentimento (RGPD)" bloco={ficha.consentimentos} vazio="Nenhum consentimento registado.">
          {(l) => (
            <ul className="space-y-1.5">
              {l.map((c) => (
                <li key={c.id} className="text-[13px]">
                  {c.canal ?? '—'} · {c.base_legal ?? '—'} · {quando(c.pedido_em)}
                  {c.retirado_em && <span className="text-red-400"> · retirado {quando(c.retirado_em)}</span>}
                </li>
              ))}
            </ul>
          )}
        </Seccao>
      </div>

      <Seccao titulo="Histórico" bloco={ficha.eventos} vazio="Este negócio ainda não tem movimentos.">
        {(l) => (
          <ol className="space-y-2">
            {l.map((e) => (
              <li key={e.id} className="border-l border-zinc-800 pl-3 text-[13px]">
                <span className="text-zinc-500">{quando(e.em)}</span>
                {' · '}
                {e.de !== e.para ? `${estadoNome(e.de)} → ${estadoNome(e.para)}` : estadoNome(e.para)}
                {' · '}
                <span className="text-zinc-500">{e.por ? (nomes[e.por] ?? 'alguém da equipa') : e.agente_id ? 'Agente IA' : 'sistema'}</span>
                {e.nota && <span className="block text-zinc-400">{e.nota}</span>}
              </li>
            ))}
          </ol>
        )}
      </Seccao>
    </div>
  )
}
