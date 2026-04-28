'use client';

import { useEffect, useRef, useState } from 'react';
import type { ScoreBand } from '@/lib/types';
import {
  listScoreBands,
  addScoreBand,
  updateScoreBand,
  removeScoreBand,
  seedDefaultBands,
  subscribeScoreBands,
} from '@/lib/store';

function useDebouncedCallback<T extends (...args: any[]) => void>(fn: T, ms = 400) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (...args: Parameters<T>) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), ms);
  };
}

export function ScoreBandsEditor({
  surveyId,
  hasFinishedExecutions,
}: {
  surveyId: string;
  hasFinishedExecutions?: boolean;
}) {
  const [bands, setBands] = useState<ScoreBand[]>([]);
  const [loading, setLoading] = useState(true);
  const reqIdRef = useRef(0);

  const reload = async () => {
    const myId = ++reqIdRef.current;
    try {
      const list = await listScoreBands(surveyId);
      // Descarta resultados obsoletos (race entre múltiplos eventos de realtime)
      if (myId !== reqIdRef.current) return;
      setBands(list);
    } finally {
      if (myId === reqIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    reqIdRef.current = 0;
    (async () => {
      const myId = ++reqIdRef.current;
      const list = await listScoreBands(surveyId);
      if (!mounted || myId !== reqIdRef.current) return;
      // Auto-seed na primeira abertura sem faixas configuradas
      if (list.length === 0) {
        try {
          const seeded = await seedDefaultBands(surveyId);
          if (mounted && myId === reqIdRef.current) setBands(seeded);
        } catch {
          if (mounted && myId === reqIdRef.current) setBands([]);
        }
      } else {
        setBands(list);
      }
      if (mounted) setLoading(false);
    })();
    const unsub = subscribeScoreBands(surveyId, reload);
    return () => {
      mounted = false;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId]);

  const handleAdd = async () => {
    const last = bands[bands.length - 1];
    const min = last ? last.max_points + 1 : 0;
    const max = min;
    await addScoreBand(surveyId, {
      position: bands.length,
      min_points: min,
      max_points: max,
      label: '',
      observation: '',
    });
  };

  const handleRemove = async (id: string) => {
    if (!confirm('Excluir esta faixa?')) return;
    // Atualização otimista: remove da UI imediatamente, sem esperar o realtime
    setBands((prev) => prev.filter((b) => b.id !== id));
    try {
      await removeScoreBand(id);
    } catch (e: any) {
      alert('Erro ao excluir faixa: ' + (e.message ?? e));
      // Em caso de erro, força refresh para sincronizar com o servidor
      reload();
    }
  };

  const handleRestoreExample = async () => {
    if (
      !confirm(
        'Substituir as faixas atuais pelo exemplo padrão? As faixas existentes serão perdidas.'
      )
    )
      return;
    await seedDefaultBands(surveyId);
  };

  // Validação: faixas contíguas e não-sobrepostas
  const issues: string[] = [];
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    if (b.min_points > b.max_points) {
      issues.push(`Faixa ${i + 1}: mínimo (${b.min_points}) é maior que o máximo (${b.max_points}).`);
    }
    if (i > 0) {
      const prev = bands[i - 1];
      if (b.min_points !== prev.max_points + 1) {
        issues.push(
          `Faixa ${i + 1}: deveria começar em ${prev.max_points + 1} para ser contígua à anterior.`
        );
      }
    }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div>
          <h3 style={{ margin: 0 }}>Faixas de Classificação</h3>
          <small className="muted">
            Aplicadas ao total de pontos do participante após a finalização da execução.
          </small>
        </div>
        <div className="spacer" />
        <button className="btn ghost" onClick={handleRestoreExample}>
          ↻ Restaurar exemplo
        </button>
      </div>

      {hasFinishedExecutions && (
        <div
          className="muted"
          style={{
            marginTop: 10,
            padding: 10,
            border: '1px solid #fde68a',
            background: '#fffbeb',
            color: '#92400e',
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          ℹ Esta enquete possui execuções finalizadas. Alterar as faixas pode mudar a
          classificação exibida aos participantes — os pontos não são afetados.
        </div>
      )}

      {loading ? (
        <div style={{ marginTop: 12 }}>Carregando faixas…</div>
      ) : bands.length === 0 ? (
        <div className="empty" style={{ marginTop: 12 }}>
          Nenhuma faixa cadastrada.{' '}
          <button className="btn" onClick={handleAdd} style={{ marginLeft: 8 }}>
            + Adicionar faixa
          </button>
        </div>
      ) : (
        <>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {bands.map((b, idx) => (
              <BandRow
                key={b.id}
                band={b}
                index={idx}
                onRemove={() => handleRemove(b.id)}
              />
            ))}
          </div>

          {issues.length > 0 && (
            <div
              style={{
                marginTop: 10,
                padding: 10,
                border: '1px solid #fecaca',
                background: '#fef2f2',
                color: '#991b1b',
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              <strong>Atenção:</strong>
              <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                {issues.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={handleAdd}>
              + Adicionar faixa
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function BandRow({
  band,
  index,
  onRemove,
}: {
  band: ScoreBand;
  index: number;
  onRemove: () => void;
}) {
  const [minVal, setMinVal] = useState(String(band.min_points));
  const [maxVal, setMaxVal] = useState(String(band.max_points));
  const [label, setLabel] = useState(band.label);
  const [obs, setObs] = useState(band.observation);

  useEffect(() => {
    setMinVal(String(band.min_points));
    setMaxVal(String(band.max_points));
    setLabel(band.label);
    setObs(band.observation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [band.id]);

  const saveNumber = useDebouncedCallback(
    (field: 'min_points' | 'max_points', raw: string) => {
      const parsed = parseInt(raw, 10);
      if (!Number.isFinite(parsed)) return;
      updateScoreBand(band.id, { [field]: parsed } as Partial<ScoreBand>);
    },
    400
  );

  const saveText = useDebouncedCallback(
    (field: 'label' | 'observation', value: string) => {
      updateScoreBand(band.id, { [field]: value } as Partial<ScoreBand>);
    },
    400
  );

  return (
    <div
      className="row"
      style={{
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
        padding: 10,
        background: '#f8fafc',
        border: '1px solid #e5e7eb',
        borderRadius: 6,
      }}
    >
      <span className="muted" style={{ minWidth: 24, textAlign: 'right' }}>
        {index + 1}.
      </span>
      <span className="muted">De</span>
      <input
        type="number"
        value={minVal}
        onChange={(e) => {
          setMinVal(e.target.value);
          saveNumber('min_points', e.target.value);
        }}
        style={{ width: 80 }}
      />
      <span className="muted">a</span>
      <input
        type="number"
        value={maxVal}
        onChange={(e) => {
          setMaxVal(e.target.value);
          saveNumber('max_points', e.target.value);
        }}
        style={{ width: 80 }}
      />
      <span className="muted">pontos →</span>
      <input
        type="text"
        value={label}
        placeholder="Classificação"
        onChange={(e) => {
          setLabel(e.target.value);
          saveText('label', e.target.value);
        }}
        style={{ flex: '1 1 160px', minWidth: 120 }}
      />
      <input
        type="text"
        value={obs}
        placeholder="Observação"
        onChange={(e) => {
          setObs(e.target.value);
          saveText('observation', e.target.value);
        }}
        style={{ flex: '2 1 220px', minWidth: 160 }}
      />
      <button className="btn icon danger" title="Excluir faixa" onClick={onRemove}>
        🗑
      </button>
    </div>
  );
}
