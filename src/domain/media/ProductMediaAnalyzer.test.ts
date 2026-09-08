import { describe, expect, it } from 'vitest';
import { ProductMediaAnalyzer } from './ProductMediaAnalyzer';

const analyze=(output:Record<string,unknown>)=>new ProductMediaAnalyzer({analyzeProductMedia:async()=>({output,provider:'fixture',model:'fixture-v1',processingMs:1})});
describe('ProductMediaAnalyzer',()=>{
  it('aprova estruturalmente uma foto limpa compatível sem extrair fatos comerciais',async()=>{const analyzer=analyze({classification:'clean_product_photo',hasTextOverlay:false,hasDetectedBranding:false,hasQrCode:false,hasWatermark:false,possibleConflictingCommercialText:false,productMatchConfidence:.95,productVisible:true,sharpnessScore:.9});const result=await analyzer.analyze({bytes:new Uint8Array([1]),mimeType:'image/png',productTitle:'Echo Dot',productCategory:'Eletrônicos'});expect(result.analysis.classification).toBe('clean_product_photo');expect(analyzer.needsReview(result.analysis)).toBe(false);expect(result.analysis).not.toHaveProperty('price');});
  it.each([
    ['arte promocional',{classification:'promotional_creative'}],['QR',{hasQrCode:true}],['branding concorrente',{hasDetectedBranding:true}],['watermark',{hasWatermark:true}],['produto incompatível',{productMatchConfidence:.2}],['texto comercial conflitante',{possibleConflictingCommercialText:true}],
  ])('envia %s para revisão',async(_label,patch)=>{const analyzer=analyze({classification:'clean_product_photo',hasTextOverlay:false,hasDetectedBranding:false,hasQrCode:false,hasWatermark:false,possibleConflictingCommercialText:false,productMatchConfidence:.9,productVisible:true,sharpnessScore:.8,...patch});const {analysis}=await analyzer.analyze({bytes:new Uint8Array([1]),mimeType:'image/png',productTitle:'Echo Dot',productCategory:null});expect(analyzer.needsReview(analysis)).toBe(true);});
});
