// Generates src/engine/data/historicalReturns.json — annual REAL US returns 1871–2024.
//
// Source: Robert Shiller's "Irrational Exuberance" dataset (monthly S&P composite price,
// dividends, CPI, and 10-year Treasury GS10 yield), via the datahub/datasets CSV mirror:
//   https://raw.githubusercontent.com/datasets/s-and-p-500/main/data/data.csv
// Run:  node scripts/generateHistoricalData.mjs path/to/data.csv
//
// Methodology (January observations, year t = Jan t → Jan t+1):
//   inflation_t  = CPI[t+1] / CPI[t] − 1
//   stockNom_t   = (P[t+1] + D[t]) / P[t] − 1        (dividends ≈ paid once at year end)
//   bondNom_t    = y_t + priceOf9yrBondAtNewYield − 1 (constant-maturity 10y par bond,
//                  annual coupons, rebalanced yearly — the standard approximation)
//   real         = (1 + nominal) / (1 + inflation) − 1
//
// The CSV mirror's dividend/CPI/GS10 columns end mid-2023, so Jan-2024 and Jan-2025
// observations below are hardcoded from public BLS/FRED/S&P data to extend through 2024.
// The output JSON is committed; this script never runs at app runtime.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const csvPath = process.argv[2];
if (!csvPath) {
  console.error('Usage: node scripts/generateHistoricalData.mjs path/to/shiller-data.csv');
  process.exit(1);
}

// month -> { p, d, cpi, gs10 }
const jan = new Map();
for (const line of readFileSync(csvPath, 'utf8').split('\n').slice(1)) {
  const [date, sp500, dividend, , cpi, gs10] = line.split(',');
  if (!date || !date.endsWith('-01-01')) continue;
  const year = Number(date.slice(0, 4));
  const row = { p: +sp500, d: +dividend, cpi: +cpi, gs10: +gs10 };
  if (row.p > 0 && row.d > 0 && row.cpi > 0 && row.gs10 > 0) jan.set(year, row);
}

// Extend with hand-checked January observations (see header note).
// CPI-U NSA index; GS10 %; S&P composite January average price and trailing annual dividend.
jan.set(2024, { p: 4804.5, d: 70.9, cpi: 308.417, gs10: 4.06 });
jan.set(2025, { p: 5994.6, d: 74.7, cpi: 317.671, gs10: 4.63 });

/** Price next Jan of a par bond issued this Jan at y0 (10y, annual coupon), now 9y at y1. */
function bondPrice(y0, y1) {
  if (y1 === 0) return 1 + y0 * 9;
  return (y0 / y1) * (1 - (1 + y1) ** -9) + (1 + y1) ** -9;
}

const out = [];
for (let year = 1871; year <= 2024; year++) {
  const a = jan.get(year);
  const b = jan.get(year + 1);
  if (!a || !b) continue;
  const inflation = b.cpi / a.cpi - 1;
  const stockNom = (b.p + a.d) / a.p - 1;
  const bondNom = a.gs10 / 100 + bondPrice(a.gs10 / 100, b.gs10 / 100) - 1;
  const real = (nom) => (1 + nom) / (1 + inflation) - 1;
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  out.push({ year, stock: r4(real(stockNom)), bond: r4(real(bondNom)), inflation: r4(inflation) });
}

if (out.length !== 154 || out[0].year !== 1871 || out.at(-1).year !== 2024) {
  console.error(`Unexpected coverage: ${out.length} years, ${out[0]?.year}–${out.at(-1)?.year}`);
  process.exit(1);
}

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const sd = (xs) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));
const stocks = out.map((o) => o.stock);
const bonds = out.map((o) => o.bond);
console.log(`years: ${out.length} (${out[0].year}–${out.at(-1).year})`);
console.log(`stock real: mean ${(mean(stocks) * 100).toFixed(2)}% sd ${(sd(stocks) * 100).toFixed(2)}%`);
console.log(`bond  real: mean ${(mean(bonds) * 100).toFixed(2)}% sd ${(sd(bonds) * 100).toFixed(2)}%`);
console.log(`inflation : mean ${(mean(out.map((o) => o.inflation)) * 100).toFixed(2)}%`);

const dest = join(dirname(fileURLToPath(import.meta.url)), '../src/engine/data/historicalReturns.json');
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, JSON.stringify(out).replace(/\},\{/g, '},\n{') + '\n');
console.log(`wrote ${dest}`);
