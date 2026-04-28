import { addQuestion, addAnswer, updateQuestion, updateAnswer } from './store';
import type { ScoringMode } from './types';

export type ParsedQuestion = {
  text: string;
  type: 'options' | 'text';
  answers: string[];
  correctIndices: number[];
  answerPoints: (number | null)[]; // por índice de answers; null quando não preenchido
};

// ---------- Template ----------
export async function downloadTemplate(scoringMode: ScoringMode = 'general') {
  const XLSX = await import('xlsx');

  let header: string[];
  let dataRows: any[][];
  let lastColLabel: string;

  if (scoringMode === 'per_answer') {
    lastColLabel = 'Pontos';
    header = [
      'Pergunta',
      'Tipo',
      'Resposta 1',
      'Resposta 2',
      'Resposta 3',
      'Resposta 4',
      'Resposta 5',
      lastColLabel,
    ];
    dataRows = [
      [
        'Como você gerencia seu estoque?',
        'opcoes',
        'Sem controle',
        'Planilha simples',
        'Sistema básico',
        'ERP integrado',
        '',
        'A=1, B=2, C=3, D=4',
      ],
      [
        'Como tomam decisões financeiras?',
        'opcoes',
        'No improviso',
        'Relatórios mensais',
        'Dashboard contínuo',
        'Indicadores em tempo real',
        '',
        'A=1, B=2, C=3, D=4',
      ],
      [
        'Comentários e sugestões?',
        'texto',
        '',
        '',
        '',
        '',
        '',
        '',
      ],
    ];
  } else if (scoringMode === 'none') {
    lastColLabel = '';
    header = [
      'Pergunta',
      'Tipo',
      'Resposta 1',
      'Resposta 2',
      'Resposta 3',
      'Resposta 4',
      'Resposta 5',
    ];
    dataRows = [
      [
        'Qual seu nível de satisfação com o evento?',
        'opcoes',
        'Ruim',
        'Regular',
        'Bom',
        'Ótimo',
        '',
      ],
      [
        'Quais temas você quer ver no próximo evento?',
        'opcoes',
        'Liderança',
        'Inovação',
        'Tecnologia',
        'Cultura',
        '',
      ],
      ['Comentários e sugestões?', 'texto', '', '', '', '', ''],
    ];
  } else {
    // general (atual)
    lastColLabel = 'Corretas';
    header = [
      'Pergunta',
      'Tipo',
      'Resposta 1',
      'Resposta 2',
      'Resposta 3',
      'Resposta 4',
      'Resposta 5',
      lastColLabel,
    ];
    dataRows = [
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
  }

  const data: any[][] = [header, ...dataRows];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = header.map((_, i) =>
    i === 0 ? { wch: 50 } : i === 1 ? { wch: 12 } : i === header.length - 1 && lastColLabel ? { wch: 22 } : { wch: 22 }
  );

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Perguntas');

  const instructions = buildInstructionsSheet(scoringMode);
  const wsInstr = XLSX.utils.aoa_to_sheet(instructions);
  wsInstr['!cols'] = [{ wch: 95 }];
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instruções');

  XLSX.writeFile(wb, 'PlanilhaModelo.xlsx');
}

function buildInstructionsSheet(scoringMode: ScoringMode): any[][] {
  const base: any[][] = [
    ['Como preencher esta planilha'],
    [''],
    ['1. Coluna "Pergunta": o texto da pergunta.'],
    ['2. Coluna "Tipo": preencha com:'],
    ['   • "opcoes"  → pergunta de múltipla escolha (preenche as Respostas)'],
    ['   • "texto"   → pergunta dissertativa (deixe Respostas em branco)'],
    [
      '3. Colunas "Resposta N": as opções da pergunta de múltipla escolha. Use quantas precisar — ' +
        'pode adicionar mais colunas Resposta antes da última coluna.',
    ],
  ];

  if (scoringMode === 'general') {
    base.push(
      [
        '4. Coluna "Corretas": indica quais respostas valem ponto, usando letras na ordem das colunas:',
      ],
      ['   • "A" = Resposta 1, "B" = Resposta 2, "C" = Resposta 3, e assim por diante.'],
      ['   • Para múltiplas respostas corretas, separe por vírgula. Ex.: "A,C".'],
      ['   • Também aceita números: "1" = Resposta 1, "1,3" para múltiplas.'],
      ['   • Deixe em branco se a pergunta não tem resposta correta (apenas pesquisa).'],
      ['']
    );
  } else if (scoringMode === 'per_answer') {
    base.push(
      [
        '4. Coluna "Pontos": indica quantos pontos cada alternativa vale, usando o formato letra=valor:',
      ],
      ['   • Exemplo: "A=1, B=2, C=3, D=4" — A vale 1 ponto, B vale 2, C vale 3, D vale 4.'],
      ['   • Os valores devem ser números inteiros de 1 a 10.'],
      ['   • Também aceita índices numéricos: "1=1, 2=2, 3=3, 4=4".'],
      ['   • Você pode pular alternativas, mas todas precisam ter pontuação antes de iniciar a execução.'],
      ['']
    );
  } else {
    base.push(
      ['4. Esta enquete está configurada como SEM PONTUAÇÃO — não há coluna de pontos ou corretas.'],
      ['']
    );
  }

  base.push(
    ['Importante:'],
    ['• A enquete precisa estar SEM perguntas cadastradas para importar.'],
    ['• Se já houver perguntas, exclua todas antes de importar.'],
    ['• Linhas com a coluna "Pergunta" em branco são ignoradas.'],
    ['• Em perguntas do tipo "texto", a coluna de pontuação/corretas é ignorada.']
  );

  if (scoringMode === 'general') {
    base.push([
      '• A pontuação por acerto é configurada na enquete (não na planilha): se houver mais de uma ' +
        'resposta correta, o ponto é proporcional ao número de acertos do participante.',
    ]);
  } else if (scoringMode === 'per_answer') {
    base.push(
      [
        '• Em "Com pontuação por resposta", se a enquete permitir múltipla escolha, os pontos das ' +
          'alternativas marcadas são somados.',
      ],
      ['• As Faixas de Classificação são configuradas na enquete (não na planilha).']
    );
  }

  return base;
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

  // Detecta cabeçalho na primeira linha e localiza colunas especiais
  let startIdx = 0;
  let correctasCol = -1;
  let pontosCol = -1;
  if (rows[0] && String(rows[0][0] ?? '').toLowerCase().includes('pergunta')) {
    startIdx = 1;
    const header = rows[0];
    for (let c = 2; c < header.length; c++) {
      const h = String(header[c] ?? '').trim().toLowerCase();
      if (h === 'corretas' || h === 'correta' || h === 'gabarito') {
        correctasCol = c;
        break;
      }
      if (h === 'pontos' || h === 'pontuação' || h === 'pontuacao') {
        pontosCol = c;
        break;
      }
    }
  }

  const specialCol = correctasCol >= 0 ? correctasCol : pontosCol;

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
    const answersEnd = specialCol >= 0 ? specialCol : row.length;
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
    let answerPoints: (number | null)[] = answers.map(() => null);

    if (type === 'options') {
      if (correctasCol >= 0) {
        const raw = String(row[correctasCol] ?? '').trim();
        if (raw) {
          correctIndices = parseCorrectIndices(raw, answers.length, i + 1);
        }
      } else if (pontosCol >= 0) {
        const raw = String(row[pontosCol] ?? '').trim();
        if (raw) {
          answerPoints = parseAnswerPoints(raw, answers.length, i + 1);
        }
      }
    }

    questions.push({ text, type, answers, correctIndices, answerPoints });
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

function parseAnswerPoints(
  raw: string,
  nAnswers: number,
  lineNumber: number
): (number | null)[] {
  const points: (number | null)[] = Array(nAnswers).fill(null);

  const tokens = raw
    .split(/[,;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  for (const tk of tokens) {
    const eq = tk.indexOf('=');
    if (eq < 0) {
      throw new Error(
        `Linha ${lineNumber}: "${tk}" inválido na coluna "Pontos". Use o formato letra=valor, ex.: "A=1, B=2".`
      );
    }
    const left = tk.slice(0, eq).trim();
    const right = tk.slice(eq + 1).trim();

    let idx: number;
    if (/^[A-Za-z]+$/.test(left)) {
      idx = letterToIndex(left);
    } else if (/^\d+$/.test(left)) {
      idx = parseInt(left, 10) - 1;
    } else {
      throw new Error(
        `Linha ${lineNumber}: identificador "${left}" inválido na coluna "Pontos". Use letras (A, B, C…) ou números (1, 2, 3…).`
      );
    }

    if (idx < 0 || idx >= nAnswers) {
      throw new Error(
        `Linha ${lineNumber}: "${left}" na coluna "Pontos" aponta para uma resposta que não existe (a pergunta tem ${nAnswers} resposta(s)).`
      );
    }

    if (!/^\d+$/.test(right)) {
      throw new Error(
        `Linha ${lineNumber}: pontuação "${right}" para "${left}" inválida. Use um número inteiro de 1 a 10.`
      );
    }
    const value = parseInt(right, 10);
    if (value < 1 || value > 10) {
      throw new Error(
        `Linha ${lineNumber}: pontuação "${value}" para "${left}" fora do intervalo permitido (1 a 10).`
      );
    }

    points[idx] = value;
  }

  return points;
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
        const patch: { is_correct?: boolean; answer_points?: number | null } = {};
        if (correctSet.has(i)) patch.is_correct = true;
        if (q.answerPoints[i] != null) patch.answer_points = q.answerPoints[i];
        if (Object.keys(patch).length > 0) {
          await updateAnswer(ans.id, patch);
        }
      }
    }
    count++;
  }
  return count;
}
