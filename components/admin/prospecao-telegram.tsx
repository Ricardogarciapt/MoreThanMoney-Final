"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, RefreshCw, Users, MessageSquare, LogOut, ExternalLink } from "lucide-react"

/**
 * PROSPEÇÃO NO TELEGRAM — quem já nos tocou e ainda não está no funil.
 *
 * Encontrar é automático; falar é teu. E aqui não é preguiça do sistema: um bot do Telegram NÃO
 * pode iniciar conversa com quem nunca lhe escreveu, e mandar em massa pela conta pessoal (o
 * MTProto) é o caminho mais curto para essa conta ser limitada — com ela caem os grupos, os
 * canais e o funil todo.
 *
 * O que desaparece aqui é o trabalho de PROCURAR e de decidir por onde começar.
 */

interface Contacto {
  tgUserId: string
  username: string | null
  firstName: string | null
  grupos: string[]
  mensagens: number
  entradas: number
  saidas: number
  ultimoVistoIso: string | null
  estado: string
  pontuacao: number
  porque: string
  comoAbordar: string
}

interface Grupo {
  chat_id: string
  titulo: string | null
  tipo: string | null
  membros: number | null
  nosso: boolean
  ultima_atividade: string | null
  fonte: string
  nota: string | null
}

export function ProspecaoTelegram() {
  const [lista, setLista] = useState<Contacto[]>([])
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [porEstado, setPorEstado] = useState<Record<string, number>>({})
  const [mtproto, setMtproto] = useState(true)
  const [aLer, setALer] = useState(true)
  const [aCorrer, setACorrer] = useState(false)
  const [aba, setAba] = useState<"pessoas" | "grupos">("pessoas")

  const buscar = useCallback(async () => {
    setALer(true)
    try {
      const r = await fetch("/api/admin/prospecao", { cache: "no-store" })
      const j = await r.json()
      if (j.ok) {
        setLista(j.lista as Contacto[])
        setGrupos(j.grupos as Grupo[])
        setPorEstado(j.porEstado as Record<string, number>)
        setMtproto(!!j.mtprotoLigado)
      }
    } catch {
      /* o painel fica como está */
    }
    setALer(false)
  }, [])

  useEffect(() => {
    void buscar()
  }, [buscar])

  const marcar = async (tgUserId: string, estado: string) => {
    setLista((l) => l.filter((c) => c.tgUserId !== tgUserId))
    await fetch("/api/admin/prospecao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tgUserId, estado }),
    }).catch(() => {})
  }

  const gruposSemBot = grupos.filter((g) => g.nosso && g.fonte === "mtproto" && !g.ultima_atividade)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
            <Users className="h-4 w-4" /> Prospeção no Telegram
          </h2>
          <p className="mt-0.5 text-[11px] text-neutral-400">
            Quem falou, entrou ou saiu dos nossos grupos e nunca chegou ao funil. O bot não lhes pode
            escrever primeiro — a API do Telegram não deixa — por isso a lista prepara a abordagem e
            não dispara nada.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              setACorrer(true)
              await fetch("/api/admin/prospecao", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ correr: true }),
              }).catch(() => {})
              await buscar()
              setACorrer(false)
            }}
            disabled={aCorrer}
            className="rounded-lg border px-3 py-1 text-sm hover:bg-neutral-800 disabled:opacity-40"
          >
            {aCorrer ? "A arrumar…" : "Arrumar agora"}
          </button>
          <button onClick={() => void buscar()} disabled={aLer} className="rounded-lg border p-1.5 hover:bg-neutral-800">
            {aLer ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* O mapa incompleto tem de se anunciar: uma lista curta lida como se fosse a realidade toda
          é pior do que não ter lista. */}
      {!mtproto && (
        <p className="rounded-lg border border-amber-900 bg-amber-950/40 p-2.5 text-[11.5px] leading-snug text-amber-200">
          <b>O mapa está a metade.</b> Falta a chave <code>TELEGRAM_DIALOGOS_SECRET</code> neste
          projeto — existe, mas só no ambiente do <i>mtm-auto</i>. Sem ela só se veem os grupos onde o
          bot já está, e ficam de fora exactamente os grupos onde mandas e o sistema não vê nada.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {(["novo", "abordado", "no_funil", "ignorado"] as const).map((e) => (
          <span key={e} className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-400">
            {e}: <b className="tabular-nums">{porEstado[e] ?? 0}</b>
          </span>
        ))}
        <button
          onClick={() => setAba(aba === "pessoas" ? "grupos" : "pessoas")}
          className="rounded-full border border-neutral-700 px-2 py-0.5 text-neutral-300 hover:bg-neutral-800"
        >
          {aba === "pessoas" ? `ver mapa dos grupos (${grupos.length})` : `ver pessoas (${lista.length})`}
        </button>
      </div>

      {aba === "pessoas" && (
        <>
          {!aLer && !lista.length && (
            <div className="rounded-lg border border-dashed border-neutral-700 p-4 text-center text-sm text-neutral-400">
              <p>Ninguém por tratar.</p>
              <p className="mt-1 text-[11px]">
                O radar só conta a partir de agora — não vê o passado. Se ficar vazio durante dias e o
                grupo estiver a falar, o mais provável é o <i>privacy mode</i> do bot estar ligado
                (BotFather → /setprivacy → Disable, e depois tirar e voltar a pôr o bot nos grupos).
              </p>
            </div>
          )}

          <div className="space-y-2">
            {lista.map((c) => (
              <div key={c.tgUserId} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span
                    className={`rounded px-1.5 py-0.5 font-bold ${
                      c.pontuacao >= 60 ? "bg-emerald-950 text-emerald-300" : "bg-neutral-100 text-neutral-400"
                    }`}
                  >
                    {c.pontuacao}
                  </span>
                  <span className="font-semibold text-neutral-100">{c.firstName ?? "sem nome"}</span>
                  {c.username && <span className="text-neutral-400">@{c.username}</span>}
                  {c.mensagens > 0 && (
                    <span className="inline-flex items-center gap-1 text-neutral-400">
                      <MessageSquare className="h-3 w-3" /> {c.mensagens}
                    </span>
                  )}
                  {c.saidas > 0 && (
                    <span className="inline-flex items-center gap-1 text-amber-400">
                      <LogOut className="h-3 w-3" /> saiu
                    </span>
                  )}
                  <span className="text-neutral-400">· {c.porque}</span>
                </div>

                <p className="mt-1.5 text-[12.5px] leading-snug text-neutral-200">{c.comoAbordar}</p>

                <div className="mt-2 flex flex-wrap gap-2">
                  {c.username && (
                    <a
                      href={`https://t.me/${c.username}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => void marcar(c.tgUserId, "abordado")}
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-black hover:bg-amber-400"
                    >
                      Abrir conversa <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <button
                    onClick={() => void marcar(c.tgUserId, "abordado")}
                    className="rounded-lg border border-neutral-700 px-3 py-1 text-xs text-neutral-100 hover:bg-neutral-800"
                  >
                    Já falei
                  </button>
                  <button
                    onClick={() => void marcar(c.tgUserId, "ignorado")}
                    className="rounded-lg border border-neutral-800 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
                  >
                    Não serve
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {aba === "grupos" && (
        <div className="space-y-2">
          {/* Os grupos nossos sem o bot vêm primeiro e com destaque: é a maior alavanca de entrada
              que existe hoje, e custa dois toques. */}
          {gruposSemBot.length > 0 && (
            <p className="rounded-lg border border-emerald-900 bg-emerald-950/40 p-2.5 text-[11.5px] text-emerald-200">
              <b>{gruposSemBot.length} grupo(s) teus sem o bot lá dentro.</b> Sem o bot não há
              boas-vindas, não há radar e não sai um lead. Pôr lá:{" "}
              <code>t.me/morethanmoneypt_bot?startgroup=true</code>
            </p>
          )}
          {grupos.map((g) => (
            <div key={g.chat_id} className="rounded-lg border p-2.5">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span
                  className={`rounded px-1.5 py-0.5 font-semibold ${
                    g.nosso ? "bg-emerald-950 text-emerald-300" : "bg-neutral-100 text-neutral-400"
                  }`}
                >
                  {g.nosso ? "nosso" : "terceiros"}
                </span>
                <span className="font-semibold text-neutral-100">{g.titulo ?? g.chat_id}</span>
                {g.membros != null && <span className="text-neutral-400">{g.membros} membros</span>}
                <span className="text-neutral-500">via {g.fonte}</span>
              </div>
              {g.nota && <p className="mt-1 text-[12px] leading-snug text-neutral-300">{g.nota}</p>}
            </div>
          ))}
          {!grupos.length && !aLer && (
            <p className="rounded-lg border border-dashed border-neutral-700 p-4 text-center text-sm text-neutral-400">
              Mapa vazio. Carrega em «Arrumar agora» para o desenhar.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
