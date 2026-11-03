import { validSalesDate } from "./registered-sales";
type Range = { since: string; until: string };
/** A current short window ends today or yesterday and covers at most fourteen days. */
export function isRecentCampaignPeriod(period: Range, today: string) {
  if (![period.since, period.until, today].every(validSalesDate)) return false;
  const days =
      (Date.parse(period.until) - Date.parse(period.since)) / 86400000 + 1,
    age = (Date.parse(today) - Date.parse(period.until)) / 86400000;
  return days >= 1 && days <= 14 && age >= 0 && age <= 1;
}
/** Never substitute old/lifetime classifications for a current campaign state. */
export function campaignEvaluationWindow<T extends Range>(
  periods: Record<string, T>,
  selected: string,
  today: string,
) {
  const chosen = periods[selected];
  if (
    selected !== "lifetime" &&
    chosen &&
    (Date.parse(chosen.until) - Date.parse(chosen.since)) / 86400000 + 1 >= 7 &&
    isRecentCampaignPeriod(chosen, today)
  )
    return { key: selected, period: chosen, label: "Por el período" };
  const recent = periods["7"];
  return {
    key: "7",
    period: recent && isRecentCampaignPeriod(recent, today) ? recent : null,
    label: "Últimos 7 días",
  };
}
