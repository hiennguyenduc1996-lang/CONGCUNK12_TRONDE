export enum QuestionType {
  DISCRETE = 'DISCRETE',
  READING = 'READING', // Read text, answer questions about it
  CLOZE = 'CLOZE', // Fill in the gaps
}

export interface Option {
  label: string; // A, B, C, D
  content: string;
}

export interface Question {
  id: string;
  number: number;
  originalNumber: number;
  content: string; // The question text
  options: Option[];
  answer: string | null; // A, B, C, D
}

export interface Section {
  id: string;
  type: QuestionType;
  header?: string; // e.g., "Read the following passage..."
  passage?: string; // The reading text
  questions: Question[];
}

export interface ExamData {
  title: string;
  sections: Section[];
}

export interface ProcessingStatus {
  step: 'idle' | 'standardizing' | 'shuffling';
  message?: string;
}