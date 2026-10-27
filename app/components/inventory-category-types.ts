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
};
export type InventoryCategoryAction =
  | {
      action: "IMPORT";
      rows: { primary: string; secondary: string }[];
      targetIds?: string[];
    }
  | {
      action: "ASSIGN";
      ids: string[];
      expectedName: string;
      categoryIds: string[];
    }
  | { action: "DELETE"; categoryId: string }
  | { action: "DELETE_MANY"; categoryIds: string[] };
