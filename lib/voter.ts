const VOTER_KEY = 'taskq:voterId';
const VOTED_PREFIX = 'taskq:voted:';

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'voter_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getVoterId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(VOTER_KEY);
  if (!id) {
    id = uuid();
    localStorage.setItem(VOTER_KEY, id);
  }
  return id;
}

export function hasVoted(surveyId: string): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(VOTED_PREFIX + surveyId) === '1';
}

export function markVoted(surveyId: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(VOTED_PREFIX + surveyId, '1');
}
