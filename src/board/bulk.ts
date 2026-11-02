import type { TskError } from "../api/types";

export interface BulkResult {
  ok: number[];
  failed: { number: number; error: TskError }[];
}

/** Runs `run` for each number in order, one at a time (tsk holds a store lock). Failures do not stop the run. */
export async function runBulk(numbers: number[], run: (n: number) => Promise<void>): Promise<BulkResult> {
  const result: BulkResult = { ok: [], failed: [] };
  for (const number of numbers) {
    try {
      await run(number);
      result.ok.push(number);
    } catch (error) {
      result.failed.push({ number, error: error as TskError });
    }
  }
  return result;
}
