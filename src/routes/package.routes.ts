import { Router } from "express";
import {body} from 'express-validator';  
import {authenticate , requireAdmin} from "../middleware/auth" ; 
import {getAllPackages , getPackageById , createPackage , updatePackage , deletePackage} from "../controllers/package.controller" ;

export const packageRouter = Router() ;

// public : 
packageRouter.get('/' , authenticate , getAllPackages) ; 
packageRouter.get('/:id' , authenticate , getPackageById) ;

//Admin only
packageRouter.post('/' , authenticate , requireAdmin , [
    body('name').isIn(['FREE' , 'SILVER' , 'GOLD' , 'DIAMOND']) , 
    body('displayName').trim().notEmpty() , 
    body('maxFolders').isInt({min : 1}) , 
    body('maxNestingLevel').isInt({min : 1}) , 
    body('allowedFileTypes').isArray({min : 1}) , 
    body('maxFileSizeMB').isFloat({min : 0.1}) , 
    body('totalFileLimit').isInt({min : 1}), 
    body('filesPerFolder').isInt({min : 1}) ,
] , createPackage) ;

packageRouter.put('/:id' , authenticate , requireAdmin , [
    body('maxFolders').optional().isInt({min: 1}) , 
    body('maxNestingLevel').optional().isInt({min : 1}) , 
    body('allowedFileTypes').optional().isArray({min : 1}) , 
    body('maxFileSizeMB').optional().isFloat({min : 0.1}) , 
    body('totalFileLimit').optional().isInt({min : 1}) , 
    body('filesPerFolder').optional().isInt({min : 1}) ,
] , updatePackage) ;


packageRouter.delete('/:id' , authenticate , requireAdmin , deletePackage) ;