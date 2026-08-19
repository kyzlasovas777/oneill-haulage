"use client"

import { useState } from "react"
import { supabase } from "./supabase"

export type DriverIdentity = {
  id: number
  name: string
  truckReg?: string
  active?: boolean
}

type LoginScreenProps = {
  onDriverLogin: (driver: DriverIdentity) => void
  onAdminLogin: () => void
}

type PinLoginResponse = {
  token_hash?: string
  type?: "email"
  error?: string
}

type AppIdentity = {
  role: "boss" | "driver"
  driver_id: number | null
  driver_name: string | null
  truck_reg: string | null
  active: boolean
}

export default function LoginScreen({
  onDriverLogin,
  onAdminLogin,
}: LoginScreenProps) {
  const [pin, setPin] = useState("")
  const [debug, setDebug] = useState("Waiting...")
  const checking = debug === "Checking..."

  const login = async () => {
    const cleanPin = pin.trim()

    if (!/^\d{4}$/.test(cleanPin)) {
      setDebug("Enter 4 digit PIN")
      return
    }

    if (!navigator.onLine) {
      setDebug("No internet. Login once online first.")
      return
    }

    setDebug("Checking...")

    try {
      const { data, error } = await supabase.functions.invoke<PinLoginResponse>(
        "pin-login",
        { body: { pin: cleanPin } }
      )

      if (error || !data?.token_hash) {
        setDebug(data?.error ?? "Invalid PIN or temporarily blocked")
        return
      }

      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: "email",
      })

      if (verifyError) {
        setDebug("Login service unavailable")
        return
      }

      const { data: identity, error: identityError } = await supabase
        .rpc("current_app_identity")
        .maybeSingle<AppIdentity>()

      if (identityError || !identity?.active) {
        await supabase.auth.signOut()
        setDebug("Invalid PIN or driver disabled")
        return
      }

      setPin("")

      if (identity.role === "boss") {
        setDebug("Boss login OK")
        onAdminLogin()
        return
      }

      if (!identity.driver_id || !identity.driver_name) {
        await supabase.auth.signOut()
        setDebug("Login service unavailable")
        return
      }

      const driver: DriverIdentity = {
        id: identity.driver_id,
        name: identity.driver_name,
        truckReg: identity.truck_reg ?? "",
        active: identity.active,
      }

      localStorage.setItem("lastDriver", JSON.stringify(driver))
      setDebug("Driver login OK")
      onDriverLogin(driver)
    } catch {
      setDebug("Login service unavailable")
    }
  }

  return (
    <main className="min-h-screen bg-white flex flex-col items-center pt-[120px]">
      <img
        src="/icon-512.png"
        alt="O'Neill Haulage"
        className="w-[320px] mb-4"
      />

      <h1 className="text-[38px] font-black text-black mb-8"></h1>

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
        disabled={checking}
        className="h-[58px] px-10 rounded-[8px] bg-green-600 text-white text-[24px] disabled:opacity-70"
      >
        Sign In
      </button>

      {checking ? (
        <div className="mt-8 flex items-center justify-center gap-2 text-[18px] text-zinc-500">
          <span
            className="w-[20px] h-[20px] rounded-full border-2 border-zinc-300 border-t-green-600 animate-spin"
            aria-hidden="true"
          />
          <span>Checking</span>
        </div>
      ) : (
        debug !== "Waiting..." &&
        debug && (
          <p className="mt-8 text-center text-[18px] text-zinc-500">{debug}</p>
        )
      )}
    </main>
  )
}
