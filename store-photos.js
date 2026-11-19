export const PHOTO_GROUPS = Object.freeze({ storefront: '门头照片', display: '陈列照片' });
export const STORE_PHOTO_LIMITS = Object.freeze({
  maxPerGroup: 6,
  maxInputBytes: 25 * 1024 * 1024,
  targetBytes: 120 * 1024,
  maxPhotoBytes: 180 * 1024,
  maxStoreDataUrlChars: 2_000_000,
  maxDatasetSerializedChars: 2_300_000,
  maxDimension: 1600,
  maxDecodedPixels: 50_000_000,
});

const GROUP_KEYS = Object.keys(PHOTO_GROUPS);
const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/;
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const fail = message => { throw new Error(message); };

/** No photos is a valid old record. Strings inside a group become stable entries. */
export function normalizeStorePhotos(store) {
  const source = store?.photos;
  if (source == null) return { storefront: [], display: [] };
  if (typeof source !== 'object' || Array.isArray(source)) fail('门店照片格式不正确，应按门头和陈列两组保存。');
  if (Object.keys(source).some(group => !GROUP_KEYS.includes(group))) fail('门店照片分组无法识别，请使用门头和陈列两组。');
  const result = { storefront: [], display: [] };
  for (const group of GROUP_KEYS) {
    if (!own(source, group)) continue;
    if (!Array.isArray(source[group])) fail(`${PHOTO_GROUPS[group]}格式不正确。`);
    result[group] = source[group].map((photo, index) => {
      if (typeof photo === 'string') return { id: `photo-${group}-${index + 1}`, src: photo, createdAt: '' };
      if (!photo || typeof photo !== 'object' || Array.isArray(photo)) fail(`${PHOTO_GROUPS[group]}包含无效照片。`);
      return { id: photo.id, src: photo.src, createdAt: photo.createdAt ?? '' };
    });
  }
  return result;
}

/** Conservative evidence detection: uncertain nonempty photo data is never deleted. */
export function hasStorePhotos(store) {
  const source = store?.photos;
  if (source == null || source === '') return false;
  if (Array.isArray(source)) return source.length > 0;
  if (typeof source !== 'object') return true;
  return Object.values(source).some(value => Array.isArray(value) ? value.length > 0 : value != null && value !== '');
}

function imageMimeFromBytes(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((byte, i) => bytes[i] === byte)) return 'image/png';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return '';
}

function inspectDataUrl(src) {
  if (typeof src !== 'string' || src.length > Math.ceil(STORE_PHOTO_LIMITS.maxPhotoBytes / 3) * 4 + 40) {
    fail('单张照片超过 180KB，请重新选择照片并压缩。');
  }
  const match = DATA_URL.exec(src);
  if (!match || match[2].length % 4 !== 0) fail('门店照片只能使用有效的 JPEG、PNG 或 WebP 本地图片。');
  const base64 = match[2];
  const bytes = base64.length * 3 / 4 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  if (bytes > STORE_PHOTO_LIMITS.maxPhotoBytes) fail('单张照片超过 180KB，请重新选择照片并压缩。');
  let header;
  try { header = Uint8Array.from(atob(base64.slice(0, 24)), char => char.charCodeAt(0)); }
  catch { fail('门店照片编码损坏，请重新上传。'); }
  if (imageMimeFromBytes(header) !== `image/${match[1]}`) fail('门店照片的文件类型与内容不一致，请重新上传。');
  return { bytes, chars: src.length };
}

/** Throws before backup restore or save if grouped photos exceed safe limits. */
export function validateStorePhotos(store) {
  const photos = normalizeStorePhotos(store), ids = new Set();
  let chars = 0;
  for (const group of GROUP_KEYS) {
    if (photos[group].length > STORE_PHOTO_LIMITS.maxPerGroup) fail(`${PHOTO_GROUPS[group]}最多保存 6 张，请先删除不需要的照片。`);
    for (const photo of photos[group]) {
      if (typeof photo.id !== 'string' || !SAFE_ID.test(photo.id) || ids.has(photo.id)) fail('门店照片编号无效或重复，请重新选择照片。');
      if (typeof photo.createdAt !== 'string' || (photo.createdAt && !Number.isFinite(Date.parse(photo.createdAt)))) fail('门店照片日期格式不正确。');
      chars += inspectDataUrl(photo.src).chars;
      ids.add(photo.id);
    }
  }
  if (chars > STORE_PHOTO_LIMITS.maxStoreDataUrlChars) fail('这家门店的照片总量过大，请减少照片或选择较小图片。');
  return true;
}

export function storePhotoSummary(store) {
  const photos = normalizeStorePhotos(store);
  let dataUrlChars = 0, decodedBytes = 0;
  for (const group of GROUP_KEYS) for (const photo of photos[group]) {
    const size = inspectDataUrl(photo.src); dataUrlChars += size.chars; decodedBytes += size.bytes;
  }
  return { storefront: photos.storefront.length, display: photos.display.length,
    total: photos.storefront.length + photos.display.length, dataUrlChars, decodedBytes };
}

