import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getTrash,
  getTrashCount,
  restoreFile,
  restoreAll,
  permanentDelete,
  emptyTrash,
} from '../controllers/trash.controller';

export const trashRouter = Router();

trashRouter.use(authenticate);

trashRouter.get('/', getTrash);          
trashRouter.get('/count', getTrashCount);     
trashRouter.post('/restore-all',  restoreAll);        
trashRouter.delete('/empty',  emptyTrash);        
trashRouter.post('/:fileId/restore', restoreFile);       
trashRouter.delete('/:fileId', permanentDelete);   