import type { Turn } from "@/lib/events/reducer";

export const splitWords = (text: string) => text.split(/\s+/).filter(Boolean);

/**
 * Index of the word currently being spoken. Words before it are "spoken", words after
 * it are upcoming; `words.length` means the whole turn has been spoken.
 * With word timings (transcript.final.words) the highlight follows the audio clock,
 * otherwise it follows the newest streamed delta.
 */
export function activeWordIndex(turn: Turn, now: number): number {
  const count = splitWords(turn.text).length;
  const timings = turn.words;
  if (timings?.length) {
    const elapsed = now - turn.startedAt;
    const lastTiming = timings[timings.length - 1]!;
    if (turn.final && elapsed >= lastTiming.endMs) return count;
    let i = 0;
    while (i + 1 < timings.length && timings[i + 1]!.startMs <= elapsed) i++;
    // Streaming text without timings for the newest words: stay on the newest word.
    if (!turn.final && count > timings.length) return count - 1;
    return Math.min(i, count);
  }
  return turn.final ? count : Math.max(0, count - 1);
}

/**
 * Estimated word timings for a turn whose text arrives as a whole (ElevenLabs messages),
 * so the highlight still walks along while Jarvis speaks. ~2.9 words/s German speech.
 */
export function estimateWordTimings(text: string, msPerWord = 340) {
  return splitWords(text).map((word, i) => ({ word, startMs: i * msPerWord, endMs: (i + 1) * msPerWord }));
}
