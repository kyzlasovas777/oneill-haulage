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

    setDebug("Driver login OK")
    onDriverLogin(data)
  }

  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <h1 className="text-[38px] font-black text-black mb-8">
        O&apos;Neill Haulage
      </h1>

      <input
        value={pin}
        onChange={(e) => {
          const value = e.target.value.replace(/\D/g, "").slice(0, 4)
          setPin(value)
        }}
        inputMode="numeric"
        placeholder="Driver PIN"
        className="w-full max-w-[330px] h-[58px] border border-black rounded-[6px] px-5 text-[24px] outline-none mb-6"
      />

      <button
        type="button"
        onClick={login}
        className="h-[58px] px-10 rounded-[8px] bg-blue-500 text-white text-[24px]"
      >
        Sign In
      </button>

      <div className="mt-8 w-full max-w-[330px] rounded-[8px] border border-black p-4 text-[18px] text-black">
        {debug}
      </div>
    </main>
  )
}