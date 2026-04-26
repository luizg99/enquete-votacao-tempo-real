'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  setTextResponse,
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

        unsubExec = subscribeExecution(executionId, (payload?: any) => {
          // Fast-path: aplica o new row direto, evita round-trip
          if (payload?.eventType === 'UPDATE' && payload.new) {
            const n = payload.new;
            setExec((prev) =>
              prev
                ? {
                    ...prev,
                    title: n.title ?? prev.title,
                    status: n.status ?? prev.status,
                    current_question_id: n.current_question_id ?? null,
                    started_at: n.started_at ?? prev.started_at,
                    finished_at: n.finished_at ?? prev.finished_at,
                  }
                : prev
            );
          } else {
            reloadExec();
          }
        });
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
      setResponses={setResponses}
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
  setResponses,
  onEdit,
  onResponsesChanged,
}: {
  execution: Execution;
  participant: Participant;
  responses: ExecutionResponse[];
  setResponses: React.Dispatch<React.SetStateAction<ExecutionResponse[]>>;
  onEdit: () => void;
  onResponsesChanged: () => void;
}) {
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!warning) return;
    const t = setTimeout(() => setWarning(null), 4000);
    return () => clearTimeout(t);
  }, [warning]);

  const handleFailure = () => {
    setWarning('Sem conexão estável. Sua resposta não foi salva — toque novamente.');
    onResponsesChanged();
  };

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

  const optimisticRow = (answerId: string): ExecutionResponse => ({
    id: -Date.now() - Math.floor(Math.random() * 1000),
    execution_id: execution.id,
    participant_id: participant.id,
    question_id: currentQuestion.id,
    answer_id: answerId,
    text: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const toggleSingle = (answerId: string) => {
    setResponses((prev) => [
      ...prev.filter((r) => r.question_id !== currentQuestion.id),
      optimisticRow(answerId),
    ]);
    setSingleResponse(execution.id, participant.id, currentQuestion.id, answerId).catch(
      handleFailure
    );
  };

  const toggleMulti = (answerId: string) => {
    const isSel = selectedIds.has(answerId);
    if (isSel) {
      setResponses((prev) =>
        prev.filter(
          (r) => !(r.question_id === currentQuestion.id && r.answer_id === answerId)
        )
      );
      removeMultiResponse(execution.id, participant.id, currentQuestion.id, answerId).catch(
        handleFailure
      );
    } else {
      setResponses((prev) => [...prev, optimisticRow(answerId)]);
      addMultiResponse(execution.id, participant.id, currentQuestion.id, answerId).catch(
        handleFailure
      );
    }
  };

  const isTextQuestion = currentQuestion.type === 'text';

  return (
    <div className="join-screen">
      <Header participant={participant} onEdit={onEdit} />

      {warning && <div className="join-warning">{warning}</div>}

      <div className="card">
        <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
          {execution.title}
        </div>
        <h2>{currentQuestion.text || '(pergunta sem texto)'}</h2>
        {!isTextQuestion && multi && (
          <small className="muted">Múltipla escolha — selecione quantas quiser</small>
        )}

        {isTextQuestion ? (
          <TextResponseField
            execution={execution}
            participant={participant}
            currentQuestionId={currentQuestion.id}
            responses={responses}
            setResponses={setResponses}
            onFailure={handleFailure}
          />
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}

function TextResponseField({
  execution,
  participant,
  currentQuestionId,
  responses,
  setResponses,
  onFailure,
}: {
  execution: Execution;
  participant: Participant;
  currentQuestionId: string;
  responses: ExecutionResponse[];
  setResponses: React.Dispatch<React.SetStateAction<ExecutionResponse[]>>;
  onFailure: () => void;
}) {
  const existing = useMemo(
    () => responses.find((r) => r.question_id === currentQuestionId && r.answer_id === null),
    [responses, currentQuestionId]
  );
  const [value, setValue] = useState(existing?.text ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>(existing?.text ?? '');

  // Reset quando troca de pergunta
  useEffect(() => {
    setValue(existing?.text ?? '');
    lastSavedRef.current = existing?.text ?? '';
    setStatus('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestionId]);

  // Reflete updates do servidor enquanto o usuário NÃO está editando
  useEffect(() => {
    if (status !== 'idle') return;
    const serverText = existing?.text ?? '';
    if (serverText !== value) setValue(serverText);
    lastSavedRef.current = serverText;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.text]);

  const persist = (text: string) => {
    if (text === lastSavedRef.current) return;
    setStatus('saving');
    // Otimista: atualiza linha local
    setResponses((prev) => {
      const others = prev.filter(
        (r) => !(r.question_id === currentQuestionId && r.answer_id === null)
      );
      if (text.trim() === '') return others;
      return [
        ...others,
        {
          id: -Date.now() - Math.floor(Math.random() * 1000),
          execution_id: execution.id,
          participant_id: participant.id,
          question_id: currentQuestionId,
          answer_id: null,
          text,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
    });
    setTextResponse(execution.id, participant.id, currentQuestionId, text)
      .then(() => {
        lastSavedRef.current = text;
        setStatus('saved');
      })
      .catch(() => {
        setStatus('idle');
        onFailure();
      });
  };

  const onChange = (next: string) => {
    setValue(next);
    setStatus('idle');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => persist(next), 800);
  };

  const onBlur = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    persist(value);
  };

  return (
    <div style={{ marginTop: 14 }}>
      <textarea
        className="text-response"
        value={value}
        placeholder="Escreva sua resposta…"
        rows={6}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      <div className="text-response-status">
        {status === 'saving' && <span className="muted">Salvando…</span>}
        {status === 'saved' && <span className="muted">✓ Resposta salva</span>}
        {status === 'idle' && value && lastSavedRef.current !== value && (
          <span className="muted">Editando — salva ao parar de digitar</span>
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
