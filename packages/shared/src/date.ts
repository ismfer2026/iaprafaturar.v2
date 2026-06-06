const LOCALE = "pt-BR";
const TZ = "America/Sao_Paulo";

export function formatDateBR(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE, { timeZone: TZ });
}

export function formatDateTimeBR(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, { timeZone: TZ });
}

export function formatTimeBR(iso: string): string {
  return new Date(iso).toLocaleTimeString(LOCALE, {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes}min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ontem";
  if (days < 7) return `${days} dias atrás`;
  return formatDateBR(iso);
}

export function formatCurrency(value: number): string {
  return value.toLocaleString(LOCALE, { style: "currency", currency: "BRL" });
}

export function toISODate(date: Date): string {
  return date.toISOString().split("T")[0] ?? "";
}
