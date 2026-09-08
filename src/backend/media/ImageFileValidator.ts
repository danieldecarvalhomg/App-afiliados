import { createHash } from 'node:crypto';

export const MAX_PRODUCT_IMAGE_BYTES = 8 * 1024 * 1024;
export interface ValidatedImage { mimeType: 'image/jpeg'|'image/png'|'image/webp'; width: number; height: number; contentHash: string; }
function jpegSize(bytes:Uint8Array){let offset=2;while(offset+8<bytes.length){if(bytes[offset]!==0xff){offset++;continue;}const marker=bytes[offset+1];const length=(bytes[offset+2]<<8)|bytes[offset+3];if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))return{height:(bytes[offset+5]<<8)|bytes[offset+6],width:(bytes[offset+7]<<8)|bytes[offset+8]};if(length<2)break;offset+=2+length;}throw new Error('INVALID_IMAGE_DIMENSIONS');}
export function validateImage(bytes:Uint8Array,_suppliedMime?:string|null):ValidatedImage{
  if(!bytes.length||bytes.length>MAX_PRODUCT_IMAGE_BYTES)throw new Error(bytes.length?'IMAGE_TOO_LARGE':'EMPTY_IMAGE');let mimeType:ValidatedImage['mimeType'];let width=0,height=0;
  if(bytes.length>=24&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47){mimeType='image/png';width=(bytes[16]*2**24)+(bytes[17]<<16)+(bytes[18]<<8)+bytes[19];height=(bytes[20]*2**24)+(bytes[21]<<16)+(bytes[22]<<8)+bytes[23];}
  else if(bytes.length>=12&&bytes[0]===0xff&&bytes[1]===0xd8){mimeType='image/jpeg';({width,height}=jpegSize(bytes));}
  else if(bytes.length>=30&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP'){mimeType='image/webp';const type=String.fromCharCode(...bytes.slice(12,16));if(type==='VP8X'){width=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16);height=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16);}else if(type==='VP8 '&&bytes[23]===0x9d&&bytes[24]===0x01&&bytes[25]===0x2a){width=(bytes[26]|(bytes[27]<<8))&0x3fff;height=(bytes[28]|(bytes[29]<<8))&0x3fff;}else if(type==='VP8L'&&bytes[20]===0x2f){width=1+(bytes[21]|((bytes[22]&0x3f)<<8));height=1+((bytes[22]>>6)|(bytes[23]<<2)|((bytes[24]&0x0f)<<10));}else throw new Error('INVALID_IMAGE_DIMENSIONS');}
  else throw new Error('INVALID_IMAGE_MIME');
  const declared=_suppliedMime?.split(';')[0].trim().toLowerCase();if(declared&&declared!=='application/octet-stream'&&declared!==mimeType)throw new Error('MIME_MISMATCH');
  if(width<1||height<1||width>20000||height>20000)throw new Error('INVALID_IMAGE_DIMENSIONS');return{mimeType,width,height,contentHash:createHash('sha256').update(bytes).digest('hex')};
}
