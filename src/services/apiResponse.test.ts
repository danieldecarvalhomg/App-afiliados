import { describe, expect, it } from 'vitest';
import { ApiResponseFormatError, readJsonResponse } from './apiResponse';

describe('readJsonResponse', () => {
  it('retorna respostas JSON válidas', async () => {
    const response = new Response(JSON.stringify({ success: true }), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });

    await expect(readJsonResponse(response)).resolves.toEqual({ success: true });
  });

  it('rejeita HTML devolvido pelo fallback da SPA com mensagem segura', async () => {
    const response = new Response('<!doctype html><html></html>', {
      headers: { 'content-type': 'text/html' },
    });

    await expect(readJsonResponse(response)).rejects.toBeInstanceOf(ApiResponseFormatError);
    await expect(readJsonResponse(new Response('<!doctype html>', {
      headers: { 'content-type': 'text/html' },
    }))).rejects.toThrow('O backend não respondeu corretamente.');
  });
});
