/** Defer initialization to a request; a rejected context is retried only on later access. */
export function lazyAuth<T extends { $context: Promise<unknown> }>(create: () => T): T {
  let cached: T | undefined;
  function current(): T {
    if (!cached) {
      const instance = create();
      cached = instance;
      // Observe startup failures without replacing the promise callers await.
      // Never retry API calls: only discard the failed initialization.
      void instance.$context.catch(() => {
        if (cached === instance) cached = undefined;
      });
    }
    return cached;
  }
  return new Proxy({} as T, {
    get(target, property) {
      if (Object.hasOwn(target, property)) return Reflect.get(target, property);
      const instance = current();
      return Reflect.get(instance, property, instance);
    },
    // toNextJsHandler checks `"handler" in auth` inside each request.
    has(target, property) { return Object.hasOwn(target, property) || Reflect.has(current(), property); },
    // Preserve method introspection and explicit overrides such as node:test mocks.
    getOwnPropertyDescriptor(target, property) {
      const own = Reflect.getOwnPropertyDescriptor(target, property);
      if (own) return own;
      const descriptor = Reflect.getOwnPropertyDescriptor(current(), property);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
  });
}
