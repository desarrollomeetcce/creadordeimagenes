"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { CurrentRole, CurrentUserId } from "../components/role-guide";
import { ThemeToggle } from "../components/theme-toggle";
import type { AdvisorPeriodView } from "@/lib/meta-ads/advisor-period-history";
import "../components/meta-header.css";
import "./workspace.css";

const MetaAds = dynamic(
  () => import("../components/meta-ads").then((m) => m.MetaAds),
  {
    loading: () => <p role="status">Cargando Meta Ads…</p>,
  },
);
const ProductsCatalog = dynamic(
  () => import("../components/products-catalog").then((m) => m.ProductsCatalog),
  {
    loading: () => <p role="status">Cargando módulo…</p>,
  },
);

export function PulpoWorkspace({
  view,
  userId,
  role,
  canCreateCampaign,
}: {
  view: "metaads" | "advisors" | "products";
  userId: string;
  role: string;
  canCreateCampaign: boolean;
}) {
  const [salesPeriod, setSalesPeriod] = useState<AdvisorPeriodView | null>(
    null,
  );
  const isMeta = view === "metaads";
  const sales = view === "products" || salesPeriod !== null;

  return (
    <CurrentUserId.Provider value={userId}>
      <CurrentRole.Provider value={role}>
        <div className="workspace pulpo-embedded">
          {isMeta ? (
            <header className="topbar meta-topbar">
              <div id="meta-navigation-slot" />
              <div className="meta-topbar-actions">
                <div id="meta-share-slot" />
                <ThemeToggle />
              </div>
            </header>
          ) : (
            <header className="topbar effectiveness-topbar financial-module-topbar">
              <div className="effectiveness-topbar-title">
                <div className="effectiveness-title-line">
                  <h1>{sales ? "Ventas" : "Asesores"}</h1>
                  {view === "advisors" && sales && (
                    <button type="button" onClick={() => setSalesPeriod(null)}>
                      Volver a Asesores
                    </button>
                  )}
                  {role === "OWNER" && (
                    <button
                      className="effectiveness-share-button"
                      type="button"
                      onClick={() =>
                        window.dispatchEvent(new Event("share-effectiveness"))
                      }
                    >
                      Compartir
                    </button>
                  )}
                </div>
              </div>
            </header>
          )}
          <main className={isMeta ? "meta-main" : "effectiveness-main"}>
            {isMeta ? (
              <MetaAds
                role={role}
                userId={userId}
                canCreateCampaign={canCreateCampaign}
              />
            ) : (
              <ProductsCatalog
                key={sales ? "sales" : "advisors"}
                module={sales ? "sales" : "advisors"}
                initialAdvisorPeriod={salesPeriod}
                onSalesPeriod={setSalesPeriod}
              />
            )}
          </main>
        </div>
      </CurrentRole.Provider>
    </CurrentUserId.Provider>
  );
}
