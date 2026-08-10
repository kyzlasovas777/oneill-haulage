import { supabase } from "./supabase"

export const PHOTO_BUCKET = "entry-photos"

const SIGNED_URL_TTL_SECONDS = 60 * 60

type PrivatePhoto = {
  photo_url: string
  photo_path?: string | null
  file_path?: string | null
}

function getPhotoPath(photo: PrivatePhoto) {
  return photo.photo_path ?? photo.file_path ?? null
}

export async function createPrivatePhotoUrl(filePath: string) {
  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS)

  if (error || !data?.signedUrl) {
    throw error ?? new Error("Could not create private photo URL")
  }

  return data.signedUrl
}

export async function hydratePrivatePhotoUrls<T extends PrivatePhoto>(photos: T[]) {
  const paths = Array.from(
    new Set(
      photos
        .map(getPhotoPath)
        .filter((path): path is string => Boolean(path))
    )
  )

  if (paths.length === 0) return photos

  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)

  if (error || !data) {
    console.log("PRIVATE PHOTO URL ERROR:", error)
    return photos
  }

  const signedUrls = new Map<string, string>()
  data.forEach((item, index) => {
    if (item.signedUrl) signedUrls.set(paths[index], item.signedUrl)
  })

  return photos.map((photo) => {
    const path = getPhotoPath(photo)
    const signedUrl = path ? signedUrls.get(path) : null
    return signedUrl ? { ...photo, photo_url: signedUrl } : photo
  })
}

export async function uploadPrivatePhoto(
  filePath: string,
  file: Blob,
  contentType = "image/jpeg"
) {
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(filePath, file, { contentType })

  if (error) throw error

  let photoUrl = filePath
  try {
    photoUrl = await createPrivatePhotoUrl(filePath)
  } catch (signedUrlError) {
    console.log("PRIVATE PHOTO SIGN ERROR:", signedUrlError)
  }

  return {
    photo_url: photoUrl,
    photo_path: filePath,
  }
}
