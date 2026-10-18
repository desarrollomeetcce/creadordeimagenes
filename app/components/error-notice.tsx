"use client";
import { useEffect, useState } from "react";
function fingerprint(text: string) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++)
    value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return (value >>> 0).toString(36);
}
/** Acknowledges this notice in this tab; never changes job or billing state. */
export function ErrorNotice({
  message,
  acknowledgementKey,
  onDismiss,
}: {
  message: string;
  acknowledgementKey?: string;
  onDismiss?: () => void;
}) {
  const key = `studio-notice:${acknowledgementKey ?? "local"}:${fingerprint(message)}`;
  const [hidden, setHidden] = useState<string | null>(null);
  useEffect(() => {
    if (!acknowledgementKey) return;
    try {
      setHidden(sessionStorage.getItem(key) === "seen" ? key : null);
    } catch {}
  }, [key, acknowledgementKey]);
  if (!message || hidden === key) return null;
  return (
    <div role="alert" className="notice error dismissible-notice">
      <span>{message}</span>
      <button
        type="button"
        aria-label="Ya lo vi: cerrar aviso de error"
        title="Ya lo vi"
        onClick={() => {
          setHidden(key);
          if (acknowledgementKey)
            try {
              sessionStorage.setItem(key, "seen");
            } catch {}
          onDismiss?.();
        }}
      >
        ×
      </button>
    </div>
  );
}
