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
  deleteFileAsSystem,
  deleteOwnerFilesAsSystem,
  readFileAsSystem,
  closeFilesPool,
  // C.4g: the anonymous upload (the client's photo on the public booking page)
  requestAnonymousUpload,
  confirmAnonymousUpload,
  listAnonymousFiles,
  // S147: the profile photo (files.personal_file)
  requestPersonalUpload,
  confirmPersonalUpload,
  readPersonalFile,
  deletePersonalFile,
} from './files';
export type {
  FilesContext,
  FilesConnection,
  FileOwner,
  FileInfo,
  FileStatus,
  AnonymousFilesContext,
  AnonymousFileInfo,
  PersonalFileInfo,
  PersonalFilePurpose,
} from './files';
export {
  ALLOWED_CONTENT_TYPES,
  ANONYMOUS_CONTENT_TYPES,
  ANONYMOUS_FILES_PER_OWNER,
  ANONYMOUS_FILES_PER_KEY,
  CSV_OWNER,
  mayKeepCsv,
  MAX_FILE_BYTES,
  ATTACHMENT_RETENTION_DAYS,
  UPLOAD_WINDOW_SECONDS,
  DOWNLOAD_LINK_SECONDS,
  STORAGE_URL_SECONDS,
  checkDeclaredFile,
  sniffContentType,
  cleanFileName,
  // Brand Kit (S148) and the profile photo (S147)
  BRAND_LOGO_OWNER,
  BRAND_LOGO_CONTENT_TYPES,
  BRAND_LOGO_MIN_SIDE,
  BRAND_LOGO_MAX_BYTES,
  isBrandLogoOwner,
  imageSize,
  PERSONAL_CONTENT_TYPES,
  MAX_PERSONAL_FILE_BYTES,
} from './policy';
export type { AllowedContentType } from './policy';
export { FileLinkRefused, signDownloadToken, verifyDownloadToken } from './links';
export type { DownloadClaims } from './links';
export { setStorageAdapter, getStorageAdapter, StorageNotConfiguredError } from './storage';
export type { StorageAdapter, StoredObject } from './storage';
export { MemoryStorageAdapter } from './adapters/memory';
export { SupabaseStorageAdapter } from './adapters/supabase';
