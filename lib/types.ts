export type Answer = {
  id: string;
  question_id: string;
  text: string;
  position: number;
  votes?: number;
};

export type QuestionType = 'options' | 'text';

export type Question = {
  id: string;
  survey_id: string;
  text: string;
  type: QuestionType;
  position: number;
  answers: Answer[];
};

export type Survey = {
  id: string;
  title: string;
  single_vote_per_device: boolean;
  allow_multiple_choices: boolean;
  created_at: string;
  questions: Question[];
};

export type TallyAnswer = {
  id: string;
  text: string;
  votes: number;
  pct: number;
};

export type TextResponse = {
  participantId: string;
  participantName: string;
  participantCompany: string;
  text: string;
  updatedAt: string;
};

export type TallyQuestion =
  | {
      id: string;
      text: string;
      type: 'options';
      total: number;
      answers: TallyAnswer[];
    }
  | {
      id: string;
      text: string;
      type: 'text';
      total: number;
      texts: TextResponse[];
    };

// ---------- Execuções ----------
export type ExecutionStatus = 'draft' | 'running' | 'finished';

export type Execution = {
  id: string;
  survey_id: string;
  title: string;
  status: ExecutionStatus;
  current_question_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  survey?: Survey;
  participant_count?: number;
};

export type Participant = {
  id: string;
  execution_id: string;
  device_id: string;
  company: string;
  full_name: string;
  phone: string;
  joined_at: string;
  last_seen_at: string;
};

export type ExecutionResponse = {
  id: number;
  execution_id: string;
  participant_id: string;
  question_id: string;
  answer_id: string | null;
  text: string | null;
  created_at: string;
  updated_at: string;
};

export type Branding = {
  id: number;
  logo_url: string | null;
  updated_at: string;
};
