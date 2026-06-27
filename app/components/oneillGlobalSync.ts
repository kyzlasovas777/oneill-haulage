import { supabase } from "./supabase"

let globalSyncStarted = false
let syncRunning = false

type DieselEntry = {
  id: number
  driver_id: number
  entry_date: string
  mileage: number | null
  litres: number | null
  reg_number: string | null
  photo_url?: string | null
  photo_path?: string | null
  created_at?: string
  syncStatus?: "synced" | "pending" | "delete_pending"
}

type DieselPhoto = {
  id: number
  diesel_entry_id: number
  driver_id: number
  photo_url: string
  photo_path: string
  created_at?: string
}

type MileageEntry = {
  id: number
  driver_id: number
  entry_date: string
  start_mileage: number
  finish_mileage: number | null
  total_miles: number | null
  reg_number: string | null
  avg_l100: number | null
  estimated_litres: number | null
  created_at?: string
  syncStatus?: "synced" | "pending" | "delete_pending"
}

type ServiceItem = {
  id: number
  truck_id: number
  entry_date: string
  mileage: number | null
  parts_cost?: number | null
  mechanic_bill?: number | null
  description: string | null
  created_at?: string
  syncStatus?: "synced" | "pending" | "delete_pending"
}

type ServicePhoto = {
  id: number
  service_id: number
  photo_url: string
  photo_path: string | null
  created_at?: string
}

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback

  try {
    const saved = localStorage.getItem(key)
    return saved ? JSON.parse(saved) : fallback
  } catch {
    return fallback
  }
}

function isLocalId(id: number) {
  return id > 1000000000000
}

function dataUrlToFile(dataUrl: string, fileName: string) {
  const arr = dataUrl.split(",")
  const mime = arr[0].match(/:(.*?);/)?.[1] ?? "image/jpeg"
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)

  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }

  return new File([u8arr], fileName, { type: mime })
}

async function uploadDieselPhoto(driverId: number, file: File) {
  const cleanName = file.name.replaceAll(" ", "-")

  const filePath = `diesel/${driverId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}-${cleanName}`

  const { error } = await supabase.storage
    .from("entry-photos")
    .upload(filePath, file, {
      contentType: "image/jpeg",
    })

  if (error) throw error

  const { data } = supabase.storage.from("entry-photos").getPublicUrl(filePath)

  return {
    photo_url: data.publicUrl,
    photo_path: filePath,
  }
}

async function uploadServicePhoto(file: File) {
  const cleanName = file.name.replaceAll(" ", "-")

  const filePath = `service/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}-${cleanName}`

  const { error } = await supabase.storage
    .from("entry-photos")
    .upload(filePath, file, {
      contentType: "image/jpeg",
    })

  if (error) throw error

  const { data } = supabase.storage.from("entry-photos").getPublicUrl(filePath)

  return {
    photo_url: data.publicUrl,
    photo_path: filePath,
  }
}

async function uploadLocalServicePhotosForEntry(
  oldServiceId: number,
  realServiceId: number,
  localPhotos: ServicePhoto[]
) {
  const entryLocalPhotos = localPhotos.filter(
    (photo) =>
      photo.service_id === oldServiceId &&
      (!photo.photo_path || photo.photo_url.startsWith("data:"))
  )

  if (entryLocalPhotos.length === 0) return []

  const insertedPhotos: ServicePhoto[] = []

  for (const photo of entryLocalPhotos) {
    const file = dataUrlToFile(photo.photo_url, `service-${photo.id}.jpg`)
    const uploaded = await uploadServicePhoto(file)

    const { data, error } = await supabase
      .from("service_photos")
      .insert({
        service_id: realServiceId,
        photo_url: uploaded.photo_url,
        photo_path: uploaded.photo_path,
      })
      .select()
      .single()

    if (error) throw error
    if (data) insertedPhotos.push(data)
  }

  return insertedPhotos
}

