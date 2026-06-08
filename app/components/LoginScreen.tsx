"use client"

import { useState } from "react"
import { supabase } from "./supabase"

type Driver = {
  id: number
  name: string
  pin: string
  active?: boolean
}

type LoginScreenProps = {
  onDriverLogin: (driver: Driver) => void
  onAdminLogin: () => void
}

export default function LoginScreen({
  onDriverLogin,
  onAdminLogin,
}: LoginScreenProps) {
  const [pin, setPin] = useState("")
  const [debug, setDebug] = useState("Waiting...")

const login = async () => {
  const cleanPin = pin.trim()
  setDebug("Checking...")

  if (!cleanPin) {
    setDebug("Enter PIN")
    return
  }

  if (cleanPin === "9999") {
    setDebug("Boss login OK")
    onAdminLogin()
    return
  }

  const savedDriversRaw = localStorage.getItem("oneill-drivers")
  const savedDrivers: Driver[] = savedDriversRaw ? JSON.parse(savedDriversRaw) : []

  const savedDriver = savedDrivers.find(
    (driver) => driver.pin === cleanPin && driver.active !== false
  )

  if (savedDriver) {
    localStorage.setItem("lastDriver", JSON.stringify(savedDriver))

    if (!navigator.onLine) {
      setDebug("Offline driver login OK")
    } else {
      setDebug("Driver login OK")
    }

    onDriverLogin(savedDriver)
    return
  }

  if (!navigator.onLine) {
    setDebug("No internet. Driver not saved on this device.")
    return
  }

  const { data, error } = await supabase
    .from("drivers")
    .select("id, name, pin, active")
    .eq("pin", cleanPin)
    .eq("active", true)
    .maybeSingle()

  if (error) {
    setDebug("Supabase error: " + error.message)
    return
  }

  if (!data) {
    setDebug("Invalid PIN or driver disabled")
    return
  }

  localStorage.setItem("lastDriver", JSON.stringify(data))

  setDebug("Driver login OK")
  onDriverLogin(data)
}

  return (
 <main className="min-h-screen bg-white flex flex-col items-center pt-[120px]">
     
     <img
  src="/icon-512.png"
  alt="O'Neill Haulage"
  className="w-[320px] mb-4"
/>
     
      <h1 className="text-[38px] font-black text-black mb-8">
      
      </h1>

      <input
        value={pin}
        onChange={(e) => {
          const value = e.target.value.replace(/\D/g, "").slice(0, 4)
          setPin(value)
        }}
        inputMode="numeric"
        placeholder="Driver PIN"
        className="w-full max-w-[330px] h-[58px] border-2 border-green-600 rounded-[6px] px-5 text-[24px] outline-none mb-6"
      />

      <button
        type="button"
        onClick={login}
      className="h-[58px] px-10 rounded-[8px] bg-green-600 text-white text-[24px]"
      >
        Sign In
      </button>

 {debug !== "Waiting..." && debug && (
  <p className="mt-8 text-center text-[18px] text-zinc-500">
    {debug}
  </p>
)}
    </main>
  )
}