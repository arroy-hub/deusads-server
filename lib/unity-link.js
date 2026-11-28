// Linking the dashboard to the Unity editor. The SDK's editor part listens on this address on the
// developer's own computer; the dashboard asks it to select a placement in the open scene. Nothing
// leaves the computer, and the SDK answers only requests from the dashboard's own address.

export const UNITY_LINK_PORT = 47321;

// The addresses the SDK's editor part answers when its server is DeusADS (DeusADSSettings in the SDK): the dashboard,
// the API and the old address. A preview build of a branch lives on another address, so Unity refuses it.
const UNITY_HOSTS = ["app.deusads.com", "api.deusads.com", "deusads-server.vercel.app"];

/** Does the Unity editor answer a page on this host? (A preview address or a copy of the site is refused.) */
export function unityAnswers(hostname) {
  const host = String(hostname ?? "").toLowerCase();
  return UNITY_HOSTS.includes(host) || host === "localhost" || host === "127.0.0.1";
}

/** The address the dashboard calls to show a place in Unity. */
export function locateUrl(externalId, place = {}) {
  const query = new URLSearchParams({ id: String(externalId ?? "") });
  if (place.scene) query.set("scene", place.scene);
  if (place.path) query.set("path", place.path);
  return `http://127.0.0.1:${UNITY_LINK_PORT}/locate?${query.toString()}`;
}

/** Where a place stands, in words: "Level_3 › Wall/Banner". */
export function addressOf(place) {
  const scene = place?.scene || "(no scene)";
  return place?.path ? `${scene} › ${place.path}` : scene;
}

/** The dashboard address that opens a placement, for the "Open in dashboard" button in Unity. */
export function dashboardLink(origin, externalId) {
  return `${String(origin).replace(/\/+$/, "")}/dashboard/find?placement=${encodeURIComponent(String(externalId ?? ""))}`;
}
