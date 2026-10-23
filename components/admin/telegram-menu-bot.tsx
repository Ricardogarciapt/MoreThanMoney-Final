'use client'

import { useCallback, useEffect, useState } from 'react'
import { Eye, EyeOff, Menu, Plus, Send, Trash2 } from 'lucide-react'
import { Aviso, Botao, Campo, Faixa, Painel, Pilula, Vazio, fmtQuando } from '@/components/admin/centro/ui'
import type { Botao as BotaoLink, ComandoExtra, MenuBot } from '@/lib/telegram/menu-bot'

/**
 * GESTÃO → TELEGRAM → MENU DO BOT: comandos do «/», descrições, botão do menu e comandos extra
 * com resposta fixa. Ver `lib/telegram/menu-bot.ts` (regras) e a API em
 * `app/api/admin/backoffice/telegram/bot-menu/route.ts`.
 */
const API = '/api/admin/backoffice/telegram/bot-menu'
const entrada = 'w-full rounded-md border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:border-[#D2A63C]/50 focus:outline-none'
const EXTRA_VAZIO: ComandoExtra = { command: '', description: '', resposta: '', botoes: [{ texto: '', url: '' }], visivel: true }

export default function TelegramMenuBot() {
  const [menu, setMenu] = useState<MenuBot | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [aGravar, setAGravar] = useState(false)
  const [mexido, setMexido] = useState(false)

  const ler = useCallback(async () => {
    const r = await fetch(API, { cache: 'no-store' })
    const d = await r.json().catch(() => ({}))
    if (r.ok) setMenu(d.menu)
    else setErro(d.error ?? 'Não consegui ler o menu.')
  }, [])
  useEffect(() => { void ler() }, [ler])

  const mudar = (m: MenuBot) => { setMenu(m); setMexido(true); setAviso(null) }

  const enviar = async (publicar: boolean) => {
    if (!menu) return
    setAGravar(true)
    setErro(null)
    try {
      const r = await fetch(API, { method: publicar ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(menu) })
      const d = await r.json().catch(() => ({}))
      if (d.menu) setMenu(d.menu)
      if (!r.ok) { setErro(d.error ?? 'Falhou.'); return }
      setMexido(false)
      setAviso(publicar ? 'Publicado. O menu novo aparece no Telegram em poucos segundos (às vezes é preciso reabrir a conversa).' : 'Gravado. Os comandos extra já respondem. O menu «/» só muda quando publicares.')
    } finally {
      setAGravar(false)
    }
  }

  if (!menu) {
    return <Painel titulo="Menu do bot" icone={<Menu className="h-3.5 w-3.5 text-[#D2A63C]" />}>{erro ? <Aviso tom="grave">{erro}</Aviso> : <Vazio>A ler…</Vazio>}</Painel>
  }

  const extra = (i: number, x: Partial<ComandoExtra>) => mudar({ ...menu, extras: menu.extras.map((e, j) => (j === i ? { ...e, ...x } : e)) })
  const botao = (i: number, k: number, b: Partial<BotaoLink>) => extra(i, { botoes: menu.extras[i].botoes.map((o, j) => (j === k ? { ...o, ...b } : o)) })

  return (
    <Painel
      titulo="Menu do bot"
      icone={<Menu className="h-3.5 w-3.5 text-[#D2A63C]" />}
      sub={`@MoreThanMoney_aibot · ${menu.publicadoEm ? `publicado ${fmtQuando(menu.publicadoEm)}` : 'ainda não publicado daqui'}`}
      accao={
        <div className="flex gap-1.5">
          <Botao onClick={() => void enviar(false)} disabled={aGravar || !mexido}>Gravar</Botao>
          <Botao tom="ouro" onClick={() => void enviar(true)} disabled={aGravar}><Send className="h-3 w-3" /> Publicar no Telegram</Botao>
        </div>
      }
    >
      {erro && <div className="mb-3"><Aviso tom="grave">{erro}</Aviso></div>}
      {aviso && <div className="mb-3"><Aviso tom="info">{aviso}</Aviso></div>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Descrição (aparece antes de alguém carregar em Começar)">
          <textarea className={entrada} rows={2} value={menu.descricao} onChange={(e) => mudar({ ...menu, descricao: e.target.value })} />
        </Campo>
        <Campo rotulo="Descrição curta (perfil do bot)">
          <input className={entrada} value={menu.descricaoCurta} onChange={(e) => mudar({ ...menu, descricaoCurta: e.target.value })} />
        </Campo>
        <Campo rotulo="Botão do menu: texto (vazio = lista de comandos)">
          <input className={entrada} value={menu.botaoMenu?.texto ?? ''} placeholder="ex.: Abrir a app" onChange={(e) => mudar({ ...menu, botaoMenu: { texto: e.target.value, url: menu.botaoMenu?.url ?? '' } })} />
        </Campo>
        <Campo rotulo="Botão do menu: link (abre dentro do Telegram)">
          <input className={entrada} value={menu.botaoMenu?.url ?? ''} placeholder="https://www.morethanmoney.pt/app-mobile" onChange={(e) => mudar({ ...menu, botaoMenu: { texto: menu.botaoMenu?.texto ?? '', url: e.target.value } })} />
        </Campo>
      </div>

      <h4 className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#D2A63C]/80">Comandos do bot</h4>
      <p className="mb-2 text-[11px] text-zinc-500">O bot já sabe responder a estes. Aqui mudas o texto do menu e se aparecem.</p>
      <div className="space-y-1">
        {menu.base.map((c, i) => (
          <div key={c.command} className={`flex items-center gap-2 ${c.visivel ? '' : 'opacity-50'}`}>
            <span className="w-24 shrink-0 font-mono text-[11.5px] text-zinc-300">/{c.command}</span>
            <input className={entrada} value={c.description} onChange={(e) => mudar({ ...menu, base: menu.base.map((b, j) => (j === i ? { ...b, description: e.target.value } : b)) })} />
            <button type="button" title={c.visivel ? 'Esconder do menu' : 'Mostrar no menu'} className="rounded-md border border-white/10 p-1.5 text-zinc-400 hover:text-white"
              onClick={() => mudar({ ...menu, base: menu.base.map((b, j) => (j === i ? { ...b, visivel: !b.visivel } : b)) })}>
              {c.visivel ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>
          </div>
        ))}
      </div>

      <div className="mb-1.5 mt-4 flex items-center gap-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#D2A63C]/80">Comandos novos</h4>
        <span className="ml-auto"><Botao onClick={() => mudar({ ...menu, extras: [...menu.extras, { ...EXTRA_VAZIO, botoes: [{ texto: '', url: '' }] }] })}><Plus className="h-3 w-3" /> Comando</Botao></span>
      </div>
      <p className="mb-2 text-[11px] text-zinc-500">Um comando com uma resposta fixa e botões de link, para um produto, um evento ou uma oferta.</p>
      {menu.extras.length === 0 ? (
        <Vazio>Ainda não há comandos novos.</Vazio>
      ) : (
        <div className="space-y-2">
          {menu.extras.map((x, i) => (
            <Faixa key={i} tom={x.visivel ? 'ok' : 'neutro'}>
              <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)_auto]">
                <input className={entrada} value={x.command} placeholder="/bootcamp" onChange={(e) => extra(i, { command: e.target.value })} />
                <input className={entrada} value={x.description} placeholder="Descrição no menu" onChange={(e) => extra(i, { description: e.target.value })} />
                <div className="flex gap-1.5">
                  <button type="button" title={x.visivel ? 'Esconder do menu' : 'Mostrar no menu'} className="rounded-md border border-white/10 p-1.5 text-zinc-400 hover:text-white" onClick={() => extra(i, { visivel: !x.visivel })}>
                    {x.visivel ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </button>
                  <Botao tom="perigo" onClick={() => mudar({ ...menu, extras: menu.extras.filter((_, j) => j !== i) })} title="Apagar"><Trash2 className="h-3 w-3" /></Botao>
                </div>
              </div>
              <textarea className={`${entrada} mt-2`} rows={3} value={x.resposta} placeholder="O que o bot responde" onChange={(e) => extra(i, { resposta: e.target.value })} />
              <div className="mt-2 space-y-1.5">
                {x.botoes.map((b, k) => (
                  <div key={k} className="grid gap-1.5 sm:grid-cols-[160px_minmax(0,1fr)_auto]">
                    <input className={entrada} value={b.texto} placeholder="Texto do botão" onChange={(e) => botao(i, k, { texto: e.target.value })} />
                    <input className={entrada} value={b.url} placeholder="https://…" onChange={(e) => botao(i, k, { url: e.target.value })} />
                    <button type="button" className="rounded-md border border-white/10 px-2 text-[11px] text-zinc-500 hover:text-white" onClick={() => extra(i, { botoes: x.botoes.filter((_, j) => j !== k) })}>tirar</button>
                  </div>
                ))}
                {x.botoes.length < 6 && (
                  <button type="button" className="text-[11px] text-[#E9C46A] hover:underline" onClick={() => extra(i, { botoes: [...x.botoes, { texto: '', url: '' }] })}>+ botão</button>
                )}
              </div>
              {!x.visivel && <p className="mt-1.5"><Pilula tom="neutro">fora do menu, mas responde</Pilula></p>}
            </Faixa>
          ))}
        </div>
      )}
    </Painel>
  )
}
