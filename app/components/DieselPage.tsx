"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "./supabase"

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
  localPhotos?: string[]
}

type DieselPhoto = {
  id: number
  diesel_entry_id: number
  driver_id: number
  photo_url: string
  photo_path: string
  created_at?: string
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

      const maxWidth = 1400
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
    const reader = new FileReader()

    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject

    reader.readAsDataURL(file)
  })
}

export default function DieselPage({
  driverId,
  onBack,
  isBoss = false,
}: DieselPageProps) {
  const [entries, setEntries] = useState<DieselEntry[]>([])
  const [allDieselEntries, setAllDieselEntries] = useState<DieselEntry[]>([])
  const [photos, setPhotos] = useState<DieselPhoto[]>([])
  const [pendingPhotoDeletes, setPendingPhotoDeletes] = useState<DieselPhoto[]>([])

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

  const [localLoaded, setLocalLoaded] = useState(false)

  const [archiveOpen, setArchiveOpen] = useState(false)
  const [activeArchiveWeek, setActiveArchiveWeek] = useState<string | null>(null)

  const today = formatEntryDate(new Date())
  const currentWeekTitle = getWeekTitle(today)

  const dieselEntriesStorageKey = `oneill-diesel-entries-${driverId}`
  const dieselPhotosStorageKey = `oneill-diesel-photos-${driverId}`
  const dieselPhotoDeletesStorageKey = `oneill-diesel-photo-deletes-${driverId}`

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
      .upload(filePath, compressedFile)

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

  const uploadAndInsertPhotos = async (dieselEntryId: number, files: File[]) => {
    if (files.length === 0) return

    const rows = []

    for (const file of files) {
      const uploaded = await uploadPhoto(file)

      rows.push({
        diesel_entry_id: dieselEntryId,
        driver_id: driverId,
        photo_url: uploaded.photo_url,
        photo_path: uploaded.photo_path,
      })
    }

    const { data, error } = await supabase
      .from("diesel_photos")
      .insert(rows)
      .select()

    if (error) {
      console.log("DIESEL PHOTOS INSERT ERROR:", error)
      throw error
    }

    if (data) setPhotos((prev) => [...data, ...prev])
  }

  const syncLocalPhotosForEntry = async (oldEntryId: number, newEntryId: number) => {
    const localPhotos = photos.filter(
      (photo) =>
        photo.diesel_entry_id === oldEntryId &&
        (!photo.photo_path || photo.photo_url.startsWith("data:"))
    )

    if (localPhotos.length === 0) return

    const insertedPhotos: DieselPhoto[] = []

    for (const photo of localPhotos) {
      const file = dataUrlToFile(photo.photo_url, `diesel-${photo.id}.jpg`)
      const uploaded = await uploadPhoto(file)

      const { data, error } = await supabase
        .from("diesel_photos")
        .insert({
          diesel_entry_id: newEntryId,
          driver_id: driverId,
          photo_url: uploaded.photo_url,
          photo_path: uploaded.photo_path,
        })
        .select()
        .single()

      if (!error && data) insertedPhotos.push(data)
    }

    if (insertedPhotos.length > 0) {
      setPhotos((prev) => [
        ...insertedPhotos,
        ...prev.filter((photo) => !localPhotos.some((p) => p.id === photo.id)),
      ])
    }
  }

  const loadDieselEntries = async () => {
    const { data, error } = await supabase
      .from("diesel_entries")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.log("DIESEL LOAD ERROR:", error)
      return
    }

    const remoteRows: DieselEntry[] = (data ?? []).map((entry) => ({
      ...entry,
      syncStatus: "synced",
    }))

    let localRows: DieselEntry[] = []

    try {
      localRows = JSON.parse(localStorage.getItem(dieselEntriesStorageKey) ?? "[]")
    } catch {
      localRows = []
    }

    const deletedIds = localRows
      .filter((entry) => entry.syncStatus === "delete_pending")
      .map((entry) => entry.id)

    const localPendingRows = localRows.filter(
      (entry) =>
        entry.syncStatus === "pending" || entry.syncStatus === "delete_pending"
    )

    const mergedDriverRows = [
      ...localPendingRows,
      ...remoteRows.filter(
        (entry) =>
          entry.driver_id === driverId &&
          !deletedIds.includes(entry.id) &&
          !localPendingRows.some((local) => local.id === entry.id)
      ),
    ]

    setAllDieselEntries([
      ...remoteRows.filter(
        (entry) => !localPendingRows.some((local) => local.id === entry.id)
      ),
      ...localPendingRows,
    ])

    setEntries(mergedDriverRows)

    const { data: photoData, error: photoError } = await supabase
      .from("diesel_photos")
      .select("*")
      .eq("driver_id", driverId)
      .order("created_at", { ascending: false })

    if (photoError) {
      console.log("DIESEL PHOTOS LOAD ERROR:", photoError)
      return
    }

    let localPhotos: DieselPhoto[] = []

    try {
      localPhotos = JSON.parse(localStorage.getItem(dieselPhotosStorageKey) ?? "[]")
    } catch {
      localPhotos = []
    }

    const localOnlyPhotos = localPhotos.filter(
      (photo) => !photo.photo_path || photo.photo_url.startsWith("data:")
    )

    setPhotos([
      ...localOnlyPhotos,
      ...(photoData ?? []).filter(
        (photo) => !localOnlyPhotos.some((local) => local.id === photo.id)
      ),
    ])
  }

  const loadTrucks = async () => {
    const { data } = await supabase.from("trucks").select("*").order("reg")
    setTrucks(data ?? [])
  }

  const loadAssignedTruck = async () => {
    const { data } = await supabase
      .from("drivers")
      .select("truck_reg")
      .eq("id", driverId)
      .single()

    setAssignedReg(data?.truck_reg ?? "")
  }

