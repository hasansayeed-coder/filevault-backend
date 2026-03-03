import { Router } from "express";
import {body} from 'express-validator' ;
import {authenticate} from "../middleware/auth" ;
import { toggleFolderStar, getStarredFolders } from '../controllers/folder.controller';

import {getFolders , getFolderById , createFolder , renameFolder , deleteFolder , getAllUserFolders , getFolderBreadcrumb} from "../controllers/folder.controller" ; 

export const folderRouter = Router() ;

folderRouter.use(authenticate) ; 

folderRouter.get('/starred', getStarredFolders);          
folderRouter.patch('/:id/star', toggleFolderStar);

folderRouter.get('/' , getFolders) ; 
folderRouter.get('/all' , getAllUserFolders) ;
folderRouter.get('/:id' , getFolderById) ;
folderRouter.get('/:id/breadcrumb' , getFolderBreadcrumb) ;

folderRouter.post('/' , [
    body('name').trim().isLength({min : 1 , max : 100}) ,
] , createFolder) ; 

folderRouter.patch('/:id/rename' , [
    body('name').trim().isLength({min : 1 , max : 100}) ,
] , renameFolder) ;


folderRouter.delete('/:id' , deleteFolder) ;