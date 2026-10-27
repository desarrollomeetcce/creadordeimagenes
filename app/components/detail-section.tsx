"use client";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
const SectionState = createContext<{
  closed: Record<string, boolean>;
  setClosed: (key: string, value: boolean) => void;
} | null>(null);
/** Keep disclosure state while a report refreshes or changes date windows. No financial persistence. */
export function DetailSections({ children }: { children: ReactNode }) {
  const [closed, setClosedState] = useState<Record<string, boolean>>({});
  const setClosed = useCallback(
    (key: string, value: boolean) =>
      setClosedState((old) =>
        old[key] === value || (!value && old[key] === undefined)
          ? old
          : { ...old, [key]: value },
      ),
    [],
  );
  const state = useMemo(() => ({ closed, setClosed }), [closed, setClosed]);
  return (
    <SectionState.Provider value={state}>{children}</SectionState.Provider>
  );
}
export function DetailSection({
  stateKey,
  title,
  tone = "parameters",
  id,
  className = "",
  children,
}: {
  stateKey: string;
  title: ReactNode;
  tone?: string;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const state = useContext(SectionState),
    [localClosed, setLocalClosed] = useState(false);
  const closed = state ? !!state.closed[stateKey] : localClosed;
  return (
    <details
      id={id}
      className={`detail-fold ${className}`}
      open={!closed}
      data-detail-section={stateKey}
      onToggle={(e) => {
        const value = !e.currentTarget.open;
        if (state) state.setClosed(stateKey, value);
        else setLocalClosed(value);
      }}
    >
      <summary
        className="detail-fold-summary"
        title="Pulsa para plegar o desplegar esta sección"
      >
        <h3 className={`detail-section-title detail-section-${tone}`}>
          {title}
        </h3>
      </summary>
      <div className="detail-fold-body">{children}</div>
    </details>
  );
}
