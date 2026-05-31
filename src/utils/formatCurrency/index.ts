const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const COMPACT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
  signDisplay: "always",
});

export const formatCurrency = (amount: number): string => USD.format(amount);
export const formatSignedCompact = (amount: number): string =>
  COMPACT.format(amount);
