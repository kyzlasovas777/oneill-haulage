"use client"

import { useEffect, useState } from "react"
import { supabase } from "./supabase"
import TrucksManager from "./TrucksManager"

type Driver = {
  id: number
  name: string
  pin: string
  truckReg?: string
  active?: boolean
  syncStatus?: "synced" | "pending"
}

type Entry = {
  id: number
  date: string
  trailer: string
  from: string
  to: string
  status: string
  note: string
}

type DieselEntry = {
  id: number
  driver_id: number
  reg_number: string | null
  mileage: number | null
  litres: number | null
  created_at?: string
}


type DieselStat = {
  mpg: number
  l100: number
}

type BossDashboardProps = {
  onLogout: () => void
  onOpenDriver: (driver: Driver) => void
}

const STORAGE_KEY = "oneill-drivers"

function loadDrivers(): Driver[] {
  if (typeof window === "undefined") return []

  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

function sortDrivers(drivers: Driver[]) {
  return [...drivers].sort((a, b) => {
    const aActive = a.active !== false
    const bActive = b.active !== false

    if (aActive !== bActive) {
      return aActive ? -1 : 1
    }

    return a.name.localeCompare(b.name)
  })
}

function getDriverRows(driverId: number) {
  if (typeof window === "undefined") return 0

  try {
    const saved = localStorage.getItem(`oneill-entries-${driverId}`)
    const entries: Entry[] = saved ? JSON.parse(saved) : []
    return entries.length
  } catch {
    return 0
  }
}

export default function BossDashboard({
  onLogout,
  onOpenDriver,
}: BossDashboardProps) {
  const [drivers, setDrivers] = useState<Driver[]>(() =>
    sortDrivers(loadDrivers())
  )

  const [refreshKey, setRefreshKey] = useState(0)
  const [showAddDriver, setShowAddDriver] = useState(false)
  const [editingDriverId, setEditingDriverId] = useState<number | null>(null)
  const [driverName, setDriverName] = useState("")
  const [driverPin, setDriverPin] = useState("")
const [driverTruck, setDriverTruck] = useState("")

const [trucks, setTrucks] = useState<string[]>([])
const [dieselStats, setDieselStats] =
  useState<Record<string, DieselStat>>({})

const loadTrucks = async () => {
  const { data } = await supabase
    .from("trucks")
    .select("reg")
    .eq("active", true)
    .order("reg")

  setTrucks((data ?? []).map((t) => t.reg))
}

const loadDieselStats = async () => {
  const { data, error } = await supabase
    .from("diesel_entries")
    .select("id, driver_id, reg_number, mileage, litres, created_at")
    .not("reg_number", "is", null)
    .not("mileage", "is", null)
    .not("litres", "is", null)
    .order("created_at", { ascending: true })

  if (error) {
    console.log("DIESEL STATS ERROR:", error)
    return
  }

  const grouped: Record<string, DieselEntry[]> = {}

  ;(data ?? []).forEach((entry) => {
    const reg = entry.reg_number?.trim()
    if (!reg) return

    if (!grouped[reg]) grouped[reg] = []
    grouped[reg].push(entry)
  })

  const nextStats: Record<string, DieselStat> = {}

  Object.entries(grouped).forEach(([reg, truckEntries]) => {
    const sorted = truckEntries.sort(
      (a, b) =>
        new Date(a.created_at ?? "").getTime() -
        new Date(b.created_at ?? "").getTime()
    )

    if (sorted.length < 2) return

    const current = sorted[sorted.length - 1]
    const previous = sorted[sorted.length - 2]

    if (!current.mileage || !previous.mileage || !current.litres) return

    const miles = current.mileage - previous.mileage
    if (miles <= 0) return

    const ukGallons = current.litres / 4.54609
    const mpg = miles / ukGallons

    const km = miles * 1.60934
    const l100 = (current.litres / km) * 100

    nextStats[reg] = { mpg, l100 }
  })

  setDieselStats(nextStats)
}
  const [syncText, setSyncText] = useState("Offline ready")
  const [syncing, setSyncing] = useState(false)

  const [showBossMenu, setShowBossMenu] = useState(false)
  const [showTrucks, setShowTrucks] = useState(false)
  
  const saveDriversLocal = (nextDrivers: Driver[]) => {


    const sorted = sortDrivers(nextDrivers)
    setDrivers(sorted)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted))
    setRefreshKey((prev) => prev + 1)
  }

  const syncDrivers = async () => {
    const localDrivers = loadDrivers()
    setSyncing(true)
    setSyncText("Syncing...")

    for (const driver of localDrivers) {
      if (driver.syncStatus === "pending") {
        const isLocalOnly = driver.id > 1000000000000

        if (isLocalOnly) {
          const { data, error } = await supabase
            .from("drivers")
          .insert({
  name: driver.name,
  pin: driver.pin,
  truck_reg: driver.truckReg ?? "",
  active: driver.active !== false,
})
.select("id, name, pin, active, truck_reg")
            .single()

          if (error) {
            console.log("SYNC ERROR:", error)
            setSyncText("Sync error: " + error.message)
            setSyncing(false)
            return
          }

          const updatedDrivers = loadDrivers().map((item) =>
            item.id === driver.id
             ? {
    id: data.id,
    name: data.name,
    pin: data.pin,
    truckReg: data.truck_reg ?? "",
    active: data.active,
    syncStatus: "synced" as const,
  }
              : item
          )

          saveDriversLocal(updatedDrivers)
        } else {
          const { data, error } = await supabase
            .from("drivers")
         .update({
  name: driver.name,
  pin: driver.pin,
  truck_reg: driver.truckReg ?? "",
  active: driver.active !== false,
})
            .eq("id", driver.id)
           .select("id, name, pin, active, truck_reg")
            .single()

          if (error) {
            console.log("UPDATE ERROR:", error)
            setSyncText("Sync error: " + error.message)
            setSyncing(false)
            return
          }

          const updatedDrivers = loadDrivers().map((item) =>
            item.id === driver.id
           ? {
    id: data.id,
    name: data.name,
    pin: data.pin,
    truckReg: data.truck_reg ?? "",
    active: data.active,
    syncStatus: "synced" as const,
  }
              : item
          )

          saveDriversLocal(updatedDrivers)
        }
      }
    }

    setSyncText("Synced")
    setSyncing(false)
  }

  const loadFromSupabase = async () => {
    const { data, error } = await supabase
  .from("drivers")
  .select("id, name, pin, active, truck_reg")
      .order("active", { ascending: false })
      .order("name", { ascending: true })

    if (error) {
      console.log("LOAD DRIVERS ERROR:", error)
      setSyncText("Offline mode")
      return
    }

    const pendingLocal = loadDrivers().filter(
      (driver) => driver.syncStatus === "pending"
    )

 const remoteDrivers: Driver[] = (data ?? []).map((driver) => ({
  id: driver.id,
  name: driver.name,
  pin: driver.pin,
  truckReg: driver.truck_reg ?? "",
  active: driver.active !== false,
  syncStatus: "synced",
}))

    const mergedDrivers = [...remoteDrivers]

    for (const pendingDriver of pendingLocal) {
      const existingIndex = mergedDrivers.findIndex(
        (driver) => driver.id === pendingDriver.id
      )

      if (existingIndex >= 0) {
        mergedDrivers[existingIndex] = pendingDriver
      } else {
        mergedDrivers.push(pendingDriver)
      }
    }

    saveDriversLocal(mergedDrivers)
    setSyncText("Loaded from Supabase")
  }

