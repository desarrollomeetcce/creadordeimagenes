"use client";
import {
  addMetaSearchPhrase,
  META_SEARCH_MAX,
} from "../../lib/meta-ads/keyword-search";

export function MetaKeywordSearch({
  value,
  draft,
  onChange,
  onDraftChange,
  expanded = false,
}: {
  value: string;
  draft: string;
  onChange: (value: string) => void;
  onDraftChange: (value: string) => void;
  expanded?: boolean;
}) {
  const terms = value.split("\n").filter(Boolean);
  const remaining = Math.max(
    0,
    META_SEARCH_MAX - value.length - (value ? 1 : 0),
  );
  return (
    <div
      className={`meta-keyword-search ${expanded ? "meta-expanded-search" : ""}`}
    >
      <span>Buscar por palabra</span>
      <div className="meta-keyword-box">
        {terms.map((term, index) => (
          <span className="meta-keyword-chip" key={`${index}:${term}`}>
            <span>{term}</span>
            <button
              type="button"
              aria-label={`Quitar término ${term}`}
              onClick={() =>
                onChange(terms.filter((_, i) => i !== index).join("\n"))
              }
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="search"
          aria-label={
            expanded
              ? "Buscar por palabra en Meta Ads ampliado"
              : "Buscar campañas, conjuntos o anuncios"
          }
          placeholder={
            remaining
              ? "Buscar…"
              : "Límite de búsqueda alcanzado"
          }
          value={draft}
          maxLength={remaining}
          disabled={!remaining}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            const next = addMetaSearchPhrase(value, draft);
            if (
              next !== value ||
              !draft.trim() ||
              terms.some(
                (term) =>
                  term.toLocaleLowerCase("es") ===
                  draft.trim().toLocaleLowerCase("es"),
              )
            ) {
              onChange(next);
              onDraftChange("");
            }
          }}
        />
      </div>
    </div>
  );
}
