const AUTO_PUBLISH_STORAGE_PREFIX = "microsite:auto-publish:";

function getStorageKey(eventId: string): string {
  return `${AUTO_PUBLISH_STORAGE_PREFIX}${eventId}`;
}

export function readMicrositeAutoPublishPreference(eventId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(getStorageKey(eventId)) === "1";
  } catch {
    return false;
  }
}

export function writeMicrositeAutoPublishPreference(
  eventId: string,
  enabled: boolean,
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getStorageKey(eventId), enabled ? "1" : "0");
  } catch {
    // Ignore storage write failures.
  }
}
