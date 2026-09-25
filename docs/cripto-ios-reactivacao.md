# Reactivar o cripto no iOS — procedimento

**Estado a 24/09/2026: o cripto está ESCONDIDO no iOS.** Foi escondido para passar a revisão da
Apple, por decisão do dono, com a intenção declarada de o reactivar assim que a app for aprovada.
Este ficheiro existe para que essa reactivação não dependa de alguém se lembrar.

---

## Antes de mais: lê isto

Reactivar uma funcionalidade que foi escondida *durante* a revisão é o que a **Guideline 2.3.1**
proíbe por palavras próprias — «hidden or undocumented features». A sanção prevista não é a
rejeição da versão: é a remoção da app da loja e, no limite, o encerramento da conta de
programador.

Em 24/09/2026 a conta estava sob escrutínio activo: a Apple tinha nesse mesmo dia rejeitado a
**MTM Auto** ao abrigo da 3.1.5 e da 3.2.1(viii), a dizer que o problema era a própria conta
(registada como pessoa singular, quando estas apps exigem conta de organização).

Quem executar este procedimento deve confirmar com o dono, por escrito, que ele mantém a decisão
sabendo disto. Não é uma formalidade — é a diferença entre um erro de uma pessoa e uma decisão de
negócio assumida.

---

## O que se reactiva com um deploy (sem build)

**Uma linha.** Em `lib/ios-sem-cripto.ts`:

```ts
export const CRIPTO_NO_IOS = true
```

Faz o deploy do site. Fica activo em **todas as versões da app já instaladas**, sem passar pela
App Store, porque as páginas que a app carrega são as de produção.

Isto devolve o cripto a estas superfícies (todas web):

| Superfície | Onde |
|---|---|
| Scanner — categoria «Cripto» e mapa de bolhas | `components/scanner-screener.tsx` |
| Scanner — chip «Criptomoedas», pares Binance, pesquisa de símbolos | `components/mobile/scanner-mobile.tsx` |
| Scanner — separador «Crypto» no selector de activos | `components/trading-view-widget.tsx` |
| MTM Alerts — classe «Cripto», BTCUSD nas subscrições por defeito | `components/mobile/trading-alerts-mobile.tsx` |
| WebTrader — watchlist, multi-gráfico, pesquisa, deep links | `components/funded/*.tsx`, `components/webtrader/corretora-trader.tsx` |
| Tap to Trade — sinais de cripto e botão «TAP to Copy» | `components/mobile/tap-to-trade-feed.tsx` |
| Chats — canais `cripto` e `cripto-perps`, mensagens de cripto | `components/mobile/chat-channels.tsx` |
| Feed — categoria «Criptomoedas» e os posts dela | `components/mobile/social-feed.tsx` |
| Portfólio, onboarding, definições | `components/mobile/portfolio-*.tsx`, `onboarding-tutorial.tsx`, `settings-mobile.tsx` |

**Atenção:** esta flag cobre o MTM System **e** a MTM Auto (a `ehAppIos` reconhece as duas marcas
de user-agent desde 24/09). Reactivar devolve o cripto às duas apps ao mesmo tempo.

---

## O que NÃO se reactiva sem build nova

Em `~/Developer/MTMApps/iOS-78/ios/App/App/MTMModels.swift`, o `enum MTMCripto`:

```swift
static let disponivel = false
```

Esta linha **vive dentro do binário**. Mudá-la não tem efeito nenhum até sair uma build nova pela
App Store — ou seja, **o lado nativo não se reactiva às escondidas**: a build que o trouxesse
teria de passar por revisão com o cripto lá dentro.

Fica de fora até haver build nova:

- canais de chat de cripto na lista nativa, e o nome completo «MTM Auto Aurum Flow **& Perpétuos**»;
- categoria «Cripto» (₿) nos chips do Feed nativo e no compositor de publicação;
- chip «Cripto» nos filtros de classe do Tap to Trade nativo, e aceitar sinais de cripto;
- tiles **Portfólio**, **PrimeVerse Hub** (`hub.primeverse.ca`) e **Swipe to Trade**
  (`primesync.replit.app`) no separador «Mais» — foi nestes dois últimos que o revisor da build 75
  foi parar;
