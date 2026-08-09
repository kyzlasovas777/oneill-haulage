"use client"

import { useEffect, useState } from "react"
import DriverApp from "./components/DriverApp"
import LoginScreen from "./components/LoginScreen"
import BossDashboard from "./components/BossDashboard"

type Driver = {
  id: number
  name: string
  pin: string
}

export default function Home() {
  const [screen, setScreen] = useState<"login" | "driver" | "admin">("login")
  const [activeDriver, setActiveDriver] = useState<Driver | null>(null)
  const [openedFromBoss, setOpenedFromBoss] = useState(false)

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => console.log("SW registered"))
        .catch((err) => console.log("SW error", err))
    }
  }, [])

  useEffect(() => {
    const savedDriverRaw = localStorage.getItem("lastDriver")

    if (!savedDriverRaw) return

    try {
      const savedDriver = JSON.parse(savedDriverRaw) as Driver
      setActiveDriver(savedDriver)
      setOpenedFromBoss(false)
      setScreen("driver")
    } catch {
      localStorage.removeItem("lastDriver")
    }
  }, [])

  const logout = () => {
    localStorage.removeItem("lastDriver")
    setActiveDriver(null)
    setOpenedFromBoss(false)
    setScreen("login")
  }

  if (screen === "login") {
    return (
      <>
      <div className="fixed top-1 right-2 z-[200] rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white shadow">
        TEST
      </div>
      <LoginScreen
        onDriverLogin={(driver) => {
          localStorage.setItem("lastDriver", JSON.stringify(driver))
          setActiveDriver(driver)
          setOpenedFromBoss(false)
          setScreen("driver")
        }}
        onAdminLogin={() => {
          setActiveDriver(null)
          setOpenedFromBoss(false)
          setScreen("admin")
        }}
      />
      </>
    )
  }

  if (screen === "admin") {
    return (
      <>
      <div className="fixed top-1 right-2 z-[200] rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white shadow">
        TEST
      </div>
      <BossDashboard
        onLogout={logout}
        onOpenDriver={(driver) => {
          setActiveDriver(driver)
          setOpenedFromBoss(true)
          setScreen("driver")
        }}
      />
      </>
    )
  }

  return (
    <>
    <div className="fixed top-1 right-2 z-[200] rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white shadow">
      TEST
    </div>
    <DriverApp
      driverId={activeDriver?.id ?? 0}
      driverName={activeDriver?.name ?? ""}
      isBoss={openedFromBoss}
      onBack={() => {
        if (openedFromBoss) {
          setScreen("admin")
        } else {
          logout()
        }
      }}
    />
    </>
  )
}
