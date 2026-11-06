"use client";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";

// Shrinks a photo before it is stored (phone photos are several MB; the dump box does not need that).
export async function compressImage(file, maxSide = 1280, quality = 0.78) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("compress failed"))), "image/jpeg", quality));
}

export const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

// Stores a file under users/{uid}/... in Firebase Storage; returns its address, or null when Storage is
// unavailable (callers then fall back to keeping a small photo inline).
export async function uploadBlob(uid, folder, blob, ext) {
  if (!storage) return null;
  try {
    const r = ref(storage, `users/${uid}/${folder}/${Date.now()}.${ext}`);
    await uploadBytes(r, blob, { contentType: blob.type });
    return await getDownloadURL(r);
  } catch {
    return null;
  }
}

// A photo ready to save on a dump / diary document: { photoUrl }.
export async function prepareImage(uid, file) {
  const blob = await compressImage(file);
  const url = await uploadBlob(uid, "dump", blob, "jpg");
  if (url) return { photoUrl: url };
  if (blob.size < 700 * 1024) return { photoUrl: await blobToDataUrl(blob) }; // Firestore documents may hold ~1MB
  throw new Error("照片太大,也没能上传到 Storage");
}

// Picks a recording format this browser can make (Safari: mp4, Chrome/Android: webm).
export const recorderMime = () => ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(m)) || "";
