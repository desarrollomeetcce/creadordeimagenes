"use client";
import type { LinkedCampaignCountryCount } from "../../lib/meta-ads/linked-campaign-counts";
import { countryName } from "../../lib/meta-ads/countries";

export function MetaCountryCampaigns({
  countries,
  canCreate,
  loading,
}: {
  countries: LinkedCampaignCountryCount[] | null;
  canCreate: boolean;
  loading: boolean;
}) {
  if (!canCreate && !countries?.length) return null;
  return (
    <div className="meta-country-campaigns" data-has-countries={!!countries?.length || undefined}>
      {canCreate && (
        <a
          className="meta-create-campaign"
          href="/?view=projects"
          target="_blank"
          rel="noopener noreferrer"
          title="Crear campaña en Proyectos · abre otra pestaña"
        >
          <span aria-hidden="true">＋</span> Crear campaña{" "}
          <span aria-hidden="true">↗</span>
        </a>
      )}
      <div
        className="meta-country-counts"
        role="group"
        aria-label="Campañas activas vinculadas por país en las cuentas seleccionadas"
        aria-busy={loading}
        tabIndex={countries?.length ? 0 : undefined}
      >
        {countries?.map(({ country, active }) => (
          <span
            className="meta-country-count"
            key={country}
            title={`${countryName(country)}: ${active} campañas activas vinculadas a diplomado y país. Todas las campañas de las cuentas seleccionadas; no solo esta página o selección. Estado actual guardado, independiente del período de gasto.`}
            aria-label={`${countryName(country)}: ${active} campañas activas vinculadas`}
          >
            <span className="meta-country-count-dot" aria-hidden="true" />
            <abbr title={countryName(country)}>{country}</abbr>
            <strong>{active}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}
