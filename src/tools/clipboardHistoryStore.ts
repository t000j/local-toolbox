export interface ClipboardHistoryEntry {
  id: string
  kind: 'text' | 'image'
  text?: string
  imageBlob?: Blob
  imageWidth?: number
  imageHeight?: number
  createdAt: number
  fingerprint: string
  sizeBytes: number
}

const databaseName = 'local-toolbox-clipboard-history'
const storeName = 'entries'
let databasePromise: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('当前环境不支持本机剪贴板历史存储。'))
      return
    }
    const request = window.indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(storeName)) database.createObjectStore(storeName, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('无法打开本机剪贴板历史。'))
  }).catch((cause) => {
    databasePromise = null
    throw cause
  })
  return databasePromise
}

export async function readClipboardEntries(): Promise<ClipboardHistoryEntry[]> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly')
    const request = transaction.objectStore(storeName).getAll()
    request.onsuccess = () => resolve((request.result as ClipboardHistoryEntry[]).sort((left, right) => right.createdAt - left.createdAt))
    request.onerror = () => reject(request.error ?? new Error('无法读取剪贴板历史。'))
    transaction.onabort = () => reject(transaction.error ?? new Error('读取剪贴板历史失败。'))
  })
}

export async function putClipboardEntry(entry: ClipboardHistoryEntry): Promise<void> {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).put(entry)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('无法保存剪贴板记录。'))
    transaction.onabort = () => reject(transaction.error ?? new Error('无法保存剪贴板记录。'))
  })
}

export async function deleteClipboardEntries(ids: string[]): Promise<void> {
  if (!ids.length) return
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)
    ids.forEach((id) => store.delete(id))
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('无法清理剪贴板历史。'))
    transaction.onabort = () => reject(transaction.error ?? new Error('无法清理剪贴板历史。'))
  })
}

export async function clearClipboardEntries(): Promise<void> {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).clear()
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('无法清空剪贴板历史。'))
    transaction.onabort = () => reject(transaction.error ?? new Error('无法清空剪贴板历史。'))
  })
}
