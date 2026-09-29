"use client"

/**
 * MARKETPLACE — a secção do Centro onde o dono manda no que os educadores vendem.
 *
 * Três coisas, por esta ordem, porque é a ordem em que elas interrompem o dia de alguém:
 *
 *   1. Os INTERRUPTORES, à cabeça. É a alavanca de emergência: desligar o marketplace inteiro sem
 *      abrir nada nem procurar nada.
 *   2. A FILA DE REVISÃO. Um produto em revisão é um educador à espera. Enterrá-lo numa tabela
 *      ordenada por data é a maneira de ninguém o ver durante duas semanas.
 *   3. Os VENDEDORES e as VENDAS — quem vende, quanto vendeu, e quanto lhe falta pagar.
 *
 * A partilha edita-se AQUI e só aqui. Não é um campo do formulário do educador: é o acordo que a
 * /criadores prometeu em público, e quem o escreve é quem responde por ele.
 */

import { useCallback, useState } from "react"
import { Store } from "lucide-react"
import { useCentroCtx } from "@/components/admin/centro/contexto"
import {
  Aviso,
  Azulejo,
  Botao,
  BotaoLer,
  Painel,
  Pilula,
  Tabela,
  Vazio,
  fmtQuando,
  pedirCentro,
  td,
  th,
  useCentro,
} from "@/components/admin/centro/ui"
import { euros } from "@/lib/marketplace/regras"

type Definicoes = { ligado: boolean; revisaoObrigatoria: boolean; iosVitrine: "ver_sem_comprar" | "esconder" }
type LinhaEducador = {
  educator_id: string
  nome: string
  specialty: string | null
  vende: boolean
  activo: boolean
  partilha_pct: number | null
  temContaStripe: boolean
  produtos: number
  vendas: number
  brutoCents: number
  aReceberCents: number
}
type Produto = {
  id: string
  slug: string
  titulo: string
  tipo: string
  preco_cents: number
  moeda: string
  estado: string
  activo: boolean
  partilha_pct: number | null
  stripe_price_id: string | null
  educator_id: string
  motivo_recusa: string | null
  publicado_em: string | null
}
type Venda = {
  id: string
  produto_id: string
  educator_id: string
  estado: string
  bruto_cents: number
  parte_educador_cents: number
  parte_casa_cents: number
  moeda: string
  pago_em: string
}
type Dados = {
  definicoes: Definicoes
  limites: { min: number; max: number }
  educadores: LinhaEducador[]
  produtos: Produto[]
  porRever: Produto[]
  vendas: Venda[]
  totais: { vendas: number; brutoCents: number; paraEducadoresCents: number; paraCasaCents: number }
}

const TOM_ESTADO: Record<string, "neutro" | "ok" | "aviso" | "grave"> = {
  publicado: "ok",
  em_revisao: "aviso",
  rascunho: "neutro",
  retirado: "grave",
}

