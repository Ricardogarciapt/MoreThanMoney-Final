# CRM embutido no backoffice

Entrada: `/backoffice/crm`, menu «CRM da equipa». Usa os mesmos negócios, permissões, âmbito e
rotas de escrita do pipeline. Não cria uma segunda base de contactos nem abre a fila service-role
aos trabalhadores. A capacidade `bo.pipeline_proprio` é obrigatória; os afiliados sem essa
capacidade não recebem acesso por terem um link no menu.

## Trabalho diário

- Procurar por nome e filtrar por etapa; paginação do servidor e indicação explícita do número
  de linhas **da página**, não uma contagem global inventada.
- Abrir os canais de contacto conhecidos (links externos, não inbox embutida).
- Ler score/resumo IA como triagem, não como decisão humana definitiva.
- Ver os responsáveis existentes por papel e as notas humanas.
- Assumir um lead da bolsa antes de o trabalhar; quem já participa pode editar nota, mover etapa,
  ocupar um papel vago autorizado, criar tarefa própria ligada ao negócio e consultar histórico.
- Abrir a agenda pública de apresentações; não reserva automaticamente nem envia convites.
- Refresh autenticado de 30 segundos, suspenso quando a pessoa está a editar nos controlos
  detectados pelo componente existente. Não subscreve dados de terceiros por Realtime público.

A mudança de etapa não cria dinheiro nem comissões. Validações e autorização de cada escrita
continuam nas APIs existentes. Responsáveis de equipa usam o âmbito que já foi definido no
backoffice; não ganham acesso global. Notas/erros não são substituídos por números fictícios.

## Verificação

Passaram typecheck da página e dependências, lint dos ficheiros novos/alterados, regressões de
âmbito do pipeline e compatibilidade sem colunas opcionais CRM. O teste estático da página prova
que usa a guarda e o leitor existentes; não substitui um teste de browser com sessões reais.
Ainda não foi testado no browser nem publicado em produção nesta entrega.

Antes de publicar: ensaiar admin, setter, closer, responsável de equipa e utilizador sem papel;
confirmar que pesquisa/paginação não mudam o âmbito, que escrever uma nota não afecta terceiros,
e que as tarefas criadas aparecem na lista pessoal. Verificar também uma lista vazia e uma falha
de ligação. Os canais de mensagem e a confirmação real da agenda continuam a exigir teste ponta
a ponta; não são dados como operacionais por esta página existir.
