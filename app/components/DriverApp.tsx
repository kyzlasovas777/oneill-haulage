"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { supabase } from "./supabase"
import MilesPage from "./MilesPage"
import DieselPage from "./DieselPage"

type Entry = {
  id: number
  date: string
  trailer: string
  from: string
  to: string
  status: string
  note: string
  regNumber?: string
  localPhotos?: string[]
  syncStatus?: "synced" | "pending" | "delete_pending"
}

type EntryPhoto = {
  id: string
  entry_id: number
  photo_url: string
  file_path: string | null
}

type WeekArchive = {
  id: number
  title: string
  date: string
  entries: Entry[]
}

type DriverAppProps = {
  driverId: number
  driverName: string
  onBack?: () => void
  isBoss?: boolean
}

function getWeekStart(date: Date) {
  const d = new Date(date)
  const day = d.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day

  d.setDate(d.getDate() + mondayOffset)
  d.setHours(1, 0, 0, 0)

  if (date < d) {
    d.setDate(d.getDate() - 7)
  }

  return d
}

function formatEntryDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}.${month}.${day}`
}

function formatDisplayDate(dateText: string) {
  const [year, month, day] = dateText.split(".").map(Number)

  const date = new Date(year, month - 1, day)

  const weekday = date.toLocaleDateString("en-GB", {
    weekday: "long",
  })

  return `${weekday} ${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`
}

function formatWeekTitle(weekTitle: string) {
  const [start, end] = weekTitle.split(" - ")

  const [startMonth, startDay] = start.split(".")
  const [endMonth, endDay] = end.split(".")

  return `${startDay}.${startMonth} - ${endDay}.${endMonth}`
}

function getWeekTitleFromEntryDate(dateText: string) {
  const [year, month, day] = dateText.split(".").map(Number)
 const date = new Date(year, month - 1, day)
date.setHours(12, 0, 0, 0)
  const monday = getWeekStart(date)

  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  const formatShort = (date: Date) => {
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
  return `${month}.${day}`
  }

  return `${formatShort(monday)} - ${formatShort(sunday)}`
}

function shouldStartNewWeek() {
  const now = new Date()
  const day = now.getDay()
  const hour = now.getHours()
  return day === 1 && hour >= 1
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

export default function DriverApp({
  driverId,
  driverName,
  onBack,
  isBoss = false,
}: DriverAppProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
 
  const [saving, setSaving] = useState(false)

  const entriesStorageKey = `oneill-entries-${driverId}`
  const archivesStorageKey = `oneill-archives-${driverId}`
  const activeWeekStorageKey = `activeWeekTitle-${driverId}`

  const today = new Date()
  const monday = getWeekStart(today)

  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  const formatShort = (date: Date) => {
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${month}.${day}`
  }

  const currentWeekTitle = `${formatShort(monday)} - ${formatShort(sunday)}`
const displayWeekTitle = formatWeekTitle(currentWeekTitle)

  const currentDate = formatEntryDate(today)

  const [entries, setEntries] = useState<Entry[]>(() =>
    loadFromStorage<Entry[]>(entriesStorageKey, [])
  )

  const [archives, setArchives] = useState<WeekArchive[]>(() =>
    loadFromStorage<WeekArchive[]>(archivesStorageKey, [])
  )

 const [screen, setScreen] = useState<
  "main" |
  "archives" |
  "archive" |
  "miles" |
  "diesel"
>("main")

  const [activeArchiveId, setActiveArchiveId] = useState<number | null>(null)

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const [savedPhotos, setSavedPhotos] = useState<EntryPhoto[]>([])

  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null)

const [previewEntry, setPreviewEntry] = useState<Entry | null>(null)
const [previewPhotos, setPreviewPhotos] = useState<EntryPhoto[]>([])


  const [showMainMenu, setShowMainMenu] = useState(false)

  const [syncText, setSyncText] = useState("Offline ready")
  const [syncing, setSyncing] = useState(false)
  const [driverTruck, setDriverTruck] = useState("")
const [trucks, setTrucks] = useState<string[]>([])


  useEffect(() => {
  setNewEntry((prev) => ({
    ...prev,
    regNumber: driverTruck,
  }))
}, [driverTruck])

  const [showPlaceModal, setShowPlaceModal] = useState(false)
  const [newPlace, setNewPlace] = useState("")



  const [places, setPlaces] = useState([
    "CnM",
    "Stena",
    "ST",
    "Mcb Dub",
    "B.E.Naas",
    "Shercock",
    "Enniskillen",
    "Americold",
    "Pulse",
    "Alied Foods",
    "Masterlink",
    "Irish Ferry",
    "An Post",
    "DFDS Belfast",
    "Belfast Stena",
    "Tesco Ballymun",
    "Turkeys Grove",
    "Musgrave",
    "Sam Dennigan",
    "Belfast Stena Storage",
    "Drogheda",
    "Primeline",
    "Larne PnO",
    "Golden Bake Dublin",
    "TIP Airport",
    "DFS Dublin",
    "Smyths Dundalk",
  ])

