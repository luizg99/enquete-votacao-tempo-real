import { addQuestion, addAnswer, updateQuestion } from './store';

export type ParsedQuestion = {
  text: string;
  type: 'options' | 'text';
  answers: string[];
};

// ---------- Template ----------
export async function downloadTemplate() {
  const XLSX = await import('xlsx');

  const data: any[][] = [
    ['Pergunta', 'Tipo', 'Resposta 1', 'Resposta 2', 'Resposta 3', 'Resposta 4', 'Resposta 5'],
    [
      'Qual seu nível de satisfação com o evento?',
      'opcoes',
      'Ruim',
      'Regular',
      'Bom',
      'Ótimo',
      '',
    ],
    ['Comentários e sugestões?', 'texto', '', '', '', '', ''],
    ['Você recomendaria para um colega?', 'opcoes', 'Sim', 'Não', 'Talvez', '', ''],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 50 },
    { wch: 12 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Perguntas');

  const instructions: any[][] = [
    ['Como preencher esta planilha'],
    [''],
    ['1. Coluna "Pergunta": o texto da pergunta.'],
    ['2. Coluna "Tipo": preencha com:'],
    ['   • "opcoes"  → pergunta de múltipla escolha (preenche as Respostas)'],
    ['   • "texto"   → pergunta dissertativa (deixe as Respostas em branco)'],
    [
      '3. Colunas "Resposta N": as opções da pergunta de múltipla escolha. Use quantas precisar — ' +
        'pode adicionar mais colunas, basta seguir a sequência.',
    ],
    [''],
    ['Importante:'],
    ['• A enquete precisa estar SEM perguntas cadastradas para importar.'],
    ['• Se já houver perguntas, exclua todas antes de importar.'],
    ['• Linhas com a coluna "Pergunta" em branco são ignoradas.'],
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instructions);
  wsInstr['!cols'] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instruções');

  XLSX.writeFile(wb, 'PlanilhaModelo.xlsx');
}

// ---------- Parse ----------
export async function parseQuestionsFile(file: File): Promise<ParsedQuestion[]> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });

  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('Arquivo sem planilhas.');
  const ws = wb.Sheets[sheetName];

  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length === 0) throw new Error('Planilha vazia.');

  // Detecta cabeçalho na primeira linha
  let startIdx = 0;
  if (rows[0] && String(rows[0][0] ?? '').toLowerCase().includes('pergunta')) {
    startIdx = 1;
  }

  const questions: ParsedQuestion[] = [];
  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const text = String(row[0] ?? '').trim();
    if (!text) continue;

    const typeRaw = String(row[1] ?? '').trim().toLowerCase();
    let type: 'options' | 'text';
    if (['texto', 'text', 'dissertativa'].includes(typeRaw)) {
      type = 'text';
    } else if (
      ['opcoes', 'opções', 'opcao', 'opção', 'options', 'multipla', 'múltipla', ''].includes(typeRaw)
    ) {
      type = 'options';
    } else {
      throw new Error(
        `Linha ${i + 1}: tipo "${typeRaw}" inválido. Use "opcoes" ou "texto".`
      );
    }

    const answers: string[] = [];
    if (type === 'options') {
      for (let c = 2; c < row.length; c++) {
        const v = String(row[c] ?? '').trim();
        if (v) answers.push(v);
      }
      if (answers.length === 0) {
        throw new Error(
          `Linha ${i + 1}: pergunta de múltipla escolha precisa de pelo menos 1 resposta.`
        );
      }
    }

    questions.push({ text, type, answers });
  }

  if (questions.length === 0) throw new Error('Nenhuma pergunta válida encontrada na planilha.');
  return questions;
}

// ---------- Importação no banco ----------
export async function importQuestionsToSurvey(
  surveyId: string,
  parsed: ParsedQuestion[]
): Promise<number> {
  let count = 0;
  for (const q of parsed) {
    const created = await addQuestion(surveyId, q.text);
    if (q.type === 'text') {
      await updateQuestion(created.id, { type: 'text' });
    } else {
      for (const ans of q.answers) {
        await addAnswer(created.id, ans);
      }
    }
    count++;
  }
  return count;
}
