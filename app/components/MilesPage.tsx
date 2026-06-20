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
  reg_number: string | null
  avg_l100: number | null
  estimated_litres: number | null
  created_at?: string
}

type Truck = {
  id: number
  reg: string
}

type DieselEntry = {
  id: number
  reg_number: string | null
  mileage: number | null
  litres: number | null
  created_at?: string
}

type DieselStat = {
  mpg: number
  l100: number
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

function normaliseReg(reg: string | null | undefined) {
  return (reg ?? "").trim().toUpperCase()
}

export default function MilesPage({ driverId, onBack }: MilesPageProps) {
  const [entries, setEntries] = useState<MileageEntry[]>([])
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [assignedReg, setAssignedReg] = useState("")

  const [startMileage, setStartMileage] = useState("")
  const [finishMileage, setFinishMileage] = useState("")
  const [regNumber, setRegNumber] = useState("")
  const [saving, setSaving] = useState(false)

  const [addOpen, setAddOpen] = useState(false)

  const [editingEntry, setEditingEntry] = useState<MileageEntry | null>(null)
  const [editStartMileage, setEditStartMileage] = useState("")
  const [editFinishMileage, setEditFinishMileage] = useState("")
  const [editRegNumber, setEditRegNumber] = useState("")
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

  const loadTrucks = async () => {
    const { data, error } = await supabase
      .from("trucks")
      .select("*")
      .order("reg")

    if (error) {
      console.log("TRUCKS LOAD ERROR:", error)
      return
    }

    setTrucks(data ?? [])
  }

  const loadAssignedTruck = async () => {
    const { data, error } = await supabase
      .from("drivers")
      .select("truck_reg")
      .eq("id", driverId)
      .single()

    if (error) {
      console.log("ASSIGNED TRUCK LOAD ERROR:", error)
      return
    }

    setAssignedReg(data?.truck_reg ?? "")
  }

  const getTruckDieselStat = async (reg: string): Promise<DieselStat | null> => {
    const cleanReg = normaliseReg(reg)
    if (!cleanReg) return null

    const { data, error } = await supabase
      .from("diesel_entries")
      .select("id, reg_number, mileage, litres, created_at")
      .not("reg_number", "is", null)
      .not("mileage", "is", null)
      .not("litres", "is", null)
      .order("created_at", { ascending: false })

    if (error) {
      console.log("GET TRUCK DIESEL STAT ERROR:", error)
      return null
    }

    const truckEntries: DieselEntry[] = (data ?? [])
      .filter((entry) => normaliseReg(entry.reg_number) === cleanReg)
      .sort(
        (a, b) =>
          new Date(b.created_at ?? "").getTime() -
          new Date(a.created_at ?? "").getTime()
      )

    if (truckEntries.length < 2) return null

    const current = truckEntries[0]
    const previous = truckEntries[1]

    if (!current.mileage || !previous.mileage || !current.litres) return null

    const miles = current.mileage - previous.mileage
    if (miles <= 0) return null

    const ukGallons = current.litres / 4.54609
    const mpg = miles / ukGallons

    const km = miles * 1.60934
    const l100 = (current.litres / km) * 100

    return { mpg, l100 }
  }

  useEffect(() => {
    loadMileageEntries()
    loadTrucks()
    loadAssignedTruck()
  }, [driverId])

  const openEdit = (entry: MileageEntry) => {
    setEditingEntry(entry)
    setEditStartMileage(String(entry.start_mileage))
    setEditFinishMileage(
      entry.finish_mileage === null ? "" : String(entry.finish_mileage)
    )
    setEditRegNumber(entry.reg_number ?? "")
  }

  const closeEdit = () => {
    setEditingEntry(null)
    setEditStartMileage("")
    setEditFinishMileage("")
    setEditRegNumber("")
  }

  const openAdd = () => {
    setStartMileage("")
    setFinishMileage("")

    if (needsFinish && todayEntry?.reg_number) {
      setRegNumber(todayEntry.reg_number)
    } else {
      setRegNumber(assignedReg)
    }

    setAddOpen(true)
  }

  const closeAdd = () => {
    setAddOpen(false)
    setStartMileage("")
    setFinishMileage("")
    setRegNumber("")
  }

  const saveStartMileage = async () => {
    if (saving) return

    const start = Number(startMileage)
    const mileageReg = normaliseReg(regNumber || assignedReg)

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
        reg_number: mileageReg || null,
        avg_l100: null,
        estimated_litres: null,
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
    const mileageReg = normaliseReg(regNumber || todayEntry.reg_number || assignedReg)

    if (!finishMileage) {
      alert("Enter finish mileage")
      return
    }

    if (finish < todayEntry.start_mileage) {
      alert("Finish mileage cannot be lower than start mileage")
      return
    }

    const total = finish - todayEntry.start_mileage

    const stat = await getTruckDieselStat(mileageReg)
    const avgL100 = stat?.l100 ?? null

    const estimatedLitres =
      avgL100 !== null && total > 0
        ? Number(((total * 1.60934 * avgL100) / 100).toFixed(1))
        : null

    setSaving(true)

    const { data, error } = await supabase
      .from("mileage_entries")
      .update({
        finish_mileage: finish,
        total_miles: total,
        reg_number: mileageReg || null,
        avg_l100: avgL100,
        estimated_litres: estimatedLitres,
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
    }
  }

  const saveEditMileage = async () => {
    if (editingSaving || !editingEntry) return

    const start = Number(editStartMileage)
    const finish =
      editFinishMileage.trim() === "" ? null : Number(editFinishMileage)
    const mileageReg = normaliseReg(editRegNumber || editingEntry.reg_number || assignedReg)

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

    let avgL100: number | null = null
    let estimatedLitres: number | null = null

    if (finish !== null && total !== null && total > 0) {
      const stat = await getTruckDieselStat(mileageReg)
      avgL100 = stat?.l100 ?? null

      estimatedLitres =
        avgL100 !== null
          ? Number(((total * 1.60934 * avgL100) / 100).toFixed(1))
          : null
    }

    setEditingSaving(true)

    const { data, error } = await supabase
      .from("mileage_entries")
      .update({
        start_mileage: start,
        finish_mileage: finish,
        total_miles: total,
        reg_number: mileageReg || null,
        avg_l100: avgL100,
        estimated_litres: estimatedLitres,
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

  const currentWeekEntries = entries
    .filter((entry) => getWeekTitle(entry.entry_date) === currentWeekTitle)
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date))

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

const isArchiveList = archiveOpen && !activeArchiveWeek

  const visibleArchiveEntries = activeArchiveWeek


    ? [...(archiveWeeks[activeArchiveWeek] ?? [])].sort((a, b) =>
        a.entry_date.localeCompare(b.entry_date)
      )
    : []

    const isArchiveMode = !!activeArchiveWeek

const visibleEntries = isArchiveMode
  ? visibleArchiveEntries
  : currentWeekEntries

const visibleTitle = isArchiveMode
  ? activeArchiveWeek
  : "Miles"

const visibleTotal = visibleEntries.reduce(
  (sum, entry) => sum + (entry.total_miles ?? 0),
  0
)

  const renderFuel = (entry: MileageEntry) => {
    const fuel = Number(entry.estimated_litres)

    if (!entry.estimated_litres || !Number.isFinite(fuel) || fuel <= 0) {
      return null
    }

    return (
      <div className="text-[12px] text-zinc-500">
        Fuel: ~<b>{fuel.toFixed(1)}</b> L
      </div>
    )
  }

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
  {archiveOpen ? "Miles Archive" : "Miles"}
</div>

          <div className="text-[14px]">
            <span className="text-zinc-500">This week</span>{" "}
            <b>{weekTotal}</b>{" "}
            <span className="text-zinc-500">miles</span>
          </div>
        </div>

{!archiveOpen && (
  <button
    onClick={() => {
      setArchiveOpen(true)
      setActiveArchiveWeek(null)
    }}
    className="w-[30px] text-[28px] leading-none"
  >
    📁
  </button>
)}
      </div>

      <div className="mt-5 space-y-3">

{isArchiveList &&
  archiveTitles.map((title) => {
    const total = archiveWeeks[title].reduce(
      (sum, entry) => sum + (entry.total_miles ?? 0),
      0
    )

    return (
      <button
        key={title}
        onClick={() => setActiveArchiveWeek(title)}
        className="w-full text-left bg-[#f5f5f5] rounded-[18px] border border-green-400 px-3 py-3 shadow-sm"
      >
        <div className="font-bold">{title}</div>
        <div className="text-[14px] text-zinc-500">
          {archiveWeeks[title].length} entries · {total} miles
        </div>
      </button>
    )
  })}

      {!isArchiveList &&
  visibleEntries.map((entry) => (
          <button
            key={entry.id}
            onClick={() => openEdit(entry)}
           className="w-full text-left bg-[#f5f5f5] rounded-[18px] border border-green-400 px-3 py-2 shadow-sm"
          >
            
             <div>
 <div className="relative text-center mb-3">
  <div className="font-semibold">
    {displayDate(entry.entry_date)}
  </div>

  <div className="absolute right-0 top-0 font-semibold">
    {entry.reg_number ?? assignedReg}
  </div>
</div>

  <div className="grid grid-cols-2 gap-3">
    <div className="space-y-1">
      <div>
        <span className="text-zinc-500">Start:</span>{" "}
        <b>{entry.start_mileage}</b>
      </div>

      <div>
        <span className="text-zinc-500">Finish:</span>{" "}
        <b>{entry.finish_mileage ?? "-"}</b>
      </div>
    </div>

    <div className="space-y-1 text-right">
      <div>
        <span className="text-zinc-500">Total:</span>{" "}
        <b>{entry.total_miles ?? "--"}</b> miles
      </div>

      {renderFuel(entry)}
    </div>
  </div>
</div>
          </button>
        ))}
      </div>

   <div className="fixed left-0 right-0 bottom-0 z-[90] bg-white p-3">
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
            <h2 className="text-[22px] font-bold mb-3">Add Mileage</h2>

            <div className="space-y-3">
              {needsStart && (
                <>
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
                    placeholder="Start mileage"
                    value={startMileage}
                    onChange={(e) => setStartMileage(e.target.value)}
                    className="w-full h-[46px] rounded-[12px] border px-4 text-[16px]"
                  />
                </>
              )}

              {needsFinish && todayEntry && (
                <>
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
    </main>
  )
}