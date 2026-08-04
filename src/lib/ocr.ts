/**
 * Receipt OCR.
 *
 * Uses Tesseract.js (dynamically imported so it never touches the initial
 * bundle) to read text from a receipt photo. The extracted text is then fed
 * through the NLP parser so amounts/merchant/date are auto-filled.
 *
 * If the OCR engine can't load (offline / blocked CDN) we fall back to a
 * clearly-labeled simulation so the UI still demos the flow end-to-end.
 */

export interface OcrResult {
  text: string;
  confidence: number;
  simulated: boolean;
}

export async function extractReceiptText(dataUrl: string): Promise<OcrResult> {
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng", 1, {
      // Defaults load wasm/lang data from jsDelivr; keep defaults.
    });
    const { data } = await worker.recognize(dataUrl);
    await worker.terminate();
    return {
      text: (data.text ?? "").trim(),
      confidence: data.confidence ?? 0,
      simulated: false,
    };
  } catch {
    console.warn("[ocr] Tesseract unavailable, using simulated extraction");
    return {
      text: simulateReceiptText(),
      confidence: 0.5,
      simulated: true,
    };
  }
}

/**
 * Deterministic demo fallback so the scan flow can be exercised offline.
 * In production, remove this and surface the OCR error to the user instead.
 */
function simulateReceiptText(): string {
  const lines = [
    "STARBUCKS STORE #12345",
    "Grande Latte 5.75",
    "Butter Croissant 3.25",
    "TOTAL $9.00",
    "VISA ********1234",
  ];
  return lines.join("\n");
}

/** Downscale + return a dataURL so OCR runs on a small, fast image. */
export function downscaleImage(file: File, maxSize = 900): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not decode image"));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