async function uploadLocalDieselPhotosForEntry(
  driverId: number,
  oldEntryId: number,
  realEntryId: number,
  localPhotos: DieselPhoto[]
) {
  const entryLocalPhotos = localPhotos.filter(
    (photo) =>
      photo.diesel_entry_id === oldEntryId &&
      (!photo.photo_path || photo.photo_url.startsWith("data:"))
  )

  if (entryLocalPhotos.length === 0) return []

  const insertedPhotos: DieselPhoto[] = []

  for (const photo of entryLocalPhotos) {
    const file = dataUrlToFile(photo.photo_url, `diesel-${photo.id}.jpg`)
    const uploaded = await uploadDieselPhoto(driverId, file)

    const { data, error } = await supabase
      .from("diesel_photos")
      .insert({
        diesel_entry_id: realEntryId,
        driver_id: driverId,
        photo_url: uploaded.photo_url,
        photo_path: uploaded.photo_path,
      })
      .select()
      .single()

    if (error) throw error
    if (data) insertedPhotos.push(data)
  }

  return insertedPhotos
}

async function syncDieselEntriesGlobal(driverId: number) {
  const dieselEntriesStorageKey = `oneill-diesel-entries-${driverId}`
  const dieselPhotosStorageKey = `oneill-diesel-photos-${driverId}`
  const dieselPhotoDeletesStorageKey = `oneill-diesel-photo-deletes-${driverId}`

  let localEntries = loadFromStorage<DieselEntry[]>(dieselEntriesStorageKey, [])
  let localPhotos = loadFromStorage<DieselPhoto[]>(dieselPhotosStorageKey, [])
  let localPhotoDeletes = loadFromStorage<DieselPhoto[]>(
    dieselPhotoDeletesStorageKey,
    []
  )

  const hasDieselWork =
    localEntries.some(
      (entry) =>
        entry.syncStatus === "pending" ||
        entry.syncStatus === "delete_pending"
    ) || localPhotoDeletes.length > 0

  if (!hasDieselWork) {
    console.log("GLOBAL DIESEL SYNC: nothing pending")
    return
  }

  console.log("GLOBAL DIESEL SYNC: started")

  for (const photo of localPhotoDeletes) {
    if (photo.photo_path) {
      await supabase.storage.from("entry-photos").remove([photo.photo_path])
    }

    await supabase.from("diesel_photos").delete().eq("id", photo.id)

    localPhotoDeletes = localPhotoDeletes.filter((item) => item.id !== photo.id)

    localStorage.setItem(
      dieselPhotoDeletesStorageKey,
      JSON.stringify(localPhotoDeletes)
    )
  }

  for (const entry of localEntries) {
    if (entry.syncStatus === "delete_pending") {
      if (!isLocalId(entry.id)) {
        const entryPhotos = localPhotos.filter(
          (photo) => photo.diesel_entry_id === entry.id && photo.photo_path
        )

        const paths = entryPhotos.map((photo) => photo.photo_path).filter(Boolean)

        if (paths.length > 0) {
          await supabase.storage.from("entry-photos").remove(paths)
        }

        await supabase
          .from("diesel_photos")
          .delete()
          .eq("diesel_entry_id", entry.id)

        await supabase.from("diesel_entries").delete().eq("id", entry.id)
      }

      localEntries = localEntries.filter((item) => item.id !== entry.id)
      localPhotos = localPhotos.filter(
        (photo) => photo.diesel_entry_id !== entry.id
      )

      localStorage.setItem(dieselEntriesStorageKey, JSON.stringify(localEntries))
      localStorage.setItem(dieselPhotosStorageKey, JSON.stringify(localPhotos))

      continue
    }

    if (entry.syncStatus === "pending") {
      if (isLocalId(entry.id)) {
        const oldLocalId = entry.id

        const { data, error } = await supabase
          .from("diesel_entries")
          .insert({
            driver_id: driverId,
            entry_date: entry.entry_date,
            mileage: entry.mileage,
            litres: entry.litres,
            reg_number: entry.reg_number,
            photo_url: null,
            photo_path: null,
          })
          .select()
          .single()

        if (error || !data) throw error

        // labai svarbu: iškart pakeičiam local ID į tikrą Supabase ID,
        // kad silpnas internetas nesukurtų dublikatų per kitą sync
        const entryWithRealId: DieselEntry = {
          ...data,
          syncStatus: "pending",
        }

        localEntries = localEntries.map((item) =>
          item.id === oldLocalId ? entryWithRealId : item
        )

        localPhotos = localPhotos.map((photo) =>
          photo.diesel_entry_id === oldLocalId
            ? { ...photo, diesel_entry_id: data.id }
            : photo
        )

        localStorage.setItem(
          dieselEntriesStorageKey,
          JSON.stringify(localEntries)
        )
        localStorage.setItem(dieselPhotosStorageKey, JSON.stringify(localPhotos))

        const insertedPhotos = await uploadLocalDieselPhotosForEntry(
          driverId,
          data.id,
          data.id,
          localPhotos
        )

        localPhotos = [
          ...insertedPhotos,
          ...localPhotos.filter(
            (photo) =>
              !(
                photo.diesel_entry_id === data.id &&
                (!photo.photo_path || photo.photo_url.startsWith("data:"))
              )
          ),
        ]

        const syncedEntry: DieselEntry = {
          ...data,
          syncStatus: "synced",
        }

        localEntries = localEntries.map((item) =>
          item.id === data.id ? syncedEntry : item
        )

        localStorage.setItem(
          dieselEntriesStorageKey,
          JSON.stringify(localEntries)
        )
        localStorage.setItem(dieselPhotosStorageKey, JSON.stringify(localPhotos))
      } else {
        const { data, error } = await supabase
          .from("diesel_entries")
          .update({
            mileage: entry.mileage,
            litres: entry.litres,
            reg_number: entry.reg_number,
          })
          .eq("id", entry.id)
          .select()
          .single()

        if (error || !data) throw error

        const insertedPhotos = await uploadLocalDieselPhotosForEntry(
          driverId,
          entry.id,
          entry.id,
          localPhotos
        )

        localPhotos = [
          ...insertedPhotos,
          ...localPhotos.filter(
            (photo) =>
              !(
                photo.diesel_entry_id === entry.id &&
                (!photo.photo_path || photo.photo_url.startsWith("data:"))
              )
          ),
        ]

        const syncedEntry: DieselEntry = {
          ...data,
          syncStatus: "synced",
        }

        localEntries = localEntries.map((item) =>
          item.id === entry.id ? syncedEntry : item
        )

        localStorage.setItem(
          dieselEntriesStorageKey,
          JSON.stringify(localEntries)
        )
        localStorage.setItem(dieselPhotosStorageKey, JSON.stringify(localPhotos))
      }
    }
  }

  window.dispatchEvent(new CustomEvent("oneill-diesel-synced"))

  console.log("GLOBAL DIESEL SYNC: finished")
}

