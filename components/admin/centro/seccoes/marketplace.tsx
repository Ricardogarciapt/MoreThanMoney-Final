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
import { euros, nomeDoAutor } from "@/lib/marketplace/regras"

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
  // NULO em todos os produtos da casa — é isso que `dono = 'casa'` significa. Estava declarado
  // `string` e não era verdade, e foi essa mentira no tipo que deixou o `tsc` calado enquanto o
  // ecrã fazia `null.slice(0, 8)` em produção. Ver `nomeDoAutor` em `regras.ts`.
  educator_id: string | null
  dono: string
  imagem_url: string | null
  motivo_recusa: string | null
  publicado_em: string | null
}
type Venda = {
  id: string
  produto_id: string
  educator_id: string | null
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
  funil: { dias: number; etapas: Record<EtapaFunil, number> }
  totais: { vendas: number; brutoCents: number; paraEducadoresCents: number; paraCasaCents: number }
}

type EtapaFunil = "viu_montra" | "viu_ficha" | "iniciou_checkout" | "pagou" | "desistiu"

/**
 * O funil pela ordem em que acontece, com o nome que uma pessoa usa.
 *
 * A ordem é a informação: é entre dois degraus seguidos que se vê onde as pessoas caem. Um objecto
 * não tem ordem garantida, por isso ela está escrita à mão aqui e não deduzida das chaves.
 */
const DEGRAUS: { chave: EtapaFunil; nome: string }[] = [
  { chave: "viu_montra", nome: "Viram a montra" },
  { chave: "viu_ficha", nome: "Abriram uma ficha" },
  { chave: "iniciou_checkout", nome: "Foram ao pagamento" },
  { chave: "pagou", nome: "Pagaram" },
]

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

  /**
   * O nome de quem vende, e o cuidado que ele não tinha.
   *
   * A versão anterior era `(id: string) => …?.nome ?? id.slice(0, 8)` e recebia `p.educator_id`
   * directamente. Nos 14 produtos da casa esse campo é NULO, e `null.slice` é um TypeError no meio
   * do render — que não estraga uma célula, derruba a secção toda. A decisão de o que mostrar a um
   * produto sem educador vive agora em `nomeDoAutor`, com guarda.
   */
  const nomeDoEducador = (id: string) => dados.educadores.find((e) => e.educator_id === id)?.nome
  const autorDe = (p: { educator_id?: string | null; dono?: string | null }) => nomeDoAutor(p, nomeDoEducador)

  const semImagem = dados.produtos.filter((p) => !p.imagem_url)

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
        <Azulejo rotulo="Para a casa" valor={euros(dados.totais.paraCasaCents)} sub="comissão 20%" />
      </div>

      {/* ── O funil ──────────────────────────────────────────────────────────────────────
          A pergunta a que este quadro responde é «quantos chegaram ao pagamento e não pagaram?»,
          e é a resposta dela que diz se o problema é o preço, a ficha ou o checkout. Conta
          PESSOAS e não cliques (ver `funilPorEtapa`): alguém que abriu a mesma ficha cinco vezes
          é uma pessoa interessada, não cinco. */}
      <Painel titulo={`Funil · últimos ${dados.funil.dias} dias`} sub="Pessoas, não cliques. Cada degrau é uma decisão que alguém tomou.">
        {DEGRAUS.every((d) => (dados.funil.etapas[d.chave] ?? 0) === 0) ? (
          <Vazio>Ninguém passou pela montra nestes dias.</Vazio>
        ) : (
          <div className="space-y-2">
            {DEGRAUS.map((d, i) => {
              const quantos = dados.funil.etapas[d.chave] ?? 0
              const topo = dados.funil.etapas[DEGRAUS[0].chave] ?? 0
              // A barra é sobre o PRIMEIRO degrau e a percentagem ao lado é sobre o ANTERIOR. São
              // duas leituras diferentes de propósito: a barra dá a escala, a percentagem dá a
              // queda — e é a queda que aponta o degrau estragado.
              const largura = topo > 0 ? Math.max(2, Math.round((quantos / topo) * 100)) : 0
              const anterior = i === 0 ? null : dados.funil.etapas[DEGRAUS[i - 1].chave] ?? 0
              return (
                <div key={d.chave}>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-zinc-300">{d.nome}</span>
                    <span className="text-zinc-400">
                      {quantos}
                      {anterior != null && anterior > 0 && (
                        <span className="ml-1.5 text-[11px] text-zinc-500">
                          {Math.round((quantos / anterior) * 100)}% do passo anterior
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-white/5">
                    <div className="h-1.5 rounded-full bg-[#E9C46A]" style={{ width: `${largura}%` }} />
                  </div>
                </div>
              )
            })}
            {(dados.funil.etapas.desistiu ?? 0) > 0 && (
              <p className="pt-1 text-[11px] text-zinc-500">
                {dados.funil.etapas.desistiu} desistiram no pagamento.
              </p>
            )}
          </div>
        )}
      </Painel>

      {/* ── As capas que faltam ──────────────────────────────────────────────────────────
          Um cartão sem imagem não é um detalhe de estética: é a diferença entre uma montra e uma
          lista. A geração é pela via GRATUITA (Pollinations) e nunca pela paga — ver o cabeçalho
          de `lib/marketplace/ia.ts`. */}
      {semImagem.length > 0 && (
        <Painel titulo={`Sem capa (${semImagem.length})`} sub="A montra desenha um cartão cinzento a cada um destes.">
          <div className="flex flex-wrap items-center gap-2">
            <Botao
              tom="ouro"
              disabled={aAgir === "imagens"}
              onClick={() => agir({ accao: "imagens_que_faltam" }, "imagens")}
            >
              {aAgir === "imagens" ? "A gerar…" : `Gerar as ${semImagem.length} capas`}
            </Botao>
            <span className="text-[11px] text-zinc-500">
              Gerador gratuito. Demora alguns segundos por capa, e uma que falhe volta a aparecer aqui.
            </span>
          </div>
          <div className="mt-2 text-[11px] text-zinc-500">
            {semImagem.map((p) => p.titulo).join(" · ")}
          </div>
        </Painel>
      )}

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
                  <td className={td}>{autorDe(p)}</td>
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
                  <td className={td}>{autorDe(p)}</td>
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
                  <td className={td}>{autorDe(v)}</td>
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