useEffect(() => {
  if (!localLoaded) return

  try {
    localStorage.setItem(dieselEntriesStorageKey, JSON.stringify(entries))
    localStorage.setItem(dieselPhotosStorageKey, JSON.stringify(photos))
  } catch (error) {
    console.log("DIESEL LOCAL SAVE ERROR:", error)
  }
}, [entries, photos, localLoaded])

  useEffect(() => {
    try {
      const savedEntries = localStorage.getItem(dieselEntriesStorageKey)
      const savedPhotos = localStorage.getItem(dieselPhotosStorageKey)
      const savedPhotoDeletes = localStorage.getItem(dieselPhotoDeletesStorageKey)

      if (savedEntries) {
        const parsedEntries = JSON.parse(savedEntries)
        setEntries(parsedEntries)
        setAllDieselEntries(parsedEntries)
      }

      if (savedPhotos) {
        setPhotos(JSON.parse(savedPhotos))
      }

      if (savedPhotoDeletes) {
        setPendingPhotoDeletes(JSON.parse(savedPhotoDeletes))
      }
    } catch (error) {
      console.log("DIESEL LOCAL LOAD ERROR:", error)
    }

    setLocalLoaded(true)

    loadDieselEntries()
    loadTrucks()
    loadAssignedTruck()
  }, [driverId])

  const syncPendingDieselEntries = async () => {
    if (!navigator.onLine) return

    for (const photo of pendingPhotoDeletes) {
      try {
        if (photo.photo_path) {
          await supabase.storage.from("entry-photos").remove([photo.photo_path])
        }

        await supabase.from("diesel_photos").delete().eq("id", photo.id)

        setPendingPhotoDeletes((prev) =>
          prev.filter((item) => item.id !== photo.id)
        )
      } catch (error) {
        console.log("DIESEL PHOTO DELETE SYNC ERROR:", error)
      }
    }

    const deleteEntries = entries.filter(
      (entry) => entry.syncStatus === "delete_pending"
    )

    for (const entry of deleteEntries) {
      try {
        const entryPhotos = photos.filter(
          (photo) => photo.diesel_entry_id === entry.id
        )

        const remotePhotoPaths = entryPhotos
          .map((photo) => photo.photo_path)
          .filter(Boolean)

        if (remotePhotoPaths.length > 0) {
          await supabase.storage.from("entry-photos").remove(remotePhotoPaths)
        }

        await supabase.from("diesel_photos").delete().eq("diesel_entry_id", entry.id)
        await supabase.from("diesel_entries").delete().eq("id", entry.id)

        setEntries((prev) => prev.filter((item) => item.id !== entry.id))
        setAllDieselEntries((prev) => prev.filter((item) => item.id !== entry.id))
        setPhotos((prev) =>
          prev.filter((photo) => photo.diesel_entry_id !== entry.id)
        )
      } catch (error) {
        console.log("DIESEL DELETE SYNC ERROR:", error)
      }
    }

    const pendingEntries = entries.filter(
      (entry) => entry.syncStatus === "pending"
    )

    for (const pendingEntry of pendingEntries) {
      try {
        if (isLocalId(pendingEntry.id)) {
          const { data, error } = await supabase
            .from("diesel_entries")
            .insert({
              driver_id: pendingEntry.driver_id,
              entry_date: pendingEntry.entry_date,
              mileage: pendingEntry.mileage,
              litres: pendingEntry.litres,
              reg_number: pendingEntry.reg_number,
              photo_url: null,
              photo_path: null,
            })
            .select()
            .single()

          if (error || !data) {
            console.log("DIESEL PENDING INSERT ERROR:", error)
            continue
          }

          const syncedEntry: DieselEntry = {
            ...data,
            syncStatus: "synced",
          }

          await syncLocalPhotosForEntry(pendingEntry.id, data.id)

          setEntries((prev) =>
            prev.map((entry) =>
              entry.id === pendingEntry.id ? syncedEntry : entry
            )
          )

          setAllDieselEntries((prev) =>
            prev.map((entry) =>
              entry.id === pendingEntry.id ? syncedEntry : entry
            )
          )

          setPhotos((prev) =>
            prev.map((photo) =>
              photo.diesel_entry_id === pendingEntry.id
                ? { ...photo, diesel_entry_id: data.id }
                : photo
            )
          )
        } else {
          const { data, error } = await supabase
            .from("diesel_entries")
            .update({
              mileage: pendingEntry.mileage,
              litres: pendingEntry.litres,
              reg_number: pendingEntry.reg_number,
            })
            .eq("id", pendingEntry.id)
            .select()
            .single()

          if (error || !data) {
            console.log("DIESEL PENDING UPDATE ERROR:", error)
            continue
          }

          await syncLocalPhotosForEntry(pendingEntry.id, pendingEntry.id)

          const syncedEntry: DieselEntry = {
            ...data,
            syncStatus: "synced",
          }

          setEntries((prev) =>
            prev.map((entry) =>
              entry.id === pendingEntry.id ? syncedEntry : entry
            )
          )

          setAllDieselEntries((prev) =>
            prev.map((entry) =>
              entry.id === pendingEntry.id ? syncedEntry : entry
            )
          )
        }
      } catch (error) {
        console.log("DIESEL PENDING SYNC CATCH:", error)
      }
    }
  }

