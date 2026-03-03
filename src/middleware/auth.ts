import { Request , Response , NextFunction } from "express";
import {verifyAccessToken} from '../utils/jwt' ; 
import {AppError} from '../utils/response' ; 
import prisma from '../utils/prisma' ; 
import {Role} from '@prisma/client' ; 

export interface AuthRequest extends Request {
    user ?: {
        userId : string ; 
        email : string ; 
        role : string ;
    } ; 
}

export const authenticate = async(req : AuthRequest , _res : Response , next : NextFunction) : Promise<void> => {

    try{
        const authHeader = req.headers.authorization ; 

        if(!authHeader || !authHeader.startsWith('Bearer ')){
            throw new AppError('Authentication token required' , 401) ; 
        }

        const token = authHeader.split(' ')[1] ; 
        const payload = verifyAccessToken(token) ; 

        // verify user still exists
        const user = await prisma.user.findUnique({
            where : {id : payload.userId} , 
            select : {id : true , email : true , role : true} ,
        }) ; 

        if(!user){
            throw new AppError('User not found' , 401) ; 
        }

        req.user = {
            userId : user.id , 
            email : user.email , 
            role : user.role , 
        } ; 

        next() ;
    }catch(error : any) {
        if(error.name === 'JsonWebTokenError'){
            next(new AppError('Invalid token' , 401)) ;
        }else if(error.name === 'TokenExpiredError'){
            next(new AppError('Token expired' , 401)) ; 
        }else{
            next(error) ;
        }
    }
}

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

export const requireUser = (req : AuthRequest , _res : Response , next : NextFunction) : void => {
    if(!req.user){
        throw new AppError('Authentication required' , 401) ;
    }
    next() ;
}