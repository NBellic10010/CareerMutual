/**
 * Next.js may expose path segments in their raw, encoded, or double-encoded
 * form depending on whether navigation came from an RSC transition or a full
 * document request. Domain references are opaque, so normalize only the URL
 * encoding at the route boundary and leave validation to the command/query.
 */
export function decodeRouteRef(value: string): string {
  let decoded = value;

  for (let pass = 0; pass < 2; pass += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }

  return decoded;
}
