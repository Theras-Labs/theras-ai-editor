// Choice popup state. A generator (or the director) asks; the UI shows the popup in the chat
// panel when it is open, else in the middle of the screen; the user picks and may add a note.
import type { ChoiceAnswers, ChoiceQuestion } from "./director/types";

export type ChoiceRequest = {
  id: number;
  title: string;
  questions: ChoiceQuestion[];
  resolve: (answers: ChoiceAnswers) => void;
};

let current: ChoiceRequest | null = null;
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function subscribeChoices(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function getChoiceRequest() {
  return current;
}

/** The suggested option of each question. */
export function suggestedAnswers(questions: ChoiceQuestion[]): ChoiceAnswers {
  return Object.fromEntries(questions.map((q) => [q.id, { optionIds: [q.suggested] }]));
}

/**
 * Shows the popup and waits for the user. No questions: resolves at once. Abort: resolves with
 * the suggested options (the caller checks the signal). One request at a time.
 */
export function requestChoices(title: string, questions: ChoiceQuestion[], signal?: AbortSignal): Promise<ChoiceAnswers> {
  if (questions.length === 0) return Promise.resolve({});
  return new Promise((resolve) => {
    const finish = (answers: ChoiceAnswers) => {
      if (current?.id !== request.id) return;
      current = null;
      emit();
      resolve(answers);
    };
    const request: ChoiceRequest = { id: nextId++, title, questions, resolve: finish };
    current?.resolve(suggestedAnswers(current.questions));
    current = request;
    signal?.addEventListener("abort", () => finish(suggestedAnswers(questions)), { once: true });
    emit();
  });
}
