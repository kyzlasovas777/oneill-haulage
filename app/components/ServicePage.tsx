"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "./supabase"

type ServicePageProps = {
  onBack: () => void
}

type Truck = {
  id: number
  reg: string
}

type ServiceItem = {
  id: number
  truck_id: number
  entry_date: string
  mileage: number | null
  description: string | null
  created_at?: string
}

type ServicePhoto = {
  id: number
  service_id: number
  photo_url: string
  photo_path: string | null
  created_at?: string
}

const ACTIVE_LIMIT = 25

function formatEntryDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}.${month}.${day}`
}

function parseEntryDate(dateText: string) {
  const [year, month, day] = dateText.split(".").map(Number)
  return new Date(year, month - 1, day)
}

function displayDate(dateText: string) {
  const date = parseEntryDate(dateText)

  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      const maxWidth = 1200
      const scale = Math.min(1, maxWidth / img.width)
      const width = Math.round(img.width * scale)
      const height = Math.round(img.height * scale)

      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext("2d")
      if (!ctx) {
        resolve(file)
        return
      }

      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file)
            return
          }

          resolve(
            new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), {
              type: "image/jpeg",
            })
          )
        },
        "image/jpeg",
        0.65
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }

    img.src = url
  })
}

export default function ServicePage({ onBack }: ServicePageProps) {
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null)

  const [items, setItems] = useState<ServiceItem[]>([])
  const [photos, setPhotos] = useState<ServicePhoto[]>([])

  const [archiveOpen, setArchiveOpen] = useState(false)

  const [addOpen, setAddOpen] = useState(false)
  const [mileage, setMileage] = useState("")
  const [description, setDescription] = useState("")
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const photoInputRef = useRef<HTMLInputElement | null>(null)

  const [editingItem, setEditingItem] = useState<ServiceItem | null>(null)
  const [editMileage, setEditMileage] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editPhotoFiles, setEditPhotoFiles] = useState<File[]>([])
  const [editPhotoPreviews, setEditPhotoPreviews] = useState<string[]>([])
  const [editingSaving, setEditingSaving] = useState(false)
  const editPhotoInputRef = useRef<HTMLInputElement | null>(null)

  const [openPhoto, setOpenPhoto] = useState<string | null>(null)

  const today = formatEntryDate(new Date())

  const loadTrucks = async () => {
    const { data, error } = await supabase.from("trucks").select("*").order("reg")

    if (error) {
      console.log("SERVICE TRUCKS LOAD ERROR:", error)
      return
    }

    setTrucks(data ?? [])
  }

  const loadAllItems = async () => {
  const { data, error } = await supabase
    .from("service_items")
    .select("*")

  if (error) {
    console.log("SERVICE ALL ITEMS LOAD ERROR:", error)
    return
  }

  setItems(data ?? [])
}

  const loadItems = async (truckId: number) => {
    const { data, error } = await supabase
      .from("service_items")
      .select("*")
      .eq("truck_id", truckId)
      .order("mileage", { ascending: false })

    if (error) {
      console.log("SERVICE ITEMS LOAD ERROR:", error)
      return
    }

    setItems(data ?? [])

    const ids = (data ?? []).map((item) => item.id)

    if (ids.length === 0) {
      setPhotos([])
      return
    }

    const { data: photoData, error: photoError } = await supabase
      .from("service_photos")
      .select("*")
      .in("service_id", ids)
      .order("created_at", { ascending: false })

    if (photoError) {
      console.log("SERVICE PHOTOS LOAD ERROR:", photoError)
      return
    }

    setPhotos(photoData ?? [])
  }

useEffect(() => {
  loadTrucks()
  loadAllItems()
}, [])

  useEffect(() => {
    if (selectedTruck) {
      loadItems(selectedTruck.id)
    }
  }, [selectedTruck])

  const getItemPhotos = (itemId: number) => {
    return photos.filter((photo) => photo.service_id === itemId)
  }

  const uploadPhoto = async (file: File) => {
    const compressedFile = await compressImage(file)

    const cleanName = compressedFile.name.replaceAll(" ", "-")
    const filePath = `service/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}-${cleanName}`

    const { error } = await supabase.storage
      .from("entry-photos")
      .upload(filePath, compressedFile, {
        contentType: "image/jpeg",
      })

    if (error) throw error

    const { data } = supabase.storage.from("entry-photos").getPublicUrl(filePath)

    return {
      photo_url: data.publicUrl,
      photo_path: filePath,
    }
  }

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

  const clearPhotos = () => {
    photoPreviews.forEach((url) => URL.revokeObjectURL(url))
    setPhotoFiles([])
    setPhotoPreviews([])
    if (photoInputRef.current) photoInputRef.current.value = ""
  }

  const clearEditPhotos = () => {
    editPhotoPreviews.forEach((url) => URL.revokeObjectURL(url))
    setEditPhotoFiles([])
    setEditPhotoPreviews([])
    if (editPhotoInputRef.current) editPhotoInputRef.current.value = ""
  }

  const removePhoto = (index: number) => {
    if (photoPreviews[index]) URL.revokeObjectURL(photoPreviews[index])
    setPhotoFiles((prev) => prev.filter((_, i) => i !== index))
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index))
    if (photoInputRef.current) photoInputRef.current.value = ""
  }

  const removeEditPhoto = (index: number) => {
    if (editPhotoPreviews[index]) URL.revokeObjectURL(editPhotoPreviews[index])
    setEditPhotoFiles((prev) => prev.filter((_, i) => i !== index))
    setEditPhotoPreviews((prev) => prev.filter((_, i) => i !== index))
    if (editPhotoInputRef.current) editPhotoInputRef.current.value = ""
  }

  const saveService = async () => {
    if (saving || !selectedTruck) return

    if (!mileage && !description && photoFiles.length === 0) {
      alert("Enter mileage, description or add photo")
      return
    }

    const mileageNumber = mileage ? Number(mileage) : null

    if (mileageNumber !== null && mileageNumber <= 0) {
      alert("Mileage must be higher than 0")
      return
    }

    setSaving(true)

    const { data, error } = await supabase
      .from("service_items")
      .insert({
        truck_id: selectedTruck.id,
        entry_date: today,
        mileage: mileageNumber,
        description: description.trim() || null,
      })
      .select()
      .single()

  if (error || !data) {
  console.log("SERVICE SAVE ERROR:", error)
  alert(error?.message ?? "Save error")
  setSaving(false)
  return
}

    for (const file of photoFiles) {
      try {
        const uploaded = await uploadPhoto(file)

        await supabase.from("service_photos").insert({
          service_id: data.id,
          photo_url: uploaded.photo_url,
          photo_path: uploaded.photo_path,
        })
      } catch (err) {
        console.log("SERVICE PHOTO SAVE ERROR:", err)
      }
    }

    setMileage("")
    setDescription("")
    clearPhotos()
    setAddOpen(false)
    setSaving(false)

    await loadItems(selectedTruck.id)
  }

  const openEdit = (item: ServiceItem) => {
    setEditingItem(item)
    setEditMileage(item.mileage === null ? "" : String(item.mileage))
    setEditDescription(item.description ?? "")
    clearEditPhotos()
  }

  const closeEdit = () => {
    setEditingItem(null)
    setEditMileage("")
    setEditDescription("")
    clearEditPhotos()
  }

  const saveEditService = async () => {
    if (editingSaving || !editingItem || !selectedTruck) return

    const mileageNumber = editMileage ? Number(editMileage) : null

    if (mileageNumber !== null && mileageNumber <= 0) {
      alert("Mileage must be higher than 0")
      return
    }

    setEditingSaving(true)

    const { error } = await supabase
      .from("service_items")
      .update({
        mileage: mileageNumber,
        description: editDescription.trim() || null,
      })
      .eq("id", editingItem.id)

    if (error) {
      console.log("SERVICE EDIT ERROR:", error)
      alert("Edit error")
      setEditingSaving(false)
      return
    }

    for (const file of editPhotoFiles) {
      try {
        const uploaded = await uploadPhoto(file)

        await supabase.from("service_photos").insert({
          service_id: editingItem.id,
          photo_url: uploaded.photo_url,
          photo_path: uploaded.photo_path,
        })
      } catch (err) {
        console.log("SERVICE EDIT PHOTO ERROR:", err)
      }
    }

    setEditingSaving(false)
    closeEdit()
    await loadItems(selectedTruck.id)
  }

  const deleteServicePhoto = async (photo: ServicePhoto) => {
    if (!confirm("Delete this photo?")) return

    if (photo.photo_path) {
      await supabase.storage.from("entry-photos").remove([photo.photo_path])
    }

    await supabase.from("service_photos").delete().eq("id", photo.id)

    if (selectedTruck) await loadItems(selectedTruck.id)
  }

  const deleteServiceItem = async (id: number) => {
    if (!confirm("Delete this service?")) return

    const itemPhotos = photos.filter((photo) => photo.service_id === id)
    const paths = itemPhotos
      .map((photo) => photo.photo_path)
      .filter(Boolean) as string[]

    if (paths.length > 0) {
      await supabase.storage.from("entry-photos").remove(paths)
    }

    await supabase.from("service_photos").delete().eq("service_id", id)
    await supabase.from("service_items").delete().eq("id", id)

    closeEdit()

    if (selectedTruck) await loadItems(selectedTruck.id)
  }

  const activeItems = items.slice(0, ACTIVE_LIMIT)
  const visibleItems = archiveOpen ? items : activeItems

  return (
    <div className="fixed inset-0 z-[80] bg-white p-3 overflow-y-auto pb-[80px]">
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => {
            if (archiveOpen) {
              setArchiveOpen(false)
          } else if (selectedTruck) {
  setSelectedTruck(null)
  setArchiveOpen(false)
  loadAllItems()
} else {
  onBack()
}
          }}
          className="w-[30px] text-[34px] text-blue-500 leading-none"
        >
          ‹
        </button>

        <div className="flex-1 text-center">
          <div className="text-[22px] font-bold">
            {archiveOpen
              ? "Service Archive"
              : selectedTruck
              ? selectedTruck.reg
              : "Service"}
          </div>

          {selectedTruck && !archiveOpen && (
            <div className="text-[14px] font-bold">
              Last {activeItems.length} services
            </div>
          )}
        </div>

        {selectedTruck && !archiveOpen ? (
          <button
            onClick={() => setArchiveOpen(true)}
            className="w-[30px] text-[28px] leading-none"
          >
            📁
          </button>
        ) : (
          <div className="w-[30px]" />
        )}
      </div>

      <div className="mt-5 space-y-3">
{!selectedTruck &&
  trucks.map((truck) => {
 const count = items.filter(
  (item) => item.truck_id === truck.id
).length

    return (
      <button
        key={truck.id}
        onClick={() => setSelectedTruck(truck)}
        className="w-full text-left bg-[#f5f5f5] rounded-[18px] border border-green-400 px-3 py-3 shadow-sm"
      >
        <div className="font-bold text-[18px]">{truck.reg}</div>

        <div className="text-[14px] text-zinc-500">
          {count} {count === 1 ? "service" : "services"}
        </div>
      </button>
    )
  })}

        {!selectedTruck && trucks.length === 0 && (
          <div className="text-center text-zinc-400 mt-10">
            No trucks found
          </div>
        )}

        {selectedTruck &&
          visibleItems.map((item) => {
            const itemPhotos = getItemPhotos(item.id)

            return (
              <button
                key={item.id}
                onClick={() => openEdit(item)}
                className="w-full text-left bg-[#f5f5f5] rounded-[18px] border border-green-400 px-3 py-2 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="pl-2">
                    <div className="font-bold">
                      {displayDate(item.entry_date)}
                    </div>

                    <div>
                      Mileage: <b>{item.mileage ?? "-"}</b>
                    </div>

                    {item.description && (
                      <div className="text-[14px] text-zinc-700 whitespace-pre-wrap mt-1">
                        {item.description}
                      </div>
                    )}
                  </div>

                  {itemPhotos.length > 0 && (
                    <div className="flex gap-1 shrink-0">
                      {itemPhotos.slice(0, 3).map((photo) => (
                        <img
                          key={photo.id}
                          src={photo.photo_url}
                          alt="Service"
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

        {selectedTruck && visibleItems.length === 0 && (
          <div className="text-center text-zinc-400 mt-10">
            No services yet
          </div>
        )}
      </div>

      {selectedTruck && !archiveOpen && (
        <div className="fixed left-0 right-0 bottom-0 z-[90] bg-white p-3">
          <button
            onClick={() => {
              setMileage("")
              setDescription("")
              clearPhotos()
              setAddOpen(true)
            }}
            className="w-full h-[44px] rounded-[16px] bg-blue-600 text-white font-bold text-[16px]"
          >
            + Add Service
          </button>
        </div>
      )}

      {addOpen && (
        <div
          onClick={() => setAddOpen(false)}
          className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[360px] bg-white rounded-[22px] p-4"
          >
            <h2 className="text-[22px] font-bold mb-3">Add Service</h2>

            <div className="text-[14px] font-bold mb-3 text-zinc-500">
              {displayDate(today)}
            </div>

            <div className="space-y-3">
              <input
                type="number"
                placeholder="Mileage"
                value={mileage}
                onChange={(e) => setMileage(e.target.value)}
                className="w-full h-[46px] rounded-[12px] border px-4 text-[16px]"
              />

              <textarea
                placeholder="Description / parts changed / invoice note"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full rounded-[12px] border px-4 py-3 text-[16px] resize-none"
              />

              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="w-full h-[42px] rounded-[12px] bg-zinc-200 font-bold text-[15px]"
              >
                📷 Add Photo
              </button>

              {photoPreviews.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pt-3 pb-1">
                  {photoPreviews.map((preview, index) => (
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
                          removePhoto(index)
                        }}
                        className="absolute top-1 right-1 h-5 w-5 rounded-full bg-red-600 text-white text-[11px] font-bold"
                      >
                        ×
                      </button>
                    </div>
                  ))}
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

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setAddOpen(false)
                    clearPhotos()
                    setMileage("")
                    setDescription("")
                  }}
                  className="flex-1 h-[46px] rounded-[14px] bg-zinc-200 font-bold"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={saveService}
                  className="flex-1 h-[46px] rounded-[14px] bg-blue-600 text-white font-bold"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingItem && (
        <div
          onClick={closeEdit}
          className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[360px] bg-white rounded-[22px] p-4"
          >
            <h2 className="text-[22px] font-bold mb-3">Edit Service</h2>

            <div className="text-[14px] font-bold mb-3 text-zinc-500">
              {displayDate(editingItem.entry_date)}
            </div>

            <div className="space-y-3">
              <input
                type="number"
                placeholder="Mileage"
                value={editMileage}
                onChange={(e) => setEditMileage(e.target.value)}
                className="w-full h-[46px] rounded-[12px] border px-4 text-[16px]"
              />

              <textarea
                placeholder="Description / parts changed / invoice note"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={4}
                className="w-full rounded-[12px] border px-4 py-3 text-[16px] resize-none"
              />

              <button
                type="button"
                onClick={() => editPhotoInputRef.current?.click()}
                className="w-full h-[42px] rounded-[12px] bg-zinc-200 font-bold text-[15px]"
              >
                📷 Add Photo
              </button>

              <div className="flex gap-2 overflow-x-auto pt-3 pb-1">
                {getItemPhotos(editingItem.id).map((photo) => (
                  <div key={photo.id} className="relative shrink-0">
                    <img
                      src={photo.photo_url}
                      alt="Service"
                      onClick={() => setOpenPhoto(photo.photo_url)}
                      className="h-[70px] w-[70px] rounded-[10px] object-cover"
                    />

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteServicePhoto(photo)
                      }}
                      className="absolute top-1 right-1 h-5 w-5 rounded-full bg-red-600 text-white text-[11px] font-bold"
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
                      className="absolute top-1 right-1 h-5 w-5 rounded-full bg-red-600 text-white text-[11px] font-bold"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

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
                  onClick={saveEditService}
                  className="flex-1 h-[46px] rounded-[14px] bg-blue-600 text-white font-bold"
                >
                  {editingSaving ? "Saving..." : "Save"}
                </button>

                <button
                  type="button"
                  onClick={() => deleteServiceItem(editingItem.id)}
                  className="flex-1 h-[46px] rounded-[14px] bg-red-600 text-white font-bold"
                >
                  Delete
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
            alt="Service"
            className="max-h-full max-w-full rounded-[16px]"
          />
        </div>
      )}
    </div>
  )
}