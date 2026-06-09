# Optional end-to-end encrypted account sync: design

Date: 2026-06-08
Status: Approved, ready for implementation planning

## Goal

Let a user optionally create an account and sync their calendar data across
devices (including mobile browsers) through a managed Supabase backend. The data
is end-to-end encrypted so the server can never read it. The app stays
local-first: with no account, it works exactly as it does today, fully offline,
with no password required.

The motivation is twofold. First, users want to open the app on their phone and
laptop and see the same data. Second, this is personal financial data, so the
developer does not want to be able to read it or be responsible for it sitting
readable on a server. End-to-end encryption removes that responsibility: a server
breach or a developer with database access still cannot decrypt anyone's events.

## Non-goals (this version)

- Encrypting local IndexedDB at rest. Local data stays plaintext, the same as the
  current local-only app, so the app opens and works with no password.
- Realtime live push between devices. Sync runs on login, on window focus, and
  after local writes. Supabase Realtime is a later enhancement.
- Field-level or CRDT merge. Conflict resolution is last-write-wins per row.
- 2FA device-loss recovery. Losing the authenticator means losing access to the
  cloud copy (see Accepted limitations).
- Social login, multiple 2FA factor types, account deletion tooling.

## Design decisions

These were settled during brainstorming and are fixed for this version:

1. **Optional and additive.** IndexedDB stays the source of truth. The account and
   sync layer only activates when a user signs in. Logged-out behavior is
   unchanged.
2. **Supabase as the backend.** Managed Postgres plus Auth plus Row Level Security.
   The browser talks to Supabase directly with the public anon key. There is no
   custom server code and no Edge Functions. RLS is the authorization layer.
3. **Row-level sync, last-write-wins.** Events and categories sync as individual
   rows. Edits to different rows on two devices both survive. Conflicts on the same
   row resolve by newest `updatedAt`.
4. **End-to-end encryption is required.** Every synced row's payload is encrypted
   client-side. The server stores only ciphertext plus routing metadata.
5. **TOTP two-factor is required.** Enforced at the database through the `aal2`
   claim in RLS policies, not just in the UI.
6. **Email and password sign-in.** No social login, no magic links in this version.
7. **libsodium for all crypto.** No hand-rolled cryptography. We assemble standard
   primitives (Argon2id, XChaCha20-Poly1305 AEAD, secure random) from a vetted
   library.

## Encryption and key management

The server must never see anything it can decrypt the data with. The encryption
key is derived from the user's password and never leaves the device.

### Key hierarchy

This is the standard wrapped-key model used by Bitwarden, Proton, and 1Password.

- `KEK` (key-encryption-key) = `Argon2id(password, salt = normalized email)`.
  Derived client-side, never sent anywhere.
- `DEK` (data-encryption-key) = a random 256-bit key generated once at signup.
  This is what actually encrypts events and categories.
- `wrappedDEK` = `encrypt(DEK, KEK)`. Stored on the server. Useless without the
  password.
- Each row payload = `encrypt(JSON(fields), DEK)` with a fresh random nonce per
  write.

The two-key indirection means a password change only re-wraps the small `DEK`
blob instead of re-encrypting all data, and every device shares one `DEK`.

### Zero-knowledge authentication

The user's real password is never sent to Supabase. The client derives a separate
`authSecret = Argon2id(password, salt = normalized email, distinct context)` and
uses `authSecret` as the password in Supabase email and password auth. Supabase
stores only `bcrypt(authSecret)`. The real password, and therefore `KEK` and
`DEK`, never reach the server.

`authSecret` and `KEK` are derived from the same password with different context
strings, so knowing one (or its bcrypt hash) does not reveal the other. Both
derivations use the email as salt so a device can derive them from email and
password alone, with no pre-login server round trip.

### Recovery key for a forgotten password

Zero-knowledge means the developer cannot reset a user's data password. At signup
the client generates a one-time high-entropy recovery key that also wraps the DEK:
`recoveryWrappedDEK = encrypt(DEK, deriveKey(recoveryKey))`. The user must save it
(download or print). The signup flow requires the user to confirm they saved it
before continuing.

Forgotten-password recovery needs two independent locks. Supabase's email reset
link re-establishes the account and sets a new `authSecret`. The recovery key
unwraps the DEK so the data is still readable. The user sets a new password, and
the client re-wraps the DEK under the new KEK.

### Security properties and bounds

- Security is bounded by password strength. The key comes from the password, so a
  weak password is brute-forceable offline if the database leaks. Signup enforces a
  minimum password strength with a strength meter. Argon2id with hardened
  parameters makes brute force expensive but cannot fix a trivial password.
- TOTP and E2EE are orthogonal. TOTP guards account login (`aal2`). E2EE guards
  data confidentiality. They stack as defense in depth.
- Metadata that still leaks to the server: the number of events and categories, and
  their create and modify timestamps. The sensitive fields (amount, direction,
  date, title, category reference, recurrence) are all inside the ciphertext.

