import { useEffect, useRef, useState } from "react";

/** 通用轮询 hook: 立即执行 + 固定间隔刷新
 *  - 上一轮完成后才排下一轮, 组件卸载自动停止
 *  - 后台标签页(hidden)暂停轮询, 回到前台立即补拉一次并恢复
 *  - 传入 isEqual 且新旧数据相等时复用旧引用, 避免下游无效重渲染 */
export function usePolling<T>(
  fn: () => Promise<T>,
  interval: number,
  deps: unknown[] = [],
  isEqual?: (a: T, b: T) => boolean,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState(0);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  const isEqualRef = useRef(isEqual);

  useEffect(() => {
    fnRef.current = fn;
    isEqualRef.current = isEqual;
  });

  useEffect(() => {
    let dead = false;
    let timer = 0;
    const schedule = () => {
      // 后台标签页不排下一轮, 等 visibilitychange 唤醒
      if (!document.hidden) timer = window.setTimeout(run, interval);
    };
    const run = async () => {
      try {
        const d = await fnRef.current();
        if (!dead) {
          setData((prev) => (prev !== null && isEqualRef.current?.(prev, d) ? prev : d));
          setError(null);
          setUpdated(Date.now());
        }
      } catch (e) {
        if (!dead) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!dead) {
          setLoading(false);
          schedule();
        }
      }
    };
    const onVisibility = () => {
      window.clearTimeout(timer);
      if (!document.hidden && !dead) void run();
    };
    void run();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      dead = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval, ...deps]);

  return { data, error, updated, loading };
}
