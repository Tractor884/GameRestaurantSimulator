/**
 * ============================================================================
 * ХРАНИЛИЩЕ ПОЛЬЗОВАТЕЛЬСКИХ ИЗОБРАЖЕНИЙ (арт-пак)
 * ============================================================================
 * IndexedDB 'restsim-art' / store 'images': { key, blob, mime, uploadedAt }.
 * Ключ = слот из реестра (registry.ts). Пользовательские картинки ВСЕГДА
 * приоритетнее встроенных. Blob-хранилище (LocalStorage мал для картинок;
 * сейвы игры не трогаем).
 *
 * Загрузка нормализуется: конвертация в WebP (canvas), даунскейл до
 * рекомендованных размеров слота (защита от раздувания хранилища).
 * Экспорт/импорт пака — JSON с base64 (перенос между браузерами).
 */

export interface StoredImage {
  key: string;
  blob: Blob;
  mime: string;
  uploadedAt: string;
  width: number;
  height: number;
}

const DB_NAME = 'restsim-art';
const STORE = 'images';
const DB_VERSION = 1;

/** Максимальная сторона после нормализации (даунскейл, защита хранилища). */
const MAX_SIDE = 1600;
/** Максимальный размер исходного файла. */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
        t.oncomplete = () => db.close();
      }),
  );
}

/* ── Нормализация загружаемого файла ── */

async function loadImageBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    return createImageBitmap(file);
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось прочитать изображение'));
    };
    img.src = url;
  });
}

/** Даунскейл + WebP через canvas. Возвращает { blob, width, height }. */
export async function normalizeImage(
  file: File,
): Promise<{ blob: Blob; mime: string; width: number; height: number }> {
  const bmp = await loadImageBitmap(file);
  const w = 'width' in bmp ? bmp.width : 0;
  const h = 'height' in bmp ? bmp.height : 0;
  if (!w || !h) throw new Error('Пустое изображение');

  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const nw = Math.max(1, Math.round(w * scale));
  const nh = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = nw;
  canvas.height = nh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas недоступен');
  ctx.drawImage(bmp as CanvasImageSource, 0, 0, nw, nh);
  if ('close' in bmp) bmp.close();

  const webp = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
  if (webp && webp.type === 'image/webp') {
    return { blob: webp, mime: 'image/webp', width: nw, height: nh };
  }
  // Браузер без WebP-энкодера — сохраняем как PNG.
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!png) throw new Error('Не удалось закодировать изображение');
  return { blob: png, mime: 'image/png', width: nw, height: nh };
}

/* ── CRUD ── */

export async function putImage(key: string, file: File): Promise<StoredImage> {
  if (!file.type.startsWith('image/')) throw new Error('Это не изображение');
  if (file.size > MAX_FILE_BYTES) throw new Error('Файл больше 8 МБ');
  const norm = await normalizeImage(file);
  const rec: StoredImage = {
    key,
    blob: norm.blob,
    mime: norm.mime,
    uploadedAt: new Date().toISOString(),
    width: norm.width,
    height: norm.height,
  };
  await tx('readwrite', (s) => s.put(rec) as unknown as IDBRequest<unknown>);
  return rec;
}

export async function deleteImage(key: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(key) as unknown as IDBRequest<unknown>);
}

export async function listImages(): Promise<StoredImage[]> {
  const all = await tx<StoredImage[]>('readonly', (s) => s.getAll() as IDBRequest<StoredImage[]>);
  return all ?? [];
}

export async function clearAllImages(): Promise<void> {
  await tx('readwrite', (s) => s.clear() as unknown as IDBRequest<unknown>);
}

/* ── Экспорт / импорт пака (JSON + base64) ── */

export interface ArtPackExport {
  kind: 'restsim-art-pack';
  version: 1;
  exportedAt: string;
  images: { key: string; mime: string; width: number; height: number; base64: string }[];
}

export async function exportArtPack(): Promise<ArtPackExport> {
  const all = await listImages();
  return {
    kind: 'restsim-art-pack',
    version: 1,
    exportedAt: new Date().toISOString(),
    images: await Promise.all(
      all.map(async (img) => ({
        key: img.key,
        mime: img.mime,
        width: img.width,
        height: img.height,
        base64: await blobToBase64(img.blob),
      })),
    ),
  };
}

export async function importArtPack(pack: unknown): Promise<number> {
  const p = pack as Partial<ArtPackExport>;
  if (!p || p.kind !== 'restsim-art-pack' || !Array.isArray(p.images)) {
    throw new Error('Файл не является арт-паком игры');
  }
  let n = 0;
  for (const img of p.images) {
    if (!img.key || typeof img.base64 !== 'string') continue;
    const blob = base64ToBlob(img.base64, img.mime || 'image/webp');
    const rec: StoredImage = {
      key: img.key,
      blob,
      mime: img.mime || 'image/webp',
      uploadedAt: new Date().toISOString(),
      width: img.width ?? 0,
      height: img.height ?? 0,
    };
    await tx('readwrite', (s) => s.put(rec) as unknown as IDBRequest<unknown>);
    n++;
  }
  return n;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const data = String(fr.result);
      resolve(data.slice(data.indexOf(',') + 1));
    };
    fr.onerror = () => reject(fr.error ?? new Error('FileReader failed'));
    fr.readAsDataURL(blob);
  });
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
