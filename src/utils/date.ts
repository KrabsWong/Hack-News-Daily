/**
 * 日期工具函数
 */

/**
 * 格式化日期为 YYYY-MM-DD
 */
export function formatDateForDisplay(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * 获取指定日期的 UTC 时间范围，end 为次日 00:00:00（不包含）。
 */
export function getDayBoundaries(dateStr: string): { start: number; end: number } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`HN_TARGET_DATE 格式无效: ${dateStr}，请使用 YYYY-MM-DD`);
  }

  const date = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || formatDateForDisplay(date) !== dateStr) {
    throw new Error(`HN_TARGET_DATE 不是有效日期: ${dateStr}`);
  }

  const start = Math.floor(date.getTime() / 1000);
  return { start, end: start + 86400 };
}

/**
 * 获取前一天的 UTC 时间范围，end 为当天 00:00:00（不包含）。
 */
export function getPreviousDayBoundaries(): { start: number; end: number } {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const end = Math.floor(today.getTime() / 1000);
  return { start: end - 86400, end };
}
