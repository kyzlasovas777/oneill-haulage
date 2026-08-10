import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  })
}

async function fingerprintRequest(req: Request) {
  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  // The gateway supplies the real client IP. Do not include User-Agent here:
  // callers can change it freely and otherwise bypass the failed-PIN limit.
  const source = forwardedFor ?? "unknown"
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  try {
    const { pin } = await req.json()
    if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
      return json({ error: "Invalid PIN or temporarily blocked" }, 401)
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Login service unavailable" }, 503)

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: matches, error: lookupError } = await admin.rpc("pin_login_lookup", {
      p_pin: pin,
      p_fingerprint: await fingerprintRequest(req),
    })
    if (lookupError) return json({ error: "Login service unavailable" }, 503)

    const account = matches?.[0]
    if (!account) return json({ error: "Invalid PIN or temporarily blocked" }, 401)

    let authUserId = account.auth_user_id as string | null
    if (!authUserId) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: account.auth_email,
        email_confirm: true,
        // Supabase Auth hashes passwords with bcrypt, which accepts at most 72 bytes.
        // A UUID is random, unguessable in practice, and safely below that limit.
        password: crypto.randomUUID(),
      })
      if (createError || !created.user) return json({ error: "Login service unavailable" }, 503)

      authUserId = created.user.id
      const { data: linked, error: linkError } = await admin.rpc("pin_login_link_auth", {
        p_account_id: account.account_id,
        p_auth_user_id: authUserId,
      })
      if (linkError || linked !== true) {
        await admin.auth.admin.deleteUser(authUserId)
        return json({ error: "Login service unavailable" }, 503)
      }
    }

    const { data: linkData, error: generateError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: account.auth_email,
    })
    const tokenHash = linkData?.properties?.hashed_token
    if (generateError || !tokenHash) return json({ error: "Login service unavailable" }, 503)

    return json({ token_hash: tokenHash, type: "email" })
  } catch {
    return json({ error: "Login service unavailable" }, 500)
  }
})
