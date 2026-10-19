type Source = {
  deletedAt?: Date | string | null;
  category: {
    deletedAt?: Date | string | null;
    project: { deletedAt?: Date | string | null };
  };
};
export function deletedSourceNotice(source: Source | null | undefined) {
  if (source?.deletedAt) return "Viene de un subproducto eliminado";
  if (source?.category.deletedAt) return "Viene de un producto eliminado";
  if (source?.category.project.deletedAt)
    return "Viene de un proyecto eliminado";
  return null;
}
