'use client';

import { useState } from 'react';
import { downloadCsv, openPrintView, type ReportData } from '@/lib/reports';

export function ExportButtons({ load }: { load: () => Promise<ReportData | null> }) {
  const [busy, setBusy] = useState<'csv' | 'pdf' | null>(null);

  const trigger = async (format: 'csv' | 'pdf') => {
    setBusy(format);
    try {
      const data = await load();
      if (!data) {
        alert('Não há dados para exportar.');
        return;
      }
      if (data.participants.length === 0) {
        alert('Nenhum participante registrado ainda.');
        return;
      }
      if (format === 'csv') downloadCsv(data);
      else openPrintView(data);
    } catch (e: any) {
      alert('Erro ao exportar: ' + (e.message ?? e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <button className="btn" disabled={!!busy} onClick={() => trigger('csv')}>
        {busy === 'csv' ? 'Gerando…' : '⬇ CSV (Excel)'}
      </button>
      <button className="btn" disabled={!!busy} onClick={() => trigger('pdf')}>
        {busy === 'pdf' ? 'Abrindo…' : '⬇ PDF'}
      </button>
    </>
  );
}
