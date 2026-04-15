export type Answer = {
  id: string;
  question_id: string;
  text: string;
  position: number;
  votes?: number;
};

export type Question = {
  id: string;
  survey_id: string;
  text: string;
  position: number;
  answers: Answer[];
};

export type Survey = {
  id: string;
  title: string;
  created_at: string;
  questions: Question[];
};

export type TallyAnswer = {
  id: string;
  text: string;
  votes: number;
  pct: number;
};

export type TallyQuestion = {
  id: string;
  text: string;
  total: number;
  answers: TallyAnswer[];
};
