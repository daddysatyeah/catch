export type ClipboardValue = { kind: 'text'; text: string } | { kind: 'image'; bytes: Uint8Array }
export type DesktopStatus = { monitoring: boolean; images: boolean; shortcut: string; shortcutError?: string; lastSkipped?: string }

export type DesktopBridge = {
  getStatus(): Promise<DesktopStatus>
  setMonitoring(enabled: boolean): Promise<DesktopStatus>
  setImages(enabled: boolean): Promise<DesktopStatus>
  setShortcut(value: string): Promise<DesktopStatus>
  readClipboard(): Promise<ClipboardValue | null>
  writeText(value: string): Promise<boolean>
  onStatus(handler: (status: DesktopStatus) => void): () => void
  onCapture(handler: (value: ClipboardValue) => void): () => void
  onQuickCapture(handler: () => void): () => void
}

declare global { interface Window { catchDesktop?: DesktopBridge } }
