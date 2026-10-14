export function formatNumber(value) {
  return new Intl.NumberFormat("es-MX").format(value || 0);
}

export function formatDuration(seconds = 0) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

export function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(value));
}

export function formatTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-MX", { timeStyle: "short" }).format(new Date(value));
}

