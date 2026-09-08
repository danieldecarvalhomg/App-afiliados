import type{WhatsAppConnection,WhatsAppGroup}from'../whatsapp/types';
import type{Campaign,CampaignCollection,CampaignStatus,ClaimedDelivery,CreateCampaignCollectionInput,CreateCampaignInput,CtaDispatchSource,DeliveryContext,DispatchContentSnapshot,QueueDelivery,QueueItem}from'./types';

export interface DispatchRepository{
  listCampaignCollections(userId:string):Promise<CampaignCollection[]>;
  getCampaignCollection(userId:string,id:string):Promise<CampaignCollection|null>;
  createCampaignCollection(userId:string,input:CreateCampaignCollectionInput):Promise<CampaignCollection>;
  updateCampaignCollection(userId:string,id:string,input:CreateCampaignCollectionInput):Promise<CampaignCollection|null>;
  listCampaigns(userId:string):Promise<Campaign[]>;
  getCampaign(userId:string,id:string):Promise<Campaign|null>;
  createCampaign(userId:string,input:CreateCampaignInput&{defaultIntervalSeconds:number;timezone:string}):Promise<Campaign>;
  updateCampaign(userId:string,id:string,input:Partial<CreateCampaignInput>):Promise<Campaign|null>;
  setCampaignStatus(userId:string,id:string,status:CampaignStatus):Promise<Campaign|null>;
  cancelCampaign(userId:string,id:string):Promise<Campaign|null>;
  getConnection(userId:string,id:string):Promise<WhatsAppConnection|null>;
  getGroups(userId:string,connectionId:string,ids?:string[]):Promise<WhatsAppGroup[]>;
  getCtaDispatchSource(userId:string,generationId:string):Promise<CtaDispatchSource|null>;
  ownsMediaAsset(userId:string,assetId:string):Promise<boolean>;
  enqueue(userId:string,input:{campaignId:string;whatsappGroupId:string|null;sourceType:string;sourceReferenceId:string|null;snapshot:DispatchContentSnapshot;scheduledAt:string;placement:'end'|'next';idempotencyKey:string}):Promise<QueueItem>;
  listQueue(userId:string,status?:string,campaignId?:string):Promise<QueueItem[]>;
  getQueueItem(userId:string,id:string):Promise<QueueItem|null>;
  listDeliveries(userId:string,itemId:string):Promise<QueueDelivery[]>;
  setQueuePaused(userId:string,id:string,paused:boolean):Promise<QueueItem|null>;
  cancelQueueItem(userId:string,id:string):Promise<QueueItem|null>;
  retryQueueItem(userId:string,id:string,includeUncertain:boolean):Promise<QueueItem|null>;
  reorderQueueItems(userId:string,campaignId:string,itemIds:string[]):Promise<QueueItem[]>;
  requestQueueNext(userId:string,campaignId:string):Promise<QueueItem|null>;
  retryDelivery(userId:string,deliveryId:string,includeUncertain:boolean):Promise<QueueDelivery|null>;
  claimNext(workerId:string,staleBefore:string):Promise<ClaimedDelivery|null>;
  loadDeliveryContext(deliveryId:string):Promise<DeliveryContext|null>;
  markSending(deliveryId:string,workerId:string):Promise<boolean>;
  markSent(deliveryId:string,workerId:string,externalMessageId:string):Promise<void>;
  markRetry(deliveryId:string,workerId:string,errorCode:string,nextAttemptAt:string):Promise<void>;
  markFailed(deliveryId:string,workerId:string,errorCode:string):Promise<void>;
  markUncertain(deliveryId:string,workerId:string,errorCode:string):Promise<void>;
  deferDisconnected(deliveryId:string,workerId:string):Promise<void>;
  recoverStale(staleBefore:string):Promise<{recovered:number;uncertain:number}>;
  recordEvent(userId:string,eventType:string,payload:Record<string,unknown>):Promise<void>;
}

export interface DispatchMediaLoader{load(userId:string,assetId:string):Promise<{bytes:Uint8Array;mimeType:string}>;}
export interface DispatchTransport{send(input:{userId:string;connectionId:string;externalGroupId:string;payload:import('./types').DispatchPayload;idempotencyKey:string}):Promise<import('./types').DispatchTransportResult>;}
