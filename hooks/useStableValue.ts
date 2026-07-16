import { useRef } from "react";

/**
 * Returns the same reference across renders as long as `value` is deep-equal
 * to the last one returned, instead of whatever new reference was just
 * computed. Use this when a value comes from a `useMemo` whose dependency is
 * coarser than the value itself (e.g. memoized off a broad store object that
 * gets a new top-level reference on every unrelated mutation) — without it,
 * every downstream `useEffect`/`useMemo` keyed on that value re-runs on every
 * such mutation even though the content it actually cares about is unchanged.
 */
export function useStableValue<T>(value: T): T {
  const ref = useRef(value);
  if (JSON.stringify(ref.current) !== JSON.stringify(value)) {
    ref.current = value;
  }
  return ref.current;
}
