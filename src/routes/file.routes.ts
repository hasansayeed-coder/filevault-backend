import { Router } from "express";
import rateLimit from 'express-rate-limit';
import { authenticate } from "../middleware/auth";
import { upload } from "../middleware/upload";
import {
  getFilesInFolder, getFileById, uploadFile, renameFile,
  deleteFile2, downloadFile, previewFile, moveFile,
  getAllUserFiles, bulkDeleteFiles, bulkMoveFiles,
  getFileVersions, uploadNewVersion, restoreVersion, deleteVersion,
  toggleFileStar, getStarredFiles,                                   
} from '../controllers/file.controller';

export const fileRouter = Router();

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req: any) => req.user?.userId || req.ip || req.socket.remoteAddress || "unknown",
  message: { success: false, message: 'Too many uploads. Max 20 per minute.' },
});

fileRouter.use(authenticate);

// ── List / search ──
fileRouter.get('/', getAllUserFiles);
fileRouter.get('/starred', getStarredFiles);              
fileRouter.get('/folder/:folderId', getFilesInFolder);
fileRouter.get('/:id', getFileById);
fileRouter.get('/:id/download', authenticate, downloadFile);
fileRouter.get('/:id/preview', authenticate, previewFile);

// ── Version routes ──
fileRouter.get( '/:id/versions', getFileVersions);
fileRouter.post('/:id/versions',  upload.single('file'), uploadNewVersion);
fileRouter.post('/:id/versions/:versionId/restore', restoreVersion);
fileRouter.delete('/:id/versions/:versionId', deleteVersion);

// ── Upload / bulk ──
fileRouter.post('/upload', uploadLimiter, upload.single('file'), uploadFile);
fileRouter.post('/bulk-delete', bulkDeleteFiles);
fileRouter.post('/bulk-move', bulkMoveFiles);

// ── Mutate ──
fileRouter.patch('/:id/star', toggleFileStar);               
fileRouter.patch('/:id/rename', renameFile);
fileRouter.patch('/:id/move', moveFile);
fileRouter.delete('/:id', deleteFile2);
