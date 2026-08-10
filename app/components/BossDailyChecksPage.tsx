"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { DAILY_CHECK_QUESTIONS } from "./DailyCheckPage"
import { supabase } from "./supabase"
import { hydratePrivatePhotoUrls } from "./privatePhotoStorage"

type DriverSummary = {
  id: number
  name: string
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
  repaired: boolean
  repaired_at: string | null
  boss_note: string
  created_at?: string
}

type DailyCheckPhoto = {
  id: number
  daily_check_id: number
  driver_id: number
  question_id: string
  photo_url: string
  photo_path: string | null
}

type BossDailyChecksPageProps = {
  drivers: DriverSummary[]
  onBack: () => void
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

function sortNewestFirst(a: DailyCheckEntry, b: DailyCheckEntry) {
  const timeOrder = (b.checked_at ?? b.created_at ?? "").localeCompare(
    a.checked_at ?? a.created_at ?? ""
  )
  if (timeOrder !== 0) return timeOrder
  return b.id - a.id
}

function readLocalArray<T>(key: string): T[] {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) : []
  } catch {
    return []
  }
}

export default function BossDailyChecksPage({
  drivers,
  onBack,
}: BossDailyChecksPageProps) {
  const [entries, setEntries] = useState<DailyCheckEntry[]>([])
  const [photos, setPhotos] = useState<DailyCheckPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [driverFilter, setDriverFilter] = useState("all")
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [activeArchiveWeek, setActiveArchiveWeek] = useState<string | null>(null)
  const [previewEntry, setPreviewEntry] = useState<DailyCheckEntry | null>(null)
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null)
  const [bossNote, setBossNote] = useState("")
  const [savingAction, setSavingAction] = useState(false)

  const driversById = useMemo(
    () => new Map(drivers.map((driver) => [driver.id, driver.name])),
    [drivers]
  )

  const loadChecks = useCallback(async () => {
    if (!navigator.onLine) {
      setLoading(false)
      return
    }

    const [checksResult, photosResult] = await Promise.all([
      supabase
        .from("daily_checks")
        .select("*")
        .order("checked_at", { ascending: false }),
      supabase.from("daily_check_photos").select("*"),
    ])

    if (checksResult.error) {
      console.log("BOSS DAILY CHECKS LOAD ERROR:", checksResult.error)
      setLoading(false)
      return
    }

    if (photosResult.error) {
      console.log("BOSS DAILY CHECK PHOTOS LOAD ERROR:", photosResult.error)
    }

    setEntries(
      (checksResult.data ?? []).map((entry) => ({
        ...entry,
        answers: entry.answers ?? [],
        defects: entry.defects ?? [],
        repaired: entry.repaired ?? false,
        repaired_at: entry.repaired_at ?? null,
        boss_note: entry.boss_note ?? "",
      }))
    )
    setPhotos(
      await hydratePrivatePhotoUrls(
        (photosResult.data ?? []) as DailyCheckPhoto[]
      )
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    const initialLoadId = window.setTimeout(loadChecks, 0)
    const intervalId = window.setInterval(loadChecks, 15000)
    return () => {
      window.clearTimeout(initialLoadId)
      window.clearInterval(intervalId)
    }
  }, [loadChecks])

  const filteredEntries = entries.filter(
    (entry) =>
      driverFilter === "all" || entry.driver_id === Number(driverFilter)
  )
  const currentWeekTitle = getWeekTitle(formatEntryDate(new Date()))
  const currentWeekEntries = filteredEntries
    .filter((entry) => getWeekTitle(entry.entry_date) === currentWeekTitle)
    .sort(sortNewestFirst)
  const archiveWeeks = filteredEntries
    .filter((entry) => getWeekTitle(entry.entry_date) !== currentWeekTitle)
    .reduce((groups, entry) => {
      const title = getWeekTitle(entry.entry_date)
      if (!groups[title]) groups[title] = []
      groups[title].push(entry)
      return groups
    }, {} as Record<string, DailyCheckEntry[]>)
  const archiveTitles = Object.keys(archiveWeeks).sort((a, b) => {
    const latestA = [...archiveWeeks[a]].sort(sortNewestFirst)[0]
    const latestB = [...archiveWeeks[b]].sort(sortNewestFirst)[0]
    return (latestB?.checked_at ?? "").localeCompare(latestA?.checked_at ?? "")
  })
  const isArchiveList = archiveOpen && !activeArchiveWeek
  const visibleEntries = activeArchiveWeek
    ? [...(archiveWeeks[activeArchiveWeek] ?? [])].sort(sortNewestFirst)
    : currentWeekEntries
  const previewPhotos = previewEntry
    ? photos.filter((photo) => photo.daily_check_id === previewEntry.id)
    : []

  const openPreview = (entry: DailyCheckEntry) => {
    setPreviewEntry(entry)
    setBossNote(entry.boss_note ?? "")
  }

  const applyUpdatedEntry = (entry: DailyCheckEntry) => {
    const normalizedEntry = {
      ...entry,
      answers: entry.answers ?? [],
      defects: entry.defects ?? [],
      boss_note: entry.boss_note ?? "",
      repaired: entry.repaired ?? false,
      repaired_at: entry.repaired_at ?? null,
    }
    setEntries((current) =>
      current.map((item) => (item.id === entry.id ? normalizedEntry : item))
    )
    setPreviewEntry(normalizedEntry)
    setBossNote(normalizedEntry.boss_note)
  }

  const saveBossNote = async () => {
    if (!previewEntry || savingAction) return
    setSavingAction(true)

    const { data, error } = await supabase
      .from("daily_checks")
      .update({ boss_note: bossNote.trim() })
      .eq("id", previewEntry.id)
      .select()
      .single()

    setSavingAction(false)
    if (error || !data) {
      console.log("BOSS DAILY CHECK NOTE ERROR:", error)
      alert("Could not save note")
      return
    }

    applyUpdatedEntry(data as DailyCheckEntry)
  }

  const toggleRepaired = async () => {
    if (!previewEntry || savingAction) return
    setSavingAction(true)
    const repaired = !previewEntry.repaired

    const { data, error } = await supabase
      .from("daily_checks")
      .update({
        repaired,
        repaired_at: repaired ? new Date().toISOString() : null,
      })
      .eq("id", previewEntry.id)
      .select()
      .single()

    setSavingAction(false)
    if (error || !data) {
      console.log("BOSS DAILY CHECK REPAIR ERROR:", error)
      alert("Could not update repair status")
      return
    }

    applyUpdatedEntry(data as DailyCheckEntry)
  }

  const removeFromLocalCache = (entry: DailyCheckEntry) => {
    const entriesKey = `oneill-daily-check-entries-${entry.driver_id}`
    const photosKey = `oneill-daily-check-photos-${entry.driver_id}`
    const localEntries = readLocalArray<DailyCheckEntry>(entriesKey).filter(
      (item) => item.id !== entry.id
    )
    const localPhotos = readLocalArray<DailyCheckPhoto>(photosKey).filter(
      (photo) => photo.daily_check_id !== entry.id
    )
    localStorage.setItem(entriesKey, JSON.stringify(localEntries))
    localStorage.setItem(photosKey, JSON.stringify(localPhotos))
  }

  const deleteCheck = async () => {
    if (!previewEntry || savingAction) return
    const driverName = driversById.get(previewEntry.driver_id) ?? "Unknown driver"
    const confirmed = window.confirm(
      `Delete ${driverName}'s ${previewEntry.reg_number} daily check? This cannot be undone.`
    )
    if (!confirmed) return

    setSavingAction(true)
    const entryToDelete = previewEntry
    const entryPhotos = photos.filter(
      (photo) => photo.daily_check_id === entryToDelete.id
    )

    const { error } = await supabase
      .from("daily_checks")
      .delete()
      .eq("id", entryToDelete.id)

    if (error) {
      setSavingAction(false)
      console.log("BOSS DAILY CHECK DELETE ERROR:", error)
      alert("Could not delete check")
      return
    }

    const photoPaths = entryPhotos
      .map((photo) => photo.photo_path)
      .filter((path): path is string => Boolean(path))
    if (photoPaths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from("entry-photos")
        .remove(photoPaths)
      if (storageError) {
        console.log("BOSS DAILY CHECK STORAGE DELETE ERROR:", storageError)
      }
    }

    removeFromLocalCache(entryToDelete)
    setEntries((current) =>
      current.filter((entry) => entry.id !== entryToDelete.id)
    )
    setPhotos((current) =>
      current.filter((photo) => photo.daily_check_id !== entryToDelete.id)
    )
    setPreviewEntry(null)
    setSavingAction(false)
  }

  const handleBack = () => {
    if (activeArchiveWeek) {
      setActiveArchiveWeek(null)
    } else if (archiveOpen) {
      setArchiveOpen(false)
    } else {
      onBack()
    }
  }

  return (
    <main className="fixed inset-0 z-[80] bg-white p-3 overflow-y-auto pb-[30px]">
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={handleBack}
          className="w-[34px] text-[34px] text-blue-500 leading-none"
          aria-label="Back"
        >
          ‹
        </button>

        <div className="flex-1 text-center">
          <div className="text-[22px] font-bold">
            {archiveOpen ? "Daily Checks Archive" : "Daily Checks"}
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
            className="w-[34px] text-[28px] leading-none"
            aria-label="Open archive"
          >
            📁
          </button>
        ) : (
          <div className="w-[34px]" />
        )}
      </div>

      <select
        value={driverFilter}
        onChange={(event) => {
          setDriverFilter(event.target.value)
          setActiveArchiveWeek(null)
        }}
        className="w-full h-[44px] rounded-[15px] border border-zinc-300 bg-white px-3 font-semibold"
      >
        <option value="all">All drivers</option>
        {drivers.map((driver) => (
          <option key={driver.id} value={driver.id}>
            {driver.name}
          </option>
        ))}
      </select>

      <div className="mt-4 space-y-3">
        {loading && (
          <p className="text-center text-zinc-400 mt-10">Loading checks...</p>
        )}

        {!loading && isArchiveList && archiveTitles.length === 0 && (
          <p className="text-center text-zinc-400 mt-10">No archives yet</p>
        )}

        {!loading &&
          isArchiveList &&
          archiveTitles.map((title) => {
            const unrepairedCount = archiveWeeks[title].filter(
              (entry) => entry.status === "defect_reported" && !entry.repaired
            ).length

            return (
              <button
                key={title}
                onClick={() => setActiveArchiveWeek(title)}
                className="w-full text-left bg-[#f5f5f5] rounded-[18px] border border-green-400 px-3 py-2 shadow-sm"
              >
                <div className="font-bold">{title}</div>
                <div className="text-[14px] text-zinc-500">
                  {archiveWeeks[title].length} checks · {unrepairedCount} open defects
                </div>
              </button>
            )
          })}

        {!loading && !isArchiveList && visibleEntries.length === 0 && (
          <p className="text-center text-zinc-400 mt-10">No checks yet</p>
        )}

        {!loading &&
          !isArchiveList &&
          visibleEntries.map((entry) => {
            const driverName = driversById.get(entry.driver_id) ?? "Unknown driver"
            const borderColor =
              entry.status === "no_defects"
                ? "border-green-400"
                : entry.repaired
                  ? "border-blue-400"
                  : "border-red-400"

            return (
              <button
                key={entry.id}
                onClick={() => openPreview(entry)}
                className={`w-full text-left bg-[#f5f5f5] rounded-[18px] border px-3 py-2 shadow-sm ${borderColor}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[17px] font-bold">{driverName}</div>
                    <div className="text-[13px] text-zinc-500">
                      {displayDate(entry.entry_date)} · {displayTime(entry.checked_at)}
                    </div>
                  </div>
                  <div className="font-bold">{entry.reg_number}</div>
                </div>

                <div className="mt-2 font-bold">
                  {entry.status === "no_defects" ? (
                    <span className="text-green-600">✓ No defects</span>
                  ) : entry.repaired ? (
                    <span className="text-blue-600">✓ Repaired</span>
                  ) : (
                    <span className="text-red-600">
                      ⚠ {entry.defects.length} defect
                      {entry.defects.length === 1 ? "" : "s"}
                    </span>
                  )}
                  {!entry.safe_to_drive && !entry.repaired && (
                    <span className="ml-2 text-[12px] text-red-700">
                      UNSAFE TO DRIVE
                    </span>
                  )}
                </div>
                {entry.boss_note && (
                  <div className="mt-1 text-[13px] text-zinc-600 line-clamp-2">
                    Boss note: {entry.boss_note}
                  </div>
                )}
              </button>
            )
          })}
      </div>

      {previewEntry && (
        <div
          onClick={() => setPreviewEntry(null)}
          className="fixed inset-0 z-[110] bg-black/45 flex items-center justify-center p-3"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-[430px] max-h-[94dvh] overflow-y-auto bg-white rounded-[24px] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="w-[34px]" />
              <div className="text-center">
                <h2 className="text-[24px] font-bold">{previewEntry.reg_number}</h2>
                <p className="text-zinc-500">
                  {driversById.get(previewEntry.driver_id) ?? "Unknown driver"}
                </p>
                <p className="text-[13px] text-zinc-500">
                  {displayDate(previewEntry.entry_date)} · {displayTime(previewEntry.checked_at)}
                </p>
              </div>
              <button
                onClick={() => setPreviewEntry(null)}
                className="w-[34px] text-[28px] text-zinc-500 leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div
              className={`rounded-[18px] p-3 text-center font-bold text-[20px] mt-4 ${
                previewEntry.status === "no_defects"
                  ? "bg-green-100"
                  : previewEntry.repaired
                    ? "bg-blue-100"
                    : "bg-red-100"
              }`}
            >
              {previewEntry.status === "no_defects"
                ? "✓ No defects"
                : previewEntry.repaired
                  ? "✓ Defects repaired"
                  : `⚠ ${previewEntry.defects.length} defect${
                      previewEntry.defects.length === 1 ? "" : "s"
                    }`}
              {!previewEntry.safe_to_drive && !previewEntry.repaired && (
                <div className="text-[14px] text-red-700 mt-1">UNSAFE TO DRIVE</div>
              )}
              {previewEntry.repaired_at && previewEntry.repaired && (
                <div className="text-[12px] text-blue-700 mt-1">
                  Marked repaired {new Date(previewEntry.repaired_at).toLocaleString("en-GB")}
                </div>
              )}
            </div>

            <div className="mt-4 space-y-2">
              {DAILY_CHECK_QUESTIONS.map((question, index) => {
                const answer = previewEntry.answers.find(
                  (item) => item.questionId === question.id
                )
                const defect = previewEntry.defects.find(
                  (item) => item.questionId === question.id
                )
                const defectPhotos = previewPhotos.filter(
                  (photo) => photo.question_id === question.id
                )

                return (
                  <div
                    key={question.id}
                    className={`rounded-[16px] border p-3 ${
                      answer?.answer === false
                        ? "border-red-300 bg-red-50"
                        : "border-zinc-200 bg-[#f7f7f7]"
                    }`}
                  >
                    <div className="flex gap-2">
                      <span className="text-[12px] text-zinc-400">{index + 1}.</span>
                      <div className="flex-1 text-[14px] font-semibold">
                        {question.text}
                      </div>
                      <div
                        className={`text-[13px] font-bold ${
                          answer?.answer === true
                            ? "text-green-600"
                            : answer?.answer === false
                              ? "text-red-600"
                              : "text-zinc-400"
                        }`}
                      >
                        {answer?.answer === true
                          ? "YES"
                          : answer?.answer === false
                            ? "NO"
                            : "—"}
                      </div>
                    </div>

                    {defect && (
                      <div className="mt-2 pl-5">
                        <div>{defect.description}</div>
                        <div
                          className={`text-[12px] font-bold mt-1 ${
                            defect.safeToDrive ? "text-amber-600" : "text-red-600"
                          }`}
                        >
                          {defect.safeToDrive ? "Safe to drive" : "Unsafe to drive"}
                        </div>
                        {defectPhotos.map((photo) => (
                          <button
                            key={photo.id}
                            onClick={() => setSelectedPhoto(photo.photo_url)}
                            className="w-full mt-2"
                          >
                            <img
                              src={photo.photo_url}
                              alt="Reported defect"
                              className="w-full max-h-[220px] object-cover rounded-[14px]"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="mt-4">
              <label className="text-[14px] font-bold" htmlFor="boss-daily-check-note">
                Boss note
              </label>
              <textarea
                id="boss-daily-check-note"
                value={bossNote}
                onChange={(event) => setBossNote(event.target.value)}
                placeholder="Add repair or inspection note"
                rows={3}
                className="w-full mt-1 rounded-[16px] border border-zinc-300 p-3 outline-none"
              />
              <button
                onClick={saveBossNote}
                disabled={savingAction || bossNote.trim() === previewEntry.boss_note}
                className="w-full h-[46px] rounded-[15px] bg-blue-600 text-white font-bold disabled:bg-zinc-200 disabled:text-zinc-400"
              >
                SAVE NOTE
              </button>
            </div>

            {previewEntry.status === "defect_reported" && (
              <button
                onClick={toggleRepaired}
                disabled={savingAction}
                className={`w-full h-[48px] rounded-[16px] font-bold mt-3 disabled:opacity-50 ${
                  previewEntry.repaired
                    ? "bg-zinc-200 text-black"
                    : "bg-green-600 text-white"
                }`}
              >
                {previewEntry.repaired
                  ? "MARK AS NOT REPAIRED"
                  : "✓ MARK AS REPAIRED"}
              </button>
            )}

            <button
              onClick={deleteCheck}
              disabled={savingAction}
              className="w-full h-[48px] rounded-[16px] border border-red-500 text-red-600 font-bold mt-3 disabled:opacity-50"
            >
              DELETE CHECK
            </button>
          </div>
        </div>
      )}

      {selectedPhoto && (
        <div
          onClick={() => setSelectedPhoto(null)}
          className="fixed inset-0 z-[140] bg-black/90 flex items-center justify-center p-2"
        >
          <img
            src={selectedPhoto}
            alt="Reported defect full size"
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}
    </main>
  )
}
