const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/**
 * Format bytes into a human-readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const isNegative = bytes < 0;
  let absBytes = Math.abs(bytes);

  let unitIndex = 0;
  while (absBytes >= 1024 && unitIndex < UNITS.length - 1) {
    absBytes /= 1024;
    unitIndex++;
  }

  const formatted = absBytes < 10 ? absBytes.toFixed(2) : absBytes < 100 ? absBytes.toFixed(1) : absBytes.toFixed(0);

  return `${isNegative ? '-' : ''}${formatted} ${UNITS[unitIndex]}`;
}

/**
 * Calculate the percentage reduction between original and optimized sizes.
 */
export function reductionPercent(original: number, optimized: number): string {
  if (original === 0) return '0%';
  const reduction = ((original - optimized) / original) * 100;
  return `${reduction.toFixed(1)}%`;
}
