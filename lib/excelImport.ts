import { addQuestion, addAnswer, updateQuestion, updateAnswer } from './store';

export type ParsedQuestion = {
  text: string;
  type: 'options' | 'text';
  answers: string[];
  correctIndices: number[];
};

// ---------- Template ----------
export async function downloadTemplate() {
  const XLSX = await import('xlsx');

  const data: any[][] = [
    [
      'Pergunta',
      'Tipo',
      'Resposta 1',
      'Resposta 2',
      'Resposta 3',
      'Resposta 4',
      'Resposta 5',
      'Corretas',
    ],
    [
      'Qual a capital do Brasil?',
      'opcoes',
      'Brasília',
      'Rio de Janeiro',
      'São Paulo',
      'Salvador',
      '',
      'A',
    ],
    [
      'Quais destes são números primos?',
      'opcoes',
      '2',
      '4',
      '7',
      '9',
      '',
      'A,C',
    ],
    [
      'Qual seu nível de satisfação com o evento?',
      'opcoes',
      'Ruim',
      'Regular',
      'Bom',
      'Ótimo',
      '',
      '',
    ],
    ['Comentários e sugestões?', 'texto', '', '', '', '', '', ''],
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
    { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Perguntas');

  const instructions: any[][] = [
    ['Como preencher esta planilha'],
    [''],
    ['1. Coluna "Pergunta": o texto da pergunta.'],
    ['2. Coluna "Tipo": preencha com:'],
    ['   • "opcoes"  → pergunta de múltipla escolha (preenche as Respostas)'],
    ['   • "texto"   → pergunta dissertativa (deixe Respostas e Corretas em branco)'],
    [
      '3. Colunas "Resposta N": as opções da pergunta de múltipla escolha. Use quantas precisar — ' +
        'pode adicionar mais colunas Resposta antes da coluna "Corretas".',
    ],
    [
      '4. Coluna "Corretas": indica quais respostas valem ponto, usando letras na ordem das colunas:',
    ],
    ['   • "A" = Resposta 1, "B" = Resposta 2, "C" = Resposta 3, e assim por diante.'],
    ['   • Para múltiplas respostas corretas, separe por vírgula. Ex.: "A,C".'],
    ['   • Também aceita números: "1" = Resposta 1, "1,3" para múltiplas.'],
    ['   • Deixe em branco se a pergunta não tem resposta correta (apenas pesquisa).'],
    [''],
    ['Importante:'],
    ['• A enquete precisa estar SEM perguntas cadastradas para importar.'],
    ['• Se já houver perguntas, exclua todas antes de importar.'],
    ['• Linhas com a coluna "Pergunta" em branco são ignoradas.'],
    ['• Em perguntas do tipo "texto", a coluna "Corretas" é ignorada.'],
    [
      '• A pontuação por acerto é configurada na enquete (não na planilha): se houver mais de uma ' +
        'resposta correta, o ponto é proporcional ao número de acertos do participante.',
    ],
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instructions);
  wsInstr['!cols'] = [{ wch: 95 }];
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

  // Detecta cabeçalho na primeira linha e localiza a coluna "Corretas"
  let startIdx = 0;
  let correctasCol = -1;
  if (rows[0] && String(rows[0][0] ?? '').toLowerCase().includes('pergunta')) {
    startIdx = 1;
    const header = rows[0];
    for (let c = 2; c < header.length; c++) {
      const h = String(header[c] ?? '').trim().toLowerCase();
      if (h === 'corretas' || h === 'correta' || h === 'gabarito') {
        correctasCol = c;
        break;
      }
    }
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
    const answersEnd = correctasCol >= 0 ? correctasCol : row.length;
    if (type === 'options') {
      for (let c = 2; c < answersEnd; c++) {
        const v = String(row[c] ?? '').trim();
        if (v) answers.push(v);
      }
      if (answers.length === 0) {
        throw new Error(
          `Linha ${i + 1}: pergunta de múltipla escolha precisa de pelo menos 1 resposta.`
        );
      }
    }

    let correctIndices: number[] = [];
    if (type === 'options' && correctasCol >= 0) {
      const raw = String(row[correctasCol] ?? '').trim();
      if (raw) {
        correctIndices = parseCorrectIndices(raw, answers.length, i + 1);
      }
    }

    questions.push({ text, type, answers, correctIndices });
  }

  if (questions.length === 0) throw new Error('Nenhuma pergunta válida encontrada na planilha.');
  return questions;
}

function parseCorrectIndices(raw: string, nAnswers: number, lineNumber: number): number[] {
  const tokens = raw
    .split(/[,;\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const indices = new Set<number>();
  for (const tk of tokens) {
    let idx: number;
    if (/^[A-Za-z]+$/.test(tk)) {
      idx = letterToIndex(tk);
    } else if (/^\d+$/.test(tk)) {
      idx = parseInt(tk, 10) - 1;
    } else {
      throw new Error(
        `Linha ${lineNumber}: valor "${tk}" inválido na coluna "Corretas". Use letras (A, B, C…) ou números (1, 2, 3…).`
      );
    }
    if (idx < 0 || idx >= nAnswers) {
      throw new Error(
        `Linha ${lineNumber}: "${tk}" na coluna "Corretas" aponta para uma resposta que não existe (a pergunta tem ${nAnswers} resposta(s)).`
      );
    }
    indices.add(idx);
  }
  return Array.from(indices).sort((a, b) => a - b);
}

function letterToIndex(s: string): number {
  let n = 0;
  for (const ch of s.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
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
      const correctSet = new Set(q.correctIndices);
      for (let i = 0; i < q.answers.length; i++) {
        const ans = await addAnswer(created.id, q.answers[i]);
        if (correctSet.has(i)) {
          await updateAnswer(ans.id, { is_correct: true });
        }
      }
    }
    count++;
  }
  return count;
}