const [newEntry, setNewEntry] = useState({
  trailer: "",
  regNumber: driverTruck,
  from: "CnM",
  to: "Stena",
  status: "L",
  note: "",
})

  const activeArchive = archives.find((archive) => archive.id === activeArchiveId)

  const visibleEntries =
    screen === "archive" && activeArchive
      ? activeArchive.entries.filter((entry) => entry.syncStatus !== "delete_pending")
      : entries.filter((entry) => entry.syncStatus !== "delete_pending")

  const visibleTitle =
  screen === "archive" && activeArchive ? activeArchive.title : displayWeekTitle

    const uploadLocalPhotosForEntry = async (entryId: number, localPhotos?: string[]) => {
  if (!localPhotos || localPhotos.length === 0) return

  for (let i = 0; i < localPhotos.length; i++) {
    const response = await fetch(localPhotos[i])
    const blob = await response.blob()

    const filePath = `${driverId}/${entryId}/${Date.now()}-${i}.jpg`

    const { error: uploadError } = await supabase.storage
      .from("entry-photos")
      .upload(filePath, blob)

    if (uploadError) throw uploadError

    const { data: publicData } = supabase.storage
      .from("entry-photos")
      .getPublicUrl(filePath)

    const { error: photoInsertError } = await supabase
      .from("entry_photos")
      .insert({
        entry_id: entryId,
        photo_url: publicData.publicUrl,
        file_path: filePath,
      })

    if (photoInsertError) throw photoInsertError
  }
}

const loadDriverTruck = async () => {
  const { data } = await supabase
    .from("drivers")
    .select("truck_reg")
    .eq("id", driverId)
    .single()

  setDriverTruck(data?.truck_reg ?? "")
}

