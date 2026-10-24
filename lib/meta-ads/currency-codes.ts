export const currencyCodes = Intl.supportedValuesOf("currency");
const currencies = new Set(currencyCodes);
export const isCurrency = (v: string) => v === "" || currencies.has(v);
