"use client"

import { ChangeEvent, useEffect, useState } from "react"
import { supabase } from "./supabase"
import { triggerOneillGlobalSync } from "./oneillGlobalSync"

type DailyCheckPageProps = {
  driverId: number
  onBack: () => void
}

type Truck = {
  id: number
  reg: string
}

type DailyCheckAnswer = {
  questionId: string
  answer: boolean
}

type DailyCheckDefect = {
  questionId: string
  question: string
  description: string
  safeToDrive: boolean
}

type DailyCheckEntry = {
  id: number
  driver_id: number
  entry_date: string
  checked_at: string
  reg_number: string
  status: "no_defects" | "defect_reported"
  safe_to_drive: boolean
  answers: DailyCheckAnswer[]
  defects: DailyCheckDefect[]
  created_at?: string
  syncStatus?: "synced" | "pending"
}

type DailyCheckPhoto = {
  id: number
  daily_check_id: number
  driver_id: number
  question_id: string
  photo_url: string
  photo_path: string | null
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

type DraftPhoto = {
  questionId: string
  dataUrl: string
}

export const DAILY_CHECK_QUESTIONS = [
  {
    id: "visibility",
    text: "Are the windows and mirrors clean, undamaged and correctly adjusted?",
  },
  {
    id: "controls-seat-belt",
    text: "Are the driving controls, seat and safety belt correctly adjusted and working?",
  },
  {
    id: "wipers-horn-demister",
    text: "Are the washers, wipers, demister and horn working correctly?",
  },
  {
    id: "tachograph",
    text: "Is the tachograph working, calibrated and showing the correct time?",
  },
  {
    id: "instruments-warning-lights",
    text: "Are all instruments, gauges and warning lights working correctly?",
  },
  {
    id: "air-system",
    text: "Is the air system free from leaks or pressure drop?",
  },
  {
    id: "vehicle-level",
    text: "Is the truck sitting square and not leaning to one side?",
  },
  {
    id: "discs-plates",
    text: "Are the required discs valid and the number plates clean and clearly visible?",
  },
  {
    id: "wheels-tyres",
    text: "Are all wheels secure and tyres correctly inflated, undamaged and legal?",
  },
  {
    id: "lights-reflectors",
    text: "Are all lights, reflectors and markings fitted, clean and working?",
  },
  {
    id: "exhaust",
    text: "Is the exhaust secure with no excessive noise or smoke?",
  },
  {
    id: "access",
    text: "Are the steps, handholds and access areas clean, secure and undamaged?",
  },
  {
    id: "body-guards-doors",
    text: "Are the body, wings, guards and doors secure and in good condition?",
  },
  {
    id: "fluids-leaks",
    text: "Are oil, coolant, washer fluid and fuel levels correct with no leaks?",
  },
  {
    id: "steering-brakes",
    text: "Are the steering and brakes operating correctly?",
  },
] as const

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
  return parseEntryDate(dateText).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function displayTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function getWeekStart(date: Date) {
  const result = new Date(date)
  const day = result.getDay()
  result.setDate(result.getDate() + (day === 0 ? -6 : 1 - day))
  result.setHours(0, 0, 0, 0)
  return result
}

function formatShort(date: Date) {
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  return `${day}.${month}`
}

function getWeekTitle(dateText: string) {
  const monday = getWeekStart(parseEntryDate(dateText))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return `${formatShort(monday)}-${formatShort(sunday)}`
}

function compareEntries(a: DailyCheckEntry, b: DailyCheckEntry) {
  const dateOrder = a.entry_date.localeCompare(b.entry_date)
  if (dateOrder !== 0) return dateOrder

  const createdOrder = (a.checked_at ?? a.created_at ?? "").localeCompare(
    b.checked_at ?? b.created_at ?? ""
  )
  if (createdOrder !== 0) return createdOrder

  return a.id - b.id
}

function normaliseReg(reg: string | null | undefined) {
  return (reg ?? "").trim().toUpperCase()
}

function findOpenMileageEntry(entries: MileageEntry[], entryDate: string) {
  return entries
    .filter(
      (entry) =>
        entry.entry_date === entryDate &&
        entry.finish_mileage === null &&
        entry.syncStatus !== "delete_pending"
    )
    .sort((a, b) => {
      const createdOrder = (b.created_at ?? "").localeCompare(a.created_at ?? "")
      return createdOrder !== 0 ? createdOrder : b.id - a.id
    })[0]
}

function compressPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const image = new Image()

      image.onload = () => {
        const maxSide = 1400
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
        const canvas = document.createElement("canvas")
        canvas.width = Math.round(image.width * scale)
        canvas.height = Math.round(image.height * scale)

        const context = canvas.getContext("2d")
        if (!context) {
          reject(new Error("Photo prepare failed"))
          return
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL("image/jpeg", 0.7))
      }

      image.onerror = () => reject(new Error("Photo load failed"))
      image.src = String(reader.result)
    }

    reader.onerror = () => reject(new Error("Photo read failed"))
    reader.readAsDataURL(file)
  })
}