## Data model and schema

### Server tables (Supabase Postgres)

All tables are keyed by `user_id` (Supabase `auth.users.id`).

```
events        ( id uuid PK, user_id uuid, updated_at bigint, deleted bool,
                nonce bytea, ciphertext bytea )
categories    ( id uuid PK, user_id uuid, updated_at bigint, deleted bool,
                nonce bytea, ciphertext bytea )
key_material  ( user_id uuid PK,
                wrapped_dek bytea, wrapped_dek_nonce bytea,
                recovery_wrapped_dek bytea, recovery_nonce bytea,
                kdf_version int, created_at timestamptz )
```

- `id` reuses the existing local event or category id, a random uuid that is not
  sensitive, so sync is keyed upserts.
- `ciphertext` holds the encrypted JSON of the sensitive fields. `deleted = true`
  is a tombstone so deletions propagate across devices.
- `updated_at` is a client epoch-millisecond timestamp stamped on every local
  write. It is the merge ordering key.
- `kdf_version` records the Argon2id parameter set used, so parameters can be
  migrated later.

### Row Level Security

Every table enables RLS. Policies for all operations require both:

```
user_id = auth.uid()
and (auth.jwt() ->> 'aal') = 'aal2'
```

The `aal2` clause is what makes TOTP genuinely required. Without passing 2FA this
session, the database returns and accepts no rows. Enforcement lives in Postgres,
not just the UI.

### Local model and storage changes

- `CalendarEvent` and `Category` gain `updatedAt: number` (epoch ms), stamped on
  every put. Add the field to their type guards.
- `src/lib/storage` bumps `DB_VERSION` to 2. The upgrade adds two object stores:
  `tombstones` (key `id`, value `{ id, type: "event" | "category", updatedAt }`)
  and `syncMeta` (key-value, holds the `lastSyncedAt` cursor and related state).
- The migration backfills `updatedAt` for existing rows.
- `deleteEvent` and `deleteCategory` write a tombstone in addition to removing the
  row, so deletes can be pushed.
- Tombstones are written whether or not an account is connected. They are tiny and
  keep the logic uniform.

## Sync and merge

A new `src/lib/sync` module orchestrates sync. Conflict resolution is
last-write-wins per row by `updatedAt`.

- **Push.** Debounced about 2 seconds off the existing `notifyDataChanged` signal,
  only when unlocked. Take local rows and tombstones whose `updatedAt` is greater
  than `lastSyncedAt`, encrypt each payload with the DEK and a fresh nonce, upsert
  to Supabase. Deletes push as `deleted = true` rows.
- **Pull.** On login, on window focus, and on light polling. Fetch rows where
  `updated_at` is greater than `lastSyncedAt`. For each, if the remote row is newer
  than the local copy, decrypt and apply (upsert or delete). Otherwise keep local.
  Advance the `lastSyncedAt` cursor to the maximum server timestamp seen.
- After applying pulled changes, call `notifyDataChanged` so open tabs and
  components re-render. The cursor plus dirty tracking prevent a push, pull, push
  echo loop.

### Known limitation

Last-write-wins by client timestamp is vulnerable to clock skew across devices.
For a single user this is low risk. The documented upgrade path, if it ever
matters, is server-authoritative timestamps or hybrid logical clocks. Not solved
in this version.

## Authentication, TOTP, and recovery flows

The entry point is a new Sync action (in the toolbar or the existing Data dialog)
that opens a `SyncDialog`.

### Create account

1. Enter email and password. A strength meter and minimum requirement apply,
   because the password is the root of the encryption.
2. The client derives `authSecret` and `KEK` from the password (Argon2id, salt is
   the normalized email).
3. `supabase.auth.signUp({ email, password: authSecret })`.
4. Generate a random `DEK` and a random recovery key. Wrap the DEK under both the
   `KEK` and the recovery key. Upload the `key_material` row.
5. Force TOTP enrollment: show the QR code, the user verifies a code, the session
   becomes `aal2`. There is no skip.
6. Show the recovery key once and require the user to confirm they saved it.
7. Encrypt all existing local events and categories and push them (initial upload).

### Sign in on a new device, including mobile

1. Enter email and password.
2. Derive `authSecret` and `KEK`.
3. `supabase.auth.signInWithPassword({ email, password: authSecret })`.
4. TOTP challenge, required to reach `aal2`.
5. Fetch `key_material`, unwrap the DEK with the KEK.
6. Pull all rows, decrypt, and merge into local IndexedDB.

### Change password

Re-derive `KEK'` and `authSecret'` from the new password. Re-wrap the DEK under
`KEK'`. Update the Supabase password and `key_material.wrapped_dek`. Data is never
re-encrypted.

### Forgot password

Supabase's email reset link re-establishes the account and sets a new
`authSecret'`. The recovery key unwraps the DEK so the data is still readable. The
user sets a new password and the client re-wraps the DEK under the new KEK.

