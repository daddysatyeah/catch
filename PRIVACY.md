# Privacy

Catch keeps originals, attachments, categories, decisions and search indexes in the active profile. Browser libraries belong to their browser origin. Windows uses a separate local Electron profile. Transferring a library requires an export and merge.

- Browser capture starts when you type, paste or select a file. The clipboard button may need browser permission.
- Windows monitoring starts off each launch. Enable it in Settings. Settings and the tray allow immediate pause. Closing the window keeps the tray process alive, and Exit Catch stops monitoring.
- Windows text monitoring checks likely credentials, OTPs, recovery codes, private-key markers and card numbers. It keeps a short-lived fingerprint for permitted repeated clipboard content and only a reason when it skips a likely secret. Some secrets are missed and ordinary text can be flagged.
- Background clipboard image capture starts off. Images may show information the text filter cannot inspect. Locally reading a stored image is a separate OCR setting.
- Search history is optional and starts off. You can clear it in Settings. It is excluded from portable backups. Recently viewed information belongs to the local library.
- Choosing **Explore demo library** downloads original sample files from Catch's web host and saves them in the active library. The demo pack contains fictional data and no excerpts of anyone's private library. Removing the examples moves them to local Trash.
- Trash is recoverable until a user explicitly deletes an item. Optional retention only moves eligible unpinned inbox items into Trash when opening the library.

Catch has no analytics, capture-upload endpoint or cloud database. Browsers initially load the web application from its host. An explicit model download contacts Hugging Face or GitHub Raw for fixed artifacts, with credentials omitted and no referrer. Hosts may receive ordinary network metadata such as an IP address. Following a saved link opens the destination selected by the user.

The classifier uses the downloaded MiniLM encoder and a small set of weights bundled with Catch. The weights come from public project fixtures. Captures do not train or update the classifier. A browser regression traces external requests while installing models and while running local search, classification and OCR.

Cache Storage holds verified model files separately. Local libraries and exports are accessible to software with sufficient access to the operating-system account or browser profile. Catch has no application-level encryption or secure-erasure guarantee. Clearing site data removes the browser library and caches. Older backups may still contain deleted records.

## Browser accounts

Sign-in is optional. A configured build uses Firebase Authentication for profile and session information and uses Google for Google sign-in. Google profile photos, when available, are fetched from Google's profile image host.

The existing IndexedDB library is the guest library. Every verified account opens a separate local database. Signing out or switching accounts does not transfer or delete these databases. Ordinary app navigation exposes only the active library. The browser profile, its developer tools, and software with equivalent privileges can still access unencrypted local data. Authentication does not encrypt or synchronize captures.

Origin usage and persistence apply to the browser origin, which can include multiple projects on GitHub Pages. Clearing site data can remove libraries for every account in that browser profile. Backups remain local files.
