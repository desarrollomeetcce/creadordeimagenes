"use client";
import type { TrialDirectory } from "../../lib/meta-ads/inventory-trials";
import type { ReplacementUsageFilter } from "../../lib/meta-ads/inventory-replacement-groups";
import { countryName } from "../../lib/meta-ads/countries";
export function InventoryReplacementGroupFilter({
  directory,
  country,
  groupId,
  usage,
  busy,
  onChange,
}: {
  directory: TrialDirectory;
  country: string;
  groupId: string;
  usage: ReplacementUsageFilter;
  busy: boolean;
  onChange: (groupId: string, usage: ReplacementUsageFilter) => void;
}) {
  return (
    <div className="inventory-replacement-group-filter">
      <label>
        Diplomados de un grupo
        <select
          aria-label="Grupo de los reemplazos"
          value={groupId}
          disabled={busy}
          onChange={(e) => onChange(e.target.value, usage)}
        >
          <option value="">Todos los grupos</option>
          {directory.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.members.length})
            </option>
          ))}
        </select>
      </label>
      <label>
        Uso en {countryName(country)}
        <select
          aria-label="Uso de los reemplazos en el país"
          value={usage}
          disabled={busy}
          onChange={(e) =>
            onChange(groupId, e.target.value as ReplacementUsageFilter)
          }
        >
          <option value="ALL">Todos</option>
          <option value="UNUSED">Sin usar</option>
          <option value="USED">Usado</option>
        </select>
      </label>
      <small>
        El uso corresponde a este país. Los antecedentes se abren al pedirlos.
      </small>
    </div>
  );
}
