const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function apiFetch(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  // Fastify rejects bodyless POST/DELETE requests that still declare
  // Content-Type: application/json with "Body cannot be empty when
  // content-type is set to 'application/json'". Only advertise a JSON
  // body when we actually send one (e.g. invite create does; accept and
  // revoke do not).
  if (init?.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
}
