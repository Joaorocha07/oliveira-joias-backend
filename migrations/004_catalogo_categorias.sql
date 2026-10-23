-- ============================================================
-- MIGRATION: catalogo_categorias — categorias dinâmicas do portfólio
-- Execute no Supabase SQL Editor após as migrations anteriores.
-- Substitui o enum hardcoded de categorias por uma tabela gerenciável.
-- ============================================================

-- 1. Criar tabela de categorias
create table if not exists public.catalogo_categorias (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. Seed com as três categorias iniciais
insert into public.catalogo_categorias (nome) values
  ('moeda antiga'),
  ('ouro'),
  ('prata')
on conflict (nome) do nothing;

-- 3. RLS e grants — leitura pública (o portfólio consulta com anon key)
alter table public.catalogo_categorias enable row level security;

create policy "catalogo_categorias_select_public"
  on public.catalogo_categorias for select
  to anon, authenticated
  using (ativo = true);

grant select on public.catalogo_categorias to anon, authenticated;

-- 4. Remover o CHECK constraint hardcoded na coluna categoria de catalogo_produtos
--    para aceitar qualquer string de categoria gerenciada pela tabela acima.
alter table public.catalogo_produtos
  drop constraint if exists catalogo_produtos_categoria_check;
