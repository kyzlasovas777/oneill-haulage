"use client"

import { useEffect, useState } from "react"
import DriverApp from "./components/DriverApp"
import LoginScreen, { type DriverIdentity } from "./components/LoginScreen"
import BossDashboard from "./components/BossDashboard"
import { supabase } from "./components/supabase"

type AppIdentity = {
  role: "boss" | "driver"
  driver_id: number | null
  driver_name: string | null
  truck_reg: string | null
  active: boolean
}

export default function Home() {
  const [screen, setScreen] = useState<"login" | "driver" | "admin">("login")
  const [activeDriver, setActiveDriver] = useState<DriverIdentity | null>(null)
  const [openedFromBoss, setOpenedFromBoss] = useState(false)
  const [restoring, setRestoring] = useState(true)

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const restoreSession = async () => {
      const savedDriverRaw = localStorage.getItem("lastDriver")

      if (!navigator.onLine) {
        if (savedDriverRaw) {
          try {
            const savedDriver = JSON.parse(savedDriverRaw) as DriverIdentity
            if (!cancelled) {
              setActiveDriver(savedDriver)
              setOpenedFromBoss(false)
              setScreen("driver")
            }
          } catch {
            localStorage.removeItem("lastDriver")
          }
        }

        if (!cancelled) setRestoring(false)
        return
      }

      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        localStorage.removeItem("lastDriver")
        if (!cancelled) setRestoring(false)
        return
      }

      const { data: identity, error } = await supabase
        .rpc("current_app_identity")
        .maybeSingle<AppIdentity>()

      if (error || !identity?.active) {
        await supabase.auth.signOut()
        localStorage.removeItem("lastDriver")
        if (!cancelled) setRestoring(false)
        return
      }

      if (!cancelled && identity.role === "boss") {
        setActiveDriver(null)
        setOpenedFromBoss(false)
        setScreen("admin")
        setRestoring(false)
        return
      }

      if (!cancelled && identity.driver_id && identity.driver_name) {
        const driver: DriverIdentity = {
          id: identity.driver_id,
          name: identity.driver_name,
          truckReg: identity.truck_reg ?? "",
          active: identity.active,
        }
        localStorage.setItem("lastDriver", JSON.stringify(driver))
        setActiveDriver(driver)
        setOpenedFromBoss(false)
        setScreen("driver")
      }

      if (!cancelled) setRestoring(false)
    }

    void restoreSession()
    return () => {
      cancelled = true
    }
  }, [])

  const logout = async () => {
    await supabase.auth.signOut()
    localStorage.removeItem("lastDriver")
    setActiveDriver(null)
    setOpenedFromBoss(false)
    setScreen("login")
  }

  if (restoring) {
    return (
      <main className="min-h-screen bg-white" aria-hidden="true" />
    )
  }

  if (screen === "login") {
    return (
      <LoginScreen
        onDriverLogin={(driver) => {
          localStorage.setItem("lastDriver", JSON.stringify(driver))
          setActiveDriver(driver)
          setOpenedFromBoss(false)
          setScreen("driver")
        }}
        onAdminLogin={() => {
          localStorage.removeItem("lastDriver")
          setActiveDriver(null)
          setOpenedFromBoss(false)
          setScreen("admin")
        }}
      />
    )
  }

  if (screen === "admin") {
    return (
      <BossDashboard
        onLogout={() => void logout()}
        onOpenDriver={(driver) => {
          setActiveDriver(driver)
          setOpenedFromBoss(true)
          setScreen("driver")
        }}
      />
    )
  }

  return (
    <DriverApp
      driverId={activeDriver?.id ?? 0}
      driverName={activeDriver?.name ?? ""}
      isBoss={openedFromBoss}
      onBack={() => {
        if (openedFromBoss) {
          setScreen("admin")
        } else {
          void logout()
        }
      }}
    />
  )
}
