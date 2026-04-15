-- Migração: adiciona flag "um voto por dispositivo" às enquetes.
-- Rode no SQL Editor do Supabase.

alter table public.surveys
  add column if not exists single_vote_per_device boolean not null default true;
