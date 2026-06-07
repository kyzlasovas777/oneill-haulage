import { useEffect, useState } from "react"
import { supabase } from "./supabase"

type DieselPageProps = {
  driverId: number
  onBack: () => void
}

type DieselEntry = {
  id: number
  driver_id: number
  entry_date: string
  mileage: number
  litres: number
  photo_url?: string | null
  photo_path?: string | null
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

export default function DieselPage({ driverId, onBack }: DieselPageProps) {
  const [entries, setEntries] = useState<DieselEntry[]>([])
  const [mileage, setMileage] = useState("")
  const [litres, setLitres] = useState("")
  const [saving, setSaving] = useState(false)

  const [editingEntry, setEditingEntry] = useState<DieselEntry | null>(null)
  const [editMileage, setEditMileage] = useState("")
  const [editLitres, setEditLitres] = useState("")
  const [editingSaving, setEditingSaving] = useState(false)

  const today = formatEntryDate(new Date())

  const loadDieselEntries = async () => {
    const { data, error } = await supabase
      .from("diesel_entries")
      .select("*")
      .eq("driver_id", driverId)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })

    if (error) {
      console.log("DIESEL LOAD ERROR:", error)
      return
    }

    setEntries(data ?? [])
  }

  useEffect(() => {
    loadDieselEntries()
  }, [driverId])

  const openEdit = (entry: DieselEntry) => {
    setEditingEntry(entry)
    setEditMileage(String(entry.mileage))
    setEditLitres(String(entry.litres))
  }

  const closeEdit = () => {
    setEditingEntry(null)
    setEditMileage("")
    setEditLitres("")
  }

  const saveDiesel = async () => {
    if (saving) return

    const mileageNumber = Number(mileage)
    const litresNumber = Number(litres)

    if (!mileage || !litres) {
      alert("Enter mileage and litres")
      return
    }

    if (mileageNumber <= 0 || litresNumber <= 0) {
      alert("Mileage and litres must be higher than 0")
      return
    }

    setSaving(true)

    const { data, error } = await supabase
      .from("diesel_entries")
      .insert({
        driver_id: driverId,
        entry_date: today,
        mileage: mileageNumber,
        litres: litresNumber,
        photo_url: null,
        photo_path: null,
      })
      .select()
      .single()

    setSaving(false)

    if (error) {
      console.log("DIESEL SAVE ERROR:", error)
      alert("Diesel save error")
      return
    }

    if (data) setEntries((prev) => [data, ...prev])

    setMileage("")
    setLitres("")
  }

  const saveEditDiesel = async () => {
    if (editingSaving || !editingEntry) return

    const mileageNumber = Number(editMileage)
    const litresNumber = Number(editLitres)

    if (!editMileage || !editLitres) {
      alert("Enter mileage and litres")
      return
    }

    if (mileageNumber <= 0 || litresNumber <= 0) {
      alert("Mileage and litres must be higher than 0")
      return
    }

    setEditingSaving(true)

    const { data, error } = await supabase
      .from("diesel_entries")
      .update({
        mileage: mileageNumber,
        litres: litresNumber,
      })
      .eq("id", editingEntry.id)
      .select()
      .single()

    setEditingSaving(false)

    if (error) {
      console.log("DIESEL EDIT ERROR:", error)
      alert("Diesel edit error")
      return
    }

    if (data) {
      setEntries((prev) =>
        prev.map((entry) => (entry.id === data.id ? data : entry))
      )
    }

    closeEdit()
  }

  const weekLitres = entries.reduce((sum, entry) => sum + Number(entry.litres), 0)

  return (
    <div className="fixed inset-0 z-[80] bg-[#efeff4] p-3 overflow-y-auto pb-[130px]">
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={onBack}
          className="h-[42px] px-4 rounded-[14px] bg-white font-bold text-[15px]"
        >
          Back
        </button>

        <button className="ml-auto h-[42px] px-4 rounded-[14px] bg-white font-bold text-[15px]">
          Archive
        </button>
      </div>

     <div className="text-center py-2">
  <h1 className="text-[28px] font-bold">Diesel</h1>
</div>

    <div className="bg-white rounded-[18px] p-4 mb-5">
  <div className="text-center text-[15px] font-bold">
    This week
  </div>

  <div className="text-center text-[34px] font-bold mt-1">
    {weekLitres.toFixed(2)} L
  </div>
</div>

    <div className="mt-5 space-y-3">
  {entries.map((entry) => (
          <button
            key={entry.id}
            onClick={() => openEdit(entry)}
           className="w-full text-left bg-white rounded-[18px] p-4 shadow-sm"
          >
            <div className="font-bold text-[16px]">
              {displayDate(entry.entry_date)}
            </div>

            <div className="mt-2 text-[14px]">
              Mileage: <b>{entry.mileage}</b>
            </div>

            <div className="text-[14px]">
              Litres: <b>{Number(entry.litres).toFixed(2)} L</b>
            </div>
          </button>
        ))}
      </div>

      <div className="fixed left-0 right-0 bottom-0 z-[90] bg-[#efeff4]/95 backdrop-blur p-3">
        <div className="bg-white rounded-[18px] p-3 shadow-lg space-y-2">
          <input
            type="number"
            placeholder="Mileage"
            value={mileage}
            onChange={(e) => setMileage(e.target.value)}
            className="w-full h-[44px] rounded-[12px] border px-4 text-[16px]"
          />

          <input
            type="number"
            placeholder="Litres"
            value={litres}
            onChange={(e) => setLitres(e.target.value)}
            className="w-full h-[44px] rounded-[12px] border px-4 text-[16px]"
          />

          <button
            onClick={saveDiesel}
            className="w-full h-[46px] rounded-[14px] bg-blue-600 text-white font-bold text-[17px]"
          >
            {saving ? "Saving..." : "Save Diesel"}
          </button>
        </div>
      </div>

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

              <div className="flex gap-2 pt-1">
                <button
                  onClick={closeEdit}
                  className="flex-1 h-[46px] rounded-[14px] bg-zinc-200 font-bold"
                >
                  Cancel
                </button>

                <button
                  onClick={saveEditDiesel}
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