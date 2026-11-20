# App do Ricardo: ponte para a Saúde (Apple Saúde e Health Connect)

Uma PWA não pode ler a Apple Saúde (HealthKit) nem o Health Connect do Android. Por isso a app
(`public/ricardogarcia/app.html`, separador **Rotas → Movimento**) funciona assim:

- **No browser**, o membro escreve os passos e os minutos de exercício à mão (accao `saude`, fonte `manual`).
- **Numa shell nativa** (a mesma via das apps da MTM: WKWebView no iOS, WebView/Capacitor no Android),
  a página procura uma ponte e, se a encontrar, mostra o botão «Ler da app Saúde».

## Contrato da ponte

iOS (Swift, WKWebView): registar um `WKScriptMessageHandler` chamado `mtmSaude`.
A página chama `window.webkit.messageHandlers.mtmSaude.postMessage({ pedir: 'hoje' })`.
A shell pede autorização ao HealthKit (`stepCount`, `appleExerciseTime`), soma o dia de hoje e responde com:

```js
window.mtmSaudeResposta({ passos: 6421, minutos: 23, fonte: 'apple' })
```

Android (Health Connect): expor um `JavascriptInterface` chamado `MTMSaude` com o método
`passosHoje()`, que devolve uma string JSON `{"passos":6421,"minutos":23,"fonte":"google"}`
(registos `StepsRecord` e `ExerciseSessionRecord` de hoje).

## Regras no servidor (`app/api/ricardogarcia/app`, accao `saude`)

- Passos até 100 000 e minutos até 600 por dia; 5000 passos ou 20 minutos dão +10 XP uma vez por dia
  (`app_saude` em `lib/xp-config.ts`, com `dailyCap: 1`).
- Fica em `rg_app_diarios` (item `saude`, dados com passos, minutos e fonte).
