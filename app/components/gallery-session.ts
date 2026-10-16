const prefix = "estudio-gallery:v1:";
export type GalleryState = {
  q: string;
  review: string;
  favorite: boolean;
  saved: boolean;
  page: number;
  selected: string[];
  format: string;
};
const empty: GalleryState = {
  q: "",
  review: "ALL",
  favorite: false,
  saved: false,
  page: 1,
  selected: [],
  format: "png",
};
export const galleryKey = (userId: string, scope: string, id: string) =>
  prefix + userId + ":" + scope + ":" + id;
export function readGallery(key: string): GalleryState {
  if (typeof window === "undefined") return { ...empty, selected: [] };
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw || raw.length > 25000) return { ...empty, selected: [] };
    const data = JSON.parse(raw);
    return {
      q: typeof data.q === "string" ? data.q.slice(0, 200) : "",
      review: ["ALL", "PENDING", "APPROVED", "REJECTED"].includes(data.review)
        ? data.review
        : "ALL",
      favorite: data.favorite === true,
      saved: data.saved === true,
      page:
        Number.isInteger(data.page) && data.page >= 1 && data.page <= 10000
          ? data.page
          : 1,
      selected: Array.isArray(data.selected)
        ? [
            ...new Set<string>(
              data.selected.filter(
                (id: unknown) =>
                  typeof id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(id),
              ),
            ),
          ].slice(0, 200)
        : [],
      format: data.format === "jpg" ? "jpg" : "png",
    };
  } catch {
    return { ...empty, selected: [] };
  }
}
export function saveGallery(key: string, value: GalleryState) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage is optional; normal navigation still works. */
  }
}
export function clearGallerySession() {
  try {
    for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
      const key = window.sessionStorage.key(i);
      if (key?.startsWith(prefix)) window.sessionStorage.removeItem(key);
    }
  } catch {
    /* Storage may be disabled by the browser. */
  }
}
