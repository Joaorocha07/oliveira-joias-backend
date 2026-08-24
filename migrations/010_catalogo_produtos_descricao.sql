-- Descrição por produto: info_produto, voce_sabia e faq como campos próprios de cada produto.
-- Quando null, o site usa a descrição padrão configurada em catalogo_config.
alter table public.catalogo_produtos
  add column if not exists info_produto text,
  add column if not exists voce_sabia text,
  add column if not exists faq jsonb;
