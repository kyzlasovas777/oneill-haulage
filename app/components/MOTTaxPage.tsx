"use client"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "./supabase"

type MOTTaxPageProps = {
  onBack: () => void
}

type Truck = {
  id: number
  reg: string
  active: boolean | null
  mot_expiry: string | null
  road_tax_expiry: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000

function daysUntil(dateText: string | null) {
  if (!dateText) return null

  const [year, month, day] = dateText.split("-").map(Number)
  if (!year || !month || !day) return null

  const now = new Date()
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const expiryUtc = Date.UTC(year, month - 1, day)

  return Math.round((expiryUtc - todayUtc) / DAY_MS)
}

function displayDate(dateText: string | null) {
  if (!dateText) return "Not set"

  const [year, month, day] = dateText.split("-")
  return `${day}/${month}/${year}`
}

function daysLabel(days: number | null) {
  if (days === null) return "Not set"
  if (days < 0) {
    const overdue = Math.abs(days)
    return `${overdue} day${overdue === 1 ? "" : "s"} overdue`
  }
  if (days === 0) return "Expires today"
  return `${days} day${days === 1 ? "" : "s"} left`
}

function statusTextClass(days: number | null) {
  if (days === null) return "text-zinc-400"
  if (days <= 15) return "text-red-600"
  if (days <= 30) return "text-amber-500"
  return "text-green-600"
}

function borderClass() {
  return "border-green-400"
}

function nearestDays(truck: Truck) {
  const values = [daysUntil(truck.mot_expiry), daysUntil(truck.road_tax_expiry)].filter(
    (value): value is number => value !== null
  )

  return values.length > 0 ? Math.min(...values) : null
}

export default function MOTTaxPage({ onBack }: MOTTaxPageProps) {
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null)
  const [motExpiry, setMotExpiry] = useState("")
  const [taxExpiry, setTaxExpiry] = useState("")
  const [saving, setSaving] = useState(false)

  const loadTrucks = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from("trucks")
      .select("id, reg, active, mot_expiry, road_tax_expiry")
      .eq("active", true)
      .order("reg", { ascending: true })

    if (error) {
      console.log("MOT TAX LOAD ERROR:", error)
      setLoading(false)
      return
    }

    setTrucks((data ?? []) as Truck[])
    setLoading(false)
  }

  useEffect(() => {
    void loadTrucks()

    const handleOnline = () => void loadTrucks()
    window.addEventListener("online", handleOnline)

    return () => window.removeEventListener("online", handleOnline)
  }, [])

  const sortedTrucks = useMemo(() => {
    return [...trucks].sort((a, b) => {
      const aDays = nearestDays(a)
      const bDays = nearestDays(b)

      if (aDays === null && bDays === null) return a.reg.localeCompare(b.reg)
      if (aDays === null) return 1
      if (bDays === null) return -1
      if (aDays !== bDays) return aDays - bDays
      return a.reg.localeCompare(b.reg)
    })
  }, [trucks])

  const openEdit = (truck: Truck) => {
    setSelectedTruck(truck)
    setMotExpiry(truck.mot_expiry ?? "")
    setTaxExpiry(truck.road_tax_expiry ?? "")
  }

  const closeEdit = () => {
    if (saving) return
    setSelectedTruck(null)
    setMotExpiry("")
    setTaxExpiry("")
  }

  const saveDates = async () => {
    if (!selectedTruck || saving) return

    if (!navigator.onLine) {
      alert("Internet is required to save MOT and Tax dates")
      return
    }

    setSaving(true)

    const { error } = await supabase
      .from("trucks")
      .update({
        mot_expiry: motExpiry || null,
        road_tax_expiry: taxExpiry || null,
      })
      .eq("id", selectedTruck.id)

    if (error) {
      console.log("MOT TAX SAVE ERROR:", error)
      setSaving(false)
      alert("Could not save MOT and Tax dates")
      return
    }

    setSaving(false)
    setSelectedTruck(null)
    setMotExpiry("")
    setTaxExpiry("")
    await loadTrucks()
  }

  return (
    <main className="h-[100dvh] bg-white flex flex-col w-full overflow-hidden">
      <div className="relative h-[76px] shrink-0 bg-white px-4 flex items-center justify-center">
        <button
          onClick={onBack}
          className="absolute left-4 text-blue-500 text-[34px] leading-none active:scale-95"
          aria-label="Back"
        >
          ‹
        </button>

        <div className="text-center">
          <h1 className="text-[23px] font-bold text-black leading-tight">MOT & Tax</h1>
          <p className="text-[12px] text-zinc-400 leading-tight">Nearest expiry first</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-none px-4 pb-6">
        {loading ? (
          <p className="pt-8 text-center text-[15px] text-zinc-400">Loading...</p>
        ) : sortedTrucks.length === 0 ? (
          <p className="pt-8 text-center text-[15px] text-zinc-400">No active trucks</p>
        ) : (
          <div className="space-y-2">
            {sortedTrucks.map((truck) => {
              const motDays = daysUntil(truck.mot_expiry)
              const taxDays = daysUntil(truck.road_tax_expiry)

              return (
                <button
                  key={truck.id}
                  onClick={() => openEdit(truck)}
                  className={`w-full rounded-[18px] border ${borderClass()} bg-[#f5f5f5] px-3 py-2.5 text-left active:scale-[0.99]`}
                >
                  <div className="mb-1.5">
                    <span className="text-[19px] font-extrabold text-black leading-tight">
                      {truck.reg}
                    </span>
                  </div>

                  <div className="grid grid-cols-[42px_1fr_auto] items-center gap-x-2 text-[13px] leading-[20px]">
                    <span className="font-bold text-zinc-600">MOT</span>
                    <span className="text-zinc-700">{displayDate(truck.mot_expiry)}</span>
                    <span className={`font-semibold text-right ${statusTextClass(motDays)}`}>
                      {daysLabel(motDays)}
                    </span>

                    <span className="font-bold text-zinc-600">Tax</span>
                    <span className="text-zinc-700">{displayDate(truck.road_tax_expiry)}</span>
                    <span className={`font-semibold text-right ${statusTextClass(taxDays)}`}>
                      {daysLabel(taxDays)}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {selectedTruck && (
        <div
          className="fixed inset-0 z-[120] bg-black/25 flex items-end justify-center"
          onClick={closeEdit}
        >
          <div
            className="w-full max-w-[430px] rounded-t-[34px] bg-[#efeff4] px-4 pt-6 pb-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-center text-[24px] font-bold text-black mb-5">
              {selectedTruck.reg}
            </h2>

            <div className="mb-3">
              <div className="mb-1 flex items-center justify-between px-1">
                <label className="text-[14px] font-semibold text-zinc-600">MOT expiry</label>
                {motExpiry && (
                  <button
                    onClick={() => setMotExpiry("")}
                    className="text-[13px] font-semibold text-blue-500"
                  >
                    Clear
                  </button>
                )}
              </div>
              <input
                type="date"
                value={motExpiry}
                onChange={(event) => setMotExpiry(event.target.value)}
                className="w-full h-[50px] rounded-[20px] bg-white px-4 text-[17px] text-black text-center outline-none"
              />
            </div>

            <div className="mb-5">
              <div className="mb-1 flex items-center justify-between px-1">
                <label className="text-[14px] font-semibold text-zinc-600">Road Tax expiry</label>
                {taxExpiry && (
                  <button
                    onClick={() => setTaxExpiry("")}
                    className="text-[13px] font-semibold text-blue-500"
                  >
                    Clear
                  </button>
                )}
              </div>
              <input
                type="date"
                value={taxExpiry}
                onChange={(event) => setTaxExpiry(event.target.value)}
                className="w-full h-[50px] rounded-[20px] bg-white px-4 text-[17px] text-black text-center outline-none"
              />
            </div>

            <button
              onClick={() => void saveDates()}
              disabled={saving}
              className="w-full h-[50px] rounded-[22px] bg-blue-500 text-white text-[18px] font-bold disabled:opacity-50 active:scale-[0.98]"
            >
              {saving ? "Saving..." : "Save"}
            </button>

            <button
              onClick={closeEdit}
              disabled={saving}
              className="mt-2 w-full h-[46px] rounded-[20px] text-zinc-500 text-[17px] font-semibold disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
