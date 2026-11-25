# Security

Captured strings, documents, URLs and backups are untrusted inputs. The principal boundaries are browser rendering, import validation, document and inference workers, and Electron IPC. A privileged operating-system user, malicious extension, compromised host or compromised profile is outside this boundary.

- React renders capture text as text. The inspector allows explicit HTTP(S) links without embedding their pages. Raster previews use approved image MIME types.
- The production page uses a Content Security Policy and scope-limited service-worker caching of application files.
- PDF.js text extraction and rendering apply page and image limits. Catch does not invoke PDF scripting or executable office content.
- Backup parsing enforces length limits, validates record shape and verifies attachment SHA-256 hashes before a one-transaction merge.
- Electron enables context isolation and sandboxing, disables Node integration for the renderer, and validates IPC sender, channel and arguments. A constrained protocol serves packaged assets. Explicit external links open in the OS browser.
- Pinned model assets are checked for size and checksum. Inference uses local cache entries and accepts only text or image bytes already on the device.
- Browser regression checks observed the five fixed model GETs with no request bodies on the replayed supplier paths, then zero external HTTP requests in the tested search, OCR and classification workflows. Electron separately denies browser permission requests, blocks unapproved renderer destinations, validates clipboard IPC arguments, and delegates explicit HTTP(S) links to the default browser.

Verification covers the implemented engineering checks. Format parsing relies on third-party libraries. Credential filtering is heuristic and does not inspect clipboard images. Local storage and backups have no application-level encryption or secure-erasure guarantee. The Windows package is unsigned.

Report vulnerabilities privately to the project maintainer with the affected version and the minimum synthetic details needed to reproduce the behavior. Keep personal capture contents out of reports.
