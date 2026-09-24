import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 日期格式化（dayjs 轻量封装） */
import dayjs from 'dayjs';

export function fmtDate(d?: string | Date | null, pattern = 'YYYY-MM-DD') {
  if (!d) return '';
  return dayjs(d).format(pattern);
}

export function fmtDateTime(d?: string | Date | null) {
  return fmtDate(d, 'YYYY-MM-DD HH:mm');
}

/** 进度百分比取整 */
export function pct(v?: number | null) {
  return Math.round((v ?? 0) * 100);
}
