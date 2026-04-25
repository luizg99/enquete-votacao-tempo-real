const DEVICE_KEY = 'taskq:deviceId';
const PARTICIPANT_PREFIX = 'taskq:participant:';

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = uuid();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function getCachedParticipantId(executionId: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(PARTICIPANT_PREFIX + executionId);
}

export function setCachedParticipantId(executionId: string, participantId: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PARTICIPANT_PREFIX + executionId, participantId);
}

export function clearCachedParticipantId(executionId: string) {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(PARTICIPANT_PREFIX + executionId);
}
