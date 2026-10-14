import type { Fetch } from "../../shared/http";
import { AsyncLocalStorage } from "node:async_hooks";
const context = new AsyncLocalStorage<{
  deadline: number;
  signal: AbortSignal;
}>();
export function remainingMailTime() {
  const value = context.getStore();
  return value ? Math.max(0, value.deadline - Date.now()) : undefined;
}
export async function withMailDeadline<T>(
  deadline: Date,
  run: () => Promise<T>,
): Promise<T> {
  const controller = new AbortController(),
    timer = setTimeout(
      () => controller.abort(),
      Math.max(1, deadline.getTime() - Date.now()),
    );
  try {
    return await context.run(
      { deadline: deadline.getTime(), signal: controller.signal },
      run,
    );
  } finally {
    clearTimeout(timer);
  }
}
export const mailFetch: Fetch = (input, init) => {
  const value = context.getStore();
  return fetch(
    input,
    value
      ? {
          ...init,
          signal: AbortSignal.any([
            value.signal,
            ...(init?.signal ? [init.signal] : []),
          ]),
        }
      : init,
  );
};
