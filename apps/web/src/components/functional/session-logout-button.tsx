"use client";

import { useState } from "react";

export function SessionLogoutButton() {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/v1/dev/session", { method: "DELETE" });
    } finally {
      window.location.assign("/login");
    }
  }

  return (
    <button disabled={busy} type="button" onClick={() => void signOut()}>
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