const loadTrucks = async () => {
  const { data } = await supabase
    .from("trucks")
    .select("reg")
    .order("reg")

  setTrucks((data ?? []).map((truck) => truck.reg))
}

  const syncEntries = async () => {
    if (screen !== "main") return

    setSyncing(true)
    setSyncText("Syncing...")

    const localEntries = loadFromStorage<Entry[]>(entriesStorageKey, [])

    for (const entry of localEntries) {
      if (entry.syncStatus === "pending") {
        const isLocalOnly = entry.id > 1000000000000

        if (isLocalOnly) {
          const { data, error } = await supabase
            .from("entries")
            .insert({
              driver_id: driverId,
              entry_date: entry.date,
              trailer: entry.trailer,
              reg_number: entry.regNumber ?? driverTruck,
              from_place: entry.from,
              to_place: entry.to,
              status: entry.status,
              note: entry.note,
            })
            .select("id")
            .single()

          if (error) {
            console.log("ENTRY SYNC ERROR:", error)
            setSyncText("Sync error: " + error.message)
            setSyncing(false)
            return
          }

          try {
  await uploadLocalPhotosForEntry(data.id, entry.localPhotos)
} catch (photoError) {
  console.log("PHOTO SYNC ERROR:", photoError)
  setSyncText("Photo sync error")
  setSyncing(false)
  return
}

          const updated = loadFromStorage<Entry[]>(entriesStorageKey, []).map((item) =>
            item.id === entry.id
           ? { ...item, id: data.id, localPhotos: [], syncStatus: "synced" as const }
              : item
          )

          setEntries(updated)
          localStorage.setItem(entriesStorageKey, JSON.stringify(updated))
        } else {
          const { error } = await supabase
            .from("entries")
           .update({
  entry_date: entry.date,
  trailer: entry.trailer,
  from_place: entry.from,
  to_place: entry.to,
  status: entry.status,
  note: entry.note,
  reg_number: entry.regNumber ?? "",
})
            .eq("id", entry.id)

          if (error) {
            console.log("ENTRY UPDATE ERROR:", error)
            setSyncText("Sync error: " + error.message)
            setSyncing(false)
            return
          }

          if (entry.localPhotos && entry.localPhotos.length > 0) {
  try {
    await uploadLocalPhotosForEntry(entry.id, entry.localPhotos)
  } catch (photoError) {
    console.log("PHOTO UPDATE ERROR:", photoError)
    setSyncText("Photo sync error")
    setSyncing(false)
    return
  }
}

        const updated = loadFromStorage<Entry[]>(entriesStorageKey, []).map((item) =>
  item.id === entry.id
    ? {
        ...item,
        localPhotos: [],
        syncStatus: "synced" as const,
      }
    : item
)

          setEntries(updated)
          localStorage.setItem(entriesStorageKey, JSON.stringify(updated))
        }
      }

      if (entry.syncStatus === "delete_pending") {
        const { error } = await supabase.from("entries").delete().eq("id", entry.id)

        if (error) {
          console.log("ENTRY DELETE ERROR:", error)
          setSyncText("Delete error: " + error.message)
          setSyncing(false)
          return
        }

        const updated = loadFromStorage<Entry[]>(entriesStorageKey, []).filter(
          (item) => item.id !== entry.id
        )

        setEntries(updated)
        localStorage.setItem(entriesStorageKey, JSON.stringify(updated))
      }
    }

    setSyncText("Synced")
    setSyncing(false)
  }

  const loadEntriesFromSupabase = async () => {
    const { data, error } = await supabase
      .from("entries")
     .select("id, entry_date, trailer, from_place, to_place, status, note, reg_number")
      .eq("driver_id", driverId)
      .order("id", { ascending: true })

    if (error) {
      console.log("LOAD ENTRIES ERROR:", error)
      setSyncText("Offline mode")
      return
    }

    const localPending = loadFromStorage<Entry[]>(entriesStorageKey, []).filter(
      (entry) => entry.syncStatus === "pending" || entry.syncStatus === "delete_pending"
    )

  const remoteEntries: Entry[] = (data ?? []).map((entry) => ({
  id: entry.id,
  date: entry.entry_date,
  trailer: entry.trailer,
  regNumber: entry.reg_number ?? "",
  from: entry.from_place,
  to: entry.to_place,
  status: entry.status,
  note: entry.note,
  syncStatus: "synced",
}))

    const allEntries = [...remoteEntries, ...localPending]

    const currentWeekEntries = allEntries.filter(
      (entry) => getWeekTitleFromEntryDate(entry.date) === currentWeekTitle
    )

    const archiveGroups = allEntries
      .filter((entry) => getWeekTitleFromEntryDate(entry.date) !== currentWeekTitle)
      .reduce((groups, entry) => {
        const weekTitle = getWeekTitleFromEntryDate(entry.date)

        if (!groups[weekTitle]) {
          groups[weekTitle] = []
        }

        groups[weekTitle].push(entry)
        return groups
      }, {} as Record<string, Entry[]>)

    const nextArchives: WeekArchive[] = Object.entries(archiveGroups)
      .map(([title, archiveEntries]) => ({
        id: Number(title.replace(/\D/g, "")),
        title,
        date: title,
        entries: archiveEntries,
      }))
      .sort((a, b) => b.id - a.id)

    setEntries(currentWeekEntries)
    setArchives(nextArchives)

    localStorage.setItem(entriesStorageKey, JSON.stringify(currentWeekEntries))
    localStorage.setItem(archivesStorageKey, JSON.stringify(nextArchives))

    setSyncText("Loaded")
  }

  useLayoutEffect(() => {
    localStorage.setItem(entriesStorageKey, JSON.stringify(entries))
  }, [entries, entriesStorageKey])

  useEffect(() => {
    loadEntriesFromSupabase()
    loadDriverTruck()
    loadTrucks()

    const handleOnline = () => {
      syncEntries()
    }

    window.addEventListener("online", handleOnline)

    return () => {
      window.removeEventListener("online", handleOnline)
    }
  }, [])

  useLayoutEffect(() => {
    localStorage.setItem(archivesStorageKey, JSON.stringify(archives))
  }, [archives, archivesStorageKey])

  useLayoutEffect(() => {
    const savedWeekTitle = localStorage.getItem(activeWeekStorageKey)

    if (!savedWeekTitle) {
      localStorage.setItem(activeWeekStorageKey, currentWeekTitle)
      return
    }

if (savedWeekTitle !== currentWeekTitle && shouldStartNewWeek()) {
    if (entries.length > 0) {
        setArchives((prev) => [
          {
            id: Date.now(),
            title: savedWeekTitle,
            date: savedWeekTitle,
            entries,
          },
          ...prev,
        ])
      }

      setEntries([])
      localStorage.setItem(activeWeekStorageKey, currentWeekTitle)
    }
  }, [activeWeekStorageKey, currentWeekTitle, entries])

