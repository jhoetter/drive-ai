const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatDriveBytes(bytes: number | null | undefined, locale: string, dash: string): string {
  if (bytes == null || Number.isNaN(bytes)) return dash;
  if (bytes < 1024)
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(bytes)} ${BYTE_UNITS[0]}`;
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < BYTE_UNITS.length - 1) {
    v /= 1024;
    i++;
  }
  const digits = i === 1 ? 1 : i >= 3 ? 2 : 1;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(v)} ${BYTE_UNITS[i]}`;
}

export function formatDriveModified(iso: string | null | undefined, locale: string, dash: string): string {
  if (!iso) return dash;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return dash;
  const now = Date.now();
  const deltaSec = Math.round((d.getTime() - now) / 1000);

  const absSec = Math.abs(deltaSec);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (absSec < 60) return rtf.format(Math.round(deltaSec), "second");
  const deltaMin = Math.round(deltaSec / 60);
  if (Math.abs(deltaMin) < 60) return rtf.format(deltaMin, "minute");
  const deltaHour = Math.round(deltaMin / 60);
  if (Math.abs(deltaHour) < 24) return rtf.format(deltaHour, "hour");
  const deltaDay = Math.round(deltaHour / 24);
  if (Math.abs(deltaDay) < 7) return rtf.format(deltaDay, "day");
  const deltaWeek = Math.round(deltaDay / 7);
  if (Math.abs(deltaWeek) < 5) return rtf.format(deltaWeek, "week");
  const deltaMonth = Math.round(deltaDay / 30);
  if (Math.abs(deltaMonth) < 12) return rtf.format(deltaMonth, "month");
  return rtf.format(Math.round(deltaDay / 365), "year");
}
