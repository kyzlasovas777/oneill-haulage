const DB_NAME = "oneill-local-photo-queue"
const STORE_NAME = "entry-photos"
const DB_VERSION = 1

function openPhotoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function queueKey(driverId: number, queueId: number) {
  return `${driverId}:${queueId}`
}

export async function saveQueuedPhotos(
  driverId: number,
  queueId: number,
  photos: string[]
) {
  const db = await openPhotoDb()

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite")
      transaction.objectStore(STORE_NAME).put(photos, queueKey(driverId, queueId))
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  } finally {
    db.close()
  }
}

export async function loadQueuedPhotos(driverId: number, queueId: number) {
  const db = await openPhotoDb()

  try {
    return await new Promise<string[] | undefined>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly")
      const request = transaction.objectStore(STORE_NAME).get(queueKey(driverId, queueId))
      request.onsuccess = () => resolve(request.result as string[] | undefined)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

export async function removeQueuedPhotos(driverId: number, queueId: number) {
  const db = await openPhotoDb()

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite")
      transaction.objectStore(STORE_NAME).delete(queueKey(driverId, queueId))
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  } finally {
    db.close()
  }
}