export default function DailyCheckPage({ driverId, onBack }: DailyCheckPageProps) {
  const entriesStorageKey = `oneill-daily-check-entries-${driverId}`
  const photosStorageKey = `oneill-daily-check-photos-${driverId}`
  const mileageStorageKey = `oneill-mileage-entries-${driverId}`
  const trucksStorageKey = "oneill-active-trucks"
  const assignedTruckStorageKey = `oneill-assigned-truck-${driverId}`

  const [entries, setEntries] = useState<DailyCheckEntry[]>(() =>
    loadFromStorage(entriesStorageKey, [])
  )
  const [photos, setPhotos] = useState<DailyCheckPhoto[]>(() =>
    loadFromStorage(photosStorageKey, [])
  )
  const [trucks, setTrucks] = useState<Truck[]>(() =>
    loadFromStorage(trucksStorageKey, [])
  )
  const [assignedReg, setAssignedReg] = useState(() =>
    loadFromStorage(assignedTruckStorageKey, "")
  )
  const [mileageEntries, setMileageEntries] = useState<MileageEntry[]>(() =>
    loadFromStorage(mileageStorageKey, [])
  )

  const [wizardOpen, setWizardOpen] = useState(false)
  const [mileageStepOpen, setMileageStepOpen] = useState(true)
  const [selectedReg, setSelectedReg] = useState("")
  const [startMileage, setStartMileage] = useState("")
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<DailyCheckAnswer[]>([])
  const [defects, setDefects] = useState<DailyCheckDefect[]>([])
  const [draftPhotos, setDraftPhotos] = useState<DraftPhoto[]>([])
  const [defectOpen, setDefectOpen] = useState(false)
  const [defectDescription, setDefectDescription] = useState("")
  const [defectSafeToDrive, setDefectSafeToDrive] = useState<boolean | null>(null)
  const [defectPhoto, setDefectPhoto] = useState<string | null>(null)
  const [photoPreparing, setPhotoPreparing] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [archiveOpen, setArchiveOpen] = useState(false)
  const [activeArchiveWeek, setActiveArchiveWeek] = useState<string | null>(null)
  const [previewEntry, setPreviewEntry] = useState<DailyCheckEntry | null>(null)
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null)

  const today = formatEntryDate(new Date())
  const currentWeekTitle = getWeekTitle(today)
  const currentQuestion = DAILY_CHECK_QUESTIONS[questionIndex]

  useEffect(() => {
    localStorage.setItem(entriesStorageKey, JSON.stringify(entries))
  }, [entries, entriesStorageKey])

  useEffect(() => {
    localStorage.setItem(photosStorageKey, JSON.stringify(photos))
  }, [photos, photosStorageKey])

  useEffect(() => {
    localStorage.setItem(mileageStorageKey, JSON.stringify(mileageEntries))
  }, [mileageEntries, mileageStorageKey])

  useEffect(() => {
    const loadTrucks = async () => {
      const { data } = await supabase
        .from("trucks")
        .select("id, reg")
        .eq("active", true)
        .order("reg")

      const activeTrucks = data ?? []
      setTrucks(activeTrucks)
      localStorage.setItem(trucksStorageKey, JSON.stringify(activeTrucks))
    }

    const loadAssignedTruck = async () => {
      const { data } = await supabase
        .from("drivers")
        .select("truck_reg")
        .eq("id", driverId)
        .single()

      const nextAssignedReg = data?.truck_reg ?? ""
      setAssignedReg(nextAssignedReg)
      localStorage.setItem(assignedTruckStorageKey, JSON.stringify(nextAssignedReg))
    }

    const loadRemoteChecks = async () => {
      if (!navigator.onLine) return

      const { data, error } = await supabase
        .from("daily_checks")
        .select("*")
        .eq("driver_id", driverId)
        .order("checked_at", { ascending: false })

      if (error) {
        console.log("DAILY CHECK LOAD ERROR:", error)
        return
      }

      const localEntries = loadFromStorage<DailyCheckEntry[]>(entriesStorageKey, [])
      const localPending = localEntries.filter(
        (entry) => entry.syncStatus === "pending"
      )
      const remoteEntries: DailyCheckEntry[] = (data ?? []).map((entry) => ({
        ...entry,
        answers: entry.answers ?? [],
        defects: entry.defects ?? [],
        syncStatus: "synced",
      }))
      const mergedEntries = [
        ...remoteEntries.filter(
          (entry) => !localPending.some((local) => local.id === entry.id)
        ),
        ...localPending,
      ]

      const { data: remotePhotos, error: photosError } = await supabase
        .from("daily_check_photos")
        .select("*")
        .eq("driver_id", driverId)

      if (photosError) {
        console.log("DAILY CHECK PHOTOS LOAD ERROR:", photosError)
      }

      const localPhotos = loadFromStorage<DailyCheckPhoto[]>(photosStorageKey, [])
      const pendingEntryIds = new Set(localPending.map((entry) => entry.id))
      const pendingPhotos = localPhotos.filter(
        (photo) =>
          pendingEntryIds.has(photo.daily_check_id) ||
          photo.photo_url.startsWith("data:")
      )
      const mergedPhotos = [
        ...((remotePhotos ?? []) as DailyCheckPhoto[]).filter(
          (photo) =>
            !pendingPhotos.some((localPhoto) => localPhoto.id === photo.id)
        ),
        ...pendingPhotos,
      ]

      setEntries(mergedEntries)
      setPhotos(mergedPhotos)
      localStorage.setItem(entriesStorageKey, JSON.stringify(mergedEntries))
      localStorage.setItem(photosStorageKey, JSON.stringify(mergedPhotos))
    }

    loadTrucks()
    loadAssignedTruck()
    loadRemoteChecks()
  }, [
    driverId,
    entriesStorageKey,
    photosStorageKey,
    trucksStorageKey,
    assignedTruckStorageKey,
  ])

  useEffect(() => {
    const loadMileageEntries = async () => {
      if (!navigator.onLine) return

      const { data, error } = await supabase
        .from("mileage_entries")
        .select("*")
        .eq("driver_id", driverId)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false })

      if (error) {
        console.log("DAILY CHECK MILEAGE LOAD ERROR:", error)
        return
      }

      const localEntries = loadFromStorage<MileageEntry[]>(mileageStorageKey, [])
      const localPending = localEntries.filter(
        (entry) =>
          entry.syncStatus === "pending" ||
          entry.syncStatus === "delete_pending"
      )
      const deletedIds = new Set(
        localPending
          .filter((entry) => entry.syncStatus === "delete_pending")
          .map((entry) => entry.id)
      )
      const remoteEntries: MileageEntry[] = (data ?? []).map((entry) => ({
        ...entry,
        syncStatus: "synced",
      }))
      const mergedEntries = [
        ...remoteEntries.filter(
          (entry) =>
            !deletedIds.has(entry.id) &&
            !localPending.some((local) => local.id === entry.id)
        ),
        ...localPending,
      ]

      setMileageEntries(mergedEntries)
      localStorage.setItem(mileageStorageKey, JSON.stringify(mergedEntries))
    }

    void loadMileageEntries()
    window.addEventListener("online", loadMileageEntries)

    return () => {
      window.removeEventListener("online", loadMileageEntries)
    }
  }, [driverId, mileageStorageKey])

  useEffect(() => {
    const handleSynced = () => {
      setEntries(loadFromStorage(entriesStorageKey, []))
      setPhotos(loadFromStorage(photosStorageKey, []))
    }

    window.addEventListener("oneill-daily-check-synced", handleSynced)
    return () => {
      window.removeEventListener("oneill-daily-check-synced", handleSynced)
    }
  }, [entriesStorageKey, photosStorageKey])

  useEffect(() => {
    const handleMileageSynced = () => {
      setMileageEntries(loadFromStorage(mileageStorageKey, []))
    }

    window.addEventListener("oneill-mileage-synced", handleMileageSynced)
    return () => {
      window.removeEventListener("oneill-mileage-synced", handleMileageSynced)
    }
  }, [mileageStorageKey])

  const resetWizard = () => {
    setWizardOpen(false)
    setMileageStepOpen(true)
    setSelectedReg("")
    setStartMileage("")
    setQuestionIndex(0)
    setAnswers([])
    setDefects([])
    setDraftPhotos([])
    setDefectOpen(false)
    setDefectDescription("")
    setDefectSafeToDrive(null)
    setDefectPhoto(null)
    setSummaryOpen(false)
  }

  const startCheck = async () => {
    let openMileage = findOpenMileageEntry(mileageEntries, today)
    let nextAssignedReg = assignedReg

    if (!openMileage && navigator.onLine) {
      const { data, error } = await supabase
        .from("mileage_entries")
        .select("*")
        .eq("driver_id", driverId)
        .eq("entry_date", today)
        .is("finish_mileage", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        console.log("DAILY CHECK OPEN MILEAGE ERROR:", error)
      } else if (data) {
        openMileage = { ...data, syncStatus: "synced" }
        const nextMileageEntries = [
          openMileage,
          ...mileageEntries.filter((entry) => entry.id !== openMileage?.id),
        ]
        setMileageEntries(nextMileageEntries)
        localStorage.setItem(mileageStorageKey, JSON.stringify(nextMileageEntries))
      }
    }

    if (!nextAssignedReg && navigator.onLine) {
      const { data, error } = await supabase
        .from("drivers")
        .select("truck_reg")
        .eq("id", driverId)
        .single()

      if (error) {
        console.log("DAILY CHECK ASSIGNED TRUCK ERROR:", error)
      } else {
        nextAssignedReg = data?.truck_reg ?? ""
        setAssignedReg(nextAssignedReg)
        localStorage.setItem(
          assignedTruckStorageKey,
          JSON.stringify(nextAssignedReg)
        )
      }
    }

    setSelectedReg(normaliseReg(openMileage?.reg_number || nextAssignedReg))
    setStartMileage(
      openMileage ? String(openMileage.start_mileage) : ""
    )
    setMileageStepOpen(true)
    setQuestionIndex(0)
    setAnswers([])
    setDefects([])
    setDraftPhotos([])
    setSummaryOpen(false)
    setWizardOpen(true)
  }

  const continueFromMileage = () => {
    const start = Number(startMileage)

    if (!selectedReg.trim()) {
      alert("Select truck")
      return
    }
    if (!startMileage.trim()) {
      alert("Enter start miles")
      return
    }
    if (!Number.isInteger(start) || start <= 0) {
      alert("Start miles must be a whole number higher than 0")
      return
    }

    setSelectedReg(normaliseReg(selectedReg))
    setMileageStepOpen(false)
    setQuestionIndex(0)
  }

  const advanceQuestion = () => {
    if (questionIndex >= DAILY_CHECK_QUESTIONS.length - 1) {
      setSummaryOpen(true)
      return
    }

    setQuestionIndex((current) => current + 1)
  }

  const replaceAnswer = (questionId: string, answer: boolean) => {
    setAnswers((current) => [
      ...current.filter((item) => item.questionId !== questionId),
      { questionId, answer },
    ])
  }

  const goToPreviousQuestion = () => {
    if (questionIndex === 0) {
      setMileageStepOpen(true)
      return
    }

    setQuestionIndex((current) => current - 1)
  }

  const goToNextQuestion = () => {
    if (!currentQuestion) return

    const hasAnswer = answers.some(
      (answer) => answer.questionId === currentQuestion.id
    )
    if (!hasAnswer) return

    advanceQuestion()
  }

  const answerYes = () => {
    if (!currentQuestion) return
    replaceAnswer(currentQuestion.id, true)
    setDefects((current) =>
      current.filter((defect) => defect.questionId !== currentQuestion.id)
    )
    setDraftPhotos((current) =>
      current.filter((photo) => photo.questionId !== currentQuestion.id)
    )
    advanceQuestion()
  }

  const answerNo = () => {
    if (!currentQuestion) return
    const savedDefect = defects.find(
      (defect) => defect.questionId === currentQuestion.id
    )
    const savedPhoto = draftPhotos.find(
      (photo) => photo.questionId === currentQuestion.id
    )

    setDefectDescription(savedDefect?.description ?? "")
    setDefectSafeToDrive(savedDefect?.safeToDrive ?? null)
    setDefectPhoto(savedPhoto?.dataUrl ?? null)
    setDefectOpen(true)
  }

  const handleDefectPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    setPhotoPreparing(true)

    try {
      setDefectPhoto(await compressPhoto(file))
    } catch (error) {
      console.log("DAILY CHECK PHOTO ERROR:", error)
      alert("Could not prepare photo")
    } finally {
      setPhotoPreparing(false)
    }
  }

  const saveDefect = () => {
    if (!currentQuestion) return
    if (!defectDescription.trim()) {
      alert("Describe the defect")
      return
    }
    if (defectSafeToDrive === null) {
      alert("Select whether the truck is safe to drive")
      return
    }

    replaceAnswer(currentQuestion.id, false)
    setDefects((current) => [
      ...current.filter(
        (defect) => defect.questionId !== currentQuestion.id
      ),
      {
        questionId: currentQuestion.id,
        question: currentQuestion.text,
        description: defectDescription.trim(),
        safeToDrive: defectSafeToDrive,
      },
    ])

    setDraftPhotos((current) => [
      ...current.filter(
        (photo) => photo.questionId !== currentQuestion.id
      ),
      ...(defectPhoto
        ? [{ questionId: currentQuestion.id, dataUrl: defectPhoto }]
        : []),
    ])

    setDefectOpen(false)
    setDefectDescription("")
    setDefectSafeToDrive(null)
    setDefectPhoto(null)
    advanceQuestion()
  }

  const confirmAndSave = () => {
    if (saving) return
    if (!selectedReg.trim()) {
      alert("Select truck")
      return
    }

    const start = Number(startMileage)
    if (!Number.isInteger(start) || start <= 0) {
      alert("Enter valid start miles")
      setSummaryOpen(false)
      setMileageStepOpen(true)
      return
    }

    setSaving(true)

    const localId = Date.now()
    const checkedAt = new Date().toISOString()
    const cleanReg = normaliseReg(selectedReg)
    const openMileage = findOpenMileageEntry(mileageEntries, today)
    const nextMileageEntries: MileageEntry[] = openMileage
      ? mileageEntries.map((entry) =>
          entry.id === openMileage.id
            ? {
                ...entry,
                start_mileage: start,
                reg_number: cleanReg,
                syncStatus: "pending",
              }
            : entry
        )
      : [
          {
            id: localId,
            driver_id: driverId,
            entry_date: today,
            start_mileage: start,
            finish_mileage: null,
            total_miles: null,
            reg_number: cleanReg,
            avg_l100: null,
            estimated_litres: null,
            created_at: checkedAt,
            syncStatus: "pending",
          },
          ...mileageEntries,
        ]
    const localEntry: DailyCheckEntry = {
      id: localId,
      driver_id: driverId,
      entry_date: formatEntryDate(new Date()),
      checked_at: checkedAt,
      reg_number: cleanReg,
      status: defects.length === 0 ? "no_defects" : "defect_reported",
      safe_to_drive: defects.every((defect) => defect.safeToDrive),
      answers,
      defects,
      created_at: checkedAt,
      syncStatus: "pending",
    }
    const localPhotos: DailyCheckPhoto[] = draftPhotos.map((photo, index) => ({
      id: localId + index + 1,
      daily_check_id: localId,
      driver_id: driverId,
      question_id: photo.questionId,
      photo_url: photo.dataUrl,
      photo_path: null,
      created_at: checkedAt,
    }))

    setEntries((current) => [...current, localEntry])
    setPhotos((current) => [...current, ...localPhotos])
    setMileageEntries(nextMileageEntries)
    localStorage.setItem(mileageStorageKey, JSON.stringify(nextMileageEntries))
    localStorage.setItem(
      entriesStorageKey,
      JSON.stringify([...loadFromStorage<DailyCheckEntry[]>(entriesStorageKey, []), localEntry])
    )
    localStorage.setItem(
      photosStorageKey,
      JSON.stringify([...loadFromStorage<DailyCheckPhoto[]>(photosStorageKey, []), ...localPhotos])
    )

    setSaving(false)
    resetWizard()

    if (navigator.onLine) {
      triggerOneillGlobalSync(driverId)
    }
  }

  const currentWeekEntries = entries
    .filter((entry) => getWeekTitle(entry.entry_date) === currentWeekTitle)
    .sort(compareEntries)

  const archiveWeeks = entries
    .filter((entry) => getWeekTitle(entry.entry_date) !== currentWeekTitle)
    .reduce((groups, entry) => {
      const title = getWeekTitle(entry.entry_date)
      if (!groups[title]) groups[title] = []
      groups[title].push(entry)
      return groups
    }, {} as Record<string, DailyCheckEntry[]>)

  const archiveTitles = Object.keys(archiveWeeks).sort((a, b) => {
    const aLatest = [...archiveWeeks[a]].sort(compareEntries).at(-1)
    const bLatest = [...archiveWeeks[b]].sort(compareEntries).at(-1)
    return (bLatest?.entry_date ?? "").localeCompare(aLatest?.entry_date ?? "")
  })
  const isArchiveList = archiveOpen && !activeArchiveWeek
  const visibleEntries = activeArchiveWeek
    ? [...(archiveWeeks[activeArchiveWeek] ?? [])].sort(compareEntries)
    : currentWeekEntries
  const previewPhotos = previewEntry
    ? photos.filter((photo) => photo.daily_check_id === previewEntry.id)
    : []
  const currentAnswer = currentQuestion
    ? answers.find((answer) => answer.questionId === currentQuestion.id)
    : undefined

  return (
    <main className="fixed inset-0 z-[80] bg-white p-3 overflow-y-auto pb-[80px]">
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
            {archiveOpen ? "Daily Check Archive" : "Daily Check"}
          </div>
          {!archiveOpen && (
            <div className="text-[14px] text-zinc-500">
              {currentWeekEntries.length} checks this week
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
          <div className="w-[30px]" />
        )}
      </div>

      <div className="mt-5 space-y-3">
        {isArchiveList && archiveTitles.length === 0 && (
          <p className="text-center text-zinc-400 mt-10">No archives yet</p>
        )}

        {isArchiveList &&
          archiveTitles.map((title) => {
            const defectCount = archiveWeeks[title].filter(
              (entry) => entry.status === "defect_reported"
            ).length

            return (
              <button
                key={title}
                onClick={() => setActiveArchiveWeek(title)}
                className="relative w-full text-left bg-[#f5f5f5] rounded-[18px] border border-green-400 px-3 py-2 shadow-sm"
              >
                <div className="font-bold">{title}</div>
                <div className="text-[14px] text-zinc-500">
                  {archiveWeeks[title].length} checks · {defectCount} with defects
                </div>
              </button>
            )
          })}

        {!isArchiveList && visibleEntries.length === 0 && (
          <p className="text-center text-zinc-400 mt-10">No checks yet</p>
        )}

        {!isArchiveList &&
          visibleEntries.map((entry) => (
            <button
              key={entry.id}
              onClick={() => setPreviewEntry(entry)}
              className={`w-full text-left bg-[#f5f5f5] rounded-[18px] border px-3 py-2 shadow-sm ${
                entry.status === "no_defects"
                  ? "border-green-400"
                  : "border-red-400"
              }`}
            >
              <div className="relative text-center mb-2">
                <div className="font-semibold">{displayDate(entry.entry_date)}</div>
                <div className="absolute right-0 top-0 font-semibold">
                  {entry.reg_number}
                </div>
              </div>

              <div className="flex items-end justify-between gap-3">
                <div>
                  <div
                    className={`font-bold ${
                      entry.status === "no_defects"
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {entry.status === "no_defects"
                      ? "✓ No defects"
                      : `⚠ ${entry.defects.length} defect${
                          entry.defects.length === 1 ? "" : "s"
                        }`}
                  </div>
                  <div className="text-[12px] text-zinc-500">
                    {displayTime(entry.checked_at)}
                    {!entry.safe_to_drive && (
                      <span className="ml-2 font-bold text-red-600">UNSAFE TO DRIVE</span>
                    )}
                  </div>
                </div>

                <div className="text-[11px] text-black">
                  {entry.syncStatus === "pending" ? (
                    <span>
                      <span className="text-amber-600 font-bold">⏳</span> Waiting sync
                    </span>
                  ) : (
                    <span>
                      <span className="text-green-600 font-bold">✓</span> Synced
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
      </div>

      {!archiveOpen && (
        <div className="fixed left-0 right-0 bottom-0 z-[90] bg-white p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <button
            onClick={startCheck}
            className="w-full h-[48px] rounded-[16px] bg-blue-600 text-white font-bold text-[16px]"
          >
            + START DAILY CHECK
          </button>
        </div>
      )}

      {wizardOpen && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col p-4 pb-[max(20px,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between">
            <button onClick={resetWizard} className="text-blue-500 text-[17px]">
              Cancel
            </button>
            <div className="font-bold">Daily Check</div>
            <div className="w-[52px]" />
          </div>

          {mileageStepOpen ? (
            <div className="flex-1 flex flex-col max-w-[420px] w-full mx-auto">
              <div className="pt-6">
                <div className="flex justify-between text-[13px] text-zinc-500 mb-2">
                  <span>{selectedReg || "Select truck"}</span>
                  <span>1 of {DAILY_CHECK_QUESTIONS.length + 1}</span>
                </div>
                <div className="w-full h-[7px] bg-zinc-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${100 / (DAILY_CHECK_QUESTIONS.length + 1)}%` }}
                  />
                </div>
              </div>

              <div className="flex-1 flex flex-col justify-center">
                <div className="text-center text-[52px] mb-2">🚛</div>
                <h2 className="text-center text-[28px] font-bold mb-5">Start miles</h2>

                <label className="text-[13px] font-bold text-zinc-500 mb-1 ml-1">
                  Truck
                </label>
                <select
                  value={selectedReg}
                  onChange={(event) => setSelectedReg(event.target.value)}
                  className="w-full h-[52px] rounded-[16px] border border-zinc-300 px-4 text-[18px] font-bold bg-white"
                >
                  <option value="">Select Reg</option>
                  {trucks.map((truck) => (
                    <option key={truck.id} value={normaliseReg(truck.reg)}>
                      {truck.reg}
                    </option>
                  ))}
                  {assignedReg &&
                    !trucks.some(
                      (truck) => normaliseReg(truck.reg) === normaliseReg(assignedReg)
                    ) && (
                      <option value={normaliseReg(assignedReg)}>{assignedReg}</option>
                    )}
                  {selectedReg &&
                    !trucks.some(
                      (truck) => normaliseReg(truck.reg) === normaliseReg(selectedReg)
                    ) &&
                    normaliseReg(assignedReg) !== normaliseReg(selectedReg) && (
                      <option value={normaliseReg(selectedReg)}>{selectedReg}</option>
                    )}
                </select>

                <label className="text-[13px] font-bold text-zinc-500 mb-1 mt-4 ml-1">
                  Odometer
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  placeholder="Enter start miles"
                  value={startMileage}
                  onChange={(event) => setStartMileage(event.target.value)}
                  className="w-full h-[56px] rounded-[16px] border border-zinc-300 px-4 text-[22px] font-bold bg-white outline-none focus:border-blue-500"
                />
              </div>

              <button
                onClick={continueFromMileage}
                className="w-full h-[52px] rounded-[18px] bg-blue-600 text-white font-bold text-[17px] active:scale-[0.98]"
              >
                NEXT ›
              </button>
            </div>
          ) : summaryOpen ? (
            <div className="flex-1 overflow-y-auto max-w-[420px] w-full mx-auto pt-5">
              <h2 className="text-center text-[28px] font-bold">Check Summary</h2>
              <p className="text-center text-[20px] font-bold mt-1 mb-5">
                {selectedReg}
              </p>

              <div className="rounded-[16px] bg-zinc-100 px-4 py-3 mb-4 flex items-center justify-between">
                <span className="text-zinc-500 font-semibold">Start miles</span>
                <span className="text-[20px] font-bold">{startMileage}</span>
              </div>

              <div
                className={`rounded-[20px] p-4 mb-4 text-center ${
                  defects.length === 0 ? "bg-green-100" : "bg-red-100"
                }`}
              >
                <div className="text-[22px] font-bold">
                  {defects.length === 0
                    ? "✓ No defects"
                    : `⚠ ${defects.length} defect${defects.length === 1 ? "" : "s"}`}
                </div>
                {defects.some((defect) => !defect.safeToDrive) && (
                  <div className="text-red-700 font-bold mt-1">UNSAFE TO DRIVE</div>
                )}
              </div>

              {defects.map((defect, index) => (
                <div
                  key={`${defect.questionId}-${index}`}
                  className="rounded-[18px] border border-red-300 bg-[#f5f5f5] p-3 mb-3"
                >
                  <div className="font-bold text-[14px]">{defect.question}</div>
                  <div className="mt-2">{defect.description}</div>
                  <div
                    className={`text-[12px] font-bold mt-2 ${
                      defect.safeToDrive ? "text-amber-600" : "text-red-600"
                    }`}
                  >
                    {defect.safeToDrive ? "Marked safe to drive" : "Marked unsafe to drive"}
                  </div>
                </div>
              ))}

              <button
                onClick={() => {
                  setSummaryOpen(false)
                  setQuestionIndex(DAILY_CHECK_QUESTIONS.length - 1)
                }}
                className="w-full h-[48px] rounded-[16px] bg-zinc-200 text-black font-bold text-[16px] mt-2"
              >
                ‹ BACK TO QUESTIONS
              </button>

              <button
                onClick={confirmAndSave}
                disabled={saving}
                className="w-full h-[52px] rounded-[18px] bg-blue-600 text-white font-bold text-[17px] mt-3 disabled:opacity-50"
              >
                {saving ? "Saving..." : "CONFIRM & SAVE"}
              </button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col max-w-[420px] w-full mx-auto">
              <div className="pt-6">
                <div className="flex justify-between text-[13px] text-zinc-500 mb-2">
                  <span>{selectedReg}</span>
                  <span>
                    {questionIndex + 2} of {DAILY_CHECK_QUESTIONS.length + 1}
                  </span>
                </div>
                <div className="w-full h-[7px] bg-zinc-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{
                      width: `${((questionIndex + 2) / (DAILY_CHECK_QUESTIONS.length + 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>

              <div className="flex-1 flex items-center justify-center px-2">
                <h2 className="text-center text-[28px] leading-tight font-bold">
                  {currentQuestion?.text}
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={answerNo}
                  className={`h-[62px] rounded-[20px] bg-red-500 text-white text-[21px] font-bold active:scale-[0.98] ${
                    currentAnswer?.answer === false
                      ? "ring-4 ring-red-200 ring-offset-2"
                      : ""
                  }`}
                >
                  NO
                </button>
                <button
                  onClick={answerYes}
                  className={`h-[62px] rounded-[20px] bg-green-500 text-white text-[21px] font-bold active:scale-[0.98] ${
                    currentAnswer?.answer === true
                      ? "ring-4 ring-green-200 ring-offset-2"
                      : ""
                  }`}
                >
                  YES
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3">
                <button
                  onClick={goToPreviousQuestion}
                  className="h-[48px] rounded-[16px] bg-zinc-200 text-black text-[16px] font-bold active:scale-[0.98]"
                >
                  ‹ BACK
                </button>
                <button
                  onClick={goToNextQuestion}
                  disabled={!currentAnswer}
                  className="h-[48px] rounded-[16px] bg-blue-600 text-white text-[16px] font-bold active:scale-[0.98] disabled:bg-zinc-200 disabled:text-zinc-400"
                >
                  NEXT ›
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {defectOpen && currentQuestion && (
        <div className="fixed inset-0 z-[120] bg-black/45 flex items-center justify-center p-4">
          <div className="w-full max-w-[380px] max-h-[92dvh] overflow-y-auto bg-white rounded-[24px] p-4">
            <h2 className="text-[22px] font-bold text-red-600 mb-1">Defect found</h2>
            <p className="text-[14px] text-zinc-500 mb-4">{currentQuestion.text}</p>

            <textarea
              value={defectDescription}
              onChange={(event) => setDefectDescription(event.target.value)}
              placeholder="Describe the defect"
              rows={4}
              className="w-full rounded-[16px] border border-zinc-300 p-3 outline-none"
            />

            <div className="mt-4 text-[14px] font-bold">Is the truck safe to drive?</div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                onClick={() => setDefectSafeToDrive(false)}
                className={`h-[46px] rounded-[14px] font-bold ${
                  defectSafeToDrive === false
                    ? "bg-red-600 text-white"
                    : "bg-zinc-200 text-black"
                }`}
              >
                NO · UNSAFE
              </button>
              <button
                onClick={() => setDefectSafeToDrive(true)}
                className={`h-[46px] rounded-[14px] font-bold ${
                  defectSafeToDrive === true
                    ? "bg-amber-500 text-white"
                    : "bg-zinc-200 text-black"
                }`}
              >
                YES · SAFE
              </button>
            </div>

            <label className="mt-4 h-[48px] rounded-[15px] border border-blue-500 text-blue-600 font-bold flex items-center justify-center cursor-pointer">
              {photoPreparing
                ? "Preparing photo..."
                : defectPhoto
                  ? "✓ Change photo"
                  : "+ Add photo"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleDefectPhoto}
                disabled={photoPreparing}
                className="hidden"
              />
            </label>

            {defectPhoto && (
              <img
                src={defectPhoto}
                alt="Defect preview"
                className="w-full max-h-[180px] object-cover rounded-[16px] mt-3"
              />
            )}

            <div className="grid grid-cols-2 gap-2 mt-4">
              <button
                onClick={() => setDefectOpen(false)}
                className="h-[48px] rounded-[15px] bg-zinc-200 font-bold"
              >
                Back
              </button>
              <button
                onClick={saveDefect}
                className="h-[48px] rounded-[15px] bg-blue-600 text-white font-bold"
              >
                Save & Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {previewEntry && (
        <div
          onClick={() => setPreviewEntry(null)}
          className="fixed inset-0 z-[110] bg-black/45 flex items-center justify-center p-4"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-[390px] max-h-[90dvh] overflow-y-auto bg-white rounded-[24px] p-4"
          >
            <h2 className="text-center text-[24px] font-bold">{previewEntry.reg_number}</h2>
            <p className="text-center text-zinc-500 mb-4">
              {displayDate(previewEntry.entry_date)} · {displayTime(previewEntry.checked_at)}
            </p>

            <div
              className={`rounded-[18px] p-3 text-center font-bold text-[20px] ${
                previewEntry.status === "no_defects" ? "bg-green-100" : "bg-red-100"
              }`}
            >
              {previewEntry.status === "no_defects"
                ? "✓ No defects"
                : `⚠ ${previewEntry.defects.length} defect${
                    previewEntry.defects.length === 1 ? "" : "s"
                  }`}
              {!previewEntry.safe_to_drive && (
                <div className="text-[14px] text-red-700 mt-1">UNSAFE TO DRIVE</div>
              )}
            </div>

            {previewEntry.defects.map((defect, index) => {
              const defectPhoto = previewPhotos.find(
                (photo) => photo.question_id === defect.questionId
              )

              return (
                <div
                  key={`${defect.questionId}-${index}`}
                  className="mt-3 border border-red-300 rounded-[18px] p-3 bg-[#f5f5f5]"
                >
                  <div className="font-bold text-[14px]">{defect.question}</div>
                  <div className="mt-2">{defect.description}</div>
                  <div
                    className={`text-[12px] font-bold mt-2 ${
                      defect.safeToDrive ? "text-amber-600" : "text-red-600"
                    }`}
                  >
                    {defect.safeToDrive ? "Safe to drive" : "Unsafe to drive"}
                  </div>
                  {defectPhoto && (
                    <button
                      onClick={() => setSelectedPhoto(defectPhoto.photo_url)}
                      className="w-full mt-3"
                    >
                      <img
                        src={defectPhoto.photo_url}
                        alt="Reported defect"
                        className="w-full max-h-[200px] object-cover rounded-[14px]"
                      />
                    </button>
                  )}
                </div>
              )
            })}

            <button
              onClick={() => setPreviewEntry(null)}
              className="w-full h-[48px] rounded-[15px] bg-blue-600 text-white font-bold mt-4"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {selectedPhoto && (
        <div
          onClick={() => setSelectedPhoto(null)}
          className="fixed inset-0 z-[140] bg-black flex items-center justify-center"
        >
          <img
            src={selectedPhoto}
            alt="Defect"
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}
    </main>
  )
}
