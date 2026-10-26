"use client";
const eventName = "effectiveness-sales-updated";
export function notifyAdvisorSalesChanged() {
  window.dispatchEvent(new Event(eventName));
  try {
    localStorage.setItem(eventName, crypto.randomUUID());
  } catch {}
  try {
    const channel = new BroadcastChannel(eventName);
    channel.postMessage("refresh");
    channel.close();
  } catch {}
}
export function subscribeAdvisorSalesChanged(refresh: () => void) {
  let frame = 0;
  const update = () => {
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
    channel.onmessage = update;
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
