"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setAccountRole } from "../actions";

const ROLES = ["developer", "advertiser", "admin"];

export default function RoleSelect({ accountId, role, isSelf }) {
  const router = useRouter();
  const [value, setValue] = useState(role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    const result = await setAccountRole({ accountId, role: value }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) {
      setValue(role);
      return setError(result.error);
    }
    router.refresh();
  }

  return (
    <div className="row">
      <select
        className="field"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={isSelf || busy}
        aria-label="Role"
      >
        {ROLES.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
      {!isSelf && value !== role && (
        <button className="button" type="button" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      )}
      {isSelf && <span className="muted-line">You</span>}
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