useEffect(() => {
  loadFromSupabase()
  loadTrucks()
  loadDieselStats()

    const handleOnline = () => {
      syncDrivers()
    }

    window.addEventListener("online", handleOnline)

    return () => {
      window.removeEventListener("online", handleOnline)
    }
  }, [])

const openAddDriver = () => {
  setEditingDriverId(null)
  setDriverName("")
  setDriverPin("")
  setDriverTruck("")
  setShowAddDriver(true)
}

const openEditDriver = (driver: Driver) => {
  setEditingDriverId(driver.id)
  setDriverName(driver.name)
  setDriverPin(driver.pin)
  setDriverTruck(driver.truckReg ?? "")
  setShowAddDriver(true)
}

  const saveDriver = async () => {
    const cleanName = driverName.trim()
    const cleanPin = driverPin.trim()
    const cleanTruck = driverTruck.trim()

    if (!cleanName) return

    if (!/^\d{4}$/.test(cleanPin)) {
      alert("PIN must be 4 numbers")
      return
    }

    const pinExists = drivers.some(
      (driver) => driver.pin === cleanPin && driver.id !== editingDriverId
    )

    if (pinExists) {
      alert("This PIN already exists")
      return
    }

    if (editingDriverId) {
      const nextDrivers = drivers.map((driver) =>
        driver.id === editingDriverId
         ? {
    ...driver,
    name: cleanName,
    pin: cleanPin,
    truckReg: cleanTruck,
    syncStatus: "pending" as const,
  }
          : driver
      )

      saveDriversLocal(nextDrivers)
    } else {
    const newDriver: Driver = {
  id: Date.now(),
  name: cleanName,
  pin: cleanPin,
  truckReg: cleanTruck,
  active: true,
  syncStatus: "pending",
}

      saveDriversLocal([...drivers, newDriver])
    }

   setDriverName("")
setDriverPin("")
setDriverTruck("")
setEditingDriverId(null)
setShowAddDriver(false)

    if (navigator.onLine) {
      setTimeout(() => {
        syncDrivers()
      }, 300)
    } else {
      setSyncText("Saved offline. Will sync later.")
    }
  }

  const toggleDriverActive = async (driver: Driver) => {
    const nextDrivers = drivers.map((item) =>
      item.id === driver.id
        ? {
            ...item,
            active: item.active === false ? true : false,
            syncStatus: "pending" as const,
          }
        : item
    )

    saveDriversLocal(nextDrivers)

    if (navigator.onLine) {
      setTimeout(() => {
        syncDrivers()
      }, 300)
    } else {
      setSyncText("Saved offline. Will sync later.")
    }
  }

  const visibleDrivers = sortDrivers(drivers)

  return (
<main className="h-[100dvh] bg-white flex flex-col w-full overflow-hidden">
<div className="relative bg-white px-4 pt-4 h-[80px] flex items-center justify-between">
        <button
          onClick={onLogout}
          className="text-blue-500 text-[17px] font-bold"
        >
          Logout
        </button>

<img
  src="/icon.clear.png"
  alt="O'Neill Haulage"
  className="absolute left-1/2 top-1/2 h-28 w-auto -translate-x-1/2 -translate-y-1/2"
/>
<button
  onClick={() => setShowBossMenu(true)}
  className="text-blue-500 text-[28px] font-black leading-none"
>
  ☰
</button>
      </div>

  
<div className="flex-1 min-h-0 px-4 overflow-y-auto overscroll-none space-y-2 pb-[80px]">
  {visibleDrivers.map((driver) => {
    const isActive = driver.active !== false

    return (
      <div
        key={`${driver.id}-${refreshKey}`}
        onClick={() => onOpenDriver(driver)}
className={`rounded-[18px] border border-green-400 p-3 active:scale-[0.99] transition-all ${
  isActive ? "bg-[#f5f5f5]" : "bg-[#f5f5f5] opacity-70"
}`}
      >
 <div className="grid grid-cols-2 gap-4 mb-2">
  <div className="space-y-1">
    <p className="h-[22px] text-[18px] font-bold text-black leading-tight">
    {isActive ? "☘️" : "🍂"}{" "}
{driver.name}
      {driver.syncStatus === "pending" ? " ⏳" : ""}
    </p>

    <p className="h-[18px] text-[13px] text-zinc-400 leading-tight">
      PIN: {driver.pin}
    </p>

    <p className="h-[18px] text-[13px] text-zinc-400 leading-tight">
      This week rows: {getDriverRows(driver.id)}
    </p>
  </div>

  <div className="space-y-1 text-right">
    <p className="h-[22px] text-[15px] font-extrabold text-black leading-tight">
      {driver.truckReg || ""}
    </p>

    <p className="h-[18px] text-[13px] text-zinc-500 leading-tight">
      {driver.truckReg && dieselStats[driver.truckReg]
        ? `${dieselStats[driver.truckReg].mpg.toFixed(1)} MPG`
        : ""}
    </p>

    <p className="h-[18px] text-[13px] text-zinc-500 leading-tight">
      {driver.truckReg && dieselStats[driver.truckReg]
        ? `${dieselStats[driver.truckReg].l100.toFixed(1)} L/100km`
        : ""}
    </p>
  </div>
</div>

        <div className="flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              openEditDriver(driver)
            }}
            className="flex-1 h-[34px] rounded-[14px] bg-blue-500 text-white text-[14px] font-bold"
          >
            Edit
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation()
              toggleDriverActive(driver)
            }}
            className={`flex-1 h-[34px] rounded-[14px] text-white text-[14px] font-bold ${
              isActive ? "bg-zinc-500" : "bg-green-500"
            }`}
          >
            {isActive ? "Disable" : "Enable"}
          </button>
        </div>
      </div>
    )
  })}


