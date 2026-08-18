"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "./supabase"

type DailyCheckDefect = {
  questionId: string
  question: string
  description: string
  safeToDrive: boolean
}

type UnseenDailyCheck = {
  id: number
  driver_id: number
  entry_date: string
  checked_at: string
  reg_number: string
  status: "no_defects" | "defect_reported"
  safe_to_drive: boolean
  defects: DailyCheckDefect[]
  boss_seen_at: string | null
}

type DailyCheckAlertButtonProps = {
  driverId: number
  driverName: string
}

function parseEntryDate(dateText: string) {
  const [year, month, day] = dateText.split(".").map(Number)
  return new Date(year, month - 1, day)
}

function displayDate(dateText: string) {
  return parseEntryDate(dateText).toLocaleDateString("en-GB", {
    weekday: "short",
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

export default function DailyCheckAlertButton({
  driverId,
  driverName,
}: DailyCheckAlertButtonProps) {
  const [checks, setChecks] = useState<UnseenDailyCheck[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState<number | null>(null)

  const loadUnseenChecks = useCallback(async () => {
    if (!navigator.onLine) return

    const { data, error } = await supabase
      .from("daily_checks")
      .select(
        "id, driver_id, entry_date, checked_at, reg_number, status, safe_to_drive, defects, boss_seen_at"
      )
      .eq("driver_id", driverId)
      .is("boss_seen_at", null)
      .order("checked_at", { ascending: false })

    if (error) {
      console.log("DAILY CHECK ALERT LOAD ERROR:", error)
      return
    }

    setChecks(
      (data ?? []).map((entry) => ({
        ...entry,
        defects: entry.defects ?? [],
      })) as UnseenDailyCheck[]
    )
  }, [driverId])

  useEffect(() => {
    const initialId = window.setTimeout(() => void loadUnseenChecks(), 0)
    const intervalId = window.setInterval(() => void loadUnseenChecks(), 15000)

    const handleOnline = () => {
      void loadUnseenChecks()
    }

    window.addEventListener("online", handleOnline)

    return () => {
      window.clearTimeout(initialId)
      window.clearInterval(intervalId)
      window.removeEventListener("online", handleOnline)
    }
  }, [loadUnseenChecks])

  const markSeen = async (checkId: number) => {
    if (savingId !== null) return
    if (!navigator.onLine) {
      alert("Internet is required to mark a Daily Check as seen")
      return
    }

    setSavingId(checkId)
    const { error } = await supabase
      .from("daily_checks")
      .update({ boss_seen_at: new Date().toISOString() })
      .eq("id", checkId)

    setSavingId(null)

    if (error) {
      console.log("DAILY CHECK MARK SEEN ERROR:", error)
      alert("Could not mark Daily Check as seen")
      return
    }

    setChecks((current) => {
      const next = current.filter((check) => check.id !== checkId)
      if (next.length === 0) setOpen(false)
      return next
    })
  }

  if (checks.length === 0) return null

  return (
    <>
      <button
        onClick={(event) => {
          event.stopPropagation()
          setLoading(true)
          setOpen(true)
          void loadUnseenChecks().finally(() => setLoading(false))
        }}
        className="inline-flex h-[24px] items-center justify-center gap-1 px-0.5 text-red-600 active:scale-95"
        aria-label={`${checks.length} unseen Daily Check${checks.length === 1 ? "" : "s"} for ${driverName}`}
      >
        <span className="inline-flex h-[22px] w-[24px] items-center justify-center" aria-hidden="true">
          <svg
            viewBox="0 0 24 22"
            className="h-[22px] w-[24px]"
            fill="none"
          >
            <path
              d="M12 1.5L22.2 19.5H1.8L12 1.5Z"
              fill="white"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="M12 7V13"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <circle cx="12" cy="16.4" r="1.05" fill="currentColor" />
          </svg>
        </span>
        <span className="text-[13px] font-bold leading-none text-red-600">
          {checks.length > 99 ? "99+" : checks.length}
        </span>
      </button>

      {open && (
        <div
          onClick={(event) => {
            event.stopPropagation()
            setOpen(false)
          }}
          className="fixed inset-0 z-[130] bg-black/45 flex items-center justify-center p-3"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-[430px] max-h-[92dvh] overflow-y-auto rounded-[24px] bg-white p-4 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="w-[34px]" />
              <div className="flex-1 text-center">
                <h2 className="text-[22px] font-bold text-black">Daily Checks</h2>
                <p className="text-[15px] font-semibold text-zinc-600">{driverName}</p>
                <p className="text-[13px] text-red-600">
                  {checks.length} new check{checks.length === 1 ? "" : "s"}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-[34px] text-[28px] text-zinc-500 leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {loading && (
              <p className="mt-6 text-center text-zinc-400">Refreshing...</p>
            )}

            <div className="mt-4 space-y-3">
              {checks.map((check) => (
                <div
                  key={check.id}
                  className={`rounded-[18px] border p-3 ${
                    check.status === "defect_reported"
                      ? "border-red-400 bg-red-50"
                      : "border-green-400 bg-[#f7f7f7]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[15px] font-bold text-black">
                        {displayDate(check.entry_date)} · {displayTime(check.checked_at)}
                      </div>
                      <div className="text-[13px] text-zinc-500">Check #{check.id}</div>
                    </div>
                    <div className="text-[16px] font-extrabold text-black">
                      {check.reg_number}
                    </div>
                  </div>

                  <div className="mt-2 font-bold">
                    {check.status === "no_defects" ? (
                      <span className="text-green-600">✓ No defects</span>
                    ) : (
                      <span className="text-red-600">
                        ! {check.defects.length} defect{check.defects.length === 1 ? "" : "s"}
                      </span>
                    )}
                    {!check.safe_to_drive && (
                      <span className="ml-2 text-[12px] text-red-700">UNSAFE TO DRIVE</span>
                    )}
                  </div>

                  {check.defects.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {check.defects.map((defect, index) => (
                        <div
                          key={`${check.id}-${defect.questionId}-${index}`}
                          className="rounded-[14px] border border-red-200 bg-white p-2"
                        >
                          <div className="text-[13px] font-semibold text-black">
                            {defect.question || `Defect ${index + 1}`}
                          </div>
                          <div className="mt-1 text-[13px] text-zinc-700">
                            {defect.description}
                          </div>
                          <div
                            className={`mt-1 text-[11px] font-bold ${
                              defect.safeToDrive ? "text-amber-600" : "text-red-600"
                            }`}
                          >
                            {defect.safeToDrive ? "Safe to drive" : "Unsafe to drive"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => void markSeen(check.id)}
                    disabled={savingId !== null}
                    className="mt-3 h-[44px] w-full rounded-[15px] bg-blue-600 text-[15px] font-bold text-white disabled:opacity-50"
                  >
                    {savingId === check.id ? "SAVING..." : "✓ MARK AS SEEN"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
