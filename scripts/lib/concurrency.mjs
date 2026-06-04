/**
 * Run async task functions with a bounded concurrency limit.
 * @param {Array<() => Promise<any>>} tasks - Array of zero-arg async functions
 * @param {number} limit - Max concurrent tasks
 * @param {(result: any, index: number) => void} [onComplete] - Called as each task finishes
 * @returns {Promise<any[]>} Results in original task order
 */
export async function parallelLimit(tasks, limit, onComplete) {
  const results = new Array(tasks.length);
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      const result = await tasks[idx]();
      results[idx] = result;
      onComplete?.(result, idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}
