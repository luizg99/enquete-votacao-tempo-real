'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Execution, Participant, ExecutionResponse } from '@/lib/types';
import {
  getExecution,
  findParticipant,
  getParticipant,
  createParticipant,
  updateParticipant,
  listResponsesByParticipant,
  setSingleResponse,
  addMultiResponse,
  removeMultiResponse,
  subscribeExecution,
  subscribeExecutionResponses,
} from '@/lib/executions';
import { subscribeSurveyChanges } from '@/lib/store';
import {
  getDeviceId,
  getCachedParticipantId,
  setCachedParticipantId,
} from '@/lib/device';

export function JoinFlow({ executionId }: { executionId: string }) {
  const [exec, setExec] = useState<Execution | null>(null);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [responses, setResponses] = useState<ExecutionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reloadExec = async () => {
    try {
      const e = await getExecution(executionId);
      setExec(e);
    } catch (err: any) {
      setError(err.message ?? String(err));
    }
  };

  const reloadResponses = async (pid: string) => {
    try {
      const r = await listResponsesByParticipant(executionId, pid);
      setResponses(r);
    } catch {
      // silencioso
    }
  };

  useEffect(() => {
    let unsubExec: (() => void) | null = null;
    let unsubResp: (() => void) | null = null;
    let unsubSurvey: (() => void) | null = null;

    (async () => {
      try {
        const e = await getExecution(executionId);
        setExec(e);
        if (!e) {
          setLoading(false);
          return;
        }

        const deviceId = getDeviceId();
        let p: Participant | null = null;

        const cachedId = getCachedParticipantId(executionId);
        if (cachedId) {
          p = await getParticipant(cachedId);
        }
        if (!p) {
          p = await findParticipant(executionId, deviceId);
          if (p) setCachedParticipantId(executionId, p.id);
        }

        setParticipant(p);
        if (p) await reloadResponses(p.id);

        unsubExec = subscribeExecution(executionId, reloadExec);
        unsubResp = subscribeExecutionResponses(executionId, () => {
          if (p) reloadResponses(p.id);
        });
        if (e.survey_id) unsubSurvey = subscribeSurveyChanges(e.survey_id, reloadExec);
      } catch (err: any) {
        setError(err.message ?? String(err));
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      if (unsubExec) unsubExec();
      if (unsubResp) unsubResp();
      if (unsubSurvey) unsubSurvey();
    };
  }, [executionId]);

  if (loading) return <div className="card">Carregando…</div>;
  if (error) return <div className="card" style={{ color: '#dc2626' }}>{error}</div>;
  if (!exec) return <div className="empty">Execução não encontrada.</div>;

  if (!participant) {
    return (
      <ParticipantForm
        executionId={executionId}
        onSaved={(p) => {
          setParticipant(p);
          setCachedParticipantId(executionId, p.id);
        }}
      />
    );
  }

  if (showEdit) {
    return (
      <ParticipantForm
        executionId={executionId}
        initial={participant}
        onSaved={(p) => {
          setParticipant(p);
          setShowEdit(false);
        }}
        onCancel={() => setShowEdit(false)}
      />
    );
  }

  return (
    <ParticipantVoteScreen
      execution={exec}
      participant={participant}
      responses={responses}
      onEdit={() => setShowEdit(true)}
      onResponsesChanged={() => reloadResponses(participant.id)}
    />
  );
}

// ---------- Cadastro / edição ----------
function ParticipantForm({
  executionId,
  initial,
  onSaved,
  onCancel,
}: {
  executionId: string;
  initial?: Participant;
  onSaved: (p: Participant) => void;
  onCancel?: () => void;
}) {
  const [company, setCompany] = useState(initial?.company ?? '');
  const [fullName, setFullName] = useState(initial?.full_name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!company.trim() || !fullName.trim() || !phone.trim()) {
      alert('Preencha todos os campos.');
      return;
    }
    setSaving(true);
    try {
      if (initial) {
        await updateParticipant(initial.id, {
          company: company.trim(),
          full_name: fullName.trim(),
          phone: phone.trim(),
        });
        onSaved({
          ...initial,
          company: company.trim(),
          full_name: fullName.trim(),
          phone: phone.trim(),
        });
      } else {
        const deviceId = getDeviceId();
        const p = await createParticipant({
          execution_id: executionId,
          device_id: deviceId,
          company: company.trim(),
          full_name: fullName.trim(),
          phone: phone.trim(),
        });
        onSaved(p);
      }
    } catch (e: any) {
      alert('Erro ao salvar: ' + (e.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="join-form">
      <div className="card">
        <h1>{initial ? 'Editar informações' : 'Bem-vindo!'}</h1>
        <p className="muted">
          {initial
            ? 'Corrija seus dados abaixo.'
            : 'Preencha seus dados para participar da execução.'}
        </p>

        <label className="muted" style={{ marginTop: 12, display: 'block' }}>Nome da Empresa</label>
        <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} />

        <label className="muted" style={{ marginTop: 12, display: 'block' }}>Nome Completo</label>
        <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} />

        <label className="muted" style={{ marginTop: 12, display: 'block' }}>Telefone</label>
        <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" />

        <div className="row" style={{ marginTop: 18, justifyContent: 'flex-end' }}>
          {onCancel && (
            <button className="btn ghost" onClick={onCancel}>Cancelar</button>
          )}
          <button className="btn primary" disabled={saving} onClick={submit}>
            {saving ? 'Salvando…' : initial ? 'Salvar alterações' : 'Entrar na execução'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Tela de votação do cliente ----------
function ParticipantVoteScreen({
  execution,
  participant,
  responses,
  onEdit,
  onResponsesChanged,
}: {
  execution: Execution;
  participant: Participant;
  responses: ExecutionResponse[];
  onEdit: () => void;
  onResponsesChanged: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  const questions = execution.survey?.questions ?? [];
  const currentQuestion = useMemo(() => {
    if (!execution.current_question_id) return null;
    return questions.find((q) => q.id === execution.current_question_id) ?? null;
  }, [execution.current_question_id, questions]);

  const selectedIds = useMemo(() => {
    if (!currentQuestion) return new Set<string>();
    return new Set(
      responses.filter((r) => r.question_id === currentQuestion.id).map((r) => r.answer_id)
    );
  }, [responses, currentQuestion]);

  const multi = !!execution.survey?.allow_multiple_choices;

  if (execution.status === 'finished') {
    return (
      <div className="join-screen">
        <Header participant={participant} onEdit={onEdit} />
        <div className="card center">
          <h1>✓ Execução encerrada</h1>
          <p className="muted">Obrigado pela sua participação!</p>
        </div>
      </div>
    );
  }

  if (execution.status === 'draft') {
    return (
      <div className="join-screen">
        <Header participant={participant} onEdit={onEdit} />
        <div className="card center">
          <h1>Aguardando início…</h1>
          <p className="muted">Assim que o anfitrião iniciar, sua primeira pergunta aparece aqui.</p>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="join-screen">
        <Header participant={participant} onEdit={onEdit} />
        <div className="card center">
          <h1>Aguardando próxima pergunta…</h1>
          <p className="muted">O anfitrião ainda não selecionou uma pergunta.</p>
        </div>
      </div>
    );
  }

  const toggleSingle = async (answerId: string) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await setSingleResponse(execution.id, participant.id, currentQuestion.id, answerId);
      onResponsesChanged();
    } catch (e: any) {
      alert('Falha ao registrar: ' + (e.message ?? e));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMulti = async (answerId: string) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (selectedIds.has(answerId)) {
        await removeMultiResponse(execution.id, participant.id, currentQuestion.id, answerId);
      } else {
        await addMultiResponse(execution.id, participant.id, currentQuestion.id, answerId);
      }
      onResponsesChanged();
    } catch (e: any) {
      alert('Falha ao registrar: ' + (e.message ?? e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="join-screen">
      <Header participant={participant} onEdit={onEdit} />

      <div className="card">
        <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
          {execution.title}
        </div>
        <h2>{currentQuestion.text || '(pergunta sem texto)'}</h2>
        {multi && <small className="muted">Múltipla escolha — selecione quantas quiser</small>}

        <div style={{ marginTop: 14 }}>
          {currentQuestion.answers.length === 0 ? (
            <div className="empty">Sem respostas configuradas.</div>
          ) : (
            currentQuestion.answers.map((a) => {
              const isSel = selectedIds.has(a.id);
              return (
                <label key={a.id} className={`option${isSel ? ' selected' : ''}`}>
                  <input
                    type={multi ? 'checkbox' : 'radio'}
                    name={`q-${currentQuestion.id}`}
                    checked={isSel}
                    onChange={() => (multi ? toggleMulti(a.id) : toggleSingle(a.id))}
                  />
                  <span>{a.text || '(sem texto)'}</span>
                </label>
              );
            })
          )}
        </div>

        {selectedIds.size > 0 && (
          <small className="muted" style={{ display: 'block', marginTop: 8 }}>
            ✓ Sua resposta foi registrada. Aguarde a próxima pergunta.
          </small>
        )}
      </div>
    </div>
  );
}

function Header({ participant, onEdit }: { participant: Participant; onEdit: () => void }) {
  return (
    <div className="join-header">
      <div>
        <strong>{participant.full_name}</strong>
        <small className="muted"> · {participant.company}</small>
      </div>
      <button className="btn ghost" onClick={onEdit}>Editar informações</button>
    </div>
  );
}
