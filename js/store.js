const STORAGE_KEY = 'taskq:v1';
const CHANGED_EVENT = 'taskq:changed';

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { surveys: [], votes: [] };
    const parsed = JSON.parse(raw);
    return {
      surveys: Array.isArray(parsed.surveys) ? parsed.surveys : [],
      votes: Array.isArray(parsed.votes) ? parsed.votes : [],
    };
  } catch {
    return { surveys: [], votes: [] };
  }
}

function save(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
}

function mutate(fn) {
  const state = load();
  const result = fn(state);
  save(state);
  return result;
}

export const store = {
  onChange(handler) {
    window.addEventListener(CHANGED_EVENT, handler);
    window.addEventListener('storage', (e) => { if (e.key === STORAGE_KEY) handler(e); });
  },

  listSurveys() {
    return load().surveys;
  },

  getSurvey(id) {
    return load().surveys.find(s => s.id === id) || null;
  },

  createSurvey(title = 'Nova enquete') {
    let created;
    mutate(state => {
      created = {
        id: uid('srv'),
        title,
        createdAt: Date.now(),
        questions: [],
      };
      state.surveys.push(created);
    });
    return created;
  },

  updateSurvey(id, patch) {
    mutate(state => {
      const s = state.surveys.find(s => s.id === id);
      if (s) Object.assign(s, patch);
    });
  },

  deleteSurvey(id) {
    mutate(state => {
      state.surveys = state.surveys.filter(s => s.id !== id);
      state.votes = state.votes.filter(v => v.surveyId !== id);
    });
  },

  addQuestion(surveyId, text = '') {
    let question;
    mutate(state => {
      const s = state.surveys.find(s => s.id === surveyId);
      if (!s) return;
      question = { id: uid('q'), text, answers: [] };
      s.questions.push(question);
    });
    return question;
  },

  updateQuestion(surveyId, qId, patch) {
    mutate(state => {
      const s = state.surveys.find(s => s.id === surveyId);
      const q = s?.questions.find(q => q.id === qId);
      if (q) Object.assign(q, patch);
    });
  },

  removeQuestion(surveyId, qId) {
    mutate(state => {
      const s = state.surveys.find(s => s.id === surveyId);
      if (!s) return;
      s.questions = s.questions.filter(q => q.id !== qId);
      state.votes = state.votes.filter(v => !(v.surveyId === surveyId && v.questionId === qId));
    });
  },

  addAnswer(surveyId, qId, text = '') {
    let answer;
    mutate(state => {
      const s = state.surveys.find(s => s.id === surveyId);
      const q = s?.questions.find(q => q.id === qId);
      if (!q) return;
      answer = { id: uid('a'), text, votes: 0 };
      q.answers.push(answer);
    });
    return answer;
  },

  updateAnswer(surveyId, qId, aId, patch) {
    mutate(state => {
      const s = state.surveys.find(s => s.id === surveyId);
      const q = s?.questions.find(q => q.id === qId);
      const a = q?.answers.find(a => a.id === aId);
      if (a) Object.assign(a, patch);
    });
  },

  removeAnswer(surveyId, qId, aId) {
    mutate(state => {
      const s = state.surveys.find(s => s.id === surveyId);
      const q = s?.questions.find(q => q.id === qId);
      if (!q) return;
      q.answers = q.answers.filter(a => a.id !== aId);
      state.votes = state.votes.filter(v => !(v.surveyId === surveyId && v.questionId === qId && v.answerId === aId));
    });
  },

  registerVote(surveyId, questionId, answerId) {
    mutate(state => {
      const s = state.surveys.find(s => s.id === surveyId);
      const q = s?.questions.find(q => q.id === questionId);
      const a = q?.answers.find(a => a.id === answerId);
      if (!a) return;
      a.votes = (a.votes || 0) + 1;
      state.votes.push({ surveyId, questionId, answerId, ts: Date.now() });
    });
  },

  tally(surveyId) {
    const survey = this.getSurvey(surveyId);
    if (!survey) return null;
    return survey.questions.map(q => {
      const total = q.answers.reduce((sum, a) => sum + (a.votes || 0), 0);
      return {
        id: q.id,
        text: q.text,
        total,
        answers: q.answers.map(a => ({
          id: a.id,
          text: a.text,
          votes: a.votes || 0,
          pct: total > 0 ? Math.round(((a.votes || 0) / total) * 100) : 0,
        })),
      };
    });
  },

  totalParticipantsFor(surveyId) {
    const survey = this.getSurvey(surveyId);
    if (!survey) return 0;
    return Math.max(...survey.questions.map(q =>
      q.answers.reduce((sum, a) => sum + (a.votes || 0), 0)
    ), 0);
  },
};