/** Mutations return only the photo object, ready for nextStore.photos = result. */
export function appendStorePhotos(store, group, added) {
  if (!own(PHOTO_GROUPS, group)) fail('请选择门头或陈列照片分类。');
  if (!Array.isArray(added)) fail('待添加照片格式不正确。');
  const photos = normalizeStorePhotos(store);
  photos[group].push(...structuredClone(added));
  validateStorePhotos({ photos });
  return photos;
}

export function removeStorePhoto(store, group, id) {
  if (!own(PHOTO_GROUPS, group)) fail('请选择门头或陈列照片分类。');
  const photos = normalizeStorePhotos(store);
  photos[group] = photos[group].filter(photo => photo.id !== id);
  validateStorePhotos({ photos });
  return photos;
}

/** Conservative UTF-16 budget leaves room for this origin's storage bookkeeping. */
export function assertDatasetStorageBudget(dataset) {
  let serialized;
  try { serialized = JSON.stringify(dataset); }
  catch { fail('数据无法保存，请检查备份格式。'); }
  if (typeof serialized !== 'string') fail('数据无法保存，请检查备份格式。');
  if (serialized.length > STORE_PHOTO_LIMITS.maxDatasetSerializedChars) {
    fail('本机照片与记录接近浏览器容量上限，请先导出备份并删除部分照片后再保存。');
  }
  // localStorage.setItem still needs a try/catch: device/private-mode quotas vary.
  return serialized;
}

async function sniffFileType(file) {
  if (!file || typeof file.size !== 'number' || typeof file.slice !== 'function' || typeof file.arrayBuffer !== 'function') fail('请选择需要上传的图片。');
  if (file.size === 0) fail('这张照片是空文件，请重新选择。');
  if (file.size > STORE_PHOTO_LIMITS.maxInputBytes) fail('单张原始照片请小于 25MB。');
  let header;
  try { header = new Uint8Array(await file.slice(0, 24).arrayBuffer()); }
  catch { fail('无法读取这张照片，请重新选择。'); }
  const mime = imageMimeFromBytes(header);
  if (!mime) {
    const name = String(file.name || ''), type = String(file.type || '');
    if (/hei[cf]/i.test(type) || /\.hei[cf]$/i.test(name)) {
      fail('这张手机原图是 HEIC/HEIF 格式。请导出为 JPEG，或将相机格式设为“兼容性最佳”后重试。');
    }
    fail('仅支持 JPEG、PNG 或 WebP 照片，请重新选择。');
  }
  return mime;
}

async function decodeImage(file, mime) {
  // Signature detection also supports Android camera files with a blank MIME type.
  const blob = file.type === mime ? file : new Blob([file], { type: mime });
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
    catch { /* Safari/older camera decoders can still use the Image path below. */ }
  }
  if (typeof Image !== 'function' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') fail('当前浏览器无法读取照片，请使用较新的手机浏览器。');
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const picture = new Image();
      picture.onload = () => resolve(picture);
      picture.onerror = () => reject(new Error('照片无法解码或已损坏，请重新拍摄后上传。'));
      picture.src = objectUrl;
    });
  } finally { URL.revokeObjectURL(objectUrl); }
}

function encodeJpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    try {
      if (typeof canvas.toBlob !== 'function') {
        const src = canvas.toDataURL('image/jpeg', quality);
        const raw = atob(src.split(',')[1]);
        resolve(new Blob([Uint8Array.from(raw, char => char.charCodeAt(0))], { type: 'image/jpeg' }));
      } else canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('照片压缩失败，请减少照片尺寸后重试。')), 'image/jpeg', quality);
    } catch { reject(new Error('照片压缩失败，请重新选择照片。')); }
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('无法保存压缩照片，请重新选择。'));
    reader.readAsDataURL(blob);
  });
}

/** Re-encoding strips location/EXIF metadata; small photos are never padded/upscaled. */
export async function compressStorePhoto(file) {
  const mime = await sniffFileType(file);
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') fail('照片压缩需要在浏览器中进行。');
  const image = await decodeImage(file, mime);
  const width = image.width || image.naturalWidth, height = image.height || image.naturalHeight;
  let chosen = null;
  try {
    if (!width || !height || width * height > STORE_PHOTO_LIMITS.maxDecodedPixels) fail('这张照片像素过大，请选择普通照片或先裁剪后上传。');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) fail('当前浏览器无法压缩照片，请换一个浏览器重试。');
    for (const bound of [1600, 1280, 1024, 800, 640]) {
      const scale = Math.min(1, bound / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [.84, .74, .64, .54]) {
        const candidate = await encodeJpeg(canvas, quality);
        if (candidate.size <= STORE_PHOTO_LIMITS.maxPhotoBytes && (!chosen || candidate.size < chosen.size)) chosen = candidate;
        if (candidate.size <= STORE_PHOTO_LIMITS.targetBytes) { chosen = candidate; break; }
      }
      if (chosen && chosen.size <= STORE_PHOTO_LIMITS.targetBytes) break;
    }
    if (!chosen) fail('照片压缩后仍超过 180KB，请裁剪照片或选择较小图片。');
    const id = globalThis.crypto?.randomUUID ? `photo-${crypto.randomUUID()}` : `photo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const result = { id, src: await blobToDataUrl(chosen), createdAt: new Date().toISOString() };
    inspectDataUrl(result.src);
    return result;
  } finally { image.close?.(); }
}
