const API_BASE = import.meta.env.VITE_API_BASE || "";

export async function api(path, options) {
  const response = await fetch(`${API_BASE}${path}`, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Error de API");
    error.details = payload.details;
    throw error;
  }
  return payload;
}

export const imageSrc = (item) => {
  const value = item?.cover_local_path || item?.image_local_path || item?.cover_url || item?.image_url;
  return value || "";
};