async function syncMileageEntriesGlobal(driverId: number) {
  const mileageStorageKey = `oneill-mileage-entries-${driverId}`

  let localEntries = loadFromStorage<MileageEntry[]>(mileageStorageKey, [])

  const hasMileageWork = localEntries.some(
    (entry) =>
      entry.syncStatus === "pending" ||
      entry.syncStatus === "delete_pending"
  )

  if (!hasMileageWork) {
    console.log("GLOBAL MILES SYNC: nothing pending")
    return
  }

  console.log("GLOBAL MILES SYNC: started")

  for (const entry of localEntries) {
    if (entry.syncStatus === "delete_pending") {
      if (!isLocalId(entry.id)) {
        await supabase.from("mileage_entries").delete().eq("id", entry.id)
      }

      localEntries = localEntries.filter((item) => item.id !== entry.id)
      localStorage.setItem(mileageStorageKey, JSON.stringify(localEntries))
      continue
    }

    if (entry.syncStatus === "pending") {
      if (isLocalId(entry.id)) {
        const oldLocalId = entry.id

        const { data, error } = await supabase
          .from("mileage_entries")
          .insert({
            driver_id: driverId,
            entry_date: entry.entry_date,
            start_mileage: entry.start_mileage,
            finish_mileage: entry.finish_mileage,
            total_miles: entry.total_miles,
            reg_number: entry.reg_number,
            avg_l100: entry.avg_l100,
            estimated_litres: entry.estimated_litres,
          })
          .select()
          .single()

        if (error || !data) throw error

        const entryWithRealId: MileageEntry = {
          ...data,
          syncStatus: "synced",
        }

        localEntries = localEntries.map((item) =>
          item.id === oldLocalId ? entryWithRealId : item
        )

        localStorage.setItem(mileageStorageKey, JSON.stringify(localEntries))
      } else {
        const { data, error } = await supabase
          .from("mileage_entries")
          .update({
            start_mileage: entry.start_mileage,
            finish_mileage: entry.finish_mileage,
            total_miles: entry.total_miles,
            reg_number: entry.reg_number,
            avg_l100: entry.avg_l100,
            estimated_litres: entry.estimated_litres,
          })
          .eq("id", entry.id)
          .select()
          .single()

        if (error || !data) throw error

        const syncedEntry: MileageEntry = {
          ...data,
          syncStatus: "synced",
        }

        localEntries = localEntries.map((item) =>
          item.id === entry.id ? syncedEntry : item
        )

        localStorage.setItem(mileageStorageKey, JSON.stringify(localEntries))
      }
    }
  }

  window.dispatchEvent(new CustomEvent("oneill-mileage-synced"))

  console.log("GLOBAL MILES SYNC: finished")
}

