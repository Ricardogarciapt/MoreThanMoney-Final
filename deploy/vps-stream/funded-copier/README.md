# MTM Funded — copiador para a conta do aluno (VPS)

Copia as posições de uma conta **simulada** do MTM Funded para uma conta MT5 que o aluno já ligou
no MTM Copy ou no MTM Auto, pela MetaApi. Fonte: `services/funded-copier/copier.ts`; as decisões
(lote, SL/TP, parciais, quando recusar) estão em `lib/mtmfunded/copia/` com testes.

```
funded_positions ──trigger──▶ funded_copy_events (outbox) ──▶ este serviço ──▶ MetaApi (conta do aluno)
                                                                  └──▶ funded_copy_positions (ponte)
```

## Antes de ligar

1. `supabase/migrations/068_funded_copier.sql` aplicada (tabelas, triggers, `funded_copy_reclamar`,
   `funded_fechar_parcial`, publicação Realtime e `site_settings.funded_copier_reais = false`).
2. **Deploy do site com a 068 já aplicada** — o WebTrader passa a fazer os parciais por
   `funded_fechar_parcial`; sem a função na base os fechos parciais dão 500.
3. O interruptor `funded_copier` (painel de estratégias do MTM Copy, «Motores de gestão») começa
   DESLIGADO: sem ele o serviço não abre cópias novas (as saídas passam sempre).

## Testes

```bash
npx tsx lib/mtmfunded/__tests__/copia.check.ts               # «todos certos»
npx tsx lib/mtmfunded/__tests__/copia-consumidor.check.ts    # «todos certos»
```

## Construir

```bash
node_modules/.bin/esbuild services/funded-copier/copier.ts --bundle --platform=node --target=node18 \
  --format=cjs --minify-syntax --legal-comments=none --external:bufferutil --external:utf-8-validate \
  --outfile=deploy/vps-stream/funded-copier/dist/copier.js
```

Um só ficheiro (~2,7 MB, com a MetaApi e a Supabase lá dentro). Os imports `@/…` resolvem-se pelos
`paths` do `tsconfig.json`, que o esbuild lê sozinho. `dist/` não vai para o git.

## Variáveis — `/etc/mtm-funded-copier.env` (chmod 600, root)

```
NEXT_PUBLIC_SUPABASE_URL=https://iwscxotvmtkphajmasof.supabase.co
SUPABASE_SERVICE_ROLE_KEY=…
METAAPI_TOKEN=…
COPIER_ESCRITA=0          # 0 = só decide e escreve no log; 1 = envia ordens
# opcionais: COPIER_SONDAGEM_MS=2000 · COPIER_LOTE=50 · COPIER_PARALELO=8
```

```bash
grep -E '^(SUPABASE_SERVICE_ROLE_KEY|METAAPI_TOKEN)=' .env.local \
  | ssh mtm-stream 'sudo tee -a /etc/mtm-funded-copier.env >/dev/null && sudo chmod 600 /etc/mtm-funded-copier.env'
```

## Instalar / actualizar

```bash
scp deploy/vps-stream/funded-copier/dist/copier.js deploy/vps-stream/funded-copier/mtm-funded-copier.service mtm-stream:/tmp/
ssh mtm-stream 'sudo mkdir -p /opt/mtm/funded-copier && sudo mv /tmp/copier.js /opt/mtm/funded-copier/ \
  && sudo mv /tmp/mtm-funded-copier.service /etc/systemd/system/ && sudo systemctl daemon-reload \
  && sudo systemctl enable --now mtm-funded-copier && sudo systemctl restart mtm-funded-copier'
ssh mtm-stream 'journalctl -u mtm-funded-copier -f'
```

## Passar a modo 1

Só depois de: umas horas em modo 0 com `[seco] abriria …` a dar lotes e SL/TP que façam sentido
para contas DEMO reais de teste. Então `COPIER_ESCRITA=1`, `systemctl restart mtm-funded-copier`,
e ligar o interruptor `funded_copier`. Os eventos consumidos em modo 0 NÃO se repetem.

Contas reais: `update site_settings set value = 'true' where key = 'funded_copier_reais'` — só
depois de semanas em demo. Até lá só admins copiam para contas reais.

## O que ler no log

- `[pulso]` de minuto a minuto: eventos, ok, a repetir, em erro, modificações colapsadas.
- `[open|modify|partial|close] #id …` — o que foi feito em cada copiador.
- `[recusa] …` — porque não abriu (pausa, interruptor, perda diária, conta pequena, destino real…).
- `[repetir] #id em Ns: …` — 1 s, 5 s, 30 s, 2 min; depois `[erro] … desiste`.
- `[direito] …` — um aluno perdeu o MTM Copy / MTM Auto: copiadores em pausa (saídas continuam).

## Garantias (e onde estão testadas)

- **Sem duplicados**: a cópia grava-se `enviando` antes da ordem; depois de um crash procura-se a
  posição pelo `clientId` (`MTMF_<copier8>_<pos8>`) ou, em contas sem comentário, por
  símbolo+direcção+lote+hora. Não encontrada ao fim de 60 s → `erro`, nunca reenvio.
- **Leitura nula não é fecho**: sem conseguir ler o destino, nada se conclui — repete-se.
- **Saídas passam sempre**: pausa, interruptor, direito perdido ou perda diária só travam aberturas.
- **Contas sem comentário**: a MetaApi guarda o `clientId` no campo do comentário, por isso não
  vai nessas contas (hoje, todas as de cliente — ver `lib/mtmcopy/no-comment-accounts.ts`); a
  recuperação usa a procura por símbolo+lote+hora.
