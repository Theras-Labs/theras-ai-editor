// Pure state helpers for the choice popup (components/editor-shell/ChoicePopup.tsx).
// The contract types live in director/types.ts; the popup state lives in choices.ts.
import type { ChoiceAnswers, ChoiceQuestion } from "./director/types";

/** Selected option ids by question id. */
export type ChoiceSelection = Record<string, string[]>;

/** The suggested option of each question (an unknown suggested id falls back to the first option). */
export function initialSelection(questions: ChoiceQuestion[]): ChoiceSelection {
  return Object.fromEntries(
    questions.map((q) => {
      const known = q.options.some((o) => o.id === q.suggested);
      const first = known ? q.suggested : q.options[0]?.id;
      return [q.id, first ? [first] : []];
    })
  );
}

/**
 * Click on an option. Single choice: that option only. Multiple: toggles it, but the last
 * selected option stays (a question never ends with no answer).
 */
export function toggleOption(selection: ChoiceSelection, question: ChoiceQuestion, optionId: string): ChoiceSelection {
  if (!question.options.some((o) => o.id === optionId)) return selection;
  const current = selection[question.id] ?? [];
  if (!question.multiple) return { ...selection, [question.id]: [optionId] };
  if (current.includes(optionId)) {
    if (current.length === 1) return selection;
    return { ...selection, [question.id]: current.filter((id) => id !== optionId) };
  }
  // Keep the order of the options, not the order of the clicks.
  const next = question.options.map((o) => o.id).filter((id) => id === optionId || current.includes(id));
  return { ...selection, [question.id]: next };
}

/**
 * The answers for requestChoices. The note goes into EVERY answer of the request, because
 * each generator reads only its own question id and the user writes one note for the popup.
 * An empty or blank note is left out.
 */
export function assembleAnswers(questions: ChoiceQuestion[], selection: ChoiceSelection, note: string): ChoiceAnswers {
  const text = note.trim().slice(0, 500);
  const fallback = initialSelection(questions);
  return Object.fromEntries(
    questions.map((q) => {
      const picked = (selection[q.id] ?? []).filter((id) => q.options.some((o) => o.id === id));
      const optionIds = picked.length > 0 ? picked : (fallback[q.id] ?? []);
      return [q.id, text ? { optionIds, note: text } : { optionIds }];
    })
  );
}
