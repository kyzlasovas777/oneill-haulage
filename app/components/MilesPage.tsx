"use client"

import { useEffect, useState } from "react"
import { supabase } from "./supabase"

type MilesPageProps = {
  driverId: number
  onBack: () => void
}

type MileageEntry = {
  id: number
  driver_id: number
  entry_date: string
  start_mileage: number
  finish_mileage: number | null
  total_miles: number | null
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

export default function MilesPage({ driverId, onBack }: MilesPageProps) {
  const [entries, setEntries] = useState<MileageEntry[]>([])

  const [startMileage, setStartMileage] = useState("")
  const [finishMileage, setFinishMileage] = useState("")
  const [saving, setSaving] = useState(false)

  const [addOpen, setAddOpen] = useState(false)

  const [editingEntry, setEditingEntry] = useState<MileageEntry | null>(null)
  const [editStartMileage, setEditStartMileage] = useState("")
  const [editFinishMileage, setEditFinishMileage] = useState("")
  const [editingSaving, setEditingSaving] = useState(false)

  const [archiveOpen, setArchiveOpen] = useState(false)
  const [activeArchiveWeek, setActiveArchiveWeek] = useState<string | null>(null)

  const today = formatEntryDate(new Date())
  const currentWeekTitle = getWeekTitle(today)

  const todayEntry = entries.find((entry) => entry.entry_date === today)
  const needsStart = !todayEntry
  const needsFinish = todayEntry && todayEntry.finish_mileage === null
  const todayCompleted = todayEntry && todayEntry.finish_mileage !== null

  const loadMileageEntries = async () => {
    const { data, error } = await supabase
      .from("mileage_entries")
      .select("*")
      .eq("driver_id", driverId)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })

    if (error) {
      console.log("MILEAGE LOAD ERROR:", error)
      return
    }

    setEntries(data ?? [])
  }

  useEffect(() => {
    loadMileageEntries()
  }, [driverId])

  const openEdit = (entry: MileageEntry) => {
    setEditingEntry(entry)
    setEditStartMileage(String(entry.start_mileage))
    setEditFinishMileage(
      entry.finish_mileage === null ? "" : String(entry.finish_mileage)
    )
  }

  const closeEdit = () => {
    setEditingEntry(null)
    setEditStartMileage("")
    setEditFinishMileage("")
  }

  const openAdd = () => {
    setStartMileage("")
    setFinishMileage("")
    setAddOpen(true)
  }

  const closeAdd = () => {
    setAddOpen(false)
    setStartMileage("")
    setFinishMileage("")
  }

  const saveStartMileage = async () => {
    if (saving) return

    const start = Number(startMileage)

    if (!startMileage) {
      alert("Enter start mileage")
      return
    }

    if (start <= 0) {
      alert("Start mileage must be higher than 0")
      return
    }

    setSaving(true)

    const { data, error } = await supabase
      .from("mileage_entries")
      .insert({
        driver_id: driverId,
        entry_date: today,
        start_mileage: start,
        finish_mileage: null,
        total_miles: null,
      })
      .select()
      .single()

    setSaving(false)

    if (error) {
      console.log("MILEAGE START SAVE ERROR:", error)
      alert("Mileage save error")
      return
    }

    if (data) setEntries((prev) => [data, ...prev])

    closeAdd()
  }

  const saveFinishMileage = async () => {
    if (saving || !todayEntry) return

    const finish = Number(finishMileage)

    if (!finishMileage) {
      alert("Enter finish mileage")
      return
    }

    if (finish < todayEntry.start_mileage) {
      alert("Finish mileage cannot be lower than start mileage")
      return
    }

    const total = finish - todayEntry.start_mileage

    setSaving(true)

    const { data, error } = await supabase
      .from("mileage_entries")
      .update({
        finish_mileage: finish,
        total_miles: total,
      })
      .eq("id", todayEntry.id)
      .select()
      .single()

    setSaving(false)

    if (error) {
      console.log("MILEAGE FINISH SAVE ERROR:", error)
      alert("Mileage save error")
      return
    }

    if (data) {
      setEntries((prev) =>
        prev.map((entry) => (entry.id === data.id ? data : entry))
      )
    }

    closeAdd()
  }

  const saveAddMileage = async () => {
    if (needsStart) {
      await saveStartMileage()
      return
    }

    if (needsFinish) {
      await saveFinishMileage()
      return
    }

   
  }

  const saveEditMileage = async () => {
    if (editingSaving || !editingEntry) return

    const start = Number(editStartMileage)
    const finish =
      editFinishMileage.trim() === "" ? null : Number(editFinishMileage)

    if (!editStartMileage) {
      alert("Enter start mileage")
      return
    }

    if (start <= 0) {
      alert("Start mileage must be higher than 0")
      return
    }

    if (finish !== null && finish < start) {
      alert("Finish mileage cannot be lower than start mileage")
      return
    }

    const total = finish === null ? null : finish - start

    setEditingSaving(true)

    const { data, error } = await supabase
      .from("mileage_entries")
      .update({
        start_mileage: start,
        finish_mileage: finish,
        total_miles: total,
      })
      .eq("id", editingEntry.id)
      .select()
      .single()

    setEditingSaving(false)

    if (error) {
      console.log("MILEAGE EDIT SAVE ERROR:", error)
      alert("Mileage edit error")
      return
    }

    if (data) {
      setEntries((prev) =>
        prev.map((entry) => (entry.id === data.id ? data : entry))
      )
    }

    closeEdit()
  }

  const deleteMileageEntry = async (id: number) => {
    if (!confirm("Delete this mileage entry?")) return

    const { error } = await supabase
      .from("mileage_entries")
      .delete()
      .eq("id", id)

    if (error) {
      alert("Delete failed")
      return
    }

    setEntries((prev) => prev.filter((entry) => entry.id !== id))
    closeEdit()
  }

  const currentWeekEntries = entries.filter(
    (entry) => getWeekTitle(entry.entry_date) === currentWeekTitle
  )

  const weekTotal = currentWeekEntries.reduce(
    (sum, entry) => sum + (entry.total_miles ?? 0),
    0
  )

  const archiveWeeks = entries
    .filter((entry) => getWeekTitle(entry.entry_date) !== currentWeekTitle)
    .reduce((groups, entry) => {
      const title = getWeekTitle(entry.entry_date)
      if (!groups[title]) groups[title] = []
      groups[title].push(entry)
      return groups
    }, {} as Record<string, MileageEntry[]>)

  const archiveTitles = Object.keys(archiveWeeks)

  const visibleArchiveEntries = activeArchiveWeek
    ? archiveWeeks[activeArchiveWeek] ?? []
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
  <div className="text-[22px] font-bold">Miles</div>

  <div className="text-[14px]">
    <span className="text-zinc-500">This week</span>{" "}
    <b>{weekTotal}</b>{" "}
    <span className="text-zinc-500">miles</span>
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
        {currentWeekEntries.map((entry) => (
          <button
            key={entry.id}
            onClick={() => openEdit(entry)}
            className="w-full text-left bg-white rounded-[18px] px-3 py-2 shadow-sm"
          >
<div>
  <div className="text-center mb-1">
    {displayDate(entry.entry_date)}
  </div>

  <div className="flex items-center justify-between">
<div>
  <span className="text-zinc-500">Start:</span>{" "}
  <b>{entry.start_mileage}</b>
  {" - "}
  <span className="text-zinc-500">Finish:</span>{" "}
  <b>{entry.finish_mileage ?? "-"}</b>
</div>
<div>
  <span className="text-zinc-500">Total:</span>{" "}
  <b>{entry.total_miles ?? "-"}</b> miles
</div>
  </div>
</div>
          </button>
        ))}
      </div>

      <div className="fixed left-0 right-0 bottom-0 z-[90] bg-[#efeff4]/95 backdrop-blur p-3">
        <button
          onClick={openAdd}
          className="w-full h-[44px] rounded-[16px] bg-blue-600 text-white font-bold text-[16px]"
        >
          + Add Mileage
        </button>
      </div>

      {addOpen && (
        <div
          onClick={closeAdd}
          className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[360px] bg-white rounded-[22px] p-4"
          >
            <h2 className="text-[22px] font-bold mb-3">Fill Up Miles</h2>

            <div className="space-y-3">
              {needsStart && (
                <input
                  type="number"
                  placeholder="Start mileage"
                  value={startMileage}
                  onChange={(e) => setStartMileage(e.target.value)}
                  className="w-full h-[46px] rounded-[12px] border px-4 text-[16px]"
                />
              )}

              {needsFinish && todayEntry && (
                <>
                  <div className="text-[15px] font-bold">
                    Start: {todayEntry.start_mileage}
                  </div>

                  <input
                    type="number"
                    placeholder="Finish mileage"
                    value={finishMileage}
                    onChange={(e) => setFinishMileage(e.target.value)}
                    className="w-full h-[46px] rounded-[12px] border px-4 text-[16px]"
                  />
                </>
              )}

      

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeAdd}
                  className="flex-1 h-[46px] rounded-[14px] bg-zinc-200 font-bold"
                >
                  Cancel
                </button>

                {!todayCompleted && (
                  <button
                    type="button"
                    onClick={saveAddMileage}
                    className="flex-1 h-[46px] rounded-[14px] bg-blue-600 text-white font-bold"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                )}
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
            <h2 className="text-[22px] font-bold mb-3">Edit Miles</h2>

            <div className="text-[14px] font-bold mb-3 text-zinc-500">
              {displayDate(editingEntry.entry_date)}
            </div>

            <div className="space-y-3">
              <input
                type="number"
                placeholder="Start mileage"
                value={editStartMileage}
                onChange={(e) => setEditStartMileage(e.target.value)}
                className="w-full h-[46px] rounded-[12px] border px-4 text-[16px]"
              />

              <input
                type="number"
                placeholder="Finish mileage"
                value={editFinishMileage}
                onChange={(e) => setEditFinishMileage(e.target.value)}
                className="w-full h-[46px] rounded-[12px] border px-4 text-[16px]"
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
                  onClick={saveEditMileage}
                  className="flex-1 h-[46px] rounded-[14px] bg-blue-600 text-white font-bold"
                >
                  {editingSaving ? "Saving..." : "Save"}
                </button>

                <button
                  type="button"
                  onClick={() => deleteMileageEntry(editingEntry.id)}
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
          className="fixed inset-0 z-[105] bg-black/40 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[380px] max-h-[85vh] overflow-y-auto bg-white rounded-[22px] p-4"
          >
            <h2 className="text-[22px] font-bold mb-3">
              {activeArchiveWeek ? activeArchiveWeek : "Miles Archive"}
            </h2>

            {!activeArchiveWeek && (
              <div className="space-y-2">
                {archiveTitles.length === 0 && (
                  <div className="text-zinc-500">No archived weeks yet</div>
                )}

                {archiveTitles.map((title) => {
                  const total = archiveWeeks[title].reduce(
                    (sum, entry) => sum + (entry.total_miles ?? 0),
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
                        {archiveWeeks[title].length} entries · {total} miles
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {activeArchiveWeek && (
              <div className="space-y-3">
                <button
                  onClick={() => setActiveArchiveWeek(null)}
                  className="h-[38px] px-4 rounded-[12px] bg-zinc-200 font-bold mb-2"
                >
                  Back to weeks
                </button>

                {visibleArchiveEntries.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => {
                      setArchiveOpen(false)
                      openEdit(entry)
                    }}
                    className="w-full text-left bg-white rounded-[18px] px-3 py-2 shadow-sm"
                  >
<div>
  <div>{displayDate(entry.entry_date)}</div>

  <div className="text-center">
    Start: <b>{entry.start_mileage}</b> - Finish:{" "}
    <b>{entry.finish_mileage ?? "-"}</b>
  </div>

  <div className="text-right font-bold">
    Total: {entry.total_miles ?? "-"} miles
  </div>
</div>
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => setArchiveOpen(false)}
              className="w-full h-[42px] rounded-[14px] bg-blue-600 text-white font-bold mt-4"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}