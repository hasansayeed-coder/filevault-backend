export class AppError extends Error {
    public statusCode : number ; 
    public isOperational : boolean ; 

    constructor(message : string , statusCode : number){
        super(message) ;
        this.statusCode = statusCode ; 
        this.isOperational = true ; 
        Error.captureStackTrace(this , this.constructor) ;
    }
}

export const successResponse = <T>(
    res : any , 
    data : T , 
    message = 'Success' , 
    statusCode = 200
) => {
    return res.status(statusCode).json({
        success : true , 
        message , 
        data , 
    });
};

export const errorResponse = (
    res : any , 
    message : string , 
    statusCode = 400 , 
    errors ?: any
) => {
    return res.status(statusCode).json({
        success : false , 
        message , 
        ...(errors && {errors}) ,
    }) ; 
};

export const paginatedResponse = <T>(
    res : any , 
    data : T[] , 
    total : number , 
    page : number , 
    limit : number , 
    message = 'Success'
) => {
    return res.status(200).json({
        success : true , 
        message , 
        data , 
        pagination : {
            total , 
            page , 
            limit , 
            totalPages : Math.ceil(total / limit) , 
            hasNext : page * limit < total , 
            hasPrev : page > 1 ,
        } , 
    });
} ;