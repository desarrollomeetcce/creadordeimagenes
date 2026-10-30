import { trialStatusNames } from "../../lib/meta-ads/inventory-trial-policy";
export function InventoryStatusLabel({
  status,
}: {
  status: keyof typeof trialStatusNames;
}) {
  return (
    <>
      <span
        className={"inventory-status-dot inventory-status-dot-" + status}
        aria-hidden="true"
      />
      {trialStatusNames[status]}
    </>
  );
}
