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

type DieselPhoto = {
  id: number
  diesel_entry_id: number
  driver_id: number
  photo_url: string
  photo_path: string
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
  const [photos, setPhotos] = useState<DieselPhoto[]>([])

  const [mileage, setMileage] = useState("")
  const [litres, setLitres] = useState("")
  const [saving, setSaving] = useState(false)

  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const photoInputRef = useRef<HTMLInputElement | null>(null)

  const [openPhoto, setOpenPhoto] = useState<string | null>(null)

  const [editingEntry, setEditingEntry] = useState<DieselEntry | null>(null)
  const [editMileage, setEditMileage] = useState("")
  const [editLitres, setEditLitres] = useState("")
  const [editPhotoFiles, setEditPhotoFiles] = useState<File[]>([])
  const [editPhotoPreviews, setEditPhotoPreviews] = useState<string[]>([])
  const editPhotoInputRef = useRef<HTMLInputElement | null>(null)
  const [editingSaving, setEditingSaving] = useState(false)

  const today = formatEntryDate(new Date())

  const getEntryPhotos = (entryId: number) => {
    return photos.filter((photo) => photo.diesel_entry_id === entryId)
  }

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

    const { data: photoData, error: photoError } = await supabase
      .from("diesel_photos")
      .select("*")
      .eq("driver_id", driverId)
      .order("created_at", { ascending: false })

    if (photoError) {
      console.log("DIESEL PHOTOS LOAD ERROR:", photoError)
      return
    }

    setPhotos(photoData ?? [])
  }

  useEffect(() => {
    loadDieselEntries()
  }, [driverId])

  const choosePhotos = (files: FileList | null) => {
    if (!files) return

    photoPreviews.forEach((url) => URL.revokeObjectURL(url))

    const selectedFiles = Array.from(files)
    setPhotoFiles(selectedFiles)
    setPhotoPreviews(selectedFiles.map((file) => URL.createObjectURL(file)))
  }



  const chooseEditPhotos = (files: FileList | null) => {
    if (!files) return

    editPhotoPreviews.forEach((url) => URL.revokeObjectURL(url))

    const selectedFiles = Array.from(files)
    setEditPhotoFiles(selectedFiles)
    setEditPhotoPreviews(selectedFiles.map((file) => URL.createObjectURL(file)))
  }

  const removePhoto = (index: number) => {
  setPhotoFiles((prev) =>
    prev.filter((_, i) => i !== index)
  )

  setPhotoPreviews((prev) =>
    prev.filter((_, i) => i !== index)
  )
}

const removeEditPhoto = (index: number) => {
  setEditPhotoFiles((prev) =>
    prev.filter((_, i) => i !== index)
  )

  setEditPhotoPreviews((prev) =>
    prev.filter((_, i) => i !== index)
  )
}

