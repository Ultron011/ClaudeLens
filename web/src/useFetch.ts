import { useCallback, useEffect, useRef, useState } from 'react';

export interface FetchState<T> {
  data: T | null;
  err: string;
  loading: boolean;
  refetch: () => void;
}

/**
 * Fetch on mount / dep change, abort the in-flight request on unmount or the next dep change,
 * and keep the previous `data` around while a refetch is in flight (no loading flash).
 */
export function useFetch<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setErr('');
    fnRef
      .current(ac.signal)
      .then((d) => {
        if (ac.signal.aborted) return;
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        if (ac.signal.aborted) return;
        // ApiError carries the server's own message; String(e) would prefix "Error: ".
        setErr(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);
  return { data, err, loading, refetch };
}
