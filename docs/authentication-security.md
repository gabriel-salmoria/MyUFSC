# Authentication & Security

MyUFSC's core security property is that **the server never sees plaintext student academic data**. All academic information is encrypted client-side before being sent to the server, and decrypted client-side after being received. The server stores only ciphertext.

---

## Overview

```
Browser                                         Server (Neon DB)
──────────────────────────────────────────────────────────────────
Login form
  → hash username (SHA256 → PBKDF2 → bcrypt)
  → hash password (bcrypt)
  → POST /api/user/auth/login
                                    ← verify bcrypt(hPassword, storedHash)
                                    ← set session cookie + userId cookie

Profile load
  → GET /api/user/profile/:userId
                                    ← return { iv, encryptedData }
  → decrypt with PBKDF2(localPwd) + AES-256-CBC
  → write StudentInfo to Zustand store
```

---

## Client-Side Cryptography (`crypto/client/crypto.ts`)

Uses the `crypto-js` library.

### `hashString(str) → string`

Used to hash the plaintext password before sending it to the server. The server never receives a raw password.

**Algorithm:**
1. SHA-256 of the input.
2. Derive a salt: SHA-256 of `(hash + "MyUFSC rocks!")`, take first 22 characters, prepend `"$2b$10$"`.
3. HMAC-SHA256 of the first hash using the derived salt.
4. Encode as hex.

The output is stored in `localStorage` under the key `enc_pwd` and is used as the key material for AES decryption.

### `deriveEncryptionKey(hash_password) → string`

Derives the AES encryption key from the hashed password using PBKDF2:
- Iterations: 10,000
- Key size: 256 bits
- Hash: SHA-256
- Salt: derived from `SHA256(hash_password + "MyUFSC rocks!")` (first 22 chars, bcrypt-prefix format)

The key is deterministic — the same password always produces the same key, which is what allows decryption after a session ends and the browser is reopened.

### `encryptStudentData(studentData, password) → { iv, encryptedData }`

- Derives the AES key from `password`.
- Serializes `studentData` to JSON.
- Generates a random 16-byte IV.
- Encrypts with AES-256-CBC + PKCS7 padding.
- Returns base64-encoded ciphertext and hex-encoded IV.

### `decryptStudentData(password, iv, encryptedData) → StudentInfo`

- Derives the AES key from `password`.
- Decrypts the ciphertext.
- JSON-parses the plaintext back to `StudentInfo`.

---

## Server-Side Cryptography (`crypto/server/crypto.ts`)

Uses `crypto-js` and `bcryptjs`.

### `hashUsername(username) → string`

The username is hashed in two phases:

**Phase 1 — Legacy bcrypt hash** (preserved for backwards compatibility):
1. SHA-256 of the username.
2. Derive a bcrypt salt: SHA-256 of `(sha256Hash + "FIXED_SALT_STRING")`, take 22 chars, prepend `"$2b$10$"`.
3. bcrypt with 10 rounds.
4. Encode as hex.

**Phase 2 — PBKDF2 strengthening** (V2 enhancement):
1. Take the bcrypt output from Phase 1.
2. Apply 9,999 rounds of PBKDF2 with the pepper `"MyUFSC_V2_PEPPER"`.
3. Encode as hex.

The two-phase design means all existing users are automatically using the V2 hash without a DB migration — the V1 hash is an intermediate value, not stored.

The final hashed username becomes the database primary key and the `userId` stored in the session cookie.

---

## Session Management

Sessions use two HttpOnly cookies set on successful login:
- `session=authenticated` — presence indicates an active session
- `userId=<hashedUsername>` — identifies which user profile to load

Both cookies:
- Max-Age: 604800 (7 days)
- `HttpOnly` — not accessible from JavaScript
- `SameSite=Lax`
- `Secure` in production, plain in dev

### Auth Check — `GET /api/user/auth/check`

Reads the `session` and `userId` cookies from the request. Returns `{ authenticated: true, userId }` if both are present, otherwise `{ authenticated: false }`.

The `useCheckAuth` hook calls this endpoint on every cold page load. If it returns `false` but `enc_pwd` exists in `localStorage`, the session has expired. In that case, the hook clears `enc_pwd` and resets the Zustand store without redirecting — the UI falls back to the welcome screen.

### Login Flow — `POST /api/user/auth/login`

1. Client sends `{ hUsername, hPassword }` — already hashed on the client.
2. Server calls `hashUsername(hUsername)` to produce the DB lookup key.
3. Fetches the user row by hashed username.
4. Compares `hPassword` against `userData.hashedPassword` using `bcrypt.compare`.
5. On success: sets the two session cookies and returns `{ iv, encryptedData }`.
6. Client decrypts with the locally stored key (`enc_pwd`).

### Register Flow — `POST /api/user/auth/register`

1. Client sends `{ hUsername, hPassword, iv, encryptedData }` — the profile is already encrypted before leaving the browser.
2. Server hashes the username and hashes the password with bcrypt (10 rounds).
3. Creates the user row: `(hashedUsername, hashedPassword, iv, encryptedData)`.
4. Sets session cookies.

### Logout — `POST /api/user/auth/logout`

Clears both session cookies. The client clears `enc_pwd` from `localStorage` and resets the Zustand store.

---

## Profile Update — `POST /api/user/update`

Called whenever `studentInfo` changes (degree change, plan edits, etc.). The client re-encrypts the entire `StudentInfo` with `encryptStudentData(studentData, password)` and POSTs the new `{ iv, encryptedData }`. The server calls `updateUser(hashedUsername, { iv, encryptedData })` — no decryption happens server-side.

---

## Anonymous Identity for Reviews

The professor review system needs to identify users for anti-spam purposes without revealing who they are. This is handled through an anonymous hash:

```ts
// In the client, before submitting a review:
const anonymousId = getAnonymousUserId(userId);
// getAnonymousUserId = SHA256(userId + some salt)
```

The `authorHash` stored in the `reviews` table is this anonymous ID, not the real `userId`. Pseudonyms for display are derived from `authorHash` in `lib/professors.ts` using `generatePseudonym(authorHash, professorId)`, which maps the hash to a Brazilian animal name + number (e.g. "Capivara042").

---

## What the Server Can and Cannot See

| Data | Server Visibility |
|---|---|
| Username | Never — only a double-hashed derivative |
| Password | Never — only a bcrypt hash of the client-side hash |
| StudentInfo (plans, grades, semesters) | Never — stored only as AES-256 ciphertext |
| IV | Yes — needed to return it to the client for decryption |
| Degree IDs / curriculum IDs | Yes — stored separately in programs/curriculums tables |
| Review text and scores | Yes — reviews are public, stored plaintext |
| Author of a review | Pseudonymous — only the `authorHash` is stored |
