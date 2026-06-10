const DECIMAL_CPU_UNITS: Record<string, number> = {
  n: 1e-9,
  u: 1e-6,
  m: 1e-3,
  '': 1,
  k: 1e3,
  M: 1e6,
  G: 1e9,
};

const MEMORY_UNITS_TO_GIB: Record<string, number> = {
  '': 1 / 1024 ** 3,
  Ki: 1 / 1024 ** 2,
  Mi: 1 / 1024,
  Gi: 1,
  Ti: 1024,
  K: 1000 / 1024 ** 3,
  M: 1000 ** 2 / 1024 ** 3,
  G: 1000 ** 3 / 1024 ** 3,
  T: 1000 ** 4 / 1024 ** 3,
};

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function parseCpu(quantity?: string | number): number {
  if (quantity === undefined || quantity === null) return 0;
  if (typeof quantity === 'number') return quantity;

  const match = quantity.trim().match(/^([0-9.]+)(n|u|m|k|M|G)?$/);
  if (!match) return 0;

  const amount = Number(match[1]);
  const unit = match[2] ?? '';

  return round(amount * (DECIMAL_CPU_UNITS[unit] ?? 1));
}

export function parseMemoryGiB(quantity?: string | number): number {
  if (quantity === undefined || quantity === null) return 0;
  if (typeof quantity === 'number') return quantity;

  const match = quantity.trim().match(/^([0-9.]+)(Ki|Mi|Gi|Ti|K|M|G|T)?$/);
  if (!match) return 0;

  const amount = Number(match[1]);
  const unit = match[2] ?? '';

  return round(amount * (MEMORY_UNITS_TO_GIB[unit] ?? MEMORY_UNITS_TO_GIB['']));
}
