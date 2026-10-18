"use client";
import { createContext, useContext } from "react";
import { roleLabels, roleAbilities } from "../../lib/roles";
export const CurrentUserId = createContext("");
export const CurrentRole = createContext("OBSERVER");
export const useCanEdit = () => useContext(CurrentRole) !== "OBSERVER";
export function RoleGuide({ name, role }: { name: string; role: string }) {
  return (
    <details className="role-guide">
      <summary>
        Hola {name}, tu rol es {roleLabels[role] ?? role}. Consulta lo que
        puedes hacer.
      </summary>
      <ul>
        {(roleAbilities[role] ?? []).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </details>
  );
}
