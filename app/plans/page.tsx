import { MarketingSite } from "../components/marketing-site";
import { publicSite } from "../../lib/site-content";
import { plansCatalog } from "../../lib/membership-plans";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "estudio AI · De una idea a toda una campaña",
  description:
    "Organiza proyectos, crea variaciones de afiches con IA y comparte resultados con tu equipo. Descubre funcionalidades y planes.",
};
export default async function PlansPage() {
  const [site, plans] = await Promise.all([publicSite(), plansCatalog()]);
  return <MarketingSite content={site.content} plans={plans} />;
}
