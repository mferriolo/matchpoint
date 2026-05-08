# Gmail "Send via Gmail" — One-Time Setup

The outreach workspace's **Send via Gmail** button posts the formatted
HTML email directly through your connected Gmail inbox using the
Gmail API. The email goes from your real address, lands in your Sent
folder, and the role-title hyperlink renders as a real `<a href>` —
no copy-paste step.

This requires a one-time setup in Google Cloud Console (you, not the
app, must own the OAuth client). Plan on about 10 minutes.

## 1. Create the OAuth client

1. Open https://console.cloud.google.com/ and pick (or create) a project.
2. Enable the **Gmail API**: Console → APIs & Services → Library →
   search "Gmail API" → Enable.
3. Configure the **OAuth consent screen** (APIs & Services → OAuth
   consent screen):
   - User type: **External**, status **Testing** is fine while only you
     and a small set of teammates are using it.
   - App name: e.g. "MatchPoint Outreach"
   - User support email + developer contact: your email.
   - Scopes: add `https://www.googleapis.com/auth/gmail.send` and
     `https://www.googleapis.com/auth/userinfo.email` and `openid`.
   - Test users: add the Gmail addresses that will use Send via Gmail.
4. Create the **OAuth Client ID** (APIs & Services → Credentials →
   Create Credentials → OAuth client ID):
   - Application type: **Web application**
   - Authorized redirect URI:
     ```
     https://nrnmzvenwjqsnegxyaxz.supabase.co/functions/v1/gmail-oauth?action=callback
     ```
     (Match this exactly — Google rejects mismatched redirects.)
5. Copy the **Client ID** and **Client secret** that Google shows.

## 2. Configure Supabase secrets

In the Supabase dashboard for project `nrnmzvenwjqsnegxyaxz`, go to
**Project Settings → Edge Functions → Secrets** and set:

| Key | Value |
| --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` | from step 1.5 |
| `GOOGLE_OAUTH_CLIENT_SECRET` | from step 1.5 |
| `APP_URL` | `https://matchpoint-nu-dun.vercel.app` (or your prod domain) |

Note: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-set by
the Supabase runtime; you don't have to set them manually.

The functions read these secrets at runtime — restart isn't required.

## 3. Connect your Gmail account

1. Open the app → **Admin → System Settings** → scroll to **Gmail
   Connection**.
2. Click **Connect Gmail**. You'll be redirected to Google's consent
   screen. Approve.
3. Google redirects you back into the app with `?gmail=connected` in
   the URL. The Gmail Connection panel should now show a green
   checkmark with your email.

## 4. Send

In the outreach workspace, after drafting an email, click **Send via
Gmail** (next to "Copy HTML" / "Send"). The email is delivered from
your inbox via the Gmail API; a toast confirms with the recipient
address. The role title in the body is rendered as a clickable link
in the recipient's inbox.

## Disconnecting

Same panel → **Disconnect**. We delete the stored row and best-effort
revoke the refresh token at Google. To fully revoke from your Google
account, also visit
https://myaccount.google.com/permissions and remove the app's grant.

## Common errors

- **`gmail=error&reason=token_exchange_400`** — typically a redirect
  URI mismatch. Confirm the URI in Google Cloud Console matches the
  one in step 1.4 exactly (including the `?action=callback` query
  string).
- **`gmail=error&reason=no_refresh_token`** — Google didn't issue a
  refresh token (this happens on subsequent grants without
  `prompt=consent`). The function already passes `prompt=consent`, but
  if you previously connected a different client, fully revoke at
  https://myaccount.google.com/permissions and reconnect.
- **`Gmail send 403`** — your account isn't on the OAuth consent
  screen's test-users list. Add it under APIs & Services → OAuth
  consent screen → Test users.

## How it works (under the hood)

- `gmail-oauth` edge function handles `start` (302 to Google),
  `callback` (exchanges code, stores tokens in `gmail_tokens`),
  `status` (reports connection state), and `disconnect` (revokes +
  deletes).
- `gmail-send` edge function reads tokens, refreshes the access
  token if it's near expiry, builds a `multipart/alternative` MIME
  message (text/plain + text/html), base64url-encodes it, and POSTs
  to `gmail.googleapis.com/.../messages/send`.
- `gmail_tokens` table stores `gmail_email`, `refresh_token`,
  `access_token`, `access_token_expires_at`, `scope`, and a couple
  of housekeeping fields. Single row in the single-tenant case.
