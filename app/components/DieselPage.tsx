"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { supabase } from "./supabase"
import { triggerOneillGlobalSync } from "./oneillGlobalSync"

type DieselPageProps = {
  driverId: number
  onBack: () => void
  isBoss?: boolean
}

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

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback

  try {
    const saved = localStorage.getItem(key)
    return saved ? JSON.parse(saved) : fallback
  } catch {
    return fallback
  }
}

function formatEntryDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}.${month}.${day}`
}

function parseEntryDate(dateText: string) {
  const [year, month, day] = dateText.split(".").map(Number)
  return new Date(year, month - 1, day)
}

function displayDate(dateText: string) {
  const date = parseEntryDate(dateText)

  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function getWeekStart(date: Date) {
  const d = new Date(date)
  const day = d.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day

  d.setDate(d.getDate() + mondayOffset)
  d.setHours(0, 0, 0, 0)

  return d
}

function formatShort(date: Date) {
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  return `${day}.${month}`
}

function getWeekTitle(dateText: string) {
  const date = parseEntryDate(dateText)
  const monday = getWeekStart(date)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  return `${formatShort(monday)}-${formatShort(sunday)}`
}

function getEntryTime(entry: DieselEntry) {
  return new Date(entry.created_at ?? "").getTime()
}

function normalizeReg(reg: string | null | undefined) {
  return (reg ?? "").trim().toUpperCase()
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

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      const maxWidth = 1200
      const scale = Math.min(1, maxWidth / img.width)
      const width = Math.round(img.width * scale)
      const height = Math.round(img.height * scale)

      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext("2d")
      if (!ctx) {
        resolve(file)
        return
      }

      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file)
            return
          }

          resolve(
            new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), {
              type: "image/jpeg",
            })
          )
        },
        "image/jpeg",
        0.65
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }

    img.src = url
  })
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const reader = new FileReader()

    reader.onload = () => {
      img.src = reader.result as string
    }

    img.onload = () => {
      const canvas = document.createElement("canvas")
      const maxWidth = 1000
      const scale = Math.min(1, maxWidth / img.width)

      canvas.width = img.width * scale
      canvas.height = img.height * scale

      const ctx = canvas.getContext("2d")
      if (!ctx) {
        reject("Canvas error")
        return
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL("image/jpeg", 0.55))
    }

    reader.onerror = reject
    img.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function DieselPage({
  driverId,
  onBack,
  isBoss = false,
}: DieselPageProps) {
  const dieselEntriesStorageKey = `oneill-diesel-entries-${driverId}`
  const dieselPhotosStorageKey = `oneill-diesel-photos-${driverId}`
  const dieselPhotoDeletesStorageKey = `oneill-diesel-photo-deletes-${driverId}`

  const [entries, setEntries] = useState<DieselEntry[]>(() =>
    loadFromStorage<DieselEntry[]>(dieselEntriesStorageKey, [])
  )

  const [allDieselEntries, setAllDieselEntries] = useState<DieselEntry[]>(() =>
    loadFromStorage<DieselEntry[]>(dieselEntriesStorageKey, [])
  )

  const [photos, setPhotos] = useState<DieselPhoto[]>(() =>
    loadFromStorage<DieselPhoto[]>(dieselPhotosStorageKey, [])
  )

  const [pendingPhotoDeletes, setPendingPhotoDeletes] = useState<DieselPhoto[]>(() =>
    loadFromStorage<DieselPhoto[]>(dieselPhotoDeletesStorageKey, [])
  )

  const [trucks, setTrucks] = useState<any[]>([])
  const [assignedReg, setAssignedReg] = useState("")
  const [regNumber, setRegNumber] = useState("")
  const [editRegNumber, setEditRegNumber] = useState("")

  const [mileage, setMileage] = useState("")
  const [litres, setLitres] = useState("")
  const [saving, setSaving] = useState(false)

  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const photoInputRef = useRef<HTMLInputElement | null>(null)

  const [openPhoto, setOpenPhoto] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const [editingEntry, setEditingEntry] = useState<DieselEntry | null>(null)
  const [editMileage, setEditMileage] = useState("")
  const [editLitres, setEditLitres] = useState("")
  const [editPhotoFiles, setEditPhotoFiles] = useState<File[]>([])
  const [editPhotoPreviews, setEditPhotoPreviews] = useState<string[]>([])
  const editPhotoInputRef = useRef<HTMLInputElement | null>(null)
  const [editingSaving, setEditingSaving] = useState(false)

  const [archiveOpen, setArchiveOpen] = useState(false)
  const [activeArchiveWeek, setActiveArchiveWeek] = useState<string | null>(null)

  const today = formatEntryDate(new Date())
  const currentWeekTitle = getWeekTitle(today)

  const syncingRef = useRef(false)

  useLayoutEffect(() => {
    localStorage.setItem(dieselEntriesStorageKey, JSON.stringify(entries))
  }, [entries, dieselEntriesStorageKey])

  useLayoutEffect(() => {
    localStorage.setItem(dieselPhotosStorageKey, JSON.stringify(photos))
  }, [photos, dieselPhotosStorageKey])

  useLayoutEffect(() => {
    localStorage.setItem(
      dieselPhotoDeletesStorageKey,
      JSON.stringify(pendingPhotoDeletes)
    )
  }, [pendingPhotoDeletes, dieselPhotoDeletesStorageKey])

  const getEntryPhotos = (entryId: number) => {
    return photos.filter((photo) => photo.diesel_entry_id === entryId)
  }

  const uploadPhoto = async (file: File) => {
    const compressedFile = await compressImage(file)

    const cleanName = compressedFile.name.replaceAll(" ", "-")
    const filePath = `diesel/${driverId}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}-${cleanName}`

    const { error } = await supabase.storage
      .from("entry-photos")
      .upload(filePath, compressedFile, {
        contentType: "image/jpeg",
      })

    if (error) {
      console.log("DIESEL PHOTO UPLOAD ERROR:", error)
      throw error
    }

    const { data } = supabase.storage.from("entry-photos").getPublicUrl(filePath)

    return {
      photo_url: data.publicUrl,
      photo_path: filePath,
    }
  }

  const uploadLocalPhotosForEntry = async (
    oldEntryId: number,
    realEntryId: number,
    localPhotos: DieselPhoto[]
  ) => {
    const entryLocalPhotos = localPhotos.filter(
      (photo) =>
        photo.diesel_entry_id === oldEntryId &&
        (!photo.photo_path || photo.photo_url.startsWith("data:"))
    )

    if (entryLocalPhotos.length === 0) return []

    const insertedPhotos: DieselPhoto[] = []

    for (const photo of entryLocalPhotos) {
      const file = dataUrlToFile(photo.photo_url, `diesel-${photo.id}.jpg`)
      const uploaded = await uploadPhoto(file)

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

      if (error) {
        console.log("DIESEL PHOTO INSERT ERROR:", error)
        throw error
      }

      if (data) insertedPhotos.push(data)
    }

    return insertedPhotos
  }

  const syncDieselEntries = async () => {
    if (!navigator.onLine) return
    if (syncingRef.current) return

    syncingRef.current = true

    try {
      let localEntries = loadFromStorage<DieselEntry[]>(dieselEntriesStorageKey, [])
      let localPhotos = loadFromStorage<DieselPhoto[]>(dieselPhotosStorageKey, [])
      let localPhotoDeletes = loadFromStorage<DieselPhoto[]>(
        dieselPhotoDeletesStorageKey,
        []
      )

      for (const photo of localPhotoDeletes) {
        try {
          if (photo.photo_path) {
            await supabase.storage.from("entry-photos").remove([photo.photo_path])
          }

          await supabase.from("diesel_photos").delete().eq("id", photo.id)

          localPhotoDeletes = localPhotoDeletes.filter(
            (item) => item.id !== photo.id
          )

          setPendingPhotoDeletes(localPhotoDeletes)
          localStorage.setItem(
            dieselPhotoDeletesStorageKey,
            JSON.stringify(localPhotoDeletes)
          )
        } catch (error) {
          console.log("DIESEL PHOTO DELETE SYNC ERROR:", error)
          syncingRef.current = false
          return
        }
      }

      for (const entry of localEntries) {
        if (entry.syncStatus === "delete_pending") {
          try {
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

            setEntries(localEntries)
            setAllDieselEntries(localEntries)
            setPhotos(localPhotos)

            localStorage.setItem(
              dieselEntriesStorageKey,
              JSON.stringify(localEntries)
            )
            localStorage.setItem(dieselPhotosStorageKey, JSON.stringify(localPhotos))
          } catch (error) {
            console.log("DIESEL ENTRY DELETE SYNC ERROR:", error)
            syncingRef.current = false
            return
          }
        }

        if (entry.syncStatus === "pending") {
          if (isLocalId(entry.id)) {
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

            if (error || !data) {
              console.log("DIESEL INSERT SYNC ERROR:", error)
              syncingRef.current = false
              return
            }

            let insertedPhotos: DieselPhoto[] = []

            try {
              insertedPhotos = await uploadLocalPhotosForEntry(
                entry.id,
                data.id,
                localPhotos
              )
            } catch (photoError) {
              console.log("DIESEL PHOTO SYNC ERROR:", photoError)
              syncingRef.current = false
              return
            }

            const syncedEntry: DieselEntry = {
              ...data,
              syncStatus: "synced",
            }

            localEntries = localEntries.map((item) =>
              item.id === entry.id ? syncedEntry : item
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

            setEntries(localEntries)
            setAllDieselEntries(localEntries)
            setPhotos(localPhotos)

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

            if (error || !data) {
              console.log("DIESEL UPDATE SYNC ERROR:", error)
              syncingRef.current = false
              return
            }

            let insertedPhotos: DieselPhoto[] = []

            try {
              insertedPhotos = await uploadLocalPhotosForEntry(
                entry.id,
                entry.id,
                localPhotos
              )
            } catch (photoError) {
              console.log("DIESEL EDIT PHOTO SYNC ERROR:", photoError)
              syncingRef.current = false
              return
            }

            const syncedEntry: DieselEntry = {
              ...data,
              syncStatus: "synced",
            }

            localEntries = localEntries.map((item) =>
              item.id === entry.id ? syncedEntry : item
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

            setEntries(localEntries)
            setAllDieselEntries(localEntries)
            setPhotos(localPhotos)

            localStorage.setItem(
              dieselEntriesStorageKey,
              JSON.stringify(localEntries)
            )
            localStorage.setItem(dieselPhotosStorageKey, JSON.stringify(localPhotos))
          }
        }
      }
    } finally {
      syncingRef.current = false
    }
  }

  const loadDieselEntries = async () => {
    if (!navigator.onLine) return

    const { data, error } = await supabase
      .from("diesel_entries")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.log("DIESEL LOAD ERROR:", error)
      return
    }

    const localEntries = loadFromStorage<DieselEntry[]>(
      dieselEntriesStorageKey,
      []
    )

    const localPending = localEntries.filter(
      (entry) => entry.syncStatus === "pending" || entry.syncStatus === "delete_pending"
    )

    const deletedIds = localPending
      .filter((entry) => entry.syncStatus === "delete_pending")
      .map((entry) => entry.id)

    const remoteRows: DieselEntry[] = (data ?? []).map((entry) => ({
      ...entry,
      syncStatus: "synced",
    }))

    const driverRows = [
      ...remoteRows.filter(
        (entry) =>
          entry.driver_id === driverId &&
          !deletedIds.includes(entry.id) &&
          !localPending.some((local) => local.id === entry.id)
      ),
      ...localPending,
    ]

    const allRows = [
      ...remoteRows.filter(
        (entry) =>
          !deletedIds.includes(entry.id) &&
          !localPending.some((local) => local.id === entry.id)
      ),
      ...localPending,
    ]

    setEntries(driverRows)
    setAllDieselEntries(allRows)
    localStorage.setItem(dieselEntriesStorageKey, JSON.stringify(driverRows))

    const { data: photoData, error: photoError } = await supabase
      .from("diesel_photos")
      .select("*")
      .eq("driver_id", driverId)
      .order("created_at", { ascending: false })

    if (photoError) {
      console.log("DIESEL PHOTOS LOAD ERROR:", photoError)
      return
    }

    const localPhotos = loadFromStorage<DieselPhoto[]>(dieselPhotosStorageKey, [])
    const photoDeletes = loadFromStorage<DieselPhoto[]>(
      dieselPhotoDeletesStorageKey,
      []
    )

    const deletedPhotoIds = photoDeletes.map((photo) => photo.id)

    const localOnlyPhotos = localPhotos.filter(
      (photo) => !photo.photo_path || photo.photo_url.startsWith("data:")
    )

    const mergedPhotos = [
      ...localOnlyPhotos,
      ...(photoData ?? []).filter(
        (photo) =>
          !deletedPhotoIds.includes(photo.id) &&
          !localOnlyPhotos.some((local) => local.id === photo.id)
      ),
    ]

    setPhotos(mergedPhotos)
    localStorage.setItem(dieselPhotosStorageKey, JSON.stringify(mergedPhotos))
  }

  const loadTrucks = async () => {
    if (!navigator.onLine) return

    const { data } = await supabase.from("trucks").select("*").order("reg")
    setTrucks(data ?? [])
  }

  const loadAssignedTruck = async () => {
    if (!navigator.onLine) return

    const { data } = await supabase
      .from("drivers")
      .select("truck_reg")
      .eq("id", driverId)
      .single()

    setAssignedReg(data?.truck_reg ?? "")
  }

  useEffect(() => {
    loadDieselEntries()
    loadTrucks()
    loadAssignedTruck()

 setTimeout(() => {
  if (navigator.onLine) triggerOneillGlobalSync(driverId)
}, 300)

  const handleOnline = () => {
  triggerOneillGlobalSync(driverId)
}

    window.addEventListener("online", handleOnline)

    return () => {
      window.removeEventListener("online", handleOnline)
    }
  }, [])

  const findPreviousEntryForSameTruck = (current: DieselEntry) => {
    const currentReg = normalizeReg(current.reg_number)
    const currentTime = getEntryTime(current)

    if (!currentReg || !current.created_at) return null

    return (
      allDieselEntries
        .filter((entry) => {
          const sameTruck = normalizeReg(entry.reg_number) === currentReg
          const isOlder =
            getEntryTime(entry) < currentTime ||
            (getEntryTime(entry) === currentTime && entry.id < current.id)

          return (
            entry.id !== current.id &&
            entry.syncStatus !== "delete_pending" &&
            sameTruck &&
            isOlder &&
            entry.mileage !== null
          )
        })
        .sort((a, b) => {
          const timeDiff = getEntryTime(b) - getEntryTime(a)
          if (timeDiff !== 0) return timeDiff
          return b.id - a.id
        })[0] ?? null
    )
  }

  const getDieselAverageFromPrevious = (
    current: DieselEntry,
    previous: DieselEntry | null
  ) => {
    if (!previous) return null
    if (!current.mileage || !previous.mileage || !current.litres) return null

    const miles = current.mileage - previous.mileage
    if (miles <= 0) return null

    const ukGallons = current.litres / 4.54609
    const mpg = miles / ukGallons

    const km = miles * 1.60934
    const litresPer100km = (current.litres / km) * 100

    return {
      mpg,
      litresPer100km,
      miles,
    }
  }

  const choosePhotos = (files: FileList | null) => {
    if (!files) return

    photoPreviews.forEach((url) => URL.revokeObjectURL(url))

    const selectedFiles = Array.from(files)
    setPhotoFiles(selectedFiles)
    setPhotoPreviews(selectedFiles.map((file) => URL.createObjectURL(file)))
  }

  const chooseEditPhotos = (files: FileList | null) => {
    if (!files) return

    editPhotoPreviews.forEach((url) => URL.revokeObjectURL(url))

    const selectedFiles = Array.from(files)
    setEditPhotoFiles(selectedFiles)
    setEditPhotoPreviews(selectedFiles.map((file) => URL.createObjectURL(file)))
  }

  const removePhoto = (index: number) => {
    if (photoPreviews[index]) URL.revokeObjectURL(photoPreviews[index])

    setPhotoFiles((prev) => prev.filter((_, i) => i !== index))
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index))

    if (photoInputRef.current) photoInputRef.current.value = ""
  }

  const removeEditPhoto = (index: number) => {
    if (editPhotoPreviews[index]) URL.revokeObjectURL(editPhotoPreviews[index])

    setEditPhotoFiles((prev) => prev.filter((_, i) => i !== index))
    setEditPhotoPreviews((prev) => prev.filter((_, i) => i !== index))

    if (editPhotoInputRef.current) editPhotoInputRef.current.value = ""
  }

  const clearPhotos = () => {
    photoPreviews.forEach((url) => URL.revokeObjectURL(url))
    setPhotoFiles([])
    setPhotoPreviews([])

    if (photoInputRef.current) photoInputRef.current.value = ""
  }

  const clearEditPhotos = () => {
    editPhotoPreviews.forEach((url) => URL.revokeObjectURL(url))
    setEditPhotoFiles([])
    setEditPhotoPreviews([])

    if (editPhotoInputRef.current) editPhotoInputRef.current.value = ""
  }

  const openEdit = (entry: DieselEntry) => {
    setEditingEntry(entry)
    setEditMileage(entry.mileage === null ? "" : String(entry.mileage))
    setEditLitres(entry.litres === null ? "" : String(entry.litres))
    setEditRegNumber(entry.reg_number ?? "")
    clearEditPhotos()
  }

  const closeEdit = () => {
    setEditingEntry(null)
    setEditMileage("")
    setEditLitres("")
    setEditRegNumber("")
    clearEditPhotos()
  }

  const saveDiesel = async () => {
    if (saving) return

    if (!mileage && !litres && photoFiles.length === 0) {
      alert("Enter mileage, litres or add photo")
      return
    }

    setSaving(true)

    const mileageNumber = mileage ? Number(mileage) : null
    const litresNumber = litres ? Number(litres) : null
    const selectedReg = regNumber || assignedReg || null

    if (mileageNumber !== null && mileageNumber <= 0) {
      alert("Mileage must be higher than 0")
      setSaving(false)
      return
    }

    if (litresNumber !== null && litresNumber <= 0) {
      alert("Litres must be higher than 0")
      setSaving(false)
      return
    }

    const localId = Date.now()

    const localEntry: DieselEntry = {
      id: localId,
      driver_id: driverId,
      entry_date: today,
      mileage: mileageNumber,
      litres: litresNumber,
      reg_number: selectedReg,
      photo_url: null,
      photo_path: null,
      created_at: new Date().toISOString(),
      syncStatus: "pending",
    }

    const savedPhotoFiles = [...photoFiles]

    const nextEntries = [localEntry, ...entries]
    setEntries(nextEntries)
    setAllDieselEntries((prev) => [localEntry, ...prev])
    localStorage.setItem(dieselEntriesStorageKey, JSON.stringify(nextEntries))

    setMileage("")
    setLitres("")
    setRegNumber("")
    clearPhotos()
    setAddOpen(false)
    setSaving(false)

    setTimeout(async () => {
      try {
        const localPhotos = await Promise.all(
          savedPhotoFiles.map((file) => fileToBase64(file))
        )

        if (localPhotos.length > 0) {
          const photoRows: DieselPhoto[] = localPhotos.map((photo, index) => ({
            id: Date.now() + index,
            diesel_entry_id: localId,
            driver_id: driverId,
            photo_url: photo,
            photo_path: "",
            created_at: new Date().toISOString(),
          }))

          const savedPhotos = loadFromStorage<DieselPhoto[]>(
            dieselPhotosStorageKey,
            []
          )

          const nextPhotos = [...photoRows, ...savedPhotos]
          setPhotos(nextPhotos)
          localStorage.setItem(dieselPhotosStorageKey, JSON.stringify(nextPhotos))
        }

    if (navigator.onLine) {
  triggerOneillGlobalSync(driverId)
}
      } catch (error) {
        console.log("DIESEL BACKGROUND PHOTO SAVE ERROR:", error)
      }
    }, 100)
  }

  const saveEditDiesel = async () => {
    if (editingSaving || !editingEntry) return

    const existingPhotos = getEntryPhotos(editingEntry.id)

    if (
      !editMileage &&
      !editLitres &&
      editPhotoFiles.length === 0 &&
      existingPhotos.length === 0
    ) {
      alert("Enter mileage, litres or add photo")
      return
    }

    setEditingSaving(true)

    const mileageNumber = editMileage ? Number(editMileage) : null
    const litresNumber = editLitres ? Number(editLitres) : null

    if (mileageNumber !== null && mileageNumber <= 0) {
      alert("Mileage must be higher than 0")
      setEditingSaving(false)
      return
    }

    if (litresNumber !== null && litresNumber <= 0) {
      alert("Litres must be higher than 0")
      setEditingSaving(false)
      return
    }

    const entryId = editingEntry.id
    const savedPhotoFiles = [...editPhotoFiles]

    const updatedEntry: DieselEntry = {
      ...editingEntry,
      mileage: mileageNumber,
      litres: litresNumber,
      reg_number: editRegNumber || null,
      syncStatus: "pending",
    }

    const nextEntries = entries.map((entry) =>
      entry.id === entryId ? updatedEntry : entry
    )

    setEntries(nextEntries)
    setAllDieselEntries((prev) =>
      prev.map((entry) => (entry.id === entryId ? updatedEntry : entry))
    )

    localStorage.setItem(dieselEntriesStorageKey, JSON.stringify(nextEntries))

    setEditingSaving(false)
    closeEdit()

    setTimeout(async () => {
      try {
        const localPhotos = await Promise.all(
          savedPhotoFiles.map((file) => fileToBase64(file))
        )

        if (localPhotos.length > 0) {
          const photoRows: DieselPhoto[] = localPhotos.map((photo, index) => ({
            id: Date.now() + index,
            diesel_entry_id: entryId,
            driver_id: driverId,
            photo_url: photo,
            photo_path: "",
            created_at: new Date().toISOString(),
          }))

          const savedPhotos = loadFromStorage<DieselPhoto[]>(
            dieselPhotosStorageKey,
            []
          )

          const nextPhotos = [...photoRows, ...savedPhotos]
          setPhotos(nextPhotos)
          localStorage.setItem(dieselPhotosStorageKey, JSON.stringify(nextPhotos))
        }

    if (navigator.onLine) {
  triggerOneillGlobalSync(driverId)
}
      } catch (error) {
        console.log("DIESEL EDIT BACKGROUND PHOTO SAVE ERROR:", error)
      }
    }, 100)
  }

  const deleteDieselPhoto = async (photo: DieselPhoto) => {
    if (!confirm("Delete this photo?")) return

    const nextPhotos = photos.filter((item) => item.id !== photo.id)
    setPhotos(nextPhotos)
    localStorage.setItem(dieselPhotosStorageKey, JSON.stringify(nextPhotos))

    if (photo.photo_path && !photo.photo_url.startsWith("data:")) {
      const nextDeletes = [photo, ...pendingPhotoDeletes]
      setPendingPhotoDeletes(nextDeletes)
      localStorage.setItem(dieselPhotoDeletesStorageKey, JSON.stringify(nextDeletes))
    }

 setTimeout(() => {
  if (navigator.onLine) triggerOneillGlobalSync(driverId)
}, 300)
  }

  const deleteDieselEntry = async (id: number) => {
    if (!confirm("Delete this diesel entry?")) return

    const entryToDelete = entries.find((entry) => entry.id === id)

    const nextEntries =
      entryToDelete?.syncStatus === "pending" && isLocalId(id)
        ? entries.filter((entry) => entry.id !== id)
        : entries.map((entry) =>
            entry.id === id
              ? { ...entry, syncStatus: "delete_pending" as const }
              : entry
          )

    const nextPhotos =
      entryToDelete?.syncStatus === "pending" && isLocalId(id)
        ? photos.filter((photo) => photo.diesel_entry_id !== id)
        : photos

    setEntries(nextEntries)
    setAllDieselEntries((prev) =>
      entryToDelete?.syncStatus === "pending" && isLocalId(id)
        ? prev.filter((entry) => entry.id !== id)
        : prev.map((entry) =>
            entry.id === id
              ? { ...entry, syncStatus: "delete_pending" as const }
              : entry
          )
    )
    setPhotos(nextPhotos)

    localStorage.setItem(dieselEntriesStorageKey, JSON.stringify(nextEntries))
    localStorage.setItem(dieselPhotosStorageKey, JSON.stringify(nextPhotos))

    closeEdit()

  setTimeout(() => {
  if (navigator.onLine) triggerOneillGlobalSync(driverId)
}, 300)
  }

  const currentWeekEntries = entries
    .filter(
      (entry) =>
        entry.syncStatus !== "delete_pending" &&
        getWeekTitle(entry.entry_date) === currentWeekTitle
    )
    .sort((a, b) => {
      const timeDiff = getEntryTime(a) - getEntryTime(b)
      if (timeDiff !== 0) return timeDiff
      return a.id - b.id
    })

  const weekLitres = currentWeekEntries.reduce(
    (sum, entry) => sum + (entry.litres ?? 0),
    0
  )

  const archiveWeeks = entries
    .filter(
      (entry) =>
        entry.syncStatus !== "delete_pending" &&
        getWeekTitle(entry.entry_date) !== currentWeekTitle
    )
    .reduce((groups, entry) => {
      const title = getWeekTitle(entry.entry_date)
      if (!groups[title]) groups[title] = []
      groups[title].push(entry)
      return groups
    }, {} as Record<string, DieselEntry[]>)

  const archiveTitles = Object.keys(archiveWeeks)

  const isArchiveList = archiveOpen && !activeArchiveWeek

  const visibleArchiveEntries = activeArchiveWeek
    ? [...(archiveWeeks[activeArchiveWeek] ?? [])].sort((a, b) => {
        const timeDiff = getEntryTime(a) - getEntryTime(b)
        if (timeDiff !== 0) return timeDiff
        return a.id - b.id
      })
    : []

    const isArchiveMode = !!activeArchiveWeek

const visibleEntries = isArchiveMode
  ? visibleArchiveEntries
  : currentWeekEntries

  const visibleLitres = visibleEntries.reduce(
  (sum, entry) => sum + (entry.litres ?? 0),
  0
)

  return (
    <div className="fixed inset-0 z-[80] bg-white p-3 overflow-y-auto pb-[80px]">
      <div className="flex items-center gap-2 mb-3">
      <button
  onClick={() => {
    if (activeArchiveWeek) {
      setActiveArchiveWeek(null)
    } else if (archiveOpen) {
      setArchiveOpen(false)
    } else {
      onBack()
    }
  }}
  className="w-[30px] text-[34px] text-blue-500 leading-none"
>
  ‹
</button>

        <div className="flex-1 text-center">
         <div className="text-[22px] font-bold">
  {archiveOpen ? "Diesel Archive" : "Diesel"}
</div>
{!archiveOpen && (
  <div className="text-[14px] font-bold">
    This week {weekLitres.toFixed(2)} L
  </div>
)}
        </div>

        
{!archiveOpen ? (
  <button
    onClick={() => {
      setArchiveOpen(true)
      setActiveArchiveWeek(null)
    }}
     className="w-[30px] text-[28px] leading-none"
  >
    📁
  </button>
) : (
  <div className="w-[70px]" />
)}


      </div>





<div className="mt-5 space-y-3">
  {isArchiveList &&
    archiveTitles.map((title) => {
      const total = archiveWeeks[title].reduce(
        (sum, entry) => sum + (entry.litres ?? 0),
        0
      )

      return (
        <button
          key={title}
          onClick={() => setActiveArchiveWeek(title)}
          className="w-full text-center bg-[#f5f5f5] rounded-[18px] border border-green-400 px-3 py-3 shadow-sm"
        >
          <div className="font-bold">{title}</div>
          <div className="text-[14px] text-zinc-500">
            {archiveWeeks[title].length} entries · {total.toFixed(2)} L
          </div>
        </button>
      )
    })}

  {!isArchiveList &&
    visibleEntries.map((entry) => {
          const entryPhotos = getEntryPhotos(entry.id)
          const previousEntry = findPreviousEntryForSameTruck(entry)
          const average = getDieselAverageFromPrevious(entry, previousEntry)

          return (
            <button
              key={entry.id}
              onClick={() => openEdit(entry)}
            className="w-full text-left bg-[#f5f5f5] rounded-[18px] border border-green-400 px-3 py-2 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="pl-2">
                  <div className="flex gap-2">
                    <span>{displayDate(entry.entry_date)}</span>
                    <b>{entry.reg_number ?? assignedReg}</b>
                  </div>

                  <div>
                    Mileage: <b>{entry.mileage ?? "-"}</b>
                  </div>

                  <div>
                    Litres:{" "}
                    <b>
                      {entry.litres === null
                        ? "-"
                        : `${Number(entry.litres).toFixed(2)} L`}
                    </b>
                  </div>

                  <div className="text-[11px]">
                    {entry.syncStatus === "pending"
                      ? "⌛ Waiting sync"
                      : entry.syncStatus === "synced"
                      ? "✔ Synced"
                      : ""}
                  </div>

                  {isBoss && average !== null && (
                    <>
                      <div>
                        Distance: <b>{average.miles}</b> miles
                      </div>

                      <div>
                        MPG: <b>{average.mpg.toFixed(1)}</b>
                      </div>

                      <div>
                        L/100km: <b>{average.litresPer100km.toFixed(1)}</b>
                      </div>
                    </>
                  )}
                </div>

                {entryPhotos.length > 0 && (
                  <div className="flex gap-1 shrink-0">
                    {entryPhotos.slice(0, 3).map((photo) => (
                      <img
                        key={photo.id}
                        src={photo.photo_url}
                        alt="Diesel receipt"
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpenPhoto(photo.photo_url)
                        }}
                        className="h-[46px] w-[46px] rounded-[9px] object-cover"
                      />
                    ))}
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>

    {!archiveOpen && (
  <div className="fixed left-0 right-0 bottom-0 z-[90] bg-white p-3">
    <button
      onClick={() => {
        setMileage("")
        setLitres("")
        setRegNumber(assignedReg)
        clearPhotos()
        setAddOpen(true)
      }}
      className="w-full h-[44px] rounded-[16px] bg-blue-600 text-white font-bold text-[16px]"
    >
      + Fill Up Diesel
    </button>
  </div>
)}

      {addOpen && (
        <div
          onClick={() => setAddOpen(false)}
          className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[360px] bg-white rounded-[22px] p-4"
          >
            <h2 className="text-[22px] font-bold mb-3">Fill Up Diesel</h2>

            <div className="space-y-3">
              <select
                value={regNumber}
                onChange={(e) => setRegNumber(e.target.value)}
                className="w-full h-[46px] rounded-[12px] border px-4 text-[16px]"
              >
                <option value="">Select Reg</option>

                {trucks.map((truck) => (
                  <option key={truck.id} value={truck.reg}>
                    {truck.reg}
                  </option>
                ))}
              </select>

              <input
                type="number"
                placeholder="Mileage"
                value={mileage}
                onChange={(e) => setMileage(e.target.value)}
                className="w-full h-[46px] rounded-[12px] border px-4 text-[16px]"
              />

              <input
                type="number"
                placeholder="Litres"
                value={litres}
                onChange={(e) => setLitres(e.target.value)}
                className="w-full h-[46px] rounded-[12px] border px-4 text-[16px]"
              />

              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="w-full h-[42px] rounded-[12px] bg-zinc-200 font-bold text-[15px]"
              >
                📷 Add Photo
              </button>

              {photoPreviews.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pt-3 pb-1">
                  {photoPreviews.map((preview, index) => (
                    <div key={preview} className="relative shrink-0">
                      <img
                        src={preview}
                        alt="Preview"
                        onClick={() => setOpenPhoto(preview)}
                        className="h-[70px] w-[70px] rounded-[10px] object-cover"
                      />

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          removePhoto(index)
                        }}
                        className="absolute top-1 right-1 h-5 w-5 rounded-full bg-red-600 text-white text-[11px] font-bold"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => choosePhotos(e.target.files)}
              />

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setAddOpen(false)
                    clearPhotos()
                    setMileage("")
                    setLitres("")
                    setRegNumber("")
                  }}
                  className="flex-1 h-[46px] rounded-[14px] bg-zinc-200 font-bold"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={saveDiesel}
                  className="flex-1 h-[46px] rounded-[14px] bg-blue-600 text-white font-bold"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingEntry && (
        <div
          onClick={closeEdit}
          className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[360px] bg-white rounded-[22px] p-4"
          >
            <h2 className="text-[22px] font-bold mb-3">Edit Diesel</h2>

            <div className="text-[14px] font-bold mb-3 text-zinc-500">
              {displayDate(editingEntry.entry_date)}
            </div>

            <div className="space-y-3">
              <select
                value={editRegNumber}
                onChange={(e) => setEditRegNumber(e.target.value)}
                className="w-full h-[46px] rounded-[12px] border px-4 text-[16px]"
              >
                <option value="">Select Reg</option>

                {trucks.map((truck) => (
                  <option key={truck.id} value={truck.reg}>
                    {truck.reg}
                  </option>
                ))}
              </select>

              <input
                type="number"
                placeholder="Mileage"
                value={editMileage}
                onChange={(e) => setEditMileage(e.target.value)}
                className="w-full h-[46px] rounded-[12px] border px-4 text-[16px]"
              />

              <input
                type="number"
                placeholder="Litres"
                value={editLitres}
                onChange={(e) => setEditLitres(e.target.value)}
                className="w-full h-[46px] rounded-[12px] border px-4 text-[16px]"
              />

              <button
                type="button"
                onClick={() => editPhotoInputRef.current?.click()}
                className="w-full h-[42px] rounded-[12px] bg-zinc-200 font-bold text-[15px]"
              >
                📷 Add Photo
              </button>

              <div className="flex gap-2 overflow-x-auto pt-3 pb-1">
                {getEntryPhotos(editingEntry.id).map((photo) => (
                  <div key={photo.id} className="relative shrink-0">
                    <img
                      src={photo.photo_url}
                      alt="Diesel receipt"
                      onClick={() => setOpenPhoto(photo.photo_url)}
                      className="h-[70px] w-[70px] rounded-[10px] object-cover"
                    />

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteDieselPhoto(photo)
                      }}
                      className="absolute top-1 right-1 h-5 w-5 rounded-full bg-red-600 text-white text-[11px] font-bold"
                    >
                      ×
                    </button>
                  </div>
                ))}

                {editPhotoPreviews.map((preview, index) => (
                  <div key={preview} className="relative shrink-0">
                    <img
                      src={preview}
                      alt="Preview"
                      onClick={() => setOpenPhoto(preview)}
                      className="h-[70px] w-[70px] rounded-[10px] object-cover"
                    />

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeEditPhoto(index)
                      }}
                      className="absolute top-1 right-1 h-5 w-5 rounded-full bg-red-600 text-white text-[11px] font-bold"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <input
                ref={editPhotoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => chooseEditPhotos(e.target.files)}
              />

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeEdit}
                  className="flex-1 h-[46px] rounded-[14px] bg-zinc-200 font-bold"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={saveEditDiesel}
                  className="flex-1 h-[46px] rounded-[14px] bg-blue-600 text-white font-bold"
                >
                  {editingSaving ? "Saving..." : "Save"}
                </button>

                <button
                  type="button"
                  onClick={() => deleteDieselEntry(editingEntry.id)}
                  className="flex-1 h-[46px] rounded-[14px] bg-red-600 text-white font-bold"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

       {openPhoto && (
        <div
          onClick={() => setOpenPhoto(null)}
          className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4"
        >
          <img
            src={openPhoto}
            alt="Diesel receipt"
            className="max-h-full max-w-full rounded-[16px]"
          />
        </div>
      )}
    </div>
  )
}