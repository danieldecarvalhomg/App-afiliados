import { describe, expect, it } from 'vitest';
import { selectPrimaryProductLink } from './PrimaryProductLinkSelector';

describe('selectPrimaryProductLink', () => {
  it('prefere o link indicado como compra ao link de resgate de cupom', () => {
    const coupon = 'https://s.shopee.com.br/cupom';
    const product = 'https://s.shopee.com.br/produto?lp=aff';
    const text = `Resgate o cupom aqui:\n${coupon}\n\nCompre aqui: ${product}`;
    expect(selectPrimaryProductLink([coupon, product], text)).toBe(product);
  });

  it('não escolhe pela ordem quando existem vários links sem contexto suficiente', () => {
    expect(selectPrimaryProductLink(['https://example.com/a', 'https://example.com/b'], 'Links da oferta')).toBeNull();
  });

  it('aceita diretamente uma única URL válida', () => {
    expect(selectPrimaryProductLink(['https://example.com/produto'], 'Oferta especial')).toBe('https://example.com/produto');
  });

  it('não confunde menção distante a cupom com o link do produto na mesma linha', () => {
    const coupon = 'https://example.com/cupom';
    const product = 'https://example.com/produto';
    const text = `Cupom disponível\n${coupon}\nDetalhes importantes\nCompre o produto aqui: ${product}`;
    expect(selectPrimaryProductLink([coupon, product], text)).toBe(product);
  });
});