const deleteDieselPhoto = async (photo: DieselPhoto) => {
  const ok = confirm("Delete this photo?")
  if (!ok) return

  const { error: storageError } = await supabase.storage
    .from("entry-photos")
    .remove([photo.photo_path])

  if (storageError) {
    console.log("DIESEL STORAGE DELETE ERROR:", storageError)
  }

  const { error } = await supabase
    .from("diesel_photos")
    .delete()
    .eq("id", photo.id)

  if (error) {
    console.log("DIESEL PHOTO DELETE ERROR:", error)
    alert("Photo delete error")
    return
  }

  setPhotos((prev) => prev.filter((item) => item.id !== photo.id))
}

  const clearPhotos = () => {
    photoPreviews.forEach((url) => URL.revokeObjectURL(url))
    setPhotoFiles([])
  
  }

  const clearEditPhotos = () => {
    editPhotoPreviews.forEach((url) => URL.revokeObjectURL(url))
    setEditPhotoFiles([])
    setEditPhotoPreviews([])
  }

  const uploadPhoto = async (file: File) => {
    const cleanName = file.name.replaceAll(" ", "-")
    const filePath = `diesel/${driverId}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}-${cleanName}`

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

  const uploadAndInsertPhotos = async (dieselEntryId: number, files: File[]) => {
    if (files.length === 0) return

    const rows = []

    for (const file of files) {
      const uploaded = await uploadPhoto(file)

      rows.push({
        diesel_entry_id: dieselEntryId,
        driver_id: driverId,
        photo_url: uploaded.photo_url,
        photo_path: uploaded.photo_path,
      })
    }

    const { data, error } = await supabase
      .from("diesel_photos")
      .insert(rows)
      .select()

    if (error) {
      console.log("DIESEL PHOTOS INSERT ERROR:", error)
      throw error
    }

    if (data) {
      setPhotos((prev) => [...data, ...prev])
    }
  }

  const openEdit = (entry: DieselEntry) => {
    setEditingEntry(entry)
    setEditMileage(entry.mileage === null ? "" : String(entry.mileage))
    setEditLitres(entry.litres === null ? "" : String(entry.litres))
    clearEditPhotos()
  }

  const closeEdit = () => {
    setEditingEntry(null)
    setEditMileage("")
    setEditLitres("")
    clearEditPhotos()
  }

  const saveDiesel = async () => {
    if (saving) return

    if (!mileage && !litres && photoFiles.length === 0) {
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
      const { data, error } = await supabase
        .from("diesel_entries")
        .insert({
          driver_id: driverId,
          entry_date: today,
          mileage: mileageNumber,
          litres: litresNumber,
          photo_url: null,
          photo_path: null,
        })
        .select()
        .single()

      if (error) {
        console.log("DIESEL SAVE ERROR:", error)
        alert(JSON.stringify(error))
        setSaving(false)
        return
      }

      if (data) {
        setEntries((prev) => [data, ...prev])
        await uploadAndInsertPhotos(data.id, photoFiles)
      }

      setMileage("")
      setLitres("")
      clearPhotos()
    } catch (error) {
      console.log("DIESEL SAVE PHOTO ERROR:", error)
      alert(JSON.stringify(error))
    }

    setSaving(false)
  }

  const saveEditDiesel = async () => {
    if (editingSaving || !editingEntry) return

    const existingPhotos = getEntryPhotos(editingEntry.id)

    if (
      !editMileage &&
      !editLitres &&
      editPhotoFiles.length === 0 &&
      existingPhotos.length === 0
    ) {
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
      const { data, error } = await supabase
        .from("diesel_entries")
        .update({
          mileage: mileageNumber,
          litres: litresNumber,
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

        await uploadAndInsertPhotos(data.id, editPhotoFiles)
      }

      closeEdit()
    } catch (error) {
      console.log("DIESEL EDIT PHOTO ERROR:", error)
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
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={onBack}
          className="h-[42px] px-4 rounded-[14px] bg-white font-bold text-[15px]"
        >
          Back
        </button>

        <div className="flex-1 text-center">
          <div className="text-[22px] font-bold">Diesel</div>
          <div className="text-[14px] font-bold">
            This week {weekLitres.toFixed(2)} L
          </div>
        </div>

        <button className="h-[42px] px-4 rounded-[14px] bg-white font-bold text-[15px]">
          Archive
        </button>
      </div>

      <div className="mt-5 space-y-3">
        {entries.map((entry) => {
          const entryPhotos = getEntryPhotos(entry.id)

          return (
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

                {entryPhotos.length > 0 && (
                  <div className="flex gap-1 shrink-0">
                    {entryPhotos.slice(0, 3).map((photo) => (
                      <img
                        key={photo.id}
                        src={photo.photo_url}
                        alt="Diesel receipt"
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpenPhoto(photo.photo_url)
                        }}
                        className="h-[46px] w-[46px] rounded-[9px] object-cover"
                      />
                    ))}
                  </div>
                )}
              </div>
            </button>
          )
        })}
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

          {photoPreviews.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto">
            {photoPreviews.map((preview, index) => (
  <div key={preview} className="relative shrink-0">
    <img
      src={preview}
      alt="Preview"
      className="h-[48px] w-[48px] rounded-[9px] object-cover"
    />

    <button
      onClick={() => removePhoto(index)}
      className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-600 text-white text-[11px] font-bold"
    >
      ×
    </button>
  </div>
))}

              <button
                onClick={clearPhotos}
                className="h-[38px] px-4 rounded-[12px] bg-red-100 text-red-700 font-bold shrink-0"
              >
                Remove
              </button>
            </div>
          )}

          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => choosePhotos(e.target.files)}
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
                📷 Add Photo
              </button>

              <div className="flex gap-2 overflow-x-auto py-1">
                {getEntryPhotos(editingEntry.id).map((photo) => (
                  <div key={photo.id} className="relative shrink-0">
                    <img
                      src={photo.photo_url}
                      alt="Diesel receipt"
                      onClick={() => setOpenPhoto(photo.photo_url)}
                      className="h-[70px] w-[70px] rounded-[10px] object-cover"
                    />

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteDieselPhoto(photo)
                      }}
                      className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-600 text-white text-[11px] font-bold"
                    >
                      ×
                    </button>
                  </div>
                ))}

                {editPhotoPreviews.map((preview, index) => (
                  <div key={preview} className="relative shrink-0">
                    <img
                      src={preview}
                      alt="Preview"
                      onClick={() => setOpenPhoto(preview)}
                      className="h-[70px] w-[70px] rounded-[10px] object-cover"
                    />

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeEditPhoto(index)
                      }}
                      className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-600 text-white text-[11px] font-bold"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              {editPhotoPreviews.length > 0 && (
                <button
                  type="button"
                  onClick={clearEditPhotos}
                  className="h-[38px] px-4 rounded-[12px] bg-red-100 text-red-700 font-bold"
                >
                  Remove New Photos
                </button>
              )}

              <input
                ref={editPhotoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => chooseEditPhotos(e.target.files)}
              />

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeEdit}
                  className="flex-1 h-[46px] rounded-[14px] bg-zinc-200 font-bold"
                >
                  Cancel
                </button>

                <button
                  type="button"
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