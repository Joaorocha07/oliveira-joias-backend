-- ============================================================
-- MIGRATION: catalogo_produtos.ordem — ordenação manual de produtos
-- Execute no Supabase SQL Editor após 004_catalogo_categorias.sql.
-- Permite definir no sistema interno a ordem de exibição no portfólio.
-- ============================================================

alter table public.catalogo_produtos
  add column if not exists ordem integer;

create index if not exists catalogo_produtos_ordem_idx
  on public.catalogo_produtos (ordem nulls last);
