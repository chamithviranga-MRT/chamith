/** Level-payment amortization. rate is an annual percentage (8.5 = 8.5% APR), n in months. */
export function amortizedPayment(principal: number, annualRatePct: number, n: number): number {
  if (n <= 0) return principal;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

/**
 * Effective annual rate (nominal, monthly compounding, as a percent) of receiving `proceeds` now and paying
 * `payment` monthly for `n` months. Solved by bisection. Fees paid out of proceeds raise this above the stated APR.
 */
export function effectiveApr(proceeds: number, payment: number, n: number): number {
  if (proceeds <= 0 || n <= 0 || payment * n <= proceeds) return 0;
  const pv = (r: number) => (r === 0 ? payment * n : (payment * (1 - Math.pow(1 + r, -n))) / r);
  let lo = 0;
  let hi = 10; // 1000% per month: far above anything real
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > proceeds) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * 12 * 100;
}

export const round2 = (x: number) => Math.round(x * 100) / 100;
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
