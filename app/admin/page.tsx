'use client';

import { useState } from 'react';
import { SurveyEditor } from '@/components/SurveyEditor';
import { SurveyList } from '@/components/SurveyList';
import { EnvGuard } from '@/components/EnvGuard';
import { createSurvey } from '@/lib/store';

export default function AdminPage() {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <EnvGuard>
      <div className="row" style={{ marginBottom: 18 }}>
        <h1>Administração de enquetes</h1>
        <div className="spacer" />
        <button
          className="btn primary big"
          onClick={async () => {
            try {
              const s = await createSurvey('Nova enquete');
              setEditingId(s.id);
            } catch (e: any) {
              alert('Erro ao criar enquete: ' + (e.message ?? e));
            }
          }}
        >
          + Criar enquete
        </button>
      </div>

      {editingId && (
        <SurveyEditor
          surveyId={editingId}
          onClose={() => setEditingId(null)}
        />
      )}

      <SurveyList onEdit={(id) => setEditingId(id)} showDashboardLinks />
    </EnvGuard>
  );
}
