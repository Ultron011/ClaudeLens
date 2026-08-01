/** Renders inline inside `.session-sub`, e.g. "... · ✉ jane@co.com · Acme Inc".
 *  The account is read from ~/.claude.json at SYNC time and is machine-global, so it's the
 *  account signed in when the hook last ran — not necessarily the one behind every turn. */
export function AccountLine({ email, orgName }: { email?: string; orgName?: string }) {
  if (!email && !orgName) return null;
  return (
    <span title="account signed in at last sync">
      {email && <> · ✉ {email}</>}
      {orgName && <> · {orgName}</>}
    </span>
  );
}