useEffect(() => {
  if (!localLoaded) return

  const handleOnline = async () => {
    await syncPendingDieselEntries()
    await loadDieselEntries()
  }

  window.addEventListener("online", handleOnline)

  return () => {
    window.removeEventListener("online", handleOnline)
  }
}, [localLoaded])

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

    setEntries((prev) => [localEntry, ...prev])
    setAllDieselEntries((prev) => [localEntry, ...prev])

    const filesToUpload = [...photoFiles]

 if (!navigator.onLine) {
  const localPhotos = await Promise.all(
    filesToUpload.map((file) => fileToBase64(file))
  )

  if (localPhotos.length > 0) {
    const localPhotoRows: DieselPhoto[] = localPhotos.map((photo, index) => ({
      id: Date.now() + index,
      diesel_entry_id: localEntry.id,
      driver_id: driverId,
      photo_url: photo,
      photo_path: "",
      created_at: new Date().toISOString(),
    }))

    setPhotos((prev) => [...localPhotoRows, ...prev])
  }
}

    setMileage("")
    setLitres("")
    setRegNumber("")
    clearPhotos()
    setAddOpen(false)
    setSaving(false)

    if (!navigator.onLine) {
      return
    }

    try {
      const { data, error } = await supabase
        .from("diesel_entries")
        .insert({
          driver_id: driverId,
          entry_date: today,
          mileage: mileageNumber,
          litres: litresNumber,
          reg_number: selectedReg,
          photo_url: null,
          photo_path: null,
        })
        .select()
        .single()

      if (error) {
        console.log("DIESEL SAVE ERROR:", error)
        return
      }

      if (data) {
        const syncedEntry: DieselEntry = {
          ...data,
          syncStatus: "synced",
        }

        setEntries((prev) =>
          prev.map((entry) =>
            entry.id === localEntry.id ? syncedEntry : entry
          )
        )

        setAllDieselEntries((prev) =>
          prev.map((entry) =>
            entry.id === localEntry.id ? syncedEntry : entry
          )
        )

        setPhotos((prev) =>
          prev.map((photo) =>
            photo.diesel_entry_id === localEntry.id
              ? { ...photo, diesel_entry_id: data.id }
              : photo
          )
        )

        await uploadAndInsertPhotos(data.id, filesToUpload)

        setPhotos((prev) =>
  prev.filter(
    (photo) =>
      !(
        photo.diesel_entry_id === data.id &&
        (!photo.photo_path || photo.photo_url.startsWith("data:"))
      )
  )
)

 
      }
    } catch (error) {
      console.log("DIESEL SAVE PHOTO ERROR:", error)
    }
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

    const localUpdatedEntry: DieselEntry = {
      ...editingEntry,
      mileage: mileageNumber,
      litres: litresNumber,
      reg_number: editRegNumber || null,
      syncStatus: "pending",
    }

    const localPhotos = await Promise.all(
      editPhotoFiles.map((file) => fileToBase64(file))
    )

    if (localPhotos.length > 0) {
      const localPhotoRows: DieselPhoto[] = localPhotos.map((photo, index) => ({
        id: Date.now() + index,
        diesel_entry_id: editingEntry.id,
        driver_id: driverId,
        photo_url: photo,
        photo_path: "",
        created_at: new Date().toISOString(),
      }))

      setPhotos((prev) => [...localPhotoRows, ...prev])
    }

    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === editingEntry.id ? localUpdatedEntry : entry
      )
    )

    setAllDieselEntries((prev) =>
      prev.map((entry) =>
        entry.id === editingEntry.id ? localUpdatedEntry : entry
      )
    )

    const entryId = editingEntry.id
    const filesToUpload = [...editPhotoFiles]

    setEditingSaving(false)
    closeEdit()

    if (!navigator.onLine) {
      return
    }

    try {
      const { data, error } = await supabase
        .from("diesel_entries")
        .update({
          mileage: mileageNumber,
          litres: litresNumber,
          reg_number: editRegNumber || null,
        })
        .eq("id", entryId)
        .select()
        .single()

      if (error) {
        console.log("DIESEL EDIT ERROR:", error)
        return
      }

      if (data) {
        const syncedEntry: DieselEntry = {
          ...data,
          syncStatus: "synced",
        }

        setEntries((prev) =>
          prev.map((entry) => (entry.id === data.id ? syncedEntry : entry))
        )

        setAllDieselEntries((prev) =>
          prev.map((entry) => (entry.id === data.id ? syncedEntry : entry))
        )

        await uploadAndInsertPhotos(data.id, filesToUpload)

        setPhotos((prev) =>
  prev.filter(
    (photo) =>
      !(
        photo.diesel_entry_id === data.id &&
        (!photo.photo_path || photo.photo_url.startsWith("data:"))
      )
  )
)

    
      }
    } catch (error) {
      console.log("DIESEL EDIT PHOTO ERROR:", error)
    }
  }

  const deleteDieselPhoto = async (photo: DieselPhoto) => {
    if (!confirm("Delete this photo?")) return

    setPhotos((prev) => prev.filter((item) => item.id !== photo.id))

    if (!navigator.onLine || !photo.photo_path || photo.photo_url.startsWith("data:")) {
      if (photo.photo_path && !photo.photo_url.startsWith("data:")) {
        setPendingPhotoDeletes((prev) => [photo, ...prev])
      }
      return
    }

    const { error: storageError } = await supabase.storage
      .from("entry-photos")
      .remove([photo.photo_path])

    if (storageError) {
      console.log("DIESEL STORAGE DELETE ERROR:", storageError)
    }

    const { error } = await supabase
      .from("diesel_photos")
      .delete()
      .eq("id", photo.id)

    if (error) {
      alert("Photo delete error")
      return
    }
  }

  const deleteDieselEntry = async (id: number) => {
    if (!confirm("Delete this diesel entry?")) return

    if (!navigator.onLine || isLocalId(id)) {
      if (isLocalId(id)) {
        setEntries((prev) => prev.filter((entry) => entry.id !== id))
        setAllDieselEntries((prev) => prev.filter((entry) => entry.id !== id))
        setPhotos((prev) => prev.filter((photo) => photo.diesel_entry_id !== id))
      } else {
        setEntries((prev) =>
          prev.map((entry) =>
            entry.id === id ? { ...entry, syncStatus: "delete_pending" } : entry
          )
        )

        setAllDieselEntries((prev) =>
          prev.map((entry) =>
            entry.id === id ? { ...entry, syncStatus: "delete_pending" } : entry
          )
        )
      }

      closeEdit()
      return
    }

    const entryPhotos = getEntryPhotos(id)

    if (entryPhotos.length > 0) {
      await supabase.storage
        .from("entry-photos")
        .remove(entryPhotos.map((photo) => photo.photo_path).filter(Boolean))

      await supabase.from("diesel_photos").delete().eq("diesel_entry_id", id)
    }

    const { error } = await supabase.from("diesel_entries").delete().eq("id", id)

    if (error) {
      alert("Delete failed")
      return
    }

    setEntries((prev) => prev.filter((entry) => entry.id !== id))
    setAllDieselEntries((prev) => prev.filter((entry) => entry.id !== id))
    setPhotos((prev) => prev.filter((photo) => photo.diesel_entry_id !== id))
    closeEdit()
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

  const visibleArchiveEntries = activeArchiveWeek
    ? [...(archiveWeeks[activeArchiveWeek] ?? [])].sort((a, b) => {
        const timeDiff = getEntryTime(a) - getEntryTime(b)
        if (timeDiff !== 0) return timeDiff
        return a.id - b.id
      })
    : []

  return (
    <div className="fixed inset-0 z-[80] bg-[#efeff4] p-3 overflow-y-auto pb-[80px]">
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={onBack}
          className="h-[42px] px-4 rounded-[14px] bg-white font-bold text-[15px]"
        >
          Back
        </button>

        <div className="flex-1 text-center">
          <div className="text-[22px] font-bold">Diesel</div>
          <div className="text-[14px] font-bold">
            This week {weekLitres.toFixed(2)} L
          </div>
        </div>

        <button
          onClick={() => {
            setArchiveOpen(true)
            setActiveArchiveWeek(null)
          }}
          className="h-[42px] px-4 rounded-[14px] bg-white font-bold text-[15px]"
        >
          Archive
        </button>
      </div>

      <div className="mt-5 space-y-3">
        {currentWeekEntries.map((entry) => {
          const entryPhotos = getEntryPhotos(entry.id)
          const previousEntry = findPreviousEntryForSameTruck(entry)
          const average = getDieselAverageFromPrevious(entry, previousEntry)

          return (
            <button
              key={entry.id}
              onClick={() => openEdit(entry)}
              className="w-full text-left bg-white rounded-[18px] px-3 py-2 shadow-sm"
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

      <div className="fixed left-0 right-0 bottom-0 z-[90] bg-[#efeff4]/95 backdrop-blur p-3">
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

      {archiveOpen && (
        <div
          onClick={() => setArchiveOpen(false)}
          className="fixed inset-0 z-[105] bg-[#efeff4]"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full h-full overflow-y-auto bg-[#efeff4] p-4"
          >
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => {
                  if (activeArchiveWeek) {
                    setActiveArchiveWeek(null)
                  } else {
                    setArchiveOpen(false)
                  }
                }}
                className="h-[40px] px-4 rounded-[14px] bg-white text-black text-[16px] font-bold"
              >
                Back
              </button>

              <h2 className="text-[22px] font-bold">
                {activeArchiveWeek ? activeArchiveWeek : "Diesel Archive"}
              </h2>

              <div className="w-[70px]" />
            </div>

            {!activeArchiveWeek && (
              <div className="space-y-2">
                {archiveTitles.length === 0 && (
                  <div className="text-zinc-500">No archived weeks yet</div>
                )}

                {archiveTitles.map((title) => {
                  const total = archiveWeeks[title].reduce(
                    (sum, entry) => sum + (entry.litres ?? 0),
                    0
                  )

                  return (
                    <button
                      key={title}
                      onClick={() => setActiveArchiveWeek(title)}
                      className="w-full bg-zinc-100 rounded-[14px] p-3 text-left"
                    >
                      <div className="font-bold">{title}</div>
                      <div className="text-[14px]">
                        {archiveWeeks[title].length} entries ·{" "}
                        {total.toFixed(2)} L
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {activeArchiveWeek && (
              <div className="space-y-3">
                {visibleArchiveEntries.map((entry) => {
                  const entryPhotos = getEntryPhotos(entry.id)
                  const previousEntry = findPreviousEntryForSameTruck(entry)
                  const average = getDieselAverageFromPrevious(
                    entry,
                    previousEntry
                  )

                  return (
                    <button
                      key={entry.id}
                      onClick={() => {
                        setArchiveOpen(false)
                        openEdit(entry)
                      }}
                      className="w-full text-left bg-white rounded-[18px] px-3 py-2 shadow-sm"
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

                          {isBoss && average !== null && (
                            <>
                              <div>
                                Distance: <b>{average.miles}</b> miles
                              </div>

                              <div>
                                MPG: <b>{average.mpg.toFixed(1)}</b>
                              </div>

                              <div>
                                L/100km:{" "}
                                <b>{average.litresPer100km.toFixed(1)}</b>
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
            )}
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