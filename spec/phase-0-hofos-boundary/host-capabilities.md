# Host capabilities for `drive-ai`

These mirror and extend the TypeScript `SisterProductHostCapabilities` pattern in hofOS (`sister-product-host-capabilities.tsx`). The `drive-ai` UI (in the native module) receives them via a **provider** in hofOS; standalone harness provides **mocks**.

## 1) Typed capability surface (conceptual)

```ts
// Conceptual — actual types live in packages/ui (hofOS re-exports or duplicates minimal interface).

export type DriveHostCapabilities = {
  /** Classify how an attachment or drive file should be opened in the host. */
  attachmentKindFor(mime: string, filename?: string): "office" | "image" | "pdf" | "other";

  /** Fetch bytes for a presigned or same-origin asset URL (with auth). */
  fetchBytes(url: string): Promise<Uint8Array>;

  /**
   * Navigate the host editor for an existing workspace asset.
   * Maps to hofOS openAsset(objectKey) → /edit-asset?key=...
   */
  openAssetByObjectKey(objectKey: string, options?: { from?: string }): void;

  /**
   * Create a new asset in the host from bytes (e.g. upload from agent or mail).
   * Returns canonical object key in the host namespace.
   */
  createHostAssetFromBytes(input: {
    bytes: Uint8Array;
    filename: string;
    mime: string;
    sourceProduct: "driveai";
  }): Promise<{ objectKey: string }>;

  /**
   * Open the shared Office-AI editor for inline editing.
   * Must not load a second @officeai/react-editors instance.
   */
  openOfficeEditor(input: {
    bytes: Uint8Array;
    filename: string;
    mime: string;
    room?: string | null;
  }): Promise<void>;

  /**
   * Request a presigned upload URL for large blobs when policy requires host-owned uploads.
   * Optional in v1; drive-ai can use product-owned MinIO in standalone.
   */
  requestPresignedUpload?(
    input: { keyHint: string; contentType: string; size: number }
  ): Promise<{ url: string; headers?: Record<string, string> }>;
};
```

## 2) Standalone mock behavior

- `openAssetByObjectKey`: open a new tab to `/open-mock-asset?key=` or show a dialog with a fake preview.
- `createHostAssetFromBytes`: store in a dev-only in-memory or temp store and return a fake key, **or** call the local `drive-ai` server’s upload if fully standalone.
- `openOfficeEditor`: open a **placeholder** panel that states “use hofOS for real Office editing” to satisfy no-second-runtime rule in harness.

## 3) hofOS real behavior

- Delegates to the existing `SisterProductHostCapabilities` implementation in the data-app, extended so `sourceProduct` allows `"driveai"`.
- Office editing flows through the same `EditAssetEditorMount` / attachment lightbox as other sisters.

## 4) Mapping: drive `fileId` ↔ host `objectKey`

- Stored in `drive-ai` as **per-revision** or per-blob metadata when integrated (exact column in `database-schema.md` for Phase 1+).
- Host never trusts client-supplied keys without server-side validation in hofOS (existing asset pipeline).
