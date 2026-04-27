-- =============================================================================
-- Migração 007 — Timer de resposta nas execuções
-- =============================================================================

-- 1) Tempo limite por pergunta na enquete (segundos)
alter table public.surveys
  add column if not exists time_per_question int not null default 60
  check (time_per_question >= 5 and time_per_question <= 3600);

-- 2) Estado do timer por pergunta dentro da execução
create table if not exists public.execution_question_states (
  execution_id text not null references public.executions(id) on delete cascade,
  question_id  text not null references public.questions(id) on delete cascade,
  started_at   timestamptz not null default now(),
  primary key (execution_id, question_id)
);

create index if not exists idx_eqs_exec on public.execution_question_states(execution_id);

alter table public.execution_question_states enable row level security;
drop policy if exists "anon_all" on public.execution_question_states;
create policy "anon_all" on public.execution_question_states
  for all using (true) with check (true);

alter publication supabase_realtime add table public.execution_question_states;

-- 3) RPC: set_current_question — atualiza pergunta atual e inicia timer (idempotente)
create or replace function public.set_current_question(
  p_exec text,
  p_q text
) returns void as $$
begin
  update public.executions set current_question_id = p_q where id = p_exec;
  if p_q is not null then
    insert into public.execution_question_states (execution_id, question_id)
      values (p_exec, p_q)
      on conflict (execution_id, question_id) do nothing;
  end if;
end;
$$ language plpgsql security definer;

grant execute on function public.set_current_question(text, text) to anon, authenticated;

-- 4) RPC: restart_current_question_timer
create or replace function public.restart_current_question_timer(
  p_exec text
) returns void as $$
declare
  q_id text;
begin
  select current_question_id into q_id from public.executions where id = p_exec;
  if q_id is null then return; end if;
  insert into public.execution_question_states (execution_id, question_id, started_at)
    values (p_exec, q_id, now())
  on conflict (execution_id, question_id)
    do update set started_at = now();
end;
$$ language plpgsql security definer;

grant execute on function public.restart_current_question_timer(text) to anon, authenticated;

-- 5) Helper: _check_response_time
create or replace function public._check_response_time(
  p_exec text,
  p_q text
) returns void as $$
declare
  v_started     timestamptz;
  v_time_limit  int;
  v_current_q   text;
begin
  select current_question_id into v_current_q from public.executions where id = p_exec;
  if v_current_q is null or v_current_q != p_q then
    raise exception 'Esta pergunta não está ativa';
  end if;

  select s.started_at, sv.time_per_question
    into v_started, v_time_limit
    from public.execution_question_states s
    join public.executions e on e.id = s.execution_id
    join public.surveys    sv on sv.id = e.survey_id
   where s.execution_id = p_exec and s.question_id = p_q;

  if v_started is null then
    raise exception 'Timer não iniciado para esta pergunta';
  end if;

  if now() > v_started + (v_time_limit || ' seconds')::interval then
    raise exception 'Tempo esgotado para esta pergunta';
  end if;
end;
$$ language plpgsql security definer;

-- 6) Atualizar set_single_response — adicionar validação no início
create or replace function public.set_single_response(
  p_exec text,
  p_part text,
  p_q text,
  p_a text
) returns void as $$
begin
  perform public._check_response_time(p_exec, p_q);

  delete from public.execution_responses
   where execution_id = p_exec
     and participant_id = p_part
     and question_id = p_q;

  insert into public.execution_responses (execution_id, participant_id, question_id, answer_id)
  values (p_exec, p_part, p_q, p_a);
end;
$$ language plpgsql security definer;

-- 7) Atualizar set_text_response — adicionar validação no início
create or replace function public.set_text_response(
  p_exec text,
  p_part text,
  p_q text,
  p_text text
) returns void as $$
begin
  perform public._check_response_time(p_exec, p_q);

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

-- 8) Novas RPCs para múltipla escolha (substituem INSERT/DELETE direto do cliente)
create or replace function public.add_multi_response(
  p_exec text, p_part text, p_q text, p_a text
) returns void as $$
begin
  perform public._check_response_time(p_exec, p_q);
  insert into public.execution_responses (execution_id, participant_id, question_id, answer_id)
    values (p_exec, p_part, p_q, p_a)
    on conflict do nothing;
end;
$$ language plpgsql security definer;

grant execute on function public.add_multi_response(text, text, text, text) to anon, authenticated;

create or replace function public.remove_multi_response(
  p_exec text, p_part text, p_q text, p_a text
) returns void as $$
begin
  perform public._check_response_time(p_exec, p_q);
  delete from public.execution_responses
   where execution_id = p_exec and participant_id = p_part
     and question_id = p_q and answer_id = p_a;
end;
$$ language plpgsql security definer;

grant execute on function public.remove_multi_response(text, text, text, text) to anon, authenticated;

-- Revoga execução pública do helper interno (somente as RPCs security definer chamam)
revoke execute on function public._check_response_time(text, text) from public;

-- Re-grants defensivos para as RPCs substituídas via CREATE OR REPLACE
-- (preserva acesso anônimo em caso de reinstalação/fresh install)
grant execute on function public.set_single_response(text, text, text, text) to anon, authenticated;
grant execute on function public.set_text_response(text, text, text, text) to anon, authenticated;
