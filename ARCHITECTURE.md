# Catch architecture

Catch is a static React and TypeScript application with a Windows Electron shell. Both editions use local profile storage and CPU inference.

## Application and capture

~~~mermaid
flowchart LR
  Person --> React[React workspace]
  Windows[Opt-in Windows clipboard] --> Bridge[Validated preload bridge]
  Bridge --> React
  React --> Draft[Capture draft and validation]
  Draft --> Hash[SHA-256 of text and files]
  Hash --> Duplicate[Exact duplicate decision]
  Duplicate --> Store[IndexedDB transaction]
  Store --> Read[Read supported attachments]
  Store --> Search[Local retrieval]
  Read --> Review[Evidence and suggestions]
~~~

A capture preserves the user-entered string, original attachments, source class when known, stable ID, and timestamps. An edit can keep a snapshot of the prior original once. Current text and its derived passages are stored separately. The Windows path applies its sensitive-text filter before sending content to the renderer.

## Local storage

~~~mermaid
erDiagram
  LIBRARY_METADATA ||--o{ CAPTURE : owns
  CAPTURE ||--o{ BLOB_HANDLE : includes
  CAPTURE ||--o| EMBEDDING_RECORD : derives
~~~

Version 2 upgrades the original IndexedDB database in a single transaction. Metadata, captures and vectors have separate stores. Blob references are structured-cloned as part of capture records. A user change reads and writes in one transaction, and commits only changed records. An embedding record stores a version and chunk-content signature. An in-flight result is checked against the current capture revision before it is written. Trashing or deleting a capture removes its vectors. IndexedDB controls reclamation of unreachable Blob data.

Backup v2 serializes records and a hash-addressed binary directory. Restoration validates fields, boundaries and checksums before showing a merge preview. Conflicting capture IDs receive new IDs and same-name collections merge. Browser and Windows use separate origins and profiles.

## Documents and OCR

~~~mermaid
flowchart LR
  Blob[Original Blob] --> Type[Format check]
  Type --> PDF[PDF.js worker]
  Type --> Plain[TXT, CSV, Markdown, DOCX text]
  PDF --> Page[Page text]
  PDF --> Raster[Rasterize limited scanned pages]
  Type --> Image[Decode orientation and resize]
  Image --> OCR[Tesseract English worker]
  Raster --> OCR
  Page --> Evidence[Page-aware passages]
  OCR --> Evidence
  Plain --> Evidence
  Evidence --> Search[Index passages]
  Evidence --> Review[Evidence-based review]
~~~

PDF.js text extraction and page rasterization are available without a scripting viewer. DOCX extraction reads a bounded document XML member and rejects DTD/entity declarations. Tesseract returns text and its own confidence value. A correction is stored alongside the original OCR text.

## Embeddings, retrieval and classification

~~~mermaid
flowchart LR
  Text[Title, tags and source passages] --> Chunk[Overlapping text windows]
  Chunk --> Encoder[MiniLM WASM worker]
  Encoder --> Cache[Versioned 384-dimensional vectors]
  Query --> Encoder
  Query --> Keyword[BM25]
  Cache --> Cosine[Best matching chunk by cosine]
  Encoder --> Cosine
  Keyword --> RRF[Reciprocal rank fusion]
  Cosine --> RRF
  RRF --> Evidence[Ranked captures and snippets]
  Encoder --> Category[Apply trained linear scores and abstention threshold]
  Category --> Abstain[Threshold and margin]
  Abstain --> Review[Human review]
~~~

Browser inference runs in a dedicated module worker with one ONNX Runtime Web thread. Catch downloads pinned, checksum-verified weights after an explicit request and primes the same-origin runtime for offline reloads. The encoder reads verified cache entries. BM25 and cosine share the filtered corpus. The default hybrid promotes complete reference matches and applies weighted reciprocal rank fusion to other queries. Related captures show evidence from the best-matching chunk. The bundled linear classifier uses the same embeddings and abstains on close scores. Category and tag corrections persist as user values.

## Information extraction

~~~mermaid
flowchart LR
  Passage[Original or extracted passage] --> Patterns[Bounded pattern matching]
  Patterns --> Validation[Calendar and currency checks]
  Validation --> Suggestion[Value, offset, page and evidence]
  Suggestion --> Human[Accept, edit, reject or dismiss]
  Human --> Decision[Local decision]
  Human --> Task[Confirmed action or explicit deadline]
~~~

Rules produce dates, times, currencies, URLs, email addresses, references and explicit action markers. Ambiguous dates stay as written until a user enters a full date. Review records decisions and local tasks.

## Desktop and privacy boundary

~~~mermaid
flowchart LR
  System[System clipboard] --> Main[Electron main after opt-in]
  Main --> Filter[Secret patterns and deduplication]
  Filter --> IPC[Validated top-frame IPC]
  IPC --> Renderer[Sandboxed Catch renderer]
  Renderer --> IDB[(Local profile)]
  Hosts[Public pinned model files] --> Cache[(Separate model cache)]
  Cache --> Renderer
  Renderer --> Export[User-triggered backup]
~~~

The Windows shell serves packaged assets through a constrained custom protocol. The renderer has a limited preload bridge and no Node access. Tray close hides the window, and explicit exit stops monitoring and releases shortcuts. The browser release uses a scoped service worker to cache shell files and lazy runtime resources on use. Model caches and capture data live outside release artifacts.
