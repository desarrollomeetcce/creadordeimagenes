import {
  cacStatusNames,
  type CacStatus,
} from "../../lib/meta-ads/inventory-cac-policy";
export function InventoryCacStatus({ status }: { status: CacStatus }) {
  return (
    <>
      <span
        className={"inventory-status-dot inventory-status-dot-" + status}
        aria-hidden="true"
      />
      {cacStatusNames[status]}
    </>
  );
}
