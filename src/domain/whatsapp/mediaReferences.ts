export type WhatsAppMediaReferenceStatus = 'pending'|'claimed'|'downloaded'|'expired'|'unavailable'|'failed';
export type WhatsAppRecoverableMediaType = 'image';

/** Payload mínimo e normalizado. Nunca contém proto RAW, auth state ou Signal state. */
export interface NormalizedMediaReference {
  mediaType: WhatsAppRecoverableMediaType;
  mediaKeyBase64: string;
  directPath: string | null;
  url: string | null;
}

export interface WhatsAppMediaReferenceRecord {
  id:string;userId:string;connectionId:string;capturedMessageId:string;
  externalGroupId:string;externalMessageId:string;mediaType:WhatsAppRecoverableMediaType;
  mimeType:string|null;encryptedPayload:string|null;status:WhatsAppMediaReferenceStatus;
  expiresAt:string;attemptCount:number;workerId:string|null;
}

export interface WhatsAppMediaReferenceRepository {
  upsert(input:{userId:string;connectionId:string;capturedMessageId:string;externalGroupId:string;externalMessageId:string;mediaType:WhatsAppRecoverableMediaType;mimeType:string|null;encryptedPayload:string;expiresAt:string}):Promise<string>;
  claimForCapture(input:{userId:string;capturedMessageId:string;workerId:string;staleBefore:string}):Promise<WhatsAppMediaReferenceRecord|null>;
  markDownloaded(reference:WhatsAppMediaReferenceRecord):Promise<void>;
  markFailure(reference:WhatsAppMediaReferenceRecord,input:{status:'pending'|'expired'|'unavailable'|'failed';errorCode:string;retryAt?:string|null}):Promise<void>;
  cleanup():Promise<number>;
  hasPending(userId:string,capturedMessageId:string):Promise<boolean>;
}

export interface WhatsAppReferenceDownloader {
  downloadReference(input:{connectionId:string;externalGroupId:string;externalMessageId:string;reference:NormalizedMediaReference}):Promise<{success:true;bytes:Uint8Array;mimeType:string|null}|{success:false;errorCode:string;transient:boolean}>;
}
