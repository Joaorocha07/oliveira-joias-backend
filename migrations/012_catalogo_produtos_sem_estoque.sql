-- Produto sem estoque: continua ativo e visível no site, mas o
-- oliveira-joias-portfolio exibe uma faixa vermelha "Sem estoque" sobre ele
-- (só no domínio oliveirajoias.com — ver showOutOfStock em app/lib/site.ts).
alter table public.catalogo_produtos
  add column if not exists sem_estoque boolean not null default false;
