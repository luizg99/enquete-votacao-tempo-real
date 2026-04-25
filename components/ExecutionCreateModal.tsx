'use client';

import { useState } from 'react';
import type { Survey } from '@/lib/types';
import { createExecution } from '@/lib/executions';

export function ExecutionCreateModal({
  surveys,
  onClose,
  onCreated,
}: {
  surveys: Survey[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [surveyId, setSurveyId] = useState(surveys[0]?.id ?? '');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!surveyId) {
      alert('Selecione uma enquete.');
      return;
    }
    setSaving(true);
    try {
      await createExecution(surveyId, title.trim() || 'Nova execução');
      onCreated();
    } catch (e: any) {
      alert('Erro ao criar execução: ' + (e.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ marginBottom: 12 }}>
          <h2>Nova execução</h2>
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>✕</button>
        </div>

        {surveys.length === 0 ? (
          <div className="empty">
            Você ainda não tem enquetes cadastradas. Crie uma em <strong>/admin</strong> primeiro.
          </div>
        ) : (
          <>
            <label className="muted">Título da execução</label>
            <input
              type="text"
              value={title}
              placeholder="Ex.: Reunião comercial — abril/2026"
              onChange={(e) => setTitle(e.target.value)}
            />

            <label className="muted" style={{ marginTop: 12, display: 'block' }}>
              Enquete vinculada
            </label>
            <select
              value={surveyId}
              onChange={(e) => setSurveyId(e.target.value)}
              className="select"
            >
              {surveys.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title || '(sem título)'} — {s.questions.length} pergunta(s)
                </option>
              ))}
            </select>

            <div className="row" style={{ marginTop: 20, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={onClose}>Cancelar</button>
              <button className="btn primary" disabled={saving} onClick={submit}>
                {saving ? 'Criando…' : 'Criar execução'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
