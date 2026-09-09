"use client"

import {
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react"
import * as XLSX from "xlsx-js-style"
import DriverAppOriginal from "./DriverAppOriginal"
import { supabase } from "./supabase"

type DriverAppProps = {
  driverId: number
  driverName: string
  onBack?: () => void
  isBoss?: boolean
}

type DaveEntry = {
  id: number
  driverId: number
  date: string
  trailer: string
  from: string
  to: string
  status: string
  note: string
  regNumber: string
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

function formatWeekTitle(monday: Date, sunday: Date) {
  const formatShort = (date: Date) => {
    const day = String(date.getDate()).padStart(2, "0")
    const month = String(date.getMonth() + 1).padStart(2, "0")
    return `${day}.${month}`
  }

  return `${formatShort(monday)} - ${formatShort(sunday)}`
}

function parseEntryDate(dateText: string) {
  const [year, month, day] = dateText.split(".").map(Number)
  return new Date(year, month - 1, day)
}

function formatExcelDate(dateText: string) {
  const date = parseEntryDate(dateText)
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

function formatDayName(dateText: string) {
  return parseEntryDate(dateText).toLocaleDateString("en-GB", {
    weekday: "long",
  })
}

function normalizePlace(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "")
}

function isCnm(value: string) {
  return normalizePlace(value) === "cnm"
}

function isShercock(value: string) {
  const normalized = normalizePlace(value)
  return normalized === "shercock" || normalized === "sherkock"
}

function isLoaded(entry: DaveEntry) {
  return entry.status.trim().toUpperCase() === "L"
}

function normalizeTrailer(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "")
}

function compareEntries(a: DaveEntry, b: DaveEntry) {
  const byDate = a.date.localeCompare(b.date)
  if (byDate !== 0) return byDate
  return a.id - b.id
}

function buildDaveEntries(allEntries: DaveEntry[]) {
  const grouped = new Map<string, DaveEntry[]>()

  for (const entry of allEntries) {
    const trailer = normalizeTrailer(entry.trailer)
    if (!trailer || trailer === "--//--") continue

    const group = grouped.get(trailer) ?? []
    group.push(entry)
    grouped.set(trailer, group)
  }

  const removedIds = new Set<number>()
  const mergedEntries: DaveEntry[] = []

  for (const trailerEntries of grouped.values()) {
    const ordered = [...trailerEntries].sort(compareEntries)

    for (let index = 0; index < ordered.length - 1; ) {
      const first = ordered[index]
      const second = ordered[index + 1]

      if (!isLoaded(first) || !isLoaded(second)) {
        index += 1
        continue
      }

      const shercockToCnm =
        isShercock(first.from) &&
        isCnm(first.to) &&
        isCnm(second.from) &&
        !isCnm(second.to) &&
        !isShercock(second.to)

      if (shercockToCnm) {
        removedIds.add(first.id)
        removedIds.add(second.id)

        mergedEntries.push({
          ...second,
          from: first.from,
        })

        index += 2
        continue
      }

      const cnmToShercock =
        !isCnm(first.from) &&
        !isShercock(first.from) &&
        isCnm(first.to) &&
        isCnm(second.from) &&
        isShercock(second.to)

      if (cnmToShercock) {
        removedIds.add(first.id)
        removedIds.add(second.id)

        mergedEntries.push({
          ...first,
          to: second.to,
        })

        index += 2
        continue
      }

      index += 1
    }
  }

  return [
    ...allEntries.filter((entry) => !removedIds.has(entry.id)),
    ...mergedEntries,
  ].sort(compareEntries)
}

function writeDaveWorkbook(
  entries: DaveEntry[],
  driverName: string,
  monday: Date,
  sunday: Date
) {
  const rows: Array<Record<string, string>> = []

  entries.forEach((entry, index) => {
    const previousEntry = entries[index - 1]

    if (previousEntry && previousEntry.date !== entry.date) {
      rows.push({
        Day: "",
        Date: "",
        Trailer: "",
        From: "",
        To: "",
        "Loaded/Empty/Solo": "",
        Reference: "",
        Driver: "",
        Reg: "",
      })
    }

    rows.push({
      Day: formatDayName(entry.date),
      Date: formatExcelDate(entry.date),
      Trailer: entry.trailer,
      From: entry.from,
      To: entry.to,
      "Loaded/Empty/Solo": entry.status,
      Reference: "",
      Driver: driverName,
      Reg: entry.regNumber,
    })
  })

  const worksheet = XLSX.utils.json_to_sheet(rows)
  const range = XLSX.utils.decode_range(worksheet["!ref"]!)

  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const cell = XLSX.utils.encode_cell({ r: row, c: column })
      if (!worksheet[cell]) continue

      worksheet[cell].s = {
        font: {
          name: "Arial",
          sz: 18,
        },
        alignment: {
          horizontal: column === 5 ? "center" : "left",
          vertical: "center",
        },
      }
    }
  }

  worksheet["!cols"] = [
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "Entries")

  const exportYear = entries[0]?.date?.split(".")[0] ?? String(monday.getFullYear())
  const fileName = `${formatWeekTitle(monday, sunday)}   ${exportYear} ${driverName} Dave.xlsx`

  XLSX.writeFile(workbook, fileName)
}

