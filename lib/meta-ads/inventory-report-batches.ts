/** The report endpoint authorizes at most twenty real sheets per request. */
export function inventoryReportBatches(ids: readonly string[]) {
  const unique = [...new Set(ids)];
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += 20)
    batches.push(unique.slice(i, i + 20));
  return batches;
}
