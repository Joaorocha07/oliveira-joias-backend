-- ============================================================
-- MIGRATION: catalogo_produtos — produtos públicos do portfólio
-- Execute no Supabase SQL Editor do MESMO projeto usado pelo
-- oliveira-joias-frontend (schema real documentado em
-- oliveira-joias-frontend/.claude/rules/schema.md).
--
-- Tabela separada da `produtos` do ERP (estoque interno, código,
-- fornecedor, variações) — esta aqui é o catálogo público exibido
-- no oliveira-joias-portfolio, com campos de marketing/exibição.
-- ============================================================

create table if not exists public.catalogo_produtos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  slug        text not null unique,
  categoria   text not null check (categoria in ('alianças', 'anéis', 'correntes', 'serviços')),
  linha       text,
  material    text not null,
  largura     text,
  descricao   text not null,
  valor       numeric(12,2) not null check (valor >= 0),
  parcelas    integer check (parcelas is null or parcelas > 0),
  imagens     text[] not null default '{}',
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists catalogo_produtos_categoria_idx on public.catalogo_produtos (categoria);
create index if not exists catalogo_produtos_ativo_idx on public.catalogo_produtos (ativo);

alter table public.catalogo_produtos enable row level security;

-- Leitura pública (o portfólio consulta com a anon key, sem login).
create policy "catalogo_produtos_select_public"
  on public.catalogo_produtos for select
  to anon, authenticated
  using (ativo = true);

-- Sem policy de insert/update/delete para anon/authenticated: a criação
-- de produtos é feita pelo backend (oliveira-joias-backend) usando a
-- service_role key, que ignora RLS por padrão no Supabase.
