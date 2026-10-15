const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Allège une photo avant envoi : côté le plus long à `maxSide` px (quelques centaines de Ko).
 * Une image déjà petite, dans un format accepté, part telle quelle (pas de seconde compression).
 * Les photos JPEG restent en JPEG ; les autres passent en WebP, qui garde la transparence des PNG
 * (JPEG sur fond blanc si le navigateur n'encode pas le WebP).
 */
export async function shrinkImage(file: Blob, maxSide = 1600, quality = 0.85, keepBelow = 1_000_000): Promise<Blob> {
  const bitmap = await createImageBitmap(file); // orientation EXIF appliquée
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= keepBelow && ACCEPTED.has(file.type)) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image illisible");
    const encode = (type: string) =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Image illisible"))), type, quality);
      });
    if (file.type !== "image/jpeg") {
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const webp = await encode("image/webp");
      if (webp.type === "image/webp") return webp;
    }
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await encode("image/jpeg");
  } finally {
    bitmap.close();
  }
}
