"use client";
import { useEffect, useState } from "react";
const key = "estudio-appearance";
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const sync = () => setDark(document.documentElement.dataset.theme === "dark");
    sync();
    const storage = (event: StorageEvent) => {
      if (event.key !== key) return;
      const value = event.newValue === "dark" ? "dark" : "light";
      document.documentElement.dataset.theme = value;
      sync();
    };
    window.addEventListener("storage", storage);
    return () => window.removeEventListener("storage", storage);
  }, []);
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      aria-pressed={dark}
      title={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      onClick={() => {
        const value = dark ? "light" : "dark";
        document.documentElement.dataset.theme = value;
        setDark(!dark);
        try { localStorage.setItem(key, value); } catch { /* Appearance still works without storage. */ }
      }}
    >
      <span aria-hidden="true">{dark ? "☀" : "☾"}</span>
      {dark ? "Modo claro" : "Modo oscuro"}
    </button>
  );
}
