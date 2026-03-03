import { Request , Response , NextFunction } from "express";
import {AppError} from '../utils/response' ; 

export const errorHandler = (err : Error | AppError , _req : Request , res : Response , _next : NextFunction) : void => {
    if(err instanceof AppError && err.isOperational){
        res.status(err.statusCode).json({
            success : false , 
            message : err.message , 
        }) ; 

        return ; 
    }


    if((err as any).code === 'P2002'){
        res.status(409).json({
            success : false , 
            message : 'A record with this data already exists' ,
        }) ;
        return ; 
    }

    if((err as any).code === 'P2025'){
        res.status(404).json({
            success : false , 
            message : 'Record not found' , 
        }) ; 

        return ;
    }

    if(err.name === 'MulterError'){
        res.status(400).json({
            success : false , 
            message : `File upload error: ${err.message}` ,
        }) ; 

        return ;
    }

    console.error('Unhandled error:' , err) ; 

    res.status(500).json({
        success : false , 
        message : process.env.NODE_ENV === 'production' ? 'internal server error' : err.message , 
    }) ; 
}; 

