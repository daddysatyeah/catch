# Phase 2 account setup

Catch runs as a guest without Firebase configuration. The Windows package uses its existing local library and does not open OAuth windows. The browser edition uses Firebase Authentication through the modular Web SDK. Captures are never placed in a Firebase database.

## Firebase console

1. Create or select a Firebase project. Register a Web app under Project settings. Copy its public Web configuration fields into .env.local using .env.example as the template. Use the project’s default PROJECT_ID.firebaseapp.com auth domain. The four fields are VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID and VITE_FIREBASE_APP_ID. No service-account file, client secret, database or Firebase Hosting deploy is required by Catch.
2. In Authentication → Sign-in method, enable Google and select the required project support email. Keep Email/Password and Email link sign-in disabled.
3. In Authentication → Settings → Authorized domains, add daddysatyeah.github.io for Pages. For local verification authorize the hostname used to open Catch, such as 127.0.0.1 or localhost. Add hostname only, with no scheme, port or path. Use a separate Firebase test project for local origins if possible. For a Google OAuth app still in Testing, include the intended testers in its Google Cloud OAuth audience.
4. Restart Vite after changing .env.local or rebuild the production bundle. Open the authorized hostname and verify a real Google popup round trip. Check popup cancellation, reopening the web app, sign-out and account switching. The Google flow uses a popup on this static host. If a mobile browser blocks the popup, use the system browser or continue as guest.

The GitHub Actions workflow accepts the same four public values as repository Actions variables. Leave them empty for a guest-only build. Public deployment still requires the existing explicit workflow approval. The Firebase Web config is included in a configured bundle by design. Keep administrative credentials and OAuth secrets out of configuration files, Actions variables and frontend source.

## Local libraries and storage

The pre-account IndexedDB remains the guest library. Verified accounts get separate databases keyed by Firebase project and UID, with their own captures, attachments, collections, preferences, Trash and retrieval vectors. Switching signed-in accounts or signing out leaves each library intact. Open the matching account to return to its library. To move items deliberately, export from one library and approve an import in the other. The existing bounded JSON importer validates attachments and merges conflicting capture IDs as copies. It keeps the current library intact. Backups can contain sensitive local captures.

The sidebar estimates the active library’s payload. The Storage screen itemizes Blob bytes, UTF-8 capture text and serialized metadata. It includes Trash and Archive. Shared, complete downloaded model artifacts appear separately. The browser-origin usage and quota are reports from the browser and can include other profiles, app/runtime caches and other projects on the same GitHub Pages hostname. Estimated headroom is the reported quota minus usage, floored at zero. Browser persistence may reduce automatic eviction. It cannot protect against a user clearing site data. Database overhead, filesystem allocation, partial model downloads and the separately stored vector index are only represented in the browser-origin figure where the browser accounts for them.

A sign-in session identifies which local library Catch opens. It provides no local encryption, OS/profile isolation, cloud backup or cross-device sync. Anyone with sufficient access to the browser profile or developer tools may read local data. The Privacy Core is a visual metaphor. It performs no scanning or security work.

## Verification

Run npm run build, npm test and npm run test:e2e. Guest and storage tests run without Firebase configuration. The synthetic browser harness is node scripts/check-account-flow.mjs. It substitutes a provider only on its own local Vite test server. It exercises app-side pending, cancellation, session restoration, account switching, sign-out and library partitioning. A passing mock run does not verify live Google sign-in.

- [Firebase Google sign-in](https://firebase.google.com/docs/auth/web/google-signin)
- [Firebase Auth session persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence)
- [Firebase Auth popup and redirect on static hosts](https://firebase.google.com/docs/auth/web/redirect-best-practices)
- [Firebase Authentication limits](https://firebase.google.com/docs/auth/limits)
- [MDN storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
