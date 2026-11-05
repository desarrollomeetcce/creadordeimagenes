"use client";
import { createContext, useContext } from "react";
import { roleLabels, roleAbilities } from "../../lib/roles";
export const CurrentUserId = createContext("");
export const CurrentRole = createContext("OBSERVER");
export const useCanEdit = () => useContext(CurrentRole) !== "OBSERVER";
export function RoleGuide({
  name,
  role,
  compact = false,
}: {
  name: string;
  role: string;
  compact?: boolean;
}) {
  return (
    <details className={"role-guide" + (compact ? " role-guide-compact" : "")}>
      <summary>
        {compact ? (
          <>
            {name} · {roleLabels[role] ?? role}
          </>
        ) : (
          <>
            Hola {name}, tu rol es {roleLabels[role] ?? role}. Consulta lo que
            puedes hacer.
          </>
        )}
      </summary>
      <ul>
        {(roleAbilities[role] ?? []).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </details>
  );
}
