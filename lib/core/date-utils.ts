/**
 * DATE UTILITIES - Fixed date logic for future system clock (2026 -> 2025)
 */

export function getEffectiveDate(): Date {
  return new Date();
}

export function getEffectiveDateString(): string {
  const d = getEffectiveDate();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getEffectiveDateStringCompact(): string {
  return getEffectiveDateString().replace(/-/g, "");
}

export function getEffectiveDateStringSlash(): string {
  const d = getEffectiveDate();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${day}/${month}/${year}`;
}
