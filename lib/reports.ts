import { getSupabase } from './supabase';
import { getSurvey } from './store';
import { getExecution } from './executions';

export type ReportQuestion = {
  id: string;
  text: string;
  type: 'options' | 'text';
};

export type ReportParticipant = {
  id: string;
  name: string;
  company: string;
  phone: string;
  joinedAt: string;
  answersByQuestion: Map<string, string[]>;
};

export type ReportData = {
  title: string;
  subtitle: string;
  questions: ReportQuestion[];
  participants: ReportParticipant[];
};

// ---------- Loaders ----------
export async function loadExecutionReport(executionId: string): Promise<ReportData | null> {
  const sb = getSupabase();
  const exec = await getExecution(executionId);
  if (!exec || !exec.survey) return null;

  const { data: parts, error: pErr } = await sb
    .from('participants')
    .select('*')
    .eq('execution_id', executionId)
    .order('joined_at', { ascending: true });
  if (pErr) throw pErr;

  const { data: resp, error: rErr } = await sb
    .from('execution_responses')
    .select('participant_id, question_id, answer_id, text')
    .eq('execution_id', executionId);
  if (rErr) throw rErr;

  const answerMap = new Map<string, string>();
  exec.survey.questions.forEach((q) =>
    q.answers.forEach((a) => answerMap.set(a.id, a.text || '(sem texto)'))
  );

  const participants: ReportParticipant[] = (parts ?? []).map((p: any) => {
    const answersByQuestion = new Map<string, string[]>();
    (resp ?? [])
      .filter((r: any) => r.participant_id === p.id)
      .forEach((r: any) => {
        const arr = answersByQuestion.get(r.question_id) ?? [];
        if (r.text) arr.push(r.text);
        else if (r.answer_id) arr.push(answerMap.get(r.answer_id) ?? '(opção removida)');
        answersByQuestion.set(r.question_id, arr);
      });
    return {
      id: p.id,
      name: p.full_name || '—',
      company: p.company || '',
      phone: p.phone || '',
      joinedAt: p.joined_at,
      answersByQuestion,
    };
  });

  return {
    title: exec.title || 'Execução',
    subtitle: `${exec.survey.title || 'Enquete'} · ${participants.length} participante(s)`,
    questions: exec.survey.questions.map((q) => ({ id: q.id, text: q.text, type: q.type })),
    participants,
  };
}

export async function loadSurveyReport(surveyId: string): Promise<ReportData | null> {
  const sb = getSupabase();
  const survey = await getSurvey(surveyId);
  if (!survey) return null;

  const { data: voters, error: vErr } = await sb
    .from('survey_voters')
    .select('*')
    .eq('survey_id', surveyId)
    .order('joined_at', { ascending: true });
  if (vErr) throw vErr;

  const { data: votes, error: voErr } = await sb
    .from('votes')
    .select('voter_id, question_id, answer_id, text')
    .eq('survey_id', surveyId);
  if (voErr) throw voErr;

  const answerMap = new Map<string, string>();
  survey.questions.forEach((q) =>
    q.answers.forEach((a) => answerMap.set(a.id, a.text || '(sem texto)'))
  );

  const participants: ReportParticipant[] = (voters ?? []).map((v: any) => {
    const answersByQuestion = new Map<string, string[]>();
    (votes ?? [])
      .filter((r: any) => r.voter_id === v.id)
      .forEach((r: any) => {
        const arr = answersByQuestion.get(r.question_id) ?? [];
        if (r.text) arr.push(r.text);
        else if (r.answer_id) arr.push(answerMap.get(r.answer_id) ?? '(opção removida)');
        answersByQuestion.set(r.question_id, arr);
      });
    return {
      id: v.id,
      name: v.full_name || '—',
      company: v.company || '',
      phone: v.phone || '',
      joinedAt: v.joined_at,
      answersByQuestion,
    };
  });

  return {
    title: survey.title || 'Enquete',
    subtitle: `${participants.length} participante(s)`,
    questions: survey.questions.map((q) => ({ id: q.id, text: q.text, type: q.type })),
    participants,
  };
}

