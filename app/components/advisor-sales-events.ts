"use client";
const eventName = "effectiveness-sales-updated";
let pageOrigin: string | undefined;
const currentOrigin = () => (pageOrigin ??= crypto.randomUUID());
export function notifyAdvisorSalesChanged(source?: string) {
  window.dispatchEvent(new CustomEvent(eventName, {detail:{source}}));
  try {
    localStorage.setItem(eventName, crypto.randomUUID());
  } catch {}
  try {
    const channel = new BroadcastChannel(eventName);
    channel.postMessage({source,origin:currentOrigin()});
    channel.close();
  } catch {}
}
export function subscribeAdvisorSalesChanged(refresh: () => void, ownSource?: string) {
  let frame = 0;
  const update = (event?: Event) => {
    if (ownSource && event instanceof CustomEvent && event.detail?.source === ownSource) return;
    if (document.hidden) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(refresh);
  };
  const storage = (e: StorageEvent) => {
    if (e.key === eventName) update();
  };
  let channel: BroadcastChannel | undefined;
  try {
    channel = new BroadcastChannel(eventName);
    channel.onmessage = event => {
      if (ownSource && event.data?.origin === currentOrigin() && event.data?.source === ownSource) return;
      update();
    };
  } catch {}
  window.addEventListener(eventName, update);
  window.addEventListener("storage", storage);
  window.addEventListener("focus", update);
  document.addEventListener("visibilitychange", update);
  return () => {
    cancelAnimationFrame(frame);
    channel?.close();
    window.removeEventListener(eventName, update);
    window.removeEventListener("storage", storage);
    window.removeEventListener("focus", update);
    document.removeEventListener("visibilitychange", update);
  };
}
