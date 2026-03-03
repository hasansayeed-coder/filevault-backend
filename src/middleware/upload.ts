import multer , {FileFilterCallback} from "multer";
import path from 'path' ; 
import fs from 'fs' ; 
import { Request } from "express";
import {v4 as uuidv4} from 'uuid' ; 

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads' ; 

if(!fs.existsSync(UPLOAD_DIR)){
    fs.mkdirSync(UPLOAD_DIR , {recursive : true}) ; 
}

const storage = multer.diskStorage({
    destination : (_req : Request , _file : Express.Multer.File , cb) => {
        cb(null , UPLOAD_DIR) ; 
    } , 
    filename : (_req : Request , file : Express.Multer.File , cb) => {
        const ext = path.extname(file.originalname) ; 
        cb(null ,  `${uuidv4()}${ext}`)
    } , 
}) ; 

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  const allowedMimes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp',
    'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/ogg',
    'application/pdf',
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/flac', 'audio/webm',
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`));
  }
};

const MAX_SERVER_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB || '500')) * 1024 * 1024;


export const upload = multer({
    storage , fileFilter , limits : {
        fileSize : MAX_SERVER_SIZE , 
        files : 1 , 
    }
})

export const deleteFile = (filePath : string) : void => {
    const fullPath = path.resolve(filePath) ; 

    if(fs.existsSync(fullPath)){
        fs.unlinkSync(fullPath) ;
    }
}