useLayoutEffect(() => {
  if (screen === "archives") return
  if (visibleEntries.length === 0) return

  const el = listRef.current
  if (!el) return

  el.scrollTop = el.scrollHeight
}, [screen, visibleEntries.length])

  const groupedEntries = visibleEntries.reduce((groups, entry) => {
    if (!groups[entry.date]) groups[entry.date] = []
    groups[entry.date].push(entry)
    return groups
  }, {} as Record<string, Entry[]>)

  const updateVisibleEntries = (nextEntries: Entry[]) => {
    if (screen === "archive" && activeArchiveId) {
      setArchives((prev) =>
        prev.map((archive) =>
          archive.id === activeArchiveId
            ? { ...archive, entries: nextEntries }
            : archive
        )
      )
    } else {
      setEntries(nextEntries)
    }
  }

  const clearPhotos = () => {
    photoPreviews.forEach((url) => URL.revokeObjectURL(url))
    setPhotoFiles([])
    setPhotoPreviews([])
    setSavedPhotos([])
  }

  const loadEntryPhotos = async (entryId: number) => {
    const { data, error } = await supabase
      .from("entry_photos")
      .select("id, entry_id, photo_url, file_path")
      .eq("entry_id", entryId)
      .order("created_at", { ascending: true })

    if (error) {
      console.log("LOAD PHOTOS ERROR:", error)
      return
    }

    setSavedPhotos(data ?? [])
  }

  const compressPhotoForUpload = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const reader = new FileReader()

      reader.onload = () => {
        img.src = reader.result as string
      }

      img.onload = () => {
        const canvas = document.createElement("canvas")
        const maxWidth = 1400
        const scale = Math.min(1, maxWidth / img.width)

        canvas.width = img.width * scale
        canvas.height = img.height * scale

        const ctx = canvas.getContext("2d")
        if (!ctx) {
          reject("Canvas error")
          return
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject("Compression error")
              return
            }

            console.log("UPLOAD PHOTO SIZE KB:", Math.round(blob.size / 1024))
            resolve(blob)
          },
          "image/jpeg",
          0.65
        )
      }

      reader.onerror = reject
      img.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const uploadPhotosForEntry = async (entryId: number) => {
    if (photoFiles.length === 0) return

    for (const file of photoFiles) {
      const compressedFile = await compressPhotoForUpload(file)

      const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_")
      const filePath = `${driverId}/${entryId}/${Date.now()}-${cleanName}`

      const { error: uploadError } = await supabase.storage
        .from("entry-photos")
        .upload(filePath, compressedFile, {
          contentType: "image/jpeg",
        })

      if (uploadError) {
        console.log("PHOTO UPLOAD ERROR:", uploadError)
        throw uploadError
      }

      const { data: publicData } = supabase.storage
        .from("entry-photos")
        .getPublicUrl(filePath)

      const { error: photoInsertError } = await supabase
        .from("entry_photos")
        .insert({
          entry_id: entryId,
          photo_url: publicData.publicUrl,
          file_path: filePath,
        })

      if (photoInsertError) {
        console.log("PHOTO INSERT ERROR:", photoInsertError)
        throw photoInsertError
      }
    }
  }

const openPreview = async (entry: Entry) => {
  setPreviewEntry(entry)

  const { data } = await supabase
    .from("entry_photos")
    .select("id, entry_id, photo_url, file_path")
    .eq("entry_id", entry.id)

  setPreviewPhotos(data ?? [])
}

  const openEdit = (entry: Entry) => {
  setPhotoFiles([])
  setPhotoPreviews([])
  setSavedPhotos([])

  setEditingId(entry.id)

setNewEntry({
  trailer: entry.trailer,
  regNumber: entry.regNumber ?? "",
  from: entry.from,
  to: entry.to,
  status: entry.status,
  note: entry.note,
})

  if (entry.localPhotos && entry.localPhotos.length > 0) {
    setPhotoPreviews(entry.localPhotos)
  } else {
    loadEntryPhotos(entry.id)
  }

  setShowModal(true)
}

  const saveUsedPlacesToTop = () => {
    setPlaces((prevPlaces) => {
      const usedPlaces = [newEntry.from.trim(), newEntry.to.trim()].filter(Boolean)

      return [
        ...usedPlaces,
        ...prevPlaces.filter(
          (place) =>
            !usedPlaces.some((used) => used.toLowerCase() === place.toLowerCase())
        ),
      ]
    })
  }

  const handleBackButton = () => {
    if (screen === "archives") {
      setScreen("main")
      return
    }

    if (screen === "archive") {
      setScreen("archives")
      return
    }

    onBack?.()
  }

