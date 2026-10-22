import { publicSite } from "../../lib/site-content";
import { PrivacyRequestForm } from "../components/privacy-request-form";
export const dynamic = "force-dynamic";
export const metadata = { title: "Contacto y solicitudes de privacidad · PULPO ANALISIS Y AUTO", robots: { index: false, follow: true } };
export default async function Page() {
  const { content } = await publicSite();
  return <div className="legal-site"><header><a href="/plans">{content.hero.brand}</a><a href="/">Ingresar</a></header><main><h1>Contacto y solicitudes de privacidad</h1><p>PULPO ANALISIS Y AUTO · Responsable: {content.legal.operatorName}</p><p>Consulta nuestra <a href="/privacidad">política de privacidad</a> y las <a href="/eliminacion-de-datos">instrucciones para eliminar datos</a>. El formulario está disponible sin iniciar sesión.</p><PrivacyRequestForm /></main><footer><a href="/terminos">Términos del servicio</a> · <a href="/privacidad">Política de privacidad</a></footer></div>;
}
