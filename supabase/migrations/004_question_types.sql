-- =============================================================================
-- Migração 004 — Tipo de pergunta (opções vs. texto livre)
-- =============================================================================
-- Cole no SQL Editor do Supabase e clique em Run.
-- =============================================================================

-- 1) Tipo de pergunta
alter table public.questions
  add column if not exists type text not null default 'options'
  check (type in ('options', 'text'));

-- 2) Permitir resposta de texto livre em execution_responses
alter table public.execution_responses
  alter column answer_id drop not null;

alter table public.execution_responses
  add column if not exists text text;

-- 3) Garantir 1 resposta de texto por (execução, participante, pergunta)
-- (a UNIQUE original em answer_id continua valendo p/ respostas de opção,
--  pois NULLs são distintos em UNIQUE — o partial index abaixo trata o caso texto.)
create unique index if not exists ux_text_response_one_per_q
  on public.execution_responses (execution_id, participant_id, question_id)
  where answer_id is null;

-- 4) RPC: upsert atômico para resposta de texto
create or replace function public.set_text_response(
  p_exec text,
  p_part text,
  p_q text,
  p_text text
) returns void as $$
begin
  delete from public.execution_responses
   where execution_id = p_exec
     and participant_id = p_part
     and question_id = p_q
     and answer_id is null;

  if coalesce(trim(p_text), '') <> '' then
    insert into public.execution_responses
      (execution_id, participant_id, question_id, answer_id, text)
    values (p_exec, p_part, p_q, null, p_text);
  end if;
end;
$$ language plpgsql security definer;

grant execute on function public.set_text_response(text, text, text, text) to anon, authenticated;
