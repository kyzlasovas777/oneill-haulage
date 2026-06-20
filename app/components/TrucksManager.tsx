"use client"

import { useEffect, useState } from "react"
import { supabase } from "./supabase"

type Truck = {
  id: number
  reg: string
}

type TrucksManagerProps = {
  onClose: () => void
  dieselStats?: Record<
    string,
    {
      mpg: number
      l100: number
    }
  >
}

export default function TrucksManager({
  onClose,
  dieselStats,
}: TrucksManagerProps) {
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [showAdd, setShowAdd] = useState(false)
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null)
  const [editingTruck, setEditingTruck] = useState<Truck | null>(null)
  const [truckReg, setTruckReg] = useState("")

  const loadTrucks = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from("trucks")
      .select("id, reg")
      .order("reg", { ascending: true })

    if (error) {
      console.log("LOAD TRUCKS ERROR:", error)
      setLoading(false)
      return
    }

    setTrucks(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadTrucks()
  }, [])

  const openAddTruck = () => {
    setTruckReg("")
    setEditingTruck(null)
    setShowAdd(true)
  }

  const openEditTruck = (truck: Truck) => {
    setSelectedTruck(null)
    setEditingTruck(truck)
    setTruckReg(truck.reg)
    setShowAdd(true)
  }

  const saveTruck = async () => {
    const reg = truckReg.trim().toUpperCase()
    if (!reg || saving) return

    setSaving(true)

    if (editingTruck) {
      const { error } = await supabase
        .from("trucks")
        .update({ reg })
        .eq("id", editingTruck.id)

      if (error) {
        console.log("UPDATE TRUCK ERROR:", error)
        setSaving(false)
        return
      }
    } else {
      const { error } = await supabase.from("trucks").insert({ reg })

      if (error) {
        console.log("ADD TRUCK ERROR:", error)
        setSaving(false)
        return
      }
    }

    setTruckReg("")
    setEditingTruck(null)
    setShowAdd(false)
    setSaving(false)
    loadTrucks()
  }

  const deleteTruck = async (truck: Truck) => {
    const ok = confirm(`Delete ${truck.reg}?`)
    if (!ok) return

    const { error } = await supabase.from("trucks").delete().eq("id", truck.id)

    if (error) {
      console.log("DELETE TRUCK ERROR:", error)
      return
    }

    setSelectedTruck(null)
    loadTrucks()
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-[90] flex items-center justify-center px-4">
      <div className="w-full max-w-[340px] bg-[#efeff4] rounded-[30px] px-4 pt-6 pb-5 shadow-xl">
<h2 className="text-center text-[32px] mb-5">
  🚛
</h2>

        <div className="space-y-2 mb-3">
          {loading ? (
            <p className="text-center text-zinc-400 text-[15px]">Loading...</p>
          ) : trucks.length === 0 ? (
            <p className="text-center text-zinc-400 text-[15px]">
              No trucks yet
            </p>
          ) : (
        trucks.map((truck) => (
  <button
    key={truck.id}
    onClick={() => setSelectedTruck(truck)}
    className="relative w-full h-[46px] rounded-[18px] bg-white flex items-center justify-center"
  >
 <div className="relative w-full text-center">
<span>{truck.reg}</span>

<span className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] text-zinc-400">
  {dieselStats?.[truck.reg]?.mpg?.toFixed(1) ?? "-"} MPG
</span>
</div>
  </button>
))
          )}
        </div>

        <button
          onClick={openAddTruck}
          className="w-full h-[50px] rounded-[22px] bg-blue-500 text-white text-[18px] font-bold mb-3 active:scale-[0.98]"
        >
          + Add Truck
        </button>

        <button
          onClick={onClose}
          className="w-full h-[46px] rounded-[20px] text-zinc-500 text-[17px] font-semibold active:scale-[0.98]"
        >
          Close
        </button>
      </div>

      {selectedTruck && (
        <div className="fixed inset-0 bg-black/30 z-[100] flex items-center justify-center px-4">
          <div className="w-full max-w-[320px] bg-[#efeff4] rounded-[28px] px-4 pt-6 pb-5 shadow-xl">
            <h2 className="text-center text-[22px] font-bold text-black mb-5">
              {selectedTruck.reg}
            </h2>

            <button
              onClick={() => openEditTruck(selectedTruck)}
              className="w-full h-[50px] rounded-[22px] bg-blue-500 text-white text-[18px] font-bold mb-2 active:scale-[0.98]"
            >
              Edit
            </button>

            <button
              onClick={() => deleteTruck(selectedTruck)}
              className="w-full h-[50px] rounded-[22px] bg-red-500 text-white text-[18px] font-bold mb-2 active:scale-[0.98]"
            >
              Delete
            </button>

            <button
              onClick={() => setSelectedTruck(null)}
              className="w-full h-[46px] rounded-[20px] text-zinc-500 text-[17px] font-semibold active:scale-[0.98]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/30 z-[110] flex items-center justify-center px-4">
          <div className="w-full max-w-[320px] bg-[#efeff4] rounded-[28px] px-4 pt-6 pb-5 shadow-xl">
            <h2 className="text-center text-[22px] font-bold text-black mb-5">
              {editingTruck ? "Edit Truck" : "Add Truck"}
            </h2>

            <input
              placeholder="Reg Number"
              value={truckReg}
              onChange={(e) => setTruckReg(e.target.value.toUpperCase())}
              className="w-full h-[50px] rounded-[20px] bg-white px-5 text-[18px] text-center font-bold text-black outline-none mb-3"
            />

            <button
              onClick={saveTruck}
              disabled={saving}
              className="w-full h-[50px] rounded-[22px] bg-blue-500 text-white text-[18px] font-bold mb-2 active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>

            <button
              onClick={() => {
                setShowAdd(false)
                setEditingTruck(null)
                setTruckReg("")
              }}
              className="w-full h-[46px] rounded-[20px] text-zinc-500 text-[17px] font-semibold active:scale-[0.98]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}