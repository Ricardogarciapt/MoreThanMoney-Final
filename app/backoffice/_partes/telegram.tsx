'use client'

/**
 * LIGAR O TELEGRAM — o bloco que faltava para o motor do dia ter com quem falar.
 *
 * O motor prepara o trabalho de cada pessoa todas as manhãs e já sabe escrever-lhe; só que
 * `backoffice_contactos` nasceu vazia e não havia forma de a preencher. Era trabalho preparado que
 * ninguém sabia que existia.
 *
 * O CÓDIGO APARECE UMA VEZ, e o texto diz isso. Não há como o voltar a ver: a base guarda o resumo e
 * não o código (ver `lib/backoffice-telegram-codigo.ts` para o porquê da ligação ser por código e não
 * pelo email). Quem o perder gera outro — e gerar outro fecha o anterior, para não ficarem dois
 * códigos vivos, um deles esquecido num screenshot.
 *
 * NÃO FINGE, como o `marcar.tsx`: enquanto o servidor não responder, o botão diz que está a gerar.
 */
import { useEffect, useState, useTransition } from 'react'
import { Copiar } from './copiar'

interface Estado {
  ligado: boolean
  username: string | null
  avisos_ligados: boolean
  validade_minutos: number
}

export function LigarTelegram({ nomeDoBot }: { nomeDoBot: string }) {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [codigo, setCodigo] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aTrabalhar, comecar] = useTransition()

  async function ler() {
    try {
      const r = await fetch('/api/backoffice/telegram', { cache: 'no-store' })
      if (r.ok) setEstado((await r.json()) as Estado)
    } catch {
      /* o bloco fica com o texto de partida — não vale um alarme */
    }
  }

  useEffect(() => {
    void ler()
  }, [])

  function gerar() {
    setErro(null)
    comecar(async () => {
      try {
        const r = await fetch('/api/backoffice/telegram', { method: 'POST' })
        const d = (await r.json()) as { codigo?: string; error?: string }
        if (!r.ok || !d.codigo) setErro(d.error ?? 'Não consegui gerar o código.')
        else setCodigo(d.codigo)
      } catch {
        setErro('Não consegui falar com o servidor.')
      }
    })
  }

  function desligar() {
    setErro(null)
    comecar(async () => {
      try {
        await fetch('/api/backoffice/telegram', { method: 'DELETE' })
        setCodigo(null)
        await ler()
      } catch {
        setErro('Não consegui desligar.')
      }
    })
  }

  const minutos = estado?.validade_minutos ?? 15

  return (
    <section className="space-y-3 rounded-xl border border-gray-800 bg-gray-900/40 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Telegram</h2>
        {estado && (
          <span className={`text-xs ${estado.ligado ? 'text-emerald-400' : 'text-gray-500'}`}>
            {estado.ligado
              ? `ligado${estado.username ? ` · @${estado.username}` : ''}${estado.avisos_ligados ? '' : ' · avisos desligados'}`
              : 'não ligado'}
          </span>
        )}
      </div>

      <p className="text-sm leading-relaxed text-gray-400">
        Liga o teu Telegram e recebes aqui o teu dia de manhã. Pelo bot também vês as tuas tarefas,
        riscas o que está feito, lês o rascunho da mensagem e consultas o teu pipeline e o teu
        extracto.
      </p>

      {codigo ? (
        <div className="space-y-2 rounded-lg border border-[#D2A63C]/40 bg-[#D2A63C]/5 p-4">
          <div className="flex items-center gap-3">
            <code className="select-all font-mono text-2xl tracking-widest text-[#D2A63C]">{codigo}</code>
            <Copiar texto={`/ligar ${codigo}`} />
          </div>
          <p className="text-xs leading-relaxed text-gray-400">
            Abre a conversa com{' '}
            <a
              href={`https://t.me/${nomeDoBot}`}
              target="_blank"
              rel="noreferrer"
              className="text-[#D2A63C] hover:underline"
            >
              @{nomeDoBot}
            </a>{' '}
            e escreve <code className="text-gray-300">/ligar {codigo}</code>.
          </p>
          <p className="text-xs text-gray-500">
            Serve uma vez e expira em {minutos} minutos. <b>Não o passes a ninguém</b> — quem o tiver
            recebe o teu trabalho e vê o teu extracto.
          </p>
        </div>
      ) : null}

      {erro && <p className="text-xs text-red-400">{erro}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={gerar}
          disabled={aTrabalhar}
          className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-200 transition hover:border-[#D2A63C] hover:text-[#D2A63C] disabled:opacity-50"
        >
          {aTrabalhar ? 'a gerar…' : estado?.ligado ? 'Gerar código novo' : 'Gerar código'}
        </button>
        {estado?.ligado && (
          <button
            type="button"
            onClick={desligar}
            disabled={aTrabalhar}
            className="rounded-md border border-gray-800 px-3 py-1.5 text-xs text-gray-400 transition hover:border-red-500/60 hover:text-red-400 disabled:opacity-50"
          >
            Desligar
          </button>
        )}
      </div>
    </section>
  )
}
