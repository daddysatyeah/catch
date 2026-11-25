const { contextBridge, ipcRenderer } = require('electron')

function subscribe(channel, callback) {
  const handler = (_event, value) => callback(value)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('catchDesktop', {
  getStatus: () => ipcRenderer.invoke('catch:status'),
  setMonitoring: enabled => ipcRenderer.invoke('catch:monitor', enabled),
  setImages: enabled => ipcRenderer.invoke('catch:images', enabled),
  setShortcut: shortcut => ipcRenderer.invoke('catch:shortcut', shortcut),
  readClipboard: () => ipcRenderer.invoke('catch:read-clipboard'),
  writeText: text => ipcRenderer.invoke('catch:write-text', text),
  onStatus: callback => subscribe('catch:status-changed', callback),
  onCapture: callback => subscribe('catch:clipboard-capture', callback),
  onQuickCapture: callback => subscribe('catch:quick-capture', callback),
})
