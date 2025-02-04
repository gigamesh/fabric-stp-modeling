export const formatNum = (num: number, decimals: number = 2) => {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  }).format(num);
};
