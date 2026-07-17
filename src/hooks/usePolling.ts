import { useEffect, useRef, useState } from "react";

/** 通用轮询 hook: 立即执行 + 固定间隔刷新 */
export function usePolling<T>(fn: () => Promise<T>, interval: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let dead = false;
    let timer = 0;
    const run = async () => {
      try {
        const d = await fnRef.current();
        if (!dead) {
          setData(d);
          setError(null);
          setUpdated(Date.now());
        }
      } catch (e) {
        if (!dead) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!dead) timer = window.setTimeout(run, interval);
      }
    };
    run();
    return () => {
      dead = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval, ...deps]);

  return { data, error, updated };
}
