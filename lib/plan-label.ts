export function planLabel(plan: {
  name: string;
  customUserId?: string | null;
}) {
  return (plan.customUserId ? "Personalizado · " : "") + plan.name;
}
