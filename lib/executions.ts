import { getSupabase } from './supabase';
import { getSurvey } from './store';
import type {
  Execution,
  ExecutionStatus,
  Participant,
  ExecutionResponse,
  ExecutionQuestionState,
  TallyQuestion,
  Survey,
} from './types';

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

// Retry com backoff exponencial para erros transientes de rede
async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message ?? e ?? '').toLowerCase();
      const isNetwork =
        msg.includes('load failed') ||
        msg.includes('failed to fetch') ||
        msg.includes('networkerror') ||
        msg.includes('aborted') ||
        msg.includes('timeout') ||
        msg.includes('fetch');
      if (!isNetwork || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 250 * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

// ---------- Executions ----------
export async function listExecutions(): Promise<Execution[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('executions')
    .select('*, surveys(title)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    survey_id: row.survey_id,
    title: row.title ?? '',
    status: row.status,
    current_question_id: row.current_question_id,
    started_at: row.started_at,
    finished_at: row.finished_at,
    created_at: row.created_at,
    survey: row.surveys ? ({ title: row.surveys.title } as Survey) : undefined,
  }));
}

export async function getExecution(id: string): Promise<Execution | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('executions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const survey = await getSurvey(data.survey_id);
  return {
    id: data.id,
    survey_id: data.survey_id,
    title: data.title ?? '',
    status: data.status,
    current_question_id: data.current_question_id,
    started_at: data.started_at,
    finished_at: data.finished_at,
    created_at: data.created_at,
    survey: survey ?? undefined,
  };
}

export async function createExecution(surveyId: string, title: string): Promise<Execution> {
  const sb = getSupabase();
  const id = uid('exec');
  const { data, error } = await sb
    .from('executions')
    .insert({ id, survey_id: surveyId, title })
    .select()
    .single();
  if (error) throw error;
  return data as Execution;
}

export async function updateExecution(
  id: string,
  patch: Partial<Pick<Execution, 'title' | 'status' | 'current_question_id' | 'started_at' | 'finished_at'>>
) {
  const sb = getSupabase();
  const { error } = await sb.from('executions').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteExecution(id: string) {
  const sb = getSupabase();
  const { error } = await sb.from('executions').delete().eq('id', id);
  if (error) throw error;
}

export async function startExecution(id: string): Promise<Execution> {
  const exec = await getExecution(id);
  if (!exec) throw new Error('Execução não encontrada');
  const firstQuestion = exec.survey?.questions?.[0]?.id ?? null;

  const patch: any = { status: 'running' as ExecutionStatus };
  if (!exec.started_at) patch.started_at = new Date().toISOString();
  await updateExecution(id, patch);

  if (!exec.current_question_id && firstQuestion) {
    await setCurrentQuestion(id, firstQuestion);
  }

  return { ...exec, ...patch, current_question_id: exec.current_question_id ?? firstQuestion };
}

export async function finishExecution(id: string) {
  await updateExecution(id, {
    status: 'finished',
    finished_at: new Date().toISOString(),
  });
}

export async function setCurrentQuestion(id: string, questionId: string | null) {
  const sb = getSupabase();
  const { error } = await sb.rpc('set_current_question', {
    p_exec: id,
    p_q: questionId,
  });
  if (error) throw error;
}

export async function restartCurrentQuestionTimer(executionId: string) {
  const sb = getSupabase();
  const { error } = await sb.rpc('restart_current_question_timer', {
    p_exec: executionId,
  });
  if (error) throw error;
}

// ---------- Participants ----------
export async function findParticipant(
  executionId: string,
  deviceId: string
): Promise<Participant | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('participants')
    .select('*')
    .eq('execution_id', executionId)
    .eq('device_id', deviceId)
    .maybeSingle();
  if (error) throw error;
  return (data as Participant) ?? null;
}

export async function getParticipant(participantId: string): Promise<Participant | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('participants')
    .select('*')
    .eq('id', participantId)
    .maybeSingle();
  if (error) throw error;
  return (data as Participant) ?? null;
}

export async function createParticipant(input: {
  execution_id: string;
  device_id: string;
  company: string;
  full_name: string;
  phone: string;
}): Promise<Participant> {
  const sb = getSupabase();
  const id = uid('p');
  const { data, error } = await sb
    .from('participants')
    .insert({ id, ...input })
    .select()
    .single();
  if (error) throw error;
  return data as Participant;
}

