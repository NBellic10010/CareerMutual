export function collectObjectKeys(value: unknown): ReadonlySet<string> {
  const keys = new Set<string>();

  function visit(current: unknown): void {
    if (Array.isArray(current)) {
      for (const item of current) visit(item);
      return;
    }
    if (current === null || typeof current !== "object") return;

    for (const [key, nested] of Object.entries(current)) {
      keys.add(key);
      visit(nested);
    }
  }

  visit(value);
  return keys;
}

export function serializeForLeakCheck(value: unknown): string {
  return JSON.stringify(value).toLocaleLowerCase("en-US");
}
