"use client";
import { useState } from "react";
import { Library } from "./library-explorer";
import { JobsPanel } from "./jobs-panel";
import { useCanEdit } from "./role-guide";
export function LibraryWorkspace({
  production = false,
}: {
  production?: boolean;
}) {
  const canEdit = useCanEdit();
  const [tab, setTab] = useState(() =>
    canEdit &&
    (production ||
      (typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("tab")) ===
        "production")
      ? "production"
      : "images",
  );
  const choose = (value: string) => {
    if (value === tab) return;
    if (
      !window.dispatchEvent(new Event("production-leave", { cancelable: true }))
    )
      return;
    const p = new URLSearchParams(window.location.search);
    p.set("view", "library");
    p.set("tab", value);
    // The active pane writes its current hierarchy to the URL before switching.
    history.replaceState(null, "", "?" + p);
    setTab(value);
  };
  return (
    <section className="stack library-workspace">
      <h1>Biblioteca</h1>
      <div
        className="workspace-tabs"
        role="tablist"
        aria-label="Vistas de Biblioteca"
        onKeyDown={(e) => {
          const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
          if (!keys.includes(e.key)) return;
          e.preventDefault();
          const next =
            e.key === "Home"
              ? "images"
              : e.key === "End"
                ? canEdit
                  ? "production"
                  : "images"
                : tab === "images" && canEdit
                  ? "production"
                  : "images";
          choose(next);
          document
            .getElementById(next === "images" ? "images-tab" : "production-tab")
            ?.focus();
        }}
      >
        <button
          type="button"
          id="images-tab"
          role="tab"
          aria-controls="library-pane"
          tabIndex={tab === "images" ? 0 : -1}
          aria-selected={tab === "images"}
          onClick={() => choose("images")}
        >
          Afiches y archivos
        </button>
        {canEdit && (
          <button
            type="button"
            id="production-tab"
            role="tab"
            aria-controls="library-pane"
            tabIndex={tab === "production" ? 0 : -1}
            aria-selected={tab === "production"}
            onClick={() => choose("production")}
          >
            Producción y revisión
          </button>
        )}
      </div>
      <div
        id="library-pane"
        role="tabpanel"
        aria-labelledby={tab === "images" ? "images-tab" : "production-tab"}
      >
        {tab === "production" ? <JobsPanel /> : <Library />}
      </div>
    </section>
  );
}