</div>

  {showBossMenu && (
  <div
    className="fixed inset-0 z-[80]"
    onClick={() => setShowBossMenu(false)}
  >
    <div
      className="absolute top-[62px] right-4 w-[170px] rounded-[18px] bg-white shadow-xl p-2"
      onClick={(e) => e.stopPropagation()}
    >
      <button
     onClick={() => {
  setShowBossMenu(false)
  setShowTrucks(true)
}}
       className="w-full h-[45px] px-6 flex items-center gap-4 text-[17px] font-normal text-black"
      >
        Trucks
      </button>

<button
  onClick={() => {
    setShowBossMenu(false)
    openAddDriver()
  }}
  className="w-full h-[45px] px-6 flex items-center gap-4 text-[17px] font-normal text-black"
>
  + Add Driver
</button>

    </div>
  </div>
)}

{showTrucks && (
  <TrucksManager
    onClose={() => setShowTrucks(false)}
  />
)}

      {showAddDriver && (
        <div className="fixed inset-0 bg-black/20 z-[90] flex items-end justify-center">
          <div className="w-full max-w-[430px] bg-[#efeff4] rounded-t-[34px] px-4 pt-8 pb-6">
            <h2 className="text-center text-[24px] font-bold text-black mb-5">
              {editingDriverId ? "Edit Driver" : "Add Driver"}
            </h2>

            <input
              placeholder="Driver name"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              className="w-full h-[50px] rounded-[20px] bg-[#dfdfe4] px-5 text-[18px] text-center outline-none mb-2"
            />

            <input
              type="tel"
              placeholder="4 digit PIN"
              value={driverPin}
              maxLength={4}
              inputMode="numeric"
              onChange={(e) =>
                setDriverPin(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              className="w-full h-[50px] rounded-[20px] bg-[#dfdfe4] px-5 text-[18px] text-center outline-none mb-3"
            />

            <select
  value={driverTruck}
  onChange={(e) => setDriverTruck(e.target.value)}
  className="w-full h-[50px] rounded-[20px] bg-[#fdfde4] px-5 text-[18px] text-black text-center font-bold mb-3 outline-none"
>
  <option value="">No truck assigned</option>

  {trucks.map((truck) => (
    <option key={truck} value={truck}>
      {truck}
    </option>
  ))}
</select>

            <button
              onClick={saveDriver}
              className="w-full h-[50px] rounded-[22px] bg-blue-500 text-white text-[18px] font-bold"
            >
              {editingDriverId ? "Save Changes" : "Save Driver"}
            </button>

            <button
              onClick={() => {
                setShowAddDriver(false)
                setEditingDriverId(null)
                setDriverName("")
                setDriverPin("")
              }}
              className="w-full h-[46px] mt-2 rounded-[20px] text-zinc-500 text-[17px] font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