export default function DriverApp(props: DriverAppProps) {
  const { driverId, driverName, isBoss = false } = props
  const rootRef = useRef<HTMLDivElement | null>(null)
  const allowOriginalExportRef = useRef(false)
  const [showExportChoices, setShowExportChoices] = useState(false)
  const [exportingDave, setExportingDave] = useState(false)

  const handleClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isBoss || allowOriginalExportRef.current) return

    const target = event.target as HTMLElement
    const button = target.closest("button")
    if (!button) return

    const label = button.textContent?.replace(/\s+/g, " ").trim() ?? ""
    if (label !== "📊 Export to Excel" && label !== "Export to Excel") return

    event.preventDefault()
    event.stopPropagation()
    setShowExportChoices(true)
  }

  const exportOriginal = () => {
    const buttons = Array.from(rootRef.current?.querySelectorAll("button") ?? [])
    const exportButton = buttons.find((button) => {
      const label = button.textContent?.replace(/\s+/g, " ").trim() ?? ""
      return label === "📊 Export to Excel" || label === "Export to Excel"
    })

    if (!exportButton) {
      alert("Original Excel export button not found")
      return
    }

    allowOriginalExportRef.current = true
    exportButton.click()
    allowOriginalExportRef.current = false
    setShowExportChoices(false)
  }

  const exportToDave = async () => {
    if (!navigator.onLine) {
      alert("Internet is required for Excel to Dave")
      return
    }

    setExportingDave(true)

    try {
      const monday = getWeekStart(new Date())
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)

      const weekStart = formatEntryDate(monday)
      const weekEnd = formatEntryDate(sunday)

      const { data, error } = await supabase
        .from("entries")
        .select(
          "id, driver_id, entry_date, trailer, from_place, to_place, status, note, reg_number"
        )
        .gte("entry_date", weekStart)
        .lte("entry_date", weekEnd)
        .order("entry_date", { ascending: true })
        .order("id", { ascending: true })

      if (error) throw error

      const allEntries: DaveEntry[] = (data ?? []).map((entry) => ({
        id: entry.id,
        driverId: entry.driver_id,
        date: entry.entry_date,
        trailer: entry.trailer ?? "",
        from: entry.from_place ?? "",
        to: entry.to_place ?? "",
        status: entry.status ?? "",
        note: entry.note ?? "",
        regNumber: entry.reg_number ?? "",
      }))

      const daveEntries = buildDaveEntries(allEntries).filter(
        (entry) => entry.driverId === driverId
      )

      if (daveEntries.length === 0) {
        alert("No entries to export for this driver")
        return
      }

      writeDaveWorkbook(daveEntries, driverName, monday, sunday)
      setShowExportChoices(false)
    } catch (error) {
      console.log("DAVE EXCEL EXPORT ERROR:", error)
      alert("Excel to Dave export failed")
    } finally {
      setExportingDave(false)
    }
  }

  return (
    <>
      <div
        ref={rootRef}
        onClickCapture={handleClickCapture}
        className="contents"
      >
        <DriverAppOriginal {...props} />
      </div>

      {showExportChoices && (
        <div
          onClick={() => {
            if (!exportingDave) setShowExportChoices(false)
          }}
          className="fixed inset-0 z-[120] bg-black/20 flex items-center justify-center px-4"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-[330px] bg-white/95 backdrop-blur-xl rounded-[28px] overflow-hidden shadow-xl p-3"
          >
            <p className="text-center text-[20px] font-bold text-black py-3">
              Export to Excel
            </p>

            <button
              onClick={exportOriginal}
              disabled={exportingDave}
              className="w-full h-[52px] rounded-[18px] bg-[#f1f1f3] text-black text-[17px] font-semibold mb-2 active:scale-[0.98] disabled:opacity-50"
            >
              Excel Original
            </button>

            <button
              onClick={() => void exportToDave()}
              disabled={exportingDave}
              className="w-full h-[52px] rounded-[18px] bg-blue-500 text-white text-[17px] font-bold active:scale-[0.98] disabled:opacity-50"
            >
              {exportingDave ? "Preparing..." : "Excel to Dave"}
            </button>

            <button
              onClick={() => setShowExportChoices(false)}
              disabled={exportingDave}
              className="w-full h-[46px] mt-1 text-zinc-500 text-[16px] font-semibold disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  )
}
