// رنگ‌ها و چیدمان. رابط فارسی/راست‌به‌چپ است، بنابراین جهت‌ها به‌صورت صریح
// تعیین می‌شوند تا نیازی به ری‌استارت پس از forceRTL نباشد.

export const colors = {
  bg: '#0E1621',
  surface: '#17212B',
  surface2: '#1D2B39',
  bubbleOut: '#2B5278',
  bubbleIn: '#19232F',
  accent: '#5EA6EA',
  text: '#F5F9FC',
  textDim: '#8E9FAF',
  danger: '#E0555A',
  ok: '#4CC38A',
  warn: '#E8A33D',
  divider: '#22303C',
};

/** In an RTL interface my own messages sit on the left edge. */
export const OUT_ALIGN = 'flex-start';
export const IN_ALIGN = 'flex-end';

export const row = { flexDirection: 'row-reverse', alignItems: 'center' };
export const rowStart = { flexDirection: 'row-reverse', alignItems: 'flex-start' };

export const text = {
  color: colors.text,
  fontSize: 15,
  writingDirection: 'rtl',
  textAlign: 'right',
};

export const textDim = { ...text, color: colors.textDim, fontSize: 13 };

export const AVATAR_COLORS = ['#6C7CFF', '#FF7C6C', '#4CC38A', '#FFB74D', '#BA68C8', '#4FC3F7', '#EC5E7C', '#9575CD'];

export function initials(name) {
  const clean = String(name || '').trim();
  if (!clean) return '?';
  const parts = clean.split(/\s+/);
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

export function timeLabel(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

const DAY = 24 * 60 * 60 * 1000;

export function dayLabel(ts) {
  const now = new Date();
  const d = new Date(ts);
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / DAY);
  if (diff === 0) return 'امروز';
  if (diff === 1) return 'دیروز';
  if (diff < 7) return ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'][d.getDay()];
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export function lastSeenLabel(ts) {
  if (!ts) return 'آفلاین';
  const diff = Date.now() - ts;
  if (diff < 60 * 1000) return 'همین حالا';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} دقیقه پیش`;
  if (diff < DAY) return `${Math.floor(diff / 3600000)} ساعت پیش`;
  return `آخرین بازدید ${dayLabel(ts)}`;
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
