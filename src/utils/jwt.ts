import jwt from 'jsonwebtoken' ; 

export interface TokenPayload {
    userId : string , 
    email : string , 
    role : string , 
}

export const generateAccessToken = (payload : TokenPayload , expiresIn = '15m') : string => {
    return jwt.sign(payload , process.env.JWT_SECRET! , {
        expiresIn , 
    } as jwt.SignOptions) ;
} ; 

export const generateRefreshToken = (payload : TokenPayload) : string => {
    return jwt.sign(payload , process.env.JWT_REFRESH_SECRET! , {
        expiresIn : process.env.JWT_REFRESH_EXPIRES_IN || '7d' , 
    } as jwt.SignOptions) ;
}

export const verifyAccessToken = (token : string) : TokenPayload => {
    return jwt.verify(token , process.env.JWT_SECRET!) as TokenPayload ; 
} ;

export const verifyRefreshToken = (token : string) : TokenPayload => {
    return jwt.verify(token , process.env.JWT_REFRESH_SECRET!) as TokenPayload
} ; 

export const generateEmailToken = () : string => {
    const crypto = require('crypto') ;
    return crypto.randomBytes(32).toString('hex') ;
}

