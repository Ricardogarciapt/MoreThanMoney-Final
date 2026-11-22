# Conector MCP do Skool

Controla a comunidade Skool (por omissão `morethanmoney-1132`) a partir do Claude ou de qualquer cliente MCP.

O Skool **não tem API pública**. Este servidor usa a sessão do dono (cookies do browser) e fala com o
mesmo backend que o site do Skool usa: lê as páginas (`__NEXT_DATA__`) e escreve em `api2.skool.com`.
Alternativas avaliadas (22/11/2026): o Zapier oficial só tem gatilhos/ações de membros; os "MCP do
Skool" que circulam são embrulhos de um actor pago na Apify (cobra por chamada e pede o email e a
palavra-passe do Skool). Aqui fica tudo em casa e sem custo.

## Endpoints

| URL | Autenticação |
|---|---|
| `POST /api/mcp/skool` | `Authorization: Bearer $SKOOL_MCP_TOKEN` |
| `POST /api/mcp/skool/<SKOOL_MCP_TOKEN>` | chave no URL (conectores personalizados do claude.ai) |

`GET` com JSON diz se está de pé e lista as ferramentas.

## Variáveis (Vercel, Production)

- `SKOOL_MCP_TOKEN` — chave do conector (`openssl rand -hex 32`, mín. 24 caracteres). Em alternativa fica em `integracoes_privadas.skool_mcp_token`. Sem nenhuma, 503.

`integracoes_privadas` (migração 281) tem RLS sem políticas: só o servidor lê. **Não usar `site_settings` para segredos — é legível por qualquer pessoa.**
- `SKOOL_COOKIE` — opcional: cabeçalho Cookie do browser com `auth_token`, `client_id`, `aws-waf-token`.
  Em alternativa, a ferramenta `skool_sessao_guardar` grava-o em `integracoes_privadas.skool_sessao` (renova sem deploy).
- `SKOOL_GRUPO` — opcional, slug da comunidade (omissão `morethanmoney-1132`).

Nunca pôr cookies nem chaves no código ou em commits.

## Tirar os cookies

1. Entrar no Skool no Chrome com a conta de dono.
2. DevTools → Network → recarregar → clicar no pedido do documento → Request Headers → copiar o valor de `cookie`.
3. Dar esse valor ao `skool_sessao_guardar` (ou pô-lo em `SKOOL_COOKIE`).

`auth_token` dura meses; `aws-waf-token` cerca de 3,5 dias. Um 403 = renovar cookies.

## Ferramentas

`skool_estado` · `skool_sessao_guardar` · `skool_posts_listar` · `skool_post_ler` · `skool_post_criar` ·
`skool_comentar` · `skool_post_editar` · `skool_post_apagar` · `skool_membros_listar` · `skool_cursos_listar` ·
`skool_curso_ler` · `skool_eventos` · `skool_conversas` · `skool_mensagens_ler` · `skool_mensagem_enviar` ·
`skool_pagina` (qualquer página) · `skool_api` (qualquer rota do api2: aprovar membros, fixar posts, cursos…).

Tudo o que outra pessoa vê exige `confirmar: true`, depois de o texto ser mostrado ao dono.

As leituras são o formato estável do site. Os caminhos de escrita foram tirados do que o site chama e
**confirmam-se no primeiro teste com a sessão real**; se o Skool mudar uma rota, usa-se `skool_api` e
corrige-se aqui.
