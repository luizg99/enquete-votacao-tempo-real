import { getSupabase } from './supabase';
import type { Survey, Question, Answer, TallyQuestion } from './types';

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

// ---------- Surveys ----------
export async function listSurveys(): Promise<Survey[]> {
  const sb = getSupabase();
  const { data: surveys, error } = await sb
    .from('surveys')
    .select('*, questions(*, answers(*))')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (surveys ?? []).map(normalizeSurvey);
}

export async function getSurvey(id: string): Promise<Survey | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('surveys')
    .select('*, questions(*, answers(*))')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeSurvey(data) : null;
}

export async function createSurvey(title = 'Nova enquete'): Promise<Survey> {
  const sb = getSupabase();
  const id = uid('srv');
  const { data, error } = await sb
    .from('surveys')
    .insert({ id, title })
    .select()
    .single();
  if (error) throw error;
  return { ...(data as any), questions: [] } as Survey;
}

export async function updateSurvey(
  id: string,
  patch: Partial<Pick<Survey, 'title' | 'single_vote_per_device' | 'allow_multiple_choices'>>
) {
  const sb = getSupabase();
  const { error } = await sb.from('surveys').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteSurvey(id: string) {
  const sb = getSupabase();
  const { error } = await sb.from('surveys').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Questions ----------
export async function addQuestion(surveyId: string, text = ''): Promise<Question> {
  const sb = getSupabase();
  const id = uid('q');
  const { count } = await sb
    .from('questions')
    .select('*', { count: 'exact', head: true })
    .eq('survey_id', surveyId);
  const position = count ?? 0;
  const { data, error } = await sb
    .from('questions')
    .insert({ id, survey_id: surveyId, text, position, type: 'options', show_text_in_run: true })
    .select()
    .single();
  if (error) throw error;
  return {
    ...(data as any),
    type: (data as any).type ?? 'options',
    show_text_in_run: (data as any).show_text_in_run ?? true,
    answers: [],
  } as Question;
}

export async function updateQuestion(
  id: string,
  patch: Partial<Pick<Question, 'text' | 'type' | 'show_text_in_run'>>
) {
  const sb = getSupabase();
  const { error } = await sb.from('questions').update(patch).eq('id', id);
  if (error) throw error;
}

export async function removeQuestion(id: string) {
  const sb = getSupabase();
  const { error } = await sb.from('questions').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Answers ----------
export async function addAnswer(questionId: string, text = ''): Promise<Answer> {
  const sb = getSupabase();
  const id = uid('a');
  const { count } = await sb
    .from('answers')
    .select('*', { count: 'exact', head: true })
    .eq('question_id', questionId);
  const position = count ?? 0;
  const { data, error } = await sb
    .from('answers')
    .insert({ id, question_id: questionId, text, position })
    .select()
    .single();
  if (error) throw error;
  return data as Answer;
}

export async function updateAnswer(id: string, patch: Partial<Pick<Answer, 'text'>>) {
  const sb = getSupabase();
  const { error } = await sb.from('answers').update(patch).eq('id', id);
  if (error) throw error;
}

export async function removeAnswer(id: string) {
  const sb = getSupabase();
  const { error } = await sb.from('answers').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Votes ----------
export async function registerVote(surveyId: string, questionId: string, answerId: string) {
  const sb = getSupabase();
  const { error } = await sb
    .from('votes')
    .insert({ survey_id: surveyId, question_id: questionId, answer_id: answerId });
  if (error) throw error;
}

export async function registerTextVote(surveyId: string, questionId: string, text: string) {
  const sb = getSupabase();
  const { error } = await sb
    .from('votes')
    .insert({ survey_id: surveyId, question_id: questionId, answer_id: null, text });
  if (error) throw error;
}

export async function tallySurvey(surveyId: string): Promise<TallyQuestion[]> {
  const sb = getSupabase();
  const survey = await getSurvey(surveyId);
  if (!survey) return [];

  const { data: tally, error } = await sb
    .from('answer_tally')
    .select('answer_id, votes')
    .eq('survey_id', surveyId);
  if (error) throw error;

  const { data: textRows, error: textErr } = await sb
    .from('votes')
    .select('id, question_id, text, created_at')
    .eq('survey_id', surveyId)
    .not('text', 'is', null);
  if (textErr) throw textErr;

  const voteByAnswer = new Map<string, number>();
  (tally ?? []).forEach((t: any) => voteByAnswer.set(t.answer_id, Number(t.votes) || 0));

  const textsByQ = new Map<string, any[]>();
  (textRows ?? []).forEach((r: any) => {
    const arr = textsByQ.get(r.question_id) ?? [];
    arr.push(r);
    textsByQ.set(r.question_id, arr);
  });

  return survey.questions.map((q): TallyQuestion => {
    if (q.type === 'text') {
      const rows = textsByQ.get(q.id) ?? [];
      const texts = rows
        .map((r) => ({
          participantId: String(r.id),
          participantName: 'Anônimo',
          participantCompany: '',
          text: r.text ?? '',
          updatedAt: r.created_at,
        }))
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      return { id: q.id, text: q.text, type: 'text', total: texts.length, texts };
    }
    const answers = q.answers.map((a) => ({
      id: a.id,
      text: a.text,
      votes: voteByAnswer.get(a.id) ?? 0,
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
function rand() { return Math.random().toString(36).slice(2, 10); }

export function subscribeSurveyVotes(surveyId: string, onChange: () => void) {
  const sb = getSupabase();
  const channel = sb
    .channel(`votes-${surveyId}-${rand()}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'votes', filter: `survey_id=eq.${surveyId}` },
      () => onChange()
    )
    .subscribe();
  return () => {
    sb.removeChannel(channel);
  };
}

export function subscribeSurveyChanges(surveyId: string, onChange: () => void) {
  const sb = getSupabase();
  const channel = sb
    .channel(`survey-${surveyId}-${rand()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'surveys', filter: `id=eq.${surveyId}` }, () => onChange())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'questions', filter: `survey_id=eq.${surveyId}` }, () => onChange())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'answers' }, () => onChange())
    .subscribe();
  return () => {
    sb.removeChannel(channel);
  };
}

export function subscribeSurveyList(onChange: () => void) {
  const sb = getSupabase();
  const name = `surveys-list-${Math.random().toString(36).slice(2, 10)}`;
  const channel = sb
    .channel(name)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'surveys' }, () => onChange())
    .subscribe();
  return () => {
    sb.removeChannel(channel);
  };
}

// ---------- Helpers ----------
function normalizeSurvey(row: any): Survey {
  const questions: Question[] = (row.questions ?? [])
    .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
    .map((q: any) => ({
      id: q.id,
      survey_id: q.survey_id,
      text: q.text,
      type: (q.type as Question['type']) ?? 'options',
      show_text_in_run: q.show_text_in_run ?? true,
      position: q.position ?? 0,
      answers: (q.answers ?? [])
        .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
        .map((a: any) => ({
          id: a.id,
          question_id: a.question_id,
          text: a.text,
          position: a.position ?? 0,
        })),
    }));
  return {
    id: row.id,
    title: row.title ?? '',
    single_vote_per_device: row.single_vote_per_device ?? true,
    allow_multiple_choices: row.allow_multiple_choices ?? false,
    created_at: row.created_at,
    questions,
  };
}
