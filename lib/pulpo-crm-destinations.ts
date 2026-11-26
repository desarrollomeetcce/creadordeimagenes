export const crmDestinations = {
  performance: "/?section=Vista%20general",
  accounts: "/?section=Subcuentas",
  conversations: "/?section=Conversaciones",
  facebook: "/?section=Messenger",
  calls: "/calls",
  books: "/books",
  "countries-prices": "/?section=Pa%C3%ADses%20y%20cuentas",
  "product-labels": "/?section=Productos",
  "funnel-labels": "/?section=Etiquetas",
  "bot-costs": "/?section=Costos%20de%20IA",
  "bot-ai": "/?section=Ajustes%20IA",
  account: "/account",
  contacts: "/?section=Contactos%20y%20CRM",
} as const;

export function crmDestination(id: string) {
  return Object.hasOwn(crmDestinations, id)
    ? crmDestinations[id as keyof typeof crmDestinations]
    : null;
}