export default function SeccaoMarketplace() {
  const ctx = useCentroCtx()
  const { dados, erro, aCarregar, recarregar, lidoEm } = useCentro<Dados>(
    `/api/admin/centro/marketplace?v=${ctx.versao}`,
    30_000,
  )
  const [aAgir, setAAgir] = useState<string | null>(null)

  const agir = useCallback(
    async (corpo: Record<string, unknown>, chave: string) => {
      setAAgir(chave)
      try {
        await pedirCentro("/api/admin/centro/marketplace", { method: "POST", body: JSON.stringify(corpo) })
        await recarregar()
        ctx.depoisDeAcao?.()
      } finally {
        setAAgir(null)
      }
    },
    [recarregar, ctx],
  )

  if (erro) return <Aviso tom="grave">Não consegui ler o marketplace: {erro}</Aviso>
  if (!dados) return <Vazio>A ler…</Vazio>

  const nomeDe = (id: string) => dados.educadores.find((e) => e.educator_id === id)?.nome ?? id.slice(0, 8)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <BotaoLer onClick={recarregar} aCarregar={aCarregar} lidoEm={lidoEm} />
      </div>

      {/* ── 1. Os interruptores ──────────────────────────────────────────────────────── */}
      <Painel
        titulo="Interruptores"
        icone={<Store size={14} />}
        sub="O geral fecha tudo de uma vez. Os de cada educador e de cada produto estão nas tabelas abaixo."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Botao
            tom={dados.definicoes.ligado ? "perigo" : "ouro"}
            disabled={aAgir === "geral"}
            onClick={() => agir({ accao: "definicoes", ligado: !dados.definicoes.ligado }, "geral")}
          >
            {dados.definicoes.ligado ? "Desligar o marketplace" : "Ligar o marketplace"}
          </Botao>
          <Botao
            disabled={aAgir === "revisao"}
            onClick={() => agir({ accao: "definicoes", revisaoObrigatoria: !dados.definicoes.revisaoObrigatoria }, "revisao")}
          >
            Revisão obrigatória: {dados.definicoes.revisaoObrigatoria ? "sim" : "não"}
          </Botao>
          <Botao
            disabled={aAgir === "ios"}
            onClick={() =>
              agir(
                { accao: "definicoes", iosVitrine: dados.definicoes.iosVitrine === "esconder" ? "ver_sem_comprar" : "esconder" },
                "ios",
              )
            }
            title="Na app iOS nunca há caminho de compra (Apple 3.1.1). A escolha é só entre mostrar a montra ou escondê-la."
          >
            App iOS: {dados.definicoes.iosVitrine === "esconder" ? "separador escondido" : "montra sem comprar"}
          </Botao>
        </div>
        {!dados.definicoes.ligado && (
          <div className="mt-3">
            <Aviso tom="info">
              Está desligado. Nada aparece na vitrine do site nem na app, e nenhum educador consegue publicar.
            </Aviso>
          </div>
        )}
      </Painel>

      {/* ── Os números ───────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Azulejo rotulo="Vendas" valor={String(dados.totais.vendas)} />
        <Azulejo rotulo="Bruto" valor={euros(dados.totais.brutoCents)} />
        <Azulejo rotulo="Para os educadores" valor={euros(dados.totais.paraEducadoresCents)} sub="por pagar/pago" />
        <Azulejo rotulo="Para a casa" valor={euros(dados.totais.paraCasaCents)} sub="comissão 5–10%" />
      </div>

      {/* ── 2. A fila de revisão ─────────────────────────────────────────────────────── */}
      <Painel
        titulo={`À espera de revisão (${dados.porRever.length})`}
        sub="Cada linha aqui é um educador à espera de uma resposta."
      >
        {dados.porRever.length === 0 ? (
          <Vazio>Nada à espera.</Vazio>
        ) : (
          <Tabela min={860}>
            <thead>
              <tr>
                <th className={th}>Produto</th>
                <th className={th}>Autor</th>
                <th className={th}>Preço</th>
                <th className={th}>Acções</th>
              </tr>
            </thead>
            <tbody>
              {dados.porRever.map((p) => (
                <tr key={p.id}>
                  <td className={td}>
                    <div className="text-zinc-200">{p.titulo}</div>
                    <div className="text-[11px] text-zinc-500">/{p.slug} · {p.tipo}</div>
                  </td>
                  <td className={td}>{nomeDe(p.educator_id)}</td>
                  <td className={td}>{euros(p.preco_cents, p.moeda)}</td>
                  <td className={td}>
                    <div className="flex gap-1.5">
                      <Botao tom="ouro" disabled={aAgir === p.id} onClick={() => agir({ accao: "aprovar", id: p.id }, p.id)}>
                        Aprovar
                      </Botao>
                      <Botao
                        tom="perigo"
                        disabled={aAgir === p.id}
                        onClick={() => {
                          // Recusar sem motivo obriga o educador a adivinhar — e ele volta a
                          // submeter a mesma coisa.
                          const motivo = window.prompt("Porquê? (o educador vai ler isto)")
                          if (motivo) agir({ accao: "recusar", id: p.id, motivo }, p.id)
                        }}
                      >
                        Recusar
                      </Botao>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Painel>

      {/* ── 3. Os vendedores ─────────────────────────────────────────────────────────── */}
      <Painel titulo="Educadores" sub={`A partilha edita-se aqui, entre ${dados.limites.min}% e ${dados.limites.max}% — é o que a /criadores promete.`}>
        <Tabela min={960}>
          <thead>
            <tr>
              <th className={th}>Educador</th>
              <th className={th}>Vende</th>
              <th className={th}>Partilha</th>
              <th className={th}>Produtos</th>
              <th className={th}>Vendas</th>
              <th className={th}>A receber</th>
              <th className={th}>Stripe</th>
            </tr>
          </thead>
          <tbody>
            {dados.educadores.map((e) => (
              <tr key={e.educator_id}>
                <td className={td}>
                  <div className="text-zinc-200">{e.nome}</div>
                  <div className="text-[11px] text-zinc-500">{e.specialty ?? "—"}</div>
                </td>
                <td className={td}>
                  <Botao
                    tom={e.activo ? "perigo" : "ouro"}
                    disabled={aAgir === e.educator_id}
                    onClick={() => agir({ accao: "vendedor", educator_id: e.educator_id, activo: !e.activo }, e.educator_id)}
                  >
                    {e.activo ? "Suspender" : "Activar"}
                  </Botao>
                </td>
                <td className={td}>
                  <button
                    type="button"
                    className="text-[#E9C46A] underline decoration-dotted"
                    onClick={() => {
                      const v = window.prompt(
                        `Partilha do educador (${dados.limites.min}–${dados.limites.max}%)`,
                        String(e.partilha_pct ?? dados.limites.max),
                      )
                      if (v) agir({ accao: "vendedor", educator_id: e.educator_id, partilha_pct: Number(v) }, e.educator_id)
                    }}
                  >
                    {e.partilha_pct != null ? `${e.partilha_pct}%` : "—"}
                  </button>
                </td>
                <td className={td}>{e.produtos}</td>
                <td className={td}>{e.vendas}</td>
                <td className={td}>{euros(e.aReceberCents)}</td>
                <td className={td}>
                  {e.temContaStripe ? <Pilula tom="ok">ligada</Pilula> : <Pilula tom="aviso">sem conta</Pilula>}
                </td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      </Painel>

      {/* ── Todos os produtos ────────────────────────────────────────────────────────── */}
      <Painel titulo={`Produtos (${dados.produtos.length})`} sub="Sem preço Stripe não há caminho de compra — o botão diz-lho e a rota recusa.">
        {dados.produtos.length === 0 ? (
          <Vazio>Ainda não há produtos.</Vazio>
        ) : (
          <Tabela min={1000}>
            <thead>
              <tr>
                <th className={th}>Produto</th>
                <th className={th}>Autor</th>
                <th className={th}>Estado</th>
                <th className={th}>Preço</th>
                <th className={th}>Stripe</th>
                <th className={th}>Acções</th>
              </tr>
            </thead>
            <tbody>
              {dados.produtos.map((p) => (
                <tr key={p.id}>
                  <td className={td}>
                    <div className="text-zinc-200">{p.titulo}</div>
                    <div className="text-[11px] text-zinc-500">/{p.slug}{p.motivo_recusa ? ` · recusado: ${p.motivo_recusa}` : ""}</div>
                  </td>
                  <td className={td}>{nomeDe(p.educator_id)}</td>
                  <td className={td}>
                    <Pilula tom={TOM_ESTADO[p.estado] ?? "neutro"}>{p.estado}</Pilula>
                    {!p.activo && <span className="ml-1"><Pilula tom="grave">desligado</Pilula></span>}
                  </td>
                  <td className={td}>{euros(p.preco_cents, p.moeda)}</td>
                  <td className={td}>
                    <button
                      type="button"
                      className="text-[#E9C46A] underline decoration-dotted"
                      onClick={() => {
                        const v = window.prompt("price_id do Stripe (vazio = sem cobrança)", p.stripe_price_id ?? "")
                        if (v !== null) agir({ accao: "produto", id: p.id, stripe_price_id: v }, p.id)
                      }}
                    >
                      {p.stripe_price_id ? "ligado" : "— ligar"}
                    </button>
                  </td>
                  <td className={td}>
                    <div className="flex gap-1.5">
                      <Botao disabled={aAgir === p.id} onClick={() => agir({ accao: "produto", id: p.id, activo: !p.activo }, p.id)}>
                        {p.activo ? "Desligar" : "Ligar"}
                      </Botao>
                      {p.estado === "publicado" && (
                        <Botao tom="perigo" disabled={aAgir === p.id} onClick={() => agir({ accao: "retirar", id: p.id }, p.id)}>
                          Retirar
                        </Botao>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Painel>

      {/* ── As vendas ────────────────────────────────────────────────────────────────── */}
      <Painel titulo="Últimas vendas" sub="O que cada venda deu ao autor e o que ficou para a casa.">
        {dados.vendas.length === 0 ? (
          <Vazio>Ainda não houve vendas.</Vazio>
        ) : (
          <Tabela min={820}>
            <thead>
              <tr>
                <th className={th}>Quando</th>
                <th className={th}>Autor</th>
                <th className={th}>Estado</th>
                <th className={th}>Bruto</th>
                <th className={th}>Autor recebe</th>
                <th className={th}>Casa</th>
              </tr>
            </thead>
            <tbody>
              {dados.vendas.map((v) => (
                <tr key={v.id}>
                  <td className={td}>{fmtQuando(v.pago_em)}</td>
                  <td className={td}>{nomeDe(v.educator_id)}</td>
                  <td className={td}>
                    <Pilula tom={v.estado === "paga" ? "ok" : "grave"}>{v.estado}</Pilula>
                  </td>
                  <td className={td}>{euros(v.bruto_cents, v.moeda)}</td>
                  <td className={td}>{euros(v.parte_educador_cents, v.moeda)}</td>
                  <td className={td}>{euros(v.parte_casa_cents, v.moeda)}</td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Painel>
    </div>
  )
}
