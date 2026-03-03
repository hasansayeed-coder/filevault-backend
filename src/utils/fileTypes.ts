import { FileType } from '@prisma/client';

export const MIME_TO_FILE_TYPE: Record<string, FileType> = {
  // Images
  'image/jpeg': FileType.IMAGE,
  'image/jpg': FileType.IMAGE,
  'image/png': FileType.IMAGE,
  'image/gif': FileType.IMAGE,
  'image/webp': FileType.IMAGE,
  'image/svg+xml': FileType.IMAGE,
  'image/bmp': FileType.IMAGE,
  // Videos
  'video/mp4': FileType.VIDEO,
  'video/mpeg': FileType.VIDEO,
  'video/quicktime': FileType.VIDEO,
  'video/x-msvideo': FileType.VIDEO,
  'video/webm': FileType.VIDEO,
  'video/ogg': FileType.VIDEO,
  // PDFs
  'application/pdf': FileType.PDF,
  // Audio
  'audio/mpeg': FileType.AUDIO,
  'audio/mp3': FileType.AUDIO,
  'audio/wav': FileType.AUDIO,
  'audio/ogg': FileType.AUDIO,
  'audio/aac': FileType.AUDIO,
  'audio/flac': FileType.AUDIO,
  'audio/webm': FileType.AUDIO,
};

export const getAllowedMimeTypes = (allowedTypes : FileType[]) : string[] => {
    return Object.entries(MIME_TO_FILE_TYPE).filter(([,type])=> allowedTypes.includes(type)).map(([mime]) => mime) ;
} ; 

export const getFileTypeFromMime = (mimeType : string) : FileType | null => {
    return MIME_TO_FILE_TYPE[mimeType] || null ;
} ; 

export const formatFileSize = (bytes : number) : string => {
     if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}