export async function updateParticipant(
  id: string,
  patch: Partial<Pick<Participant, 'company' | 'full_name' | 'phone'>>
) {
  const sb = getSupabase();
  const { error } = await sb
    .from('participants')
    .update({ ...patch, last_seen_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function countParticipants(executionId: string): Promise<number> {
  const sb = getSupabase();
  const { count, error } = await sb
    .from('participants')
    .select('*', { count: 'exact', head: true })
    .eq('execution_id', executionId);
  if (error) throw error;
  return count ?? 0;
}

// ---------- Responses ----------
export async function listResponsesByParticipant(
  executionId: string,
  participantId: string
): Promise<ExecutionResponse[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('execution_responses')
    .select('*')
    .eq('execution_id', executionId)
    .eq('participant_id', participantId);
  if (error) throw error;
  return (data ?? []) as ExecutionResponse[];
}

export async function setSingleResponse(
  executionId: string,
  participantId: string,
  questionId: string,
  answerId: string
) {
  return withRetry(async () => {
    const sb = getSupabase();
    const { error } = await sb.rpc('set_single_response', {
      p_exec: executionId,
      p_part: participantId,
      p_q: questionId,
      p_a: answerId,
    });
    if (error) throw error;
  });
}

export async function addMultiResponse(
  executionId: string,
  participantId: string,
  questionId: string,
  answerId: string
) {
  return withRetry(async () => {
    const sb = getSupabase();
    const { error } = await sb.from('execution_responses').insert({
      execution_id: executionId,
      participant_id: participantId,
      question_id: questionId,
      answer_id: answerId,
    });
    if (error && (error as any).code !== '23505') throw error; // ignora duplicate
  });
}

export async function removeMultiResponse(
  executionId: string,
  participantId: string,
  questionId: string,
  answerId: string
) {
  return withRetry(async () => {
    const sb = getSupabase();
    const { error } = await sb
      .from('execution_responses')
      .delete()
      .eq('execution_id', executionId)
      .eq('participant_id', participantId)
      .eq('question_id', questionId)
      .eq('answer_id', answerId);
    if (error) throw error;
  });
}

export async function setTextResponse(
  executionId: string,
  participantId: string,
  questionId: string,
  text: string
) {
  return withRetry(async () => {
    const sb = getSupabase();
    const { error } = await sb.rpc('set_text_response', {
      p_exec: executionId,
      p_part: participantId,
      p_q: questionId,
      p_text: text,
    });
    if (error) throw error;
  });
}

export async function tallyExecution(executionId: string): Promise<TallyQuestion[]> {
  const sb = getSupabase();
  const exec = await getExecution(executionId);
  if (!exec || !exec.survey) return [];

  const { data, error } = await sb
    .from('execution_responses')
    .select('question_id, answer_id, text, participant_id, updated_at, participants(full_name, company)')
    .eq('execution_id', executionId);
  if (error) throw error;

  const optCounts = new Map<string, number>(); // answer_id -> votes
  const textsByQ = new Map<string, any[]>(); // question_id -> list of rows
  (data ?? []).forEach((r: any) => {
    if (r.answer_id) {
      optCounts.set(r.answer_id, (optCounts.get(r.answer_id) ?? 0) + 1);
    } else if (r.text) {
      const arr = textsByQ.get(r.question_id) ?? [];
      arr.push(r);
      textsByQ.set(r.question_id, arr);
    }
  });

  return exec.survey.questions.map((q): TallyQuestion => {
    if (q.type === 'text') {
      const rows = textsByQ.get(q.id) ?? [];
      const texts = rows
        .map((r) => ({
          participantId: r.participant_id,
          participantName: r.participants?.full_name ?? '—',
          participantCompany: r.participants?.company ?? '',
          text: r.text ?? '',
          updatedAt: r.updated_at,
        }))
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      return { id: q.id, text: q.text, type: 'text', total: texts.length, texts };
    }

    const answers = q.answers.map((a) => ({
      id: a.id,
      text: a.text,
      votes: optCounts.get(a.id) ?? 0,
    }));
    const total = answers.reduce((s, a) => s + a.votes, 0);
    return {
      id: q.id,
      text: q.text,
      type: 'options',
      total,
      answers: answers.map((a) => ({
        ...a,
        pct: total > 0 ? Math.round((a.votes / total) * 100) : 0,
      })),
    };
  });
}

// ---------- Realtime ----------
export function subscribeExecutionList(onChange: () => void) {
  const sb = getSupabase();
  const name = `executions-list-${Math.random().toString(36).slice(2, 10)}`;
  const channel = sb
    .channel(name)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'executions' }, () => onChange())
    .subscribe();
  return () => { sb.removeChannel(channel); };
}

function rand() { return Math.random().toString(36).slice(2, 10); }

export function subscribeExecution(
  executionId: string,
  onChange: (payload?: any) => void
) {
  const sb = getSupabase();
  const channel = sb
    .channel(`exec-${executionId}-${rand()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'executions', filter: `id=eq.${executionId}` },
      (payload) => onChange(payload)
    )
    .subscribe();
  return () => { sb.removeChannel(channel); };
}

export function subscribeExecutionResponses(executionId: string, onChange: () => void) {
  const sb = getSupabase();
  const channel = sb
    .channel(`exec-resp-${executionId}-${rand()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'execution_responses', filter: `execution_id=eq.${executionId}` },
      () => onChange()
    )
    .subscribe();
  return () => { sb.removeChannel(channel); };
}

export function subscribeParticipants(executionId: string, onChange: () => void) {
  const sb = getSupabase();
  const channel = sb
    .channel(`exec-part-${executionId}-${rand()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'participants', filter: `execution_id=eq.${executionId}` },
      () => onChange()
    )
    .subscribe();
  return () => { sb.removeChannel(channel); };
}

export async function listQuestionStates(
  executionId: string
): Promise<ExecutionQuestionState[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('execution_question_states')
    .select('*')
    .eq('execution_id', executionId);
  if (error) throw error;
  return (data ?? []) as ExecutionQuestionState[];
}

export function subscribeQuestionStates(executionId: string, onChange: () => void) {
  const sb = getSupabase();
  const channel = sb
    .channel(`exec-qstates-${executionId}-${rand()}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'execution_question_states',
        filter: `execution_id=eq.${executionId}`,
      },
      () => onChange()
    )
    .subscribe();
  return () => { sb.removeChannel(channel); };
}
