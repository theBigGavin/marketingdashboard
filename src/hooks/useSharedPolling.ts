import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

interface Snapshot<T> {
  data: T | null;
  error: string | null;
  updated: number;
}

interface SharedEntry<T> {
  snapshot: Snapshot<T>;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setTimeout> | null;
  fn: () => Promise<T>;
  intervalMs: number;
}

/** 模块级共享轮询注册表: 同 key 的所有订阅者共享同一条轮询循环与数据缓存 */
const registry = new Map<string, SharedEntry<unknown>>();

async function tick<T>(key: string, entry: SharedEntry<T>) {
  try {
    const data = await entry.fn();
    if (!registry.has(key)) return; // 等待期间已无订阅者
    entry.snapshot = { data, error: null, updated: Date.now() };
  } catch (e) {
    if (!registry.has(key)) return;
    entry.snapshot = { ...entry.snapshot, error: e instanceof Error ? e.message : String(e) };
  }
  entry.listeners.forEach((l) => l());
  // 后台标签页不排下一轮, 等 visibilitychange 唤醒
  if (registry.has(key) && !document.hidden) {
    entry.timer = setTimeout(() => void tick(key, entry), entry.intervalMs);
  }
}

function acquire<T>(key: string, fn: () => Promise<T>, intervalMs: number): SharedEntry<T> {
  let entry = registry.get(key) as SharedEntry<T> | undefined;
  if (!entry) {
    entry = {
      snapshot: { data: null, error: null, updated: 0 },
      listeners: new Set(),
      timer: null,
      fn,
      intervalMs,
    };
    registry.set(key, entry as SharedEntry<unknown>);
    void tick(key, entry); // 首个订阅者挂载: 立即拉取
  }
  return entry;
}

function release(key: string, listener: () => void) {
  const entry = registry.get(key);
  if (!entry) return;
  entry.listeners.delete(listener);
  if (entry.listeners.size === 0) {
    // 最后一个订阅者卸载: 停止轮询并清除缓存
    if (entry.timer) clearTimeout(entry.timer);
    registry.delete(key);
  }
}

// 后台标签页暂停所有共享轮询, 回到前台立即补拉一次
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    for (const [key, entry] of registry) {
      if (entry.timer) {
        clearTimeout(entry.timer);
        entry.timer = null;
      }
      if (!document.hidden) void tick(key, entry);
    }
  });
}

const EMPTY: Snapshot<never> = { data: null, error: null, updated: 0 };

/** 共享轮询: 同 key 的多个组件实例共享同一定时器与数据
 *  (注意: 同 key 的调用方需传入等价的 fn, 首个订阅者的 intervalMs 生效) */
export function useSharedPolling<T>(
  key: string,
  fn: () => Promise<T>,
  intervalMs: number,
): { data: T | null; error: string | null; updated: number } {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const entry = acquire(key, () => fnRef.current(), intervalMs);
      entry.listeners.add(onStoreChange);
      return () => release(key, onStoreChange);
    },
    [key, intervalMs],
  );

  return useSyncExternalStore(
    subscribe,
    () => (registry.get(key) as SharedEntry<T> | undefined)?.snapshot ?? (EMPTY as Snapshot<T>),
  );
}