async function syncServiceEntriesGlobal() {
  const serviceItemsStorageKey = "oneill-service-items"
  const servicePhotosStorageKey = "oneill-service-photos"
  const servicePhotoDeletesStorageKey = "oneill-service-photo-deletes"

  let localItems = loadFromStorage<ServiceItem[]>(serviceItemsStorageKey, [])
  let localPhotos = loadFromStorage<ServicePhoto[]>(servicePhotosStorageKey, [])
  let localPhotoDeletes = loadFromStorage<ServicePhoto[]>(
    servicePhotoDeletesStorageKey,
    []
  )

  const hasServiceWork =
    localItems.some(
      (item) =>
        item.syncStatus === "pending" ||
        item.syncStatus === "delete_pending"
    ) || localPhotoDeletes.length > 0

  if (!hasServiceWork) {
    console.log("GLOBAL SERVICE SYNC: nothing pending")
    return
  }

  console.log("GLOBAL SERVICE SYNC: started")

  for (const photo of localPhotoDeletes) {
    if (photo.photo_path) {
      await supabase.storage.from("entry-photos").remove([photo.photo_path])
    }

    await supabase.from("service_photos").delete().eq("id", photo.id)

    localPhotoDeletes = localPhotoDeletes.filter((item) => item.id !== photo.id)

    localStorage.setItem(
      servicePhotoDeletesStorageKey,
      JSON.stringify(localPhotoDeletes)
    )
  }

  for (const item of localItems) {
    if (item.syncStatus === "delete_pending") {
      if (!isLocalId(item.id)) {
        const itemPhotos = localPhotos.filter(
          (photo) => photo.service_id === item.id && photo.photo_path
        )

        const paths = itemPhotos
          .map((photo) => photo.photo_path)
          .filter(Boolean) as string[]

        if (paths.length > 0) {
          await supabase.storage.from("entry-photos").remove(paths)
        }

        await supabase.from("service_photos").delete().eq("service_id", item.id)
        await supabase.from("service_items").delete().eq("id", item.id)
      }

      localItems = localItems.filter((entry) => entry.id !== item.id)
      localPhotos = localPhotos.filter((photo) => photo.service_id !== item.id)

      localStorage.setItem(serviceItemsStorageKey, JSON.stringify(localItems))
      localStorage.setItem(servicePhotosStorageKey, JSON.stringify(localPhotos))

      continue
    }

    if (item.syncStatus === "pending") {
      if (isLocalId(item.id)) {
        const oldLocalId = item.id

        const { data, error } = await supabase
          .from("service_items")
          .insert({
            truck_id: item.truck_id,
            entry_date: item.entry_date,
            mileage: item.mileage,
            parts_cost: item.parts_cost ?? 0,
            mechanic_bill: item.mechanic_bill ?? 0,
            description: item.description,
          })
          .select()
          .single()

        if (error || !data) throw error

        const itemWithRealId: ServiceItem = {
          ...data,
          syncStatus: "pending",
        }

        localItems = localItems.map((entry) =>
          entry.id === oldLocalId ? itemWithRealId : entry
        )

        localPhotos = localPhotos.map((photo) =>
          photo.service_id === oldLocalId
            ? { ...photo, service_id: data.id }
            : photo
        )

        localStorage.setItem(serviceItemsStorageKey, JSON.stringify(localItems))
        localStorage.setItem(servicePhotosStorageKey, JSON.stringify(localPhotos))

        const insertedPhotos = await uploadLocalServicePhotosForEntry(
          data.id,
          data.id,
          localPhotos
        )

        localPhotos = [
          ...insertedPhotos,
          ...localPhotos.filter(
            (photo) =>
              !(
                photo.service_id === data.id &&
                (!photo.photo_path || photo.photo_url.startsWith("data:"))
              )
          ),
        ]

        const syncedItem: ServiceItem = {
          ...data,
          syncStatus: "synced",
        }

        localItems = localItems.map((entry) =>
          entry.id === data.id ? syncedItem : entry
        )

        localStorage.setItem(serviceItemsStorageKey, JSON.stringify(localItems))
        localStorage.setItem(servicePhotosStorageKey, JSON.stringify(localPhotos))
      } else {
        const { data, error } = await supabase
          .from("service_items")
          .update({
            entry_date: item.entry_date,
            mileage: item.mileage,
            parts_cost: item.parts_cost ?? 0,
            mechanic_bill: item.mechanic_bill ?? 0,
            description: item.description,
          })
          .eq("id", item.id)
          .select()
          .single()

        if (error || !data) throw error

        const insertedPhotos = await uploadLocalServicePhotosForEntry(
          item.id,
          item.id,
          localPhotos
        )

        localPhotos = [
          ...insertedPhotos,
          ...localPhotos.filter(
            (photo) =>
              !(
                photo.service_id === item.id &&
                (!photo.photo_path || photo.photo_url.startsWith("data:"))
              )
          ),
        ]

        const syncedItem: ServiceItem = {
          ...data,
          syncStatus: "synced",
        }

        localItems = localItems.map((entry) =>
          entry.id === item.id ? syncedItem : entry
        )

        localStorage.setItem(serviceItemsStorageKey, JSON.stringify(localItems))
        localStorage.setItem(servicePhotosStorageKey, JSON.stringify(localPhotos))
      }
    }
  }

  window.dispatchEvent(new CustomEvent("oneill-service-synced"))

  console.log("GLOBAL SERVICE SYNC: finished")
}

async function runSync(driverId: number) {
  if (!navigator.onLine) {
    console.log("GLOBAL SYNC: offline")
    return
  }

  if (syncRunning) {
    console.log("GLOBAL SYNC: already running")
    return
  }

  syncRunning = true

  try {
    console.log("GLOBAL SYNC: started", driverId)

    await syncDieselEntriesGlobal(driverId)

    await syncMileageEntriesGlobal(driverId)

    await syncServiceEntriesGlobal()

    console.log("GLOBAL SYNC: finished")
  } catch (error) {
    console.log("GLOBAL SYNC ERROR:", error)
  } finally {
    syncRunning = false
  }
}

export function startOneillGlobalSync(driverId: number) {
  if (typeof window === "undefined") return
  if (globalSyncStarted) return

  globalSyncStarted = true

  console.log("GLOBAL SYNC STARTED FOR DRIVER:", driverId)

  runSync(driverId)

  window.addEventListener("online", () => {
    runSync(driverId)
  })

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      runSync(driverId)
    }
  })

  setInterval(() => {
    runSync(driverId)
  }, 60000)
}
export function triggerOneillGlobalSync(driverId: number) {
  runSync(driverId)
}