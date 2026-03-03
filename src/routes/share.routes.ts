import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  createShare,
  getFileShare,
  revokeShare,
  getSharedFile,
  accessSharedFile,
} from '../controllers/share.controller';

const shareRouter = Router();

// Protected routes (owner)
shareRouter.post('/create', authenticate, createShare);
shareRouter.get('/file/:fileId', authenticate, getFileShare);
shareRouter.delete('/file/:fileId', authenticate, revokeShare);

// Public routes (no auth)
shareRouter.get('/public/:token', getSharedFile);
shareRouter.get('/public/:token/access', accessSharedFile);

export default shareRouter;