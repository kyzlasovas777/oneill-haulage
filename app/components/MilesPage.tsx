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

function displayDate(dateText: string) {
  const [year, month, day] = dateText.split(".").map(Number)
  const date = new Date(year, month - 1, day)

  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

export default function MilesPage({ driverId, onBack }: MilesPageProps) {
  const [entries, setEntries] = useState<MileageEntry[]>([])
  const [startMileage, setStartMileage] = useState("")
  const [finishMileage, setFinishMileage] = useState("")
  const [saving, setSaving] = useState(false)

  const [editingEntry, setEditingEntry] = useState<MileageEntry | null>(null)
  const [editStartMileage, setEditStartMileage] = useState("")
  const [editFinishMileage, setEditFinishMileage] = useState("")
  const [editingSaving, setEditingSaving] = useState(false)

  const today = formatEntryDate(new Date())

  const todayEntry = entries.find((entry) => entry.entry_date === today)
  const needsStart = !todayEntry
  const needsFinish = todayEntry && todayEntry.finish_mileage === null

  const loadMileageEntries = async () => {
    const { data, error } = await supabase
      .from("mileage_entries")
      .select("*")
      .eq("driver_id", driverId)
      .order("entry_date", { ascending: false })

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

  const saveStartMileage = async () => {
    if (saving) return

    const start = Number(startMileage)

    if (!startMileage) {
      alert("Enter start mileage")
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

    setStartMileage("")
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

    setFinishMileage("")
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

  const weekTotal = entries.reduce(
    (sum, entry) => sum + (entry.total_miles ?? 0),
    0
  )

  return (
    <div className="fixed inset-0 z-[80] bg-[#efeff4] p-3 overflow-y-auto pb-[120px]">
    <div className="flex items-center gap-2 mb-3">
  <button
    onClick={onBack}
    className="h-[42px] px-4 rounded-[14px] bg-white font-bold text-[15px]"
  >
    Back
  </button>

  <button
    className="ml-auto h-[42px] px-4 rounded-[14px] bg-white font-bold text-[15px]"
  >
    Archive
  </button>
</div>

     <div className="text-center py-2">
  <h1 className="text-[28px] font-bold">
    Miles
  </h1>

  {todayEntry && todayEntry.finish_mileage !== null && (
    <div className="mt-2 text-[15px] font-bold text-green-700">
      Today mileage completed
    </div>
  )}
</div>



     <div className="bg-white rounded-[18px] p-4 mb-5">
  <div className="text-center text-[15px] font-bold">
    This week
  </div>

  <div className="text-center text-[34px] font-bold mt-1">
    {weekTotal} miles
  </div>
</div>

      <div className="space-y-2">
        {entries.map((entry) => (
          <button
            key={entry.id}
            onClick={() => openEdit(entry)}
            className="w-full text-left bg-white rounded-[16px] p-3"
          >
            <div className="font-bold text-[16px]">
              {displayDate(entry.entry_date)}
            </div>

            <div className="mt-2 text-[14px]">
              Start: <b>{entry.start_mileage}</b>
            </div>

            <div className="text-[14px]">
              Finish: <b>{entry.finish_mileage ?? "-"}</b>
            </div>

            <div className="mt-2 text-[17px] font-bold">
              Total: {entry.total_miles ?? "-"} miles
            </div>
          </button>
        ))}
      </div>

      {(needsStart || needsFinish) && (
        <div className="fixed left-0 right-0 bottom-0 z-[90] bg-[#efeff4]/95 backdrop-blur p-3">
          <div className="bg-white rounded-[18px] p-3 shadow-lg">
            {needsStart && (
              <div className="space-y-2">
                <input
                  type="number"
                  placeholder="Start mileage"
                  value={startMileage}
                  onChange={(e) => setStartMileage(e.target.value)}
                  className="w-full h-[44px] rounded-[12px] border px-4 text-[16px]"
                />

                <button
                  onClick={saveStartMileage}
                  className="w-full h-[46px] rounded-[14px] bg-blue-600 text-white font-bold text-[17px]"
                >
                  {saving ? "Saving..." : "Save Start"}
                </button>
              </div>
            )}

            {needsFinish && todayEntry && (
              <div className="space-y-2">
                <div className="text-[15px]">
                  Start: <b>{todayEntry.start_mileage}</b>
                </div>

                <input
                  type="number"
                  placeholder="Finish mileage"
                  value={finishMileage}
                  onChange={(e) => setFinishMileage(e.target.value)}
                  className="w-full h-[44px] rounded-[12px] border px-4 text-[16px]"
                />

                <button
                  onClick={saveFinishMileage}
                  className="w-full h-[46px] rounded-[14px] bg-blue-600 text-white font-bold text-[17px]"
                >
                  {saving ? "Saving..." : "Save Finish"}
                </button>
              </div>
            )}
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
            <h2 className="text-[22px] font-bold mb-3">Edit Mileage</h2>

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
                  onClick={closeEdit}
                  className="flex-1 h-[46px] rounded-[14px] bg-zinc-200 font-bold"
                >
                  Cancel
                </button>

                <button
                  onClick={saveEditMileage}
                  className="flex-1 h-[46px] rounded-[14px] bg-blue-600 text-white font-bold"
                >
                  {editingSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}