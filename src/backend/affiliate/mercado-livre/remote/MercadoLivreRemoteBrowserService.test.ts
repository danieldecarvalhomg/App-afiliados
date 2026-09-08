import { describe, expect, it } from 'vitest';
import {
  extractMercadoLivreGeneratedUrl,
  mapMercadoLivreAffiliateHubCard,
  mercadoLivreGenerationPriority,
  mercadoLivreGenerationQueueDelay,
  selectMercadoLivreTrackingTag,
} from './MercadoLivreRemoteBrowserService';

describe('MercadoLivreRemoteBrowserService helpers', () => {
  it('seleciona o campo tag atualmente retornado pelo portal', () => {
    expect(selectMercadoLivreTrackingTag([
      { tag: 'secundaria', in_use: false },
      { tag: 'principal', in_use: true },
    ])).toBe('principal');
  });

  it('preserva compatibilidade com id/name e respeita a etiqueta solicitada', () => {
    expect(selectMercadoLivreTrackingTag({ tags: [{ id: 'um' }, { name: 'dois' }] }, 'dois')).toBe('dois');
  });

  it('extrai a URL do formato urls[] usado atualmente', () => {
    expect(extractMercadoLivreGeneratedUrl({ urls: [{ short_url: 'https://meli.la/abc123' }] }))
      .toBe('https://meli.la/abc123');
  });

  it('preserva os formatos legados results/data e long_url', () => {
    expect(extractMercadoLivreGeneratedUrl({ results: [{ long_url: 'https://mercadolivre.com.br/x' }] }))
      .toBe('https://mercadolivre.com.br/x');
  });

  it('não adiciona espera perceptível às conversões manuais', () => {
    expect(mercadoLivreGenerationPriority('promofy_manual')).toBe('interactive');
    expect(mercadoLivreGenerationQueueDelay('promofy_manual')).toBe(0);
  });

  it('agrupa somente fluxos automáticos dentro da janela configurada', () => {
    const previous=process.env.ML_REMOTE_BACKGROUND_BATCH_MS;
    process.env.ML_REMOTE_BACKGROUND_BATCH_MS='180';
    try {
      expect(mercadoLivreGenerationPriority('promofy_monitor')).toBe('background');
      expect(mercadoLivreGenerationPriority('promofy_radar')).toBe('background');
      expect(mercadoLivreGenerationQueueDelay('promofy_monitor')).toBe(180);
    } finally {
      if(previous===undefined)delete process.env.ML_REMOTE_BACKGROUND_BATCH_MS;
      else process.env.ML_REMOTE_BACKGROUND_BATCH_MS=previous;
    }
  });

  it('permite desligar a otimização sem alterar a conversão', () => {
    const previous=process.env.ML_REMOTE_OPTIMIZATIONS_ENABLED;
    process.env.ML_REMOTE_OPTIMIZATIONS_ENABLED='false';
    try { expect(mercadoLivreGenerationQueueDelay('promofy_monitor')).toBe(0); }
    finally {
      if(previous===undefined)delete process.env.ML_REMOTE_OPTIMIZATIONS_ENABLED;
      else process.env.ML_REMOTE_OPTIMIZATIONS_ENABLED=previous;
    }
  });

  it('normaliza um card real da Central de Afiliados para o Radar', () => {
    const deal = mapMercadoLivreAffiliateHubCard({
      title: 'Creatina Monohidratada',
      productUrl: 'https://www.mercadolivre.com.br/creatina/p/MLB19603205?wid=MLB5872060016&sid=affiliates&matt_word=concorrente',
      imageUrl: 'https://http2.mlstatic.com/produto.webp',
      currentPriceText: 'R$ 39,90', originalPriceText: 'R$ 64,90', discountText: '38% OFF',
      commissionText: 'GANHOS 16%', ratingText: 'Classificação 4.9 de 5 estrelas',
      salesText: '+1M vendidos', bodyText: 'Frete grátis · Cupom disponível',
    }, '2026-08-30T12:00:00.000Z');
    expect(deal).toMatchObject({ marketplace: 'mercado_livre', externalProductId: 'MLB5872060016',
      price: 39.9, originalPrice: 64.9, discountPercent: 38, commissionRate: 16,
      salesCount: 1_000_000, rating: 4.9, freeShipping: true, coupon: 'Disponível' });
    expect(deal?.productUrl).toBe('https://www.mercadolivre.com.br/creatina/p/MLB19603205?wid=MLB5872060016');
  });
});
