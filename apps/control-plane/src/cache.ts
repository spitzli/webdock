import { RedisClient } from "bun";
type Key = {
  kind: "branding" | "catalog" | "usage";
  environment: string;
  customerID: string;
  resourceID: string;
  revision: string;
};
type Store = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
};
async function bounded<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error("Cache timeout")), 100);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
/** Public presentation data, or views after live authorization. Never decides access or quota admission. */
export class ViewCache {
  private unavailableUntil = 0;
  constructor(private readonly store: Store) {}
  async read<T>(key: Key, load: () => Promise<T>): Promise<T> {
    const name =
      "webdock:view:" +
      JSON.stringify([
        key.environment,
        key.kind,
        key.customerID,
        key.resourceID,
        key.revision,
      ]);
    if (this.unavailableUntil > Date.now()) return load();
    try {
      const cached = await bounded(this.store.get(name));
      if (cached !== null) return JSON.parse(cached) as T;
    } catch {
      this.unavailableUntil = Date.now() + 10_000;
      return load();
    }
    const value = await load();
    const encoded = JSON.stringify(value);
    if (encoded !== undefined && Buffer.byteLength(encoded) <= 512 * 1024) {
      try {
        await bounded(this.store.set(name, encoded));
      } catch {
        this.unavailableUntil = Date.now() + 10_000;
      }
    }
    return value;
  }
}
export function connectViewCache(url: string) {
  const redis = new RedisClient(url, {
    connectionTimeout: 100,
    autoReconnect: false,
    maxRetries: 0,
    enableOfflineQueue: false,
  });
  return {
    cache: new ViewCache({
      get: async (key) => {
        // Offline queuing is disabled: establish the connection before GET.
        // The view wrapper bounds this wait and falls back to its loader.
        if (!redis.connected) await redis.connect();
        return redis.get(key);
      },
      set: (key, value) => redis.send("SET", [key, value, "EX", "60"]),
    }),
    close: () => redis.close(),
  };
}