- reescrita de símbolos de cripto para `XAUUSD` no WebTrader nativo;
- sessões ao vivo e aulas: já aparecem (`sessoesEducacionais = true`), independentemente desta flag.

Nota histórica que evita confusão: **o `disponivel` nunca esteve a `true` numa build publicada.**
Em 24/09 chegou a estar `true` na árvore de trabalho, mas não foi compilado. A 3.7.8 (81) e todas
as anteriores saíram com `false`.

---

## O que fica de fora das duas flags

Estes mostram cripto sempre, com as flags em qualquer valor. Não estão dentro da app pela
navegação normal, mas um link leva lá — e a webview não tem `WKAppBoundDomains` a travá-la:

- `app/scanner/page.tsx` — card Aurum Flow: «scanner de perpétuos cripto», «Mercados: perpétuos
  cripto (Bybit / Binance)», alavancagem, «copytrading». É o texto do site que mais se aproxima da
  leitura «exchange» da 3.1.5;
- `components/alertas-mtm.tsx` — classe «Cripto Perp», alavancagem, margem e notional em USD
  (rotas `/alertas-mtm` e `/scanner-access`);
- `app/portfolios/page.tsx` — portefólio de cripto na versão web;
- `app/mtmauto/page.tsx` — mockup com um cartão BTCUSD «TP2 hit» por baixo de um botão «Tap to
  Trade»;
- textos de marketing em `app/mtm/page.tsx`, `app/criadores/page.tsx`, `app/trading/page.tsx`,
  `app/sensei-scalp/page.tsx`.

Se alguma vez vier uma rejeição e as duas flags já estiverem fechadas, é aqui que se procura a
seguir.

---

## Procedimento, por ordem

1. Confirmar com o dono, por escrito, que mantém a decisão depois de ler a secção «Antes de mais».
2. Confirmar que a versão em causa está **aprovada e publicada** (`READY_FOR_SALE`), não só
   aprovada. Ver em App Store Connect ou pela API (`asc/asc.mjs` em `~/Projetos/mtm-auto-ios-8`).
3. Pôr `CRIPTO_NO_IOS = true` em `lib/ios-sem-cripto.ts` e **actualizar a caixa de comentário no
   topo do ficheiro** — a que diz que está temporariamente a `false` passa a mentir.
4. `npx tsc --noEmit` a zero; correr `lib/__tests__/cripto-catalogo.check.ts` e
   `lib/__tests__/app-nativa.check.ts`.
5. Deploy. Verificar numa app iOS real (não no simulador do browser: o user-agent é o que decide).
6. Se e quando houver build nova, decidir em separado se o `MTMCripto.disponivel` a acompanha — e
   lembrar que essa build vai a revisão com o cripto visível.

---

## Histórico

| Data | O que aconteceu |
|---|---|
| 04/09 | Apple rejeita 3.7.2 (build 67), Guideline 3.1.5(iii). Revista em iPad Air. |
| 09/09 | Decisão: tirar o cripto do iOS. Nasce este mecanismo. |
| 17/09 | Apple rejeita 3.7.6 (build 75), outra vez 3.1.5(iii) — cripto nas páginas web carregadas pela grelha do iPad. |
| 22/09 | 3.7.8 (81) aprovada, com sessões e aulas de cripto como conteúdo educativo. |
| 24/09 manhã | Dono reabre o cripto: `CRIPTO_NO_IOS = true` publicado em produção. |
| 24/09 tarde | Apple rejeita a MTM Auto (3.1.5 + 3.2.1(viii)): a conta é de pessoa singular e tem de ser de organização. Dono decide esconder o cripto para a revisão e reactivar depois. É o estado deste ficheiro. |
