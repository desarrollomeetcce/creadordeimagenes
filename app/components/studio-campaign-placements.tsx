"use client";
import {
  platformNames,
  eligiblePlatforms,
  eligiblePositions,
  placementChoices,
  type CampaignPlatform,
} from "../../lib/creative-studio/campaign-workbench-policy";
import type { CampaignConfig } from "../../lib/creative-studio/campaign-policy";
export function StudioCampaignPlacements({
  value,
  onChange,
  readonly = false,
}: {
  value: CampaignConfig;
  onChange: (patch: Partial<CampaignConfig>) => void;
  readonly?: boolean;
}) {
  return (
    <section className="studio-placement-workbench">
      <div className="studio-platform-grid">
        {(Object.keys(platformNames) as CampaignPlatform[]).map((platform) => {
          const available = eligiblePlatforms(value.objective).includes(
              platform,
            ),
            active = value.platforms.includes(platform),
            selected = value.placements?.[platform];
          return (
            <div
              className={"studio-platform " + (active ? "selected" : "")}
              key={platform}
            >
              <label>
                <input
                  aria-label={"Plataforma " + platformNames[platform]}
                  type="checkbox"
                  disabled={readonly || (!available && !active)}
                  checked={active}
                  onChange={(e) =>
                    onChange({
                      platforms: e.target.checked
                        ? [...value.platforms, platform]
                        : value.platforms.filter((p) => p !== platform),
                    })
                  }
                />
                <strong>{platformNames[platform]}</strong>
                <small>
                  {active
                    ? selected?.length
                      ? selected.length + " ubicaciones"
                      : "Todas las compatibles"
                    : "Sin seleccionar"}
                </small>
              </label>
              {active && (
                <details>
                  <summary>Elegir ubicaciones</summary>
                  <label className="studio-check">
                    <input
                      type="checkbox"
                      disabled={readonly}
                      checked={!selected}
                      onChange={(e) => {
                        const positions = { ...value.placements };
                        if (e.target.checked) delete positions[platform];
                        else
                          positions[platform] = eligiblePositions(
                            value.objective,
                            platform,
                          ).map((p) => p.id);
                        onChange({ placements: positions });
                      }}
                    />
                    Todas las compatibles
                  </label>
                  {eligiblePositions(value.objective, platform).map((p) => (
                    <label className="studio-check" key={p.id}>
                      <input
                        type="checkbox"
                        disabled={readonly}
                        checked={!selected || selected.includes(p.id)}
                        onChange={(e) => {
                          const positions =
                              selected ??
                              eligiblePositions(value.objective, platform).map(
                                (p) => p.id,
                              ),
                            next = e.target.checked
                              ? [...positions.filter((id) => id !== p.id), p.id]
                              : positions.filter((id) => id !== p.id);
                          if (!next.length) {
                            onChange({
                              platforms: value.platforms.filter(
                                (v) => v !== platform,
                              ),
                            });
                            return;
                          }
                          onChange({
                            placements: {
                              ...value.placements,
                              [platform]: next,
                            },
                          });
                        }}
                      />
                      {p.name}
                    </label>
                  ))}
                </details>
              )}
            </div>
          );
        })}
      </div>
      <label className="studio-placement-spend">
        <input
          aria-label="Permitir gasto limitado en ubicaciones excluidas"
          type="checkbox"
          disabled={readonly}
          checked={value.allowExcludedPlacementSpend ?? false}
          onChange={(e) =>
            onChange({ allowExcludedPlacementSpend: e.target.checked })
          }
        />
        <span>
          Permitir gasto limitado en ubicaciones excluidas
          <small>
            {value.allowExcludedPlacementSpend
              ? "Meta podrá utilizar parte del presupuesto en esas ubicaciones."
              : "Desactivado: se mantiene la exclusión de ubicaciones."}
          </small>
        </span>
      </label>
      {readonly && (
        <small>Se conservan las ubicaciones del conjunto existente.</small>
      )}
    </section>
  );
}
