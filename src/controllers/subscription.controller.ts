import {Request , Response , NextFunction} from 'express' ; 
import prisma from '../utils/prisma' ; 
import{AppError , successResponse} from '../utils/response' ; 
import {getUserStorageStats} from "../services/subscription.service" ; 
import {AuthRequest} from "../middleware/auth"  ;


export const getUserSubscriptions = async(req : AuthRequest , res : Response , next : NextFunction) : Promise<void> => {

    try{
        const subscriptions = await prisma.userSubscription.findMany({
            where : {userId : req.user!.userId} , 
            include : {package : true} , 
            orderBy : {startDate : 'desc'} ,
        }) ;

        successResponse(res , subscriptions , 'Subscription history retrieved') ; 

    }catch(error){
        next(error) ;
    }
}

export const getActiveSubscription = async(req : AuthRequest , res : Response , next : NextFunction) : Promise<void> => {

    try{
        const subscription = await prisma.userSubscription.findFirst({
            where : {
                userId : req.user!.userId , isActive : true , 
            }  ,
            include : {
                package : true
            } , 
            orderBy : {
                startDate : 'desc' 
            } ,
        }) ; 

        const stats = await getUserStorageStats(req.user!.userId) ;
        successResponse(res , {subscription , stats} , 'Active subscription retrieved') ;

    }catch(error){
        next(error) ;
    }

}

export const selectPackage = async(req : AuthRequest , res : Response , next : NextFunction) : Promise<void> => {

    try{

        const {packageId} = req.body ; 
        const userId = req.user!.userId ; 

        const pkg = await prisma.subscriptionPackage.findUnique({
            where : {
                id : packageId
            }
        }) ; 

        if(!pkg || !pkg.isActive)throw new AppError('Package not found or inactive' , 404) ;

        await prisma.userSubscription.updateMany({
            where : {userId , isActive : true} , 
            data : {isActive : false , endDate : new Date()} ,                     
        });

        const newSub = await prisma.userSubscription.create({
            data : {userId , packageId , isActive : true} , 
            include : {package : true} ,
        }) ; 

        successResponse(res , newSub , `Successfully subscribed to ${pkg.displayName} plan` , 201) ; 
    }catch(error){
        next(error) ;
    }
}

export const getStorageStats = async(req : AuthRequest , res : Response , next : NextFunction) : Promise<void> => {

    try{
        const stats = await getUserStorageStats(req.user!.userId) ; 
        successResponse(res , stats , 'Storage stats retrieved') ; 
    }catch(error){
        next(error) ;
    }
} ;