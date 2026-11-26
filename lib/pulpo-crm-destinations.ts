export const crmDestinations = {
  performance: "/?section=Vista%20general",
  accounts: "/?section=Subcuentas",
  conversations: "/?section=Conversaciones",
  facebook: "/?section=Messenger",
  calls: "/calls",
  books: "/books",
  contacts: "/?section=Contactos%20y%20CRM",
} as const;

export function crmDestination(id: string) {
  return Object.hasOwn(crmDestinations, id)
    ? crmDestinations[id as keyof typeof crmDestinations]
    : null;
}
