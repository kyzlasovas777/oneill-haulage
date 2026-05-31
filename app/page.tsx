"use client"

import { useState } from "react"
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
      onBack={openedFromBoss ? () => setScreen("admin") : undefined}
    />
  )
}