-- E-books da casa como recompensas de XP na app do Ricardo.
-- Uma recompensa com produto_slug = slug de e-book gera, ao ser aprovada no painel, um link
-- assinado (lib/ebooks/acesso.ts) que fica em rg_app_resgates.link e aparece ao membro na app.
alter table rg_app_recompensas add column if not exists produto_slug text;
alter table rg_app_resgates add column if not exists link text;

insert into rg_app_recompensas (titulo, descricao, custo, min_dias_conta, min_dias_ativos, min_patente, cooldown_dias, stock_mes, ordem, activo, produto_slug)
select * from (values
  ('E-book «Destruí Tudo. E Ainda Bem.»', 'O livro do Ricardo: disciplina, dinheiro e mercados (PDF + versão interativa). Depois de aprovado, abre aqui na app.', 60, 14, 10, 2, 365, 20, 6, true, 'destrui-tudo-e-ainda-bem'),
  ('E-book «A Primeira Chave»', 'Cripto para iniciantes, do Ruben Pereira (PDF + versão interativa).', 55, 14, 10, 2, 365, 20, 7, false, 'a-primeira-chave'),
  ('E-book «Só as Mãos»', 'Vender sem aparecer, da Maria Costa (PDF + versão interativa).', 55, 14, 10, 2, 365, 20, 8, false, 'so-as-maos')
) v(titulo, descricao, custo, min_dias_conta, min_dias_ativos, min_patente, cooldown_dias, stock_mes, ordem, activo, produto_slug)
where not exists (select 1 from rg_app_recompensas r where r.produto_slug = v.produto_slug);
