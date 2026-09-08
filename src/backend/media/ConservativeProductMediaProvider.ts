import type { ProductMediaAnalysisProvider } from '../../domain/media/ProductMediaAnalyzer';
/** Fallback seguro: sem visão configurada, nunca aprova imagem automaticamente. */
export class ConservativeProductMediaProvider implements ProductMediaAnalysisProvider {
  async analyzeProductMedia(){return{output:{classification:'unknown',hasTextOverlay:false,hasDetectedBranding:false,hasQrCode:false,hasWatermark:false,possibleConflictingCommercialText:false,productMatchConfidence:0,productVisible:false,sharpnessScore:0},provider:'deterministic',model:'none',processingMs:0};}
}
