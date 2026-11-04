// Lot 4.7: the files (storage, signed links, access by organization)
export {
  requestUpload,
  confirmUpload,
  getDownloadLink,
  openDownloadLink,
  getFile,
  listFiles,
  storageUsedBytes,
  deleteFile,
  closeFilesPool,
} from './files';
export type { FilesContext, FilesConnection, FileOwner, FileInfo, FileStatus } from './files';
export {
  ALLOWED_CONTENT_TYPES,
  MAX_FILE_BYTES,
  ATTACHMENT_RETENTION_DAYS,
  UPLOAD_WINDOW_SECONDS,
  DOWNLOAD_LINK_SECONDS,
  STORAGE_URL_SECONDS,
  checkDeclaredFile,
  sniffContentType,
  cleanFileName,
} from './policy';
export type { AllowedContentType } from './policy';
export { FileLinkRefused, signDownloadToken, verifyDownloadToken } from './links';
export type { DownloadClaims } from './links';
export { setStorageAdapter, getStorageAdapter, StorageNotConfiguredError } from './storage';
export type { StorageAdapter, StoredObject } from './storage';
export { MemoryStorageAdapter } from './adapters/memory';
export { SupabaseStorageAdapter } from './adapters/supabase';
