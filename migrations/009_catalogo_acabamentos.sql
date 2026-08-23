-- ============================================================
-- MIGRATION: catalogo_acabamentos — acabamentos/linhas dinâmicos do portfólio
-- Execute no Supabase SQL Editor.
-- Permite cadastrar acabamentos (ex: Tradicional, Anatômico, Trabalhado)
-- que aparecem no select "Linha" do formulário de produto no admin.
-- ============================================================

-- 1. Criar tabela
create table if not exists public.catalogo_acabamentos (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. RLS — leitura pública (portfólio e admin consomem com anon/service_role)
alter table public.catalogo_acabamentos enable row level security;

create policy "catalogo_acabamentos_select_public"
  on public.catalogo_acabamentos for select
  to anon, authenticated
  using (ativo = true);

grant select on public.catalogo_acabamentos to anon, authenticated;
grant all   on public.catalogo_acabamentos to service_role;