### Sign out and lock

The Supabase session may persist so the user stays signed in. The DEK lives only
in memory and is dropped on reload. After reload the app shows local data
immediately, and sync stays paused until the user unlocks by re-entering their
password (re-derives KEK, unwraps DEK). This is the standard encrypted-vault
unlock model. Because local data is plaintext, the app is fully usable while
locked. Only sync waits for the unlock.

## Local-first integration

- The local CRUD path is untouched. Writes hit IndexedDB first (offline-first),
  reads always come from IndexedDB. Logged-out behavior is identical to today.
- State is exposed through a new `SyncProvider` and a `useSync()` hook, kept
  separate from `useCalendar()` so the calendar context stays focused. It exposes
  `syncStatus` (`off`, `locked`, `syncing`, `synced`, `error`), the account email,
  and actions: `createAccount`, `signIn`, `unlock`, `signOut`, `changePassword`,
  `recover`.

## Module layout

New modules, each a directory with `index.ts` and, where useful, `consts.ts`,
`types.ts`, and `tests.ts`:

```
src/lib/crypto/    deriveKeys, generateDek, wrap/unwrapDek,
                   encrypt/decryptPayload, generateRecoveryKey (libsodium-wrappers)
src/lib/supabase/  client init plus typed table access (env-configured)
src/lib/sync/      initialSync, push, pull, last-write-wins merge, cursor, tombstones
src/lib/account/   signUp, signIn, MFA enroll and challenge, changePassword, recover
src/context/SyncContext/   SyncProvider plus useSync()
src/components/SyncDialog/  account create, sign in, status, unlock,
                           TOTP enroll and challenge, recovery-key display
```

Changes to existing code:

- `src/lib/storage`: bump `DB_VERSION` to 2, add the `tombstones` and `syncMeta`
  stores, stamp `updatedAt` on every put, write tombstones on delete, migration
  backfills `updatedAt`.
- `src/types`: add `updatedAt` to `CalendarEvent` and `Category` with guards. Add
  `EncryptedRow`, `KeyMaterial`, and `SyncStatus` types with guards.
- Config: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`. Both are
  public and safe with RLS, and are documented.

## Implementation phases

One spec, sequenced so it is reviewable in chunks rather than one drop:

1. **Crypto core.** `src/lib/crypto` with libsodium: key derivation, DEK wrap and
   unwrap, payload encrypt and decrypt, recovery key. Thorough unit tests first.
2. **Schema and RLS.** Create the Supabase project, the three tables, and the RLS
   policies including the `aal2` requirement.
3. **Storage changes.** `updatedAt` stamping, tombstones, `syncMeta`, the v2
   migration.
4. **Sync engine.** `src/lib/sync` push, pull, and merge against a mockable
   Supabase client seam.
5. **Auth and onboarding UI.** `SyncProvider`, `useSync()`, and `SyncDialog` with
   create account, sign in, TOTP enroll and challenge, recovery-key display,
   unlock, change password, and recover.
6. **Docs.** Update `CLAUDE.md` and `docs/TRD.md`.

## Testing

- **crypto** (security-critical, so thorough): encrypt and decrypt round-trips, DEK
  wrap and unwrap, recovery-key unwrap, KDF determinism (same email and password
  give the same KEK), and a wrong password fails to unwrap because the AEAD auth tag
  rejects it. Pure and fast.
- **sync merge:** last-write-wins cases (local newer, remote newer, new row,
  tombstone) against a mocked Supabase client plus `fake-indexeddb`.
- **storage migration:** v1 to v2 adds stores, backfills `updatedAt`, and a delete
  writes a tombstone.
- The Supabase module is the mock seam, so unit tests never hit the network. The
  auth and MFA UI gets manual browser verification, because jsdom cannot see layout
  or positioning.

## Documentation updates

- `CLAUDE.md` and `docs/TRD.md`: the architecture becomes a local-first client SPA
  with an optional managed Supabase sync layer. Local-only is the default and stays
  fully functional. The "no backend" statement becomes "no backend required."

## Accepted limitations

These are deliberate for this version, not oversights:

1. **Lost authenticator locks out the cloud copy.** TOTP is enforced at the
   database through `aal2`, and there is no 2FA device-loss recovery. The recovery
   key unlocks the data but cannot get past RLS without a valid TOTP code, and there
   is no backend admin to reset it. Local data is untouched and fully usable, so the
   realistic recovery is to keep using the app locally, create a fresh account, and
   re-upload.
2. **Forgotten password plus lost recovery key means the cloud data is
   unrecoverable.** This is the defining property of zero-knowledge encryption, not
   a bug. Local data is unaffected.
3. **Security is bounded by password strength.** Mitigated by an enforced minimum
   and Argon2id, but a weak password remains a weak password.
4. **Clock skew can mis-order same-row conflicts** under last-write-wins. Low risk
   for a single user.