const filesToBase64 = async (files: File[]) => {
  const compressFile = (file: File) =>
    new Promise<string>((resolve, reject) => {
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

  return Promise.all(files.map(compressFile))
}

const saveEntry = async () => {
  if (saving) return

  setSaving(true)

  const savedNewEntry = { ...newEntry }
  const savedEditingId = editingId
  const savedPhotoFiles = [...photoFiles]

  saveUsedPlacesToTop()

  const oldEntry = savedEditingId
    ? visibleEntries.find((entry) => entry.id === savedEditingId)
    : null

  const entryDate = oldEntry?.date ?? formatEntryDate(new Date())
  const localId = savedEditingId ?? Date.now()

  const nextEntries: Entry[] = savedEditingId
    ? visibleEntries.map((entry) =>
        entry.id === savedEditingId
          ? {
              ...entry,
              ...savedNewEntry,
              date: entryDate,
              regNumber: savedNewEntry.regNumber || driverTruck,
              syncStatus: "pending" as const,
            }
          : entry
      )
    : [
        ...visibleEntries,
        {
          id: localId,
          date: entryDate,
          ...savedNewEntry,
          regNumber: savedNewEntry.regNumber || driverTruck,
          localPhotos: [],
          syncStatus: "pending",
        },
      ]

  updateVisibleEntries(nextEntries)
  localStorage.setItem(entriesStorageKey, JSON.stringify(nextEntries))

  setShowModal(false)
  setEditingId(null)
  clearPhotos()
  setSaving(false)

setNewEntry({
  trailer: "",
  regNumber: "",
  from: "CnM",
  to: "Stena",
  status: "L",
  note: "",
})

  setSyncText("Syncing...")
  setSyncing(true)

  setTimeout(async () => {
    try {
      const localPhotos = await filesToBase64(savedPhotoFiles)

      const withPhotos = loadFromStorage<Entry[]>(entriesStorageKey, []).map((entry) =>
        entry.id === localId
          ? { ...entry, localPhotos, syncStatus: "pending" as const }
          : entry
      )

      setEntries(withPhotos)
      localStorage.setItem(entriesStorageKey, JSON.stringify(withPhotos))

      if (navigator.onLine && screen === "main") {
        await syncEntries()
      } else {
        setSyncText("Saved offline. Will sync later.")
        setSyncing(false)
      }
    } catch (error) {
      console.log("BACKGROUND SAVE ERROR:", error)
      setSyncText("Photo prepare error")
      setSyncing(false)
    }
  }, 100)
}

  const deleteEntry = async (entryToDelete: Entry) => {
    const confirmed = confirm("Delete this entry?")
    if (!confirmed) return

    const nextEntries =
      entryToDelete.syncStatus === "pending"
        ? visibleEntries.filter((entry) => entry.id !== entryToDelete.id)
        : visibleEntries.map((entry) =>
            entry.id === entryToDelete.id
              ? { ...entry, syncStatus: "delete_pending" as const }
              : entry
          )

    updateVisibleEntries(nextEntries)
    localStorage.setItem(entriesStorageKey, JSON.stringify(nextEntries))

    setTimeout(() => {
      if (navigator.onLine) syncEntries()
    }, 300)
  }

  return (
   <main className="h-[100dvh] bg-[#efeff4] flex flex-col w-full overflow-hidden">
      <div className="px-4 pt-6 pb-1">
        <div className="flex items-center justify-between">
          <button
  onClick={handleBackButton}
  className="text-blue-500 text-[18px] font-medium"
>
  Logout
</button>

          <div className="flex flex-col items-center">
            <h1 className="text-[24px] font-black tracking-tight text-black">
              {screen === "archives" ? "Archives" : visibleTitle}
            </h1>

            {driverName && (
              <p className="text-[20px] font-bold text-black">
                {driverName}
              </p>
            )}

         <p
  className={
    syncText === "Synced" || syncText === "Loaded"
      ? "text-[12px] font-bold text-green-600"
      : "text-[11px] font-bold text-zinc-400"
  }
>
              {syncing
                ? "🔄 Syncing"
                : syncText === "Synced" || syncText === "Loaded"
              ? (
  <>
    <span className="text-green-600">✔</span>
    <span className="text-black"> Synced</span>
  </>
)
                : "⏳ Offline"}
            </p>
          </div>

 {screen === "miles" && (
  <MilesPage onBack={() => setScreen("main")} />
)}

{screen === "diesel" && (
  <DieselPage onBack={() => setScreen("main")} />
)}

          {screen === "main" ? (
            <button
              onClick={() => setShowMainMenu(true)}
              className="text-[30px] text-blue-500"
            >
              ☰
            </button>
          ) : (
            <div className="w-5" />
          )}
        </div>
      </div>

      {screen === "archives" ? (
        <div className="flex-1 px-3 overflow-y-auto pb-[90px]">
          <div className="space-y-2">
            {archives.length === 0 && (
              <p className="text-center text-zinc-400 mt-10">No archives yet</p>
            )}

            {archives.map((archive) => (
              <button
                key={archive.id}
                onClick={() => {
                  setActiveArchiveId(archive.id)
                  setScreen("archive")
                }}
                className="w-full h-[54px] rounded-[16px] bg-white px-4 relative flex items-center active:scale-[0.98] transition-all"
              >
                <span className="absolute left-4 text-[13px] text-zinc-400">
                  {new Date().getFullYear()}
                </span>

                <span className="w-full text-center text-[16px] font-bold text-black">
                  {archive.title}
                </span>

                <span className="absolute right-4 text-[13px] text-zinc-400">
                  {archive.entries.length} rows
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div
  ref={listRef}
className="flex-1 min-h-0 px-3 overflow-y-auto overscroll-none"
>
          {Object.entries(groupedEntries).map(([date, dayEntries]) => (
          <div key={date} className="mb-3">
           <p className="text-center text-[15px] font-semi-bold text-zinc-500">
  {formatDisplayDate(date)}
</p>

              <div className="space-y-1">
                {dayEntries.map((entry) => (
                  <div
                    key={entry.id}
  onClick={() => openPreview(entry)}
                   
                    className="select-none bg-white rounded-[14px] h-[34px] px-3 flex items-center active:scale-[0.98] transition-all"
                  >
                    <div className="w-[72px] shrink-0">
                      <p className="select-none text-[12px] font-bold text-black truncate">
                        {entry.trailer}
                      </p>
                    </div>

                    <div className="w-[170px] shrink-0 pr-2">
                      <p className="select-none text-[12px] text-black truncate">
                        {entry.from} → {entry.to}
                      </p>
                    </div>

                    <div className="w-[54px] shrink-0 flex justify-start">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          entry.status === "L"
                            ? "bg-green-500"
                            : entry.status === "E"
                            ? "bg-yellow-400"
                            : "bg-red-500"
                        }`}
                      >
                        <span className="select-none text-white text-[10px] font-bold">
                          {entry.status}
                        </span>
                      </div>
                    </div>

                    <div className="flex-1 -ml-6 min-w-0">
                      <p className="select-none text-[12px] text-zinc-400 truncate">
                        {entry.note}
                      </p>
                    </div>

                    <div className="w-[22px] shrink-0 text-right text-[11px]">
                     {entry.syncStatus === "pending"
  ? "⌛"
  : entry.syncStatus === "synced"
  ? <span className="text-green-600 font-bold">✔</span>
  : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div ref={bottomRef} className="h-[1px]" />
        </div>
      )}

      {screen !== "archives" && (
        <div className="shrink-0 px-3 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 bg-[#efeff4]">
          <button
            onClick={() => {
              setEditingId(null)
              clearPhotos()
       setNewEntry({
  trailer: "",
  regNumber: "",
  from: "CnM",
  to: "Stena",
  status: "L",
  note: "",
})
              setShowModal(true)
            }}
            className="w-full h-[50px] rounded-[18px] bg-blue-500 text-white text-[16px] font-bold active:scale-[0.98] transition-all"
          >
            NEW ENTRY
          </button>
        </div>
      )}

      {showMainMenu && (
        <div
          onClick={() => setShowMainMenu(false)}
          className="fixed inset-0 z-[70] bg-black/10 flex items-start justify-end pt-[105px] pr-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[220-px] bg-white/90 backdrop-blur-xl rounded-[28px] overflow-hidden shadow-xl"
          >
            <button
              onClick={() => {
                setScreen("archives")
                setShowMainMenu(false)
              }}
             className="w-full h-[52px] px-6 flex items-center gap-4 text-[20px] text-black"
            >
              <span>▰</span>
              Archives
            </button>

            <button
              onClick={() => {
                setShowMainMenu(false)
                setShowPlaceModal(true)
              }}
            className="w-full h-[52px] px-6 flex items-center gap-4 text-[20px] text-black"
            >
              <span>＋</span>
              Add Place
            </button>

  <button
  onClick={() => {
    setScreen("miles")
    setShowMainMenu(false)
  }}
  className="w-full h-[52px] px-6 flex items-center gap-4 text-[20px]"
>
  <span>🛣️</span>
  Miles
</button>

<button
  onClick={() => {
    setScreen("diesel")
    setShowMainMenu(false)
  }}
  className="w-full h-[52px] px-6 flex items-center gap-4 text-[20px]"
>
  <span>⛽</span>
  Diesel
</button>

{isBoss && (
  <button className="w-full h-[52px] px-6 flex items-center gap-4 text-[20px]">
    <span>📊</span>
    Export to Excel
  </button>
)}

          </div>
        </div>
      )}

      {previewEntry && (
  <div
    onClick={() => {
      setPreviewEntry(null)
      setPreviewPhotos([])
    }}
    className="fixed inset-0 z-[55] bg-black/50 flex items-center justify-center"
  >
    <div
      onClick={(e) => e.stopPropagation()}
      className="w-[340px] bg-white rounded-[20px] p-4"
    >
      <h3 className="text-center text-[20px] font-bold mb-3">
        {previewEntry.trailer}
      </h3>

    <p className="text-center text-[18px] mb-2">
  Reg: <span className="font-bold">{previewEntry.regNumber}</span>
</p>

      <p className="text-center mb-2">
        {previewEntry.from} → {previewEntry.to}
      </p>

      <p className="text-center mb-2">
        Status: {previewEntry.status}
      </p>

      <p className="text-center text-zinc-500 mb-4">
        {previewEntry.note}
      </p>

      <div className="flex gap-2 overflow-x-auto">
        {previewPhotos.map((photo) => (
          <img
            key={photo.id}
            src={photo.photo_url}
            onClick={() => setSelectedPhoto(photo.photo_url)}
            className="w-[90px] h-[90px] rounded-[12px] object-cover"
          />
        ))}
      </div>

    <div className="flex gap-2 mt-4">
  <button
   onClick={() => {
  const entry = previewEntry
  if (!entry) return

  setPreviewEntry(null)
  setPreviewPhotos([])

  openEdit(entry)
}}
    className="flex-1 h-[46px] rounded-[16px] bg-blue-500 text-white font-bold"
  >
    Edit
  </button>

  {previewEntry?.id === visibleEntries[visibleEntries.length - 1]?.id && (
    <button
   onClick={() => {
  deleteEntry(previewEntry!)
  setPreviewEntry(null)
  setPreviewPhotos([])
}}
      className="flex-1 h-[46px] rounded-[16px] bg-red-500 text-white font-bold"
    >
      Delete
    </button>
  )}

  <button
    onClick={() => {
      setPreviewEntry(null)
      setPreviewPhotos([])
    }}
    className="flex-1 h-[46px] rounded-[16px] bg-zinc-200 text-black font-bold"
 
>
  Close
</button>
</div>
</div>
</div>
)}

   {showPlaceModal && (
  <div className="fixed inset-0 bg-[#efeff4] z-[90] flex items-start justify-center">
    <div className="w-full max-w-[430px] bg-[#efeff4] rounded-t-[34px] px-4 pt-8 pb-6">
      <h2 className="text-center text-[24px] font-bold text-black mb-5">
        Add Place
      </h2>

      <input
        placeholder="Place name"
        value={newPlace}
        onChange={(e) => setNewPlace(e.target.value)}
        className="w-full h-[50px] rounded-[20px] bg-[#dfdfe4] px-5 text-[18px] text-center outline-none placeholder:text-zinc-400 mb-3"
      />

      <button
        onClick={() => {
          const cleanPlace = newPlace.trim()
          if (!cleanPlace) return

          setPlaces((prevPlaces) => [
            cleanPlace,
            ...prevPlaces.filter(
              (place) => place.toLowerCase() !== cleanPlace.toLowerCase()
            ),
          ])

          setNewPlace("")
          setShowPlaceModal(false)
        }}
        className="w-full h-[50px] rounded-[22px] bg-blue-500 text-white text-[18px] font-bold active:scale-[0.98]"
      >
        Add Place
      </button>

      <button
        onClick={() => {
          setNewPlace("")
          setShowPlaceModal(false)
        }}
        className="w-full h-[46px] mt-2 rounded-[20px] text-zinc-500 text-[17px] font-semibold"
      >
        Cancel
      </button>
    </div>
  </div>
)}

{showModal && (
      <div className="fixed inset-0 bg-[#efeff4] z-[90] flex items-start justify-center">
       <div className="w-full max-w-[430px] max-h-[100vh] bg-[#efeff4] rounded-t-[34px] px-4 pt-[52px] pb-6 overflow-y-auto">
            <h2 className="text-center text-[20px] font-bold text-black mb-2">
              {editingId ? "Edit Entry" : "New Entry"}
            </h2>
 <input
  placeholder="Trailer No"
  value={newEntry.trailer}
  onChange={(e) =>
    setNewEntry((prev) => ({
      ...prev,
      trailer: e.target.value.toUpperCase(),
    }))
  }
  className="w-full h-[46px] rounded-[20px] bg-[#dfdfe4] px-5 text-[18px] text-center outline-none placeholder:text-zinc-400 mb-1"
/>



  <select
              value={newEntry.from}
              onChange={(e) =>
                setNewEntry((prev) => ({ ...prev, from: e.target.value }))
              }


 
              className="w-full h-[46px] rounded-[20px] bg-[#dfdfe4] px-5 text-[18px] text-center text-blue-500 outline-none mb-1"
            >
              {places.map((place, index) => (
                <option key={`${place}-${index}`} value={place}>
                  {place}
                </option>
              ))}
            </select>

            <select
              value={newEntry.to}
              onChange={(e) =>
                setNewEntry((prev) => ({ ...prev, to: e.target.value }))
              }
              className="w-full h-[46px] rounded-[20px] bg-[#dfdfe4] px-5 text-[18px] text-center text-blue-500 outline-none mb-1"
            >
              {places.map((place, index) => (
                <option key={`${place}-${index}`} value={place}>
                  {place}
                </option>
              ))}
            </select>

            <div className="flex gap-4 mb-1">
              {["L", "E", "S"].map((status) => (
                <button
                  key={status}
                  onClick={() =>
                    setNewEntry((prev) => ({
                      ...prev,
                      status,
                      trailer:
                        status === "S"
                          ? "--//--"
                          : prev.trailer === "--//--"
                          ? ""
                          : prev.trailer,
                    }))
                  }
                  className={`flex-1 h-[46px] rounded-[20px] text-[20px] font-bold text-white transition-all ${
                    newEntry.status === status
                      ? status === "L"
                        ? "bg-green-500"
                        : status === "E"
                        ? "bg-yellow-400"
                        : "bg-red-500"
                      : "bg-[#cfcfd4]"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            <input
              placeholder="Job Ref / Note"
              value={newEntry.note}
              onChange={(e) =>
                setNewEntry((prev) => ({ ...prev, note: e.target.value }))
              }
              className="w-full h-[46px] rounded-[20px] bg-[#dfdfe4] px-5 text-[18px] text-center outline-none placeholder:text-zinc-400 mb-1"
            />

          <div className="w-full flex gap-3 mb-1">


 <select
 value={newEntry.regNumber || driverTruck}
  onChange={(e) =>
    setNewEntry((prev) => ({
      ...prev,
      regNumber: e.target.value,
    }))
  }
  className="flex-1 h-[46px] rounded-[18px] bg-[#fdfdfc] text-[16px] font-semibold text-center text-zinc-700 px-3"
>
<option value="">Reg Number</option>

{trucks.map((truck) => (
  <option key={truck} value={truck}>
    {truck}
  </option>
))}
</select>
  <label className="flex-1 h-[46px] rounded-[18px] bg-[#fdfdfc] text-[16px] font-semibold text-zinc-500 flex items-center justify-center">
    + Add Photo

    <input
      type="file"
      accept="image/*"
      capture="environment"
      multiple
      className="hidden"
      onChange={(e) => {
        const files = Array.from(e.target.files ?? [])
        if (files.length === 0) return

        setPhotoFiles((prev) => [...prev, ...files])
        setPhotoPreviews((prev) => [
          ...prev,
          ...files.map((file) => URL.createObjectURL(file)),
        ])

        e.target.value = ""
      }}
    />
  </label>

</div>

            {savedPhotos.map((item) => (
            <img
  key={item.id}
  src={item.photo_url}
  alt="saved photo"
  onClick={() => setSelectedPhoto(item.photo_url)}
  className="w-[70px] h-[70px] object-cover rounded-[12px] m-1 inline-block cursor-pointer"
/>
            ))}

            {photoPreviews.map((url, index) => (
           <img
  key={url}
  src={url}
  alt={`preview ${index + 1}`}
  onClick={() => setSelectedPhoto(url)}
  className="w-[70px] h-[70px] object-cover rounded-[12px] m-1 inline-block cursor-pointer"
/>
            ))}

           <button
  onClick={saveEntry}
  disabled={saving}
  className="w-full h-[46px] rounded-[22px] bg-blue-500 text-white text-[20px] font-bold active:scale-[0.98] disabled:opacity-50"
>
  {saving ? "Saving..." : "Save Entry"}
</button>

            <button
              onClick={() => {
                setShowModal(false)
                setEditingId(null)
                clearPhotos()
              }}
              className="w-full h-[46px] mt-1 rounded-[20px] text-zinc-500 text-[17px] font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

{selectedPhoto && (
  <div
    className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center"
    onClick={() => setSelectedPhoto(null)}
  >
    <img
      src={selectedPhoto}
      alt="Full screen"
      className="max-w-full max-h-full object-contain"
    />
  </div>
)}

    </main>
  )
}