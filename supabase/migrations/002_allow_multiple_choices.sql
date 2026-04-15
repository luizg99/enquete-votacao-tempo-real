-- Migração: adiciona flag "permitir múltiplas escolhas" às enquetes.
-- Rode no SQL Editor do Supabase.

alter table public.surveys
  add column if not exists allow_multiple_choices boolean not null default false;
