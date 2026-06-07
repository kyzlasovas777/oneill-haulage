import { useEffect, useRef, useState } from "react"
import { supabase } from "./supabase"

type DieselPageProps = {
  driverId: number
  onBack: () => void
}

type DieselEntry = {
  id: number
  driver_id: number
  entry_date: string
  mileage: number | null
  litres: number | null
  photo_url?: string | null
  photo_path?: string | null
  created_at?: string
}

function formatEntryDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}.${month}.${day}`
}

function displayDate(dateText: string) {
  const [year, month, day] = dateText.split(".").map(Number)
  const date = new Date(year, month - 1, day)

  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

export default function DieselPage({ driverId, onBack }: DieselPageProps) {
  const [entries, setEntries] = useState<DieselEntry[]>([])
  const [mileage, setMileage] = useState("")
  const [litres, setLitres] = useState("")
  const [saving, setSaving] = useState(false)

  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState("")
  const [openPhoto, setOpenPhoto] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement | null>(null)

  const [editingEntry, setEditingEntry] = useState<DieselEntry | null>(null)
  const [editMileage, setEditMileage] = useState("")
  const [editLitres, setEditLitres] = useState("")
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null)
  const [editPhotoPreview, setEditPhotoPreview] = useState("")
  const editPhotoInputRef = useRef<HTMLInputElement | null>(null)
  const [editingSaving, setEditingSaving] = useState(false)

  const today = formatEntryDate(new Date())

  const loadDieselEntries = async () => {
    const { data, error } = await supabase
      .from("diesel_entries")
      .select("*")
      .eq("driver_id", driverId)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })

    if (error) {
      console.log("DIESEL LOAD ERROR:", error)
      return
    }

    setEntries(data ?? [])
  }

  useEffect(() => {
    loadDieselEntries()
  }, [driverId])

  const choosePhoto = (file: File | undefined) => {
    if (!file) return
    if (photoPreview) URL.revokeObjectURL(photoPreview)

    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const chooseEditPhoto = (file: File | undefined) => {
    if (!file) return
    if (editPhotoPreview) URL.revokeObjectURL(editPhotoPreview)

    setEditPhotoFile(file)
    setEditPhotoPreview(URL.createObjectURL(file))
  }

  const clearPhoto = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoFile(null)
    setPhotoPreview("")
  }

  const clearEditPhoto = () => {
    if (editPhotoPreview) URL.revokeObjectURL(editPhotoPreview)
    setEditPhotoFile(null)
    setEditPhotoPreview("")
  }

  const uploadPhoto = async (file: File | null) => {
    if (!file) {
      return { photo_url: null, photo_path: null }
    }

    const cleanName = file.name.replaceAll(" ", "-")
    const filePath = `diesel/${driverId}/${Date.now()}-${cleanName}`

    const { error } = await supabase.storage
    .from("entry-photos")
      .upload(filePath, file)

    if (error) {
      console.log("DIESEL PHOTO UPLOAD ERROR:", error)
      throw error
    }

    const { data } = supabase.storage
     .from("entry-photos")
      .getPublicUrl(filePath)

    return {
      photo_url: data.publicUrl,
      photo_path: filePath,
    }
  }

  const openEdit = (entry: DieselEntry) => {
    setEditingEntry(entry)
    setEditMileage(entry.mileage === null ? "" : String(entry.mileage))
    setEditLitres(entry.litres === null ? "" : String(entry.litres))
    clearEditPhoto()
  }

  const closeEdit = () => {
    setEditingEntry(null)
    setEditMileage("")
    setEditLitres("")
    clearEditPhoto()
  }

  const saveDiesel = async () => {
    if (saving) return

    if (!mileage && !litres && !photoFile) {
      alert("Enter mileage, litres or add photo")
      return
    }

    const mileageNumber = mileage ? Number(mileage) : null
    const litresNumber = litres ? Number(litres) : null

    if (mileageNumber !== null && mileageNumber <= 0) {
      alert("Mileage must be higher than 0")
      return
    }

    if (litresNumber !== null && litresNumber <= 0) {
      alert("Litres must be higher than 0")
      return
    }

    setSaving(true)

    try {
      const uploadedPhoto = await uploadPhoto(photoFile)

      const { data, error } = await supabase
        .from("diesel_entries")
        .insert({
          driver_id: driverId,
          entry_date: today,
          mileage: mileageNumber,
          litres: litresNumber,
          photo_url: uploadedPhoto.photo_url,
          photo_path: uploadedPhoto.photo_path,
        })
        .select()
        .single()

      if (error) {
        console.log("DIESEL SAVE ERROR:", error)
        alert(JSON.stringify(error))
        setSaving(false)
        return
      }

      if (data) setEntries((prev) => [data, ...prev])

      setMileage("")
      setLitres("")
      clearPhoto()
    } catch (error) {
      console.log("PHOTO SAVE ERROR:", error)
      alert(JSON.stringify(error))
    }

    setSaving(false)
  }

  const saveEditDiesel = async () => {
    if (editingSaving || !editingEntry) return

    if (!editMileage && !editLitres && !editPhotoFile && !editingEntry.photo_url) {
      alert("Enter mileage, litres or add photo")
      return
    }

    const mileageNumber = editMileage ? Number(editMileage) : null
    const litresNumber = editLitres ? Number(editLitres) : null

    if (mileageNumber !== null && mileageNumber <= 0) {
      alert("Mileage must be higher than 0")
      return
    }

    if (litresNumber !== null && litresNumber <= 0) {
      alert("Litres must be higher than 0")
      return
    }

    setEditingSaving(true)

    try {
      const uploadedPhoto = editPhotoFile
        ? await uploadPhoto(editPhotoFile)
        : {
            photo_url: editingEntry.photo_url ?? null,
            photo_path: editingEntry.photo_path ?? null,
          }

      const { data, error } = await supabase
        .from("diesel_entries")
        .update({
          mileage: mileageNumber,
          litres: litresNumber,
          photo_url: uploadedPhoto.photo_url,
          photo_path: uploadedPhoto.photo_path,
        })
        .eq("id", editingEntry.id)
        .select()
        .single()

      if (error) {
        console.log("DIESEL EDIT ERROR:", error)
        alert(JSON.stringify(error))
        setEditingSaving(false)
        return
      }

      if (data) {
        setEntries((prev) =>
          prev.map((entry) => (entry.id === data.id ? data : entry))
        )
      }

      closeEdit()
    } catch (error) {
      console.log("PHOTO EDIT ERROR:", error)
      alert(JSON.stringify(error))
    }

    setEditingSaving(false)
  }

  const weekLitres = entries.reduce(
    (sum, entry) => sum + (entry.litres ?? 0),
    0
  )

  return (
    <div className="fixed inset-0 z-[80] bg-[#efeff4] p-3 overflow-y-auto pb-[180px]">
    <div className="flex items-center mb-3">
  <button
    onClick={onBack}
    className="h-[42px] px-4 rounded-[14px] bg-white font-bold text-[15px]"
  >
    Back
  </button>

  <h1 className="flex-1 text-center text-[24px] font-bold">
    Diesel
  </h1>

  <button className="h-[42px] px-4 rounded-[14px] bg-white font-bold text-[15px]">
    Archive
  </button>
</div>
        

  <div className="bg-white rounded-[18px] p-2 mb-3">
        <div className="text-center text-[15px] font-bold">This week</div>

      <div className="text-center text-[28px] font-bold">
          {weekLitres.toFixed(2)} L
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {entries.map((entry) => (
          <button
            key={entry.id}
            onClick={() => openEdit(entry)}
            className="w-full text-left bg-white rounded-[18px] p-4 shadow-sm"
          >
      <div className="flex items-center justify-between gap-3">
  <div>
    <div className="font-bold text-[16px]">
      {displayDate(entry.entry_date)}
    </div>

    <div className="mt-2 text-[14px]">
      Mileage: <b>{entry.mileage ?? "-"}</b>
    </div>

    <div className="text-[14px]">
      Litres:{" "}
      <b>
        {entry.litres === null
          ? "-"
          : `${Number(entry.litres).toFixed(2)} L`}
      </b>
    </div>
  </div>

  {entry.photo_url && (
    <img
      src={entry.photo_url}
      alt="Diesel receipt"
      onClick={(e) => {
        e.stopPropagation()
        setOpenPhoto(entry.photo_url ?? null)
      }}
      className="h-[58px] w-[58px] rounded-[10px] object-cover shrink-0"
    />
  )}
</div>
          </button>
        ))}
      </div>

      <div className="fixed left-0 right-0 bottom-0 z-[90] bg-[#efeff4]/95 backdrop-blur p-3">
        <div className="bg-white rounded-[18px] p-3 shadow-lg space-y-2">
          <input
            type="number"
            placeholder="Mileage"
            value={mileage}
            onChange={(e) => setMileage(e.target.value)}
            className="w-full h-[44px] rounded-[12px] border px-4 text-[16px]"
          />

          <input
            type="number"
            placeholder="Litres"
            value={litres}
            onChange={(e) => setLitres(e.target.value)}
            className="w-full h-[44px] rounded-[12px] border px-4 text-[16px]"
          />

          <button
            onClick={() => photoInputRef.current?.click()}
            className="w-full h-[42px] rounded-[12px] bg-zinc-200 font-bold text-[15px]"
          >
            📷 Add Photo
          </button>

          {photoPreview && (
            <div className="flex items-center gap-3">
              <img
                src={photoPreview}
                alt="Preview"
                className="h-[58px] w-[58px] rounded-[10px] object-cover"
              />

              <button
                onClick={clearPhoto}
                className="h-[38px] px-4 rounded-[12px] bg-red-100 text-red-700 font-bold"
              >
                Remove
              </button>
            </div>
          )}

          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => choosePhoto(e.target.files?.[0])}
          />

          <button
            onClick={saveDiesel}
            className="w-full h-[46px] rounded-[14px] bg-blue-600 text-white font-bold text-[17px]"
          >
            {saving ? "Saving..." : "Save Diesel"}
          </button>
        </div>
      </div>

      {editingEntry && (
        <div
          onClick={closeEdit}
          className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[360px] bg-white rounded-[22px] p-4"
          >
            <h2 className="text-[22px] font-bold mb-3">Edit Diesel</h2>

            <div className="text-[14px] font-bold mb-3 text-zinc-500">
              {displayDate(editingEntry.entry_date)}
            </div>

            <div className="space-y-3">
              <input
                type="number"
                placeholder="Mileage"
                value={editMileage}
                onChange={(e) => setEditMileage(e.target.value)}
                className="w-full h-[46px] rounded-[12px] border px-4 text-[16px]"
              />

              <input
                type="number"
                placeholder="Litres"
                value={editLitres}
                onChange={(e) => setEditLitres(e.target.value)}
                className="w-full h-[46px] rounded-[12px] border px-4 text-[16px]"
              />

              <button
                onClick={() => editPhotoInputRef.current?.click()}
                className="w-full h-[42px] rounded-[12px] bg-zinc-200 font-bold text-[15px]"
              >
                📷 Add / Change Photo
              </button>

              {(editPhotoPreview || editingEntry.photo_url) && (
                <div className="flex items-center gap-3">
                  <img
                    src={editPhotoPreview || editingEntry.photo_url || ""}
                    alt="Diesel receipt"
                    onClick={() =>
                      setOpenPhoto(editPhotoPreview || editingEntry.photo_url || null)
                    }
                    className="h-[90px] w-[90px] rounded-[12px] object-cover"
                  />

                  {editPhotoPreview && (
                    <button
                      onClick={clearEditPhoto}
                      className="h-[38px] px-4 rounded-[12px] bg-red-100 text-red-700 font-bold"
                    >
                      Remove
                    </button>
                  )}
                </div>
              )}

              <input
                ref={editPhotoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => chooseEditPhoto(e.target.files?.[0])}
              />

              <div className="flex gap-2 pt-1">
                <button
                  onClick={closeEdit}
                  className="flex-1 h-[46px] rounded-[14px] bg-zinc-200 font-bold"
                >
                  Cancel
                </button>

                <button
                  onClick={saveEditDiesel}
                  className="flex-1 h-[46px] rounded-[14px] bg-blue-600 text-white font-bold"
                >
                  {editingSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {openPhoto && (
        <div
          onClick={() => setOpenPhoto(null)}
          className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4"
        >
          <img
            src={openPhoto}
            alt="Diesel receipt"
            className="max-h-full max-w-full rounded-[16px]"
          />
        </div>
      )}
    </div>
  )
}