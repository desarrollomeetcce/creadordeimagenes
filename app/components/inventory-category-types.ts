export type InventoryCategory = {
  id: string;
  name: string;
  kind: "PRIMARY" | "SECONDARY";
};
export type InventoryCategoryState = {
  listId: string;
  revision: number;
  categories: InventoryCategory[];
  relations: { primaryId: string; secondaryId: string }[];
  assignments: Record<string, string[]>;
  items?: { id: string; name: string }[];
};
export type InventoryCategoryAction =
  | {
      action: "IMPORT";
      rows: { primary: string; secondary: string }[];
      targetIds?: string[];
      decisions?: import("../../lib/meta-ads/inventory-duplicates").InventoryNameDecision[];
    }
  | {
      action: "ASSIGN";
      ids: string[];
      expectedName: string;
      categoryIds: string[];
    }
  | {
      action: "MOVE";
      ids: string[];
      expectedName: string;
      categoryId: string;
      toKind: "PRIMARY" | "SECONDARY";
      decisions?: import("../../lib/meta-ads/inventory-duplicates").InventoryNameDecision[];
    }
  | {
      action: "ASSIGN_LEVEL";
      ids: string[];
      expectedName: string;
      kind: "PRIMARY" | "SECONDARY";
      names: string[];
      decisions?: import("../../lib/meta-ads/inventory-duplicates").InventoryNameDecision[];
    }
  | { action: "DELETE"; categoryId: string }
  | { action: "DELETE_MANY"; categoryIds: string[] };