// ---------- CSV ----------
export function downloadCsv(data: ReportData) {
  const headers = [
    'Nome',
    'Empresa',
    'Telefone',
    'Cadastrado em',
    ...data.questions.map((q) => q.text || '(sem texto)'),
  ];
  const rows: string[][] = [headers];

  data.participants.forEach((p) => {
    rows.push([
      p.name,
      p.company,
      p.phone,
      formatDate(p.joinedAt),
      ...data.questions.map((q) => (p.answersByQuestion.get(q.id) ?? []).join('; ')),
    ]);
  });

  const csv = rows.map((r) => r.map(escapeCsv).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugify(data.title)}-${todayStamp()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCsv(v: string): string {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'relatorio'
  );
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

// ---------- PDF (via janela de impressão) ----------
export function openPrintView(data: ReportData) {
  const w = window.open('', '_blank');
  if (!w) {
    alert('Habilite popups para gerar o PDF.');
    return;
  }
  w.document.write(renderHtml(data));
  w.document.close();
  w.focus();
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHtml(data: ReportData): string {
  const participantsHtml =
    data.participants.length === 0
      ? '<p class="empty">Nenhum participante cadastrado.</p>'
      : data.participants
          .map(
            (p) => `
    <section class="participant">
      <h2>${escapeHtml(p.name)}</h2>
      <div class="meta">
        ${p.company ? `<strong>Empresa:</strong> ${escapeHtml(p.company)} &nbsp;·&nbsp; ` : ''}
        ${p.phone ? `<strong>Telefone:</strong> ${escapeHtml(p.phone)} &nbsp;·&nbsp; ` : ''}
        <strong>Cadastrado em:</strong> ${escapeHtml(formatDate(p.joinedAt))}
      </div>
      <table>
        <tbody>
          ${data.questions
            .map((q) => {
              const arr = p.answersByQuestion.get(q.id) ?? [];
              const ans = arr.length > 0
                ? arr.map((a) => escapeHtml(a)).join('<br>')
                : '<span class="empty">— sem resposta</span>';
              return `
                <tr>
                  <td class="q">${escapeHtml(q.text || '(sem texto)')}</td>
                  <td class="a">${ans}</td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    </section>
  `
          )
          .join('');

  return `<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(data.title)} — Relatório</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      padding: 28px; color: #0f172a; line-height: 1.45;
      max-width: 900px; margin: 0 auto;
    }
    h1 { margin: 0 0 6px; font-size: 24px; }
    .subtitle { color: #64748b; margin-bottom: 6px; font-size: 14px; }
    .gen { color: #94a3b8; font-size: 12px; margin-bottom: 28px; }
    .actions { margin-bottom: 24px; display: flex; gap: 10px; }
    .actions button {
      padding: 10px 18px; font-size: 14px; font-weight: 500;
      background: #4f46e5; color: #fff; border: 0; border-radius: 8px; cursor: pointer;
    }
    .actions button.secondary { background: #fff; color: #0f172a; border: 1px solid #cbd5e1; }
    .participant {
      margin-bottom: 28px; page-break-inside: avoid;
      border-top: 3px solid #4f46e5; padding-top: 14px;
    }
    .participant h2 { margin: 0 0 4px; font-size: 18px; color: #4f46e5; }
    .meta { font-size: 13px; color: #475569; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; }
    td {
      padding: 9px 12px; border-bottom: 1px solid #e2e8f0;
      vertical-align: top; font-size: 14px;
    }
    td.q { width: 40%; font-weight: 500; color: #334155; background: #f8fafc; }
    td.a { white-space: pre-wrap; word-break: break-word; }
    .empty { color: #94a3b8; font-style: italic; }
    @media print {
      body { padding: 0; }
      .actions { display: none; }
      .participant { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="actions">
    <button onclick="window.print()">Imprimir / Salvar como PDF</button>
    <button class="secondary" onclick="window.close()">Fechar</button>
  </div>
  <h1>${escapeHtml(data.title)}</h1>
  <div class="subtitle">${escapeHtml(data.subtitle)}</div>
  <div class="gen">Gerado em ${escapeHtml(formatDate(new Date().toISOString()))}</div>
  ${participantsHtml}
</body>
</html>`;
}
