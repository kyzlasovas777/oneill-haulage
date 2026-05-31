"use client"

import { useState } from "react"
import DriverApp from "./components/DriverApp"
import LoginScreen from "./components/LoginScreen"
import BossDashboard from "./components/BossDashboard"
import { useEffect } from "react"

type Driver = {
  id: number
  name: string
  pin: string
}

export default function Home() {

useEffect(() => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => console.log("SW registered"))
      .catch((err) => console.log("SW error", err))
  }
}, [])

  const [screen, setScreen] = useState<"login" | "driver" | "admin">("login")
  const [activeDriver, setActiveDriver] = useState<Driver | null>(null)
  const [openedFromBoss, setOpenedFromBoss] = useState(false)

  if (screen === "login") {
    return (
      <LoginScreen
        onDriverLogin={(driver) => {
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
    )
  }

  if (screen === "admin") {
    return (
      <BossDashboard
        onLogout={() => {
          setActiveDriver(null)
          setOpenedFromBoss(false)
          setScreen("login")
        }}
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
      onBack={() => {
  if (openedFromBoss) {
    setScreen("admin")
  } else {
    setActiveDriver(null)
    setOpenedFromBoss(false)
    setScreen("login")
  }
}}
    />
  )
}