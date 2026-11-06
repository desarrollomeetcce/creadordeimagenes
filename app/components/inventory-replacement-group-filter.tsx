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
  onUsageNeeded,
}: {
  onUsageNeeded?:()=>void;
  directory: TrialDirectory;
  country: string;
  groupId: string;
  usage: ReplacementUsageFilter;
  busy: boolean;
  onChange: (groupId: string, usage: ReplacementUsageFilter) => void;
}) {
  return (
    <div className="inventory-replacement-group-filter" role="group" aria-label={`Por grupo y uso · ${countryName(country)}`}>
      <span className="inventory-replacement-filter-label">Por grupo y uso · {countryName(country)}</span>
      <label>
        <span className="sr-only">Por grupo</span>
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
        <span className="sr-only">Uso · {countryName(country)}</span>
        <select
          aria-label="Uso de los reemplazos en el país"
          value={usage}
          disabled={busy}
          onChange={(e) =>
            {onChange(groupId, e.target.value as ReplacementUsageFilter);if(e.target.value!=="ALL"&&directory.usageReady===false)onUsageNeeded?.();}
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
