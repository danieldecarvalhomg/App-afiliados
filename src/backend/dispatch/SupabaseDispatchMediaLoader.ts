import type { SupabaseClient } from '@supabase/supabase-js';
import type { DispatchMediaLoader } from '../../domain/dispatch/DispatchRepository';
import type { ProductMediaStorage } from '../../domain/media/ProductMediaRepository';
import { validateImage } from '../media/ImageFileValidator';

const INVALID_MEDIA_ERRORS = /MEDIA_INVALID|EMPTY_IMAGE|IMAGE_TOO_LARGE|INVALID_IMAGE|INVALID_IMAGE_MIME|INVALID_IMAGE_DIMENSIONS|MIME_MISMATCH/i;

/** Resolve asset_id no backend e somente então acessa o bucket privado. */
export class SupabaseDispatchMediaLoader implements DispatchMediaLoader {
  constructor(
    private readonly db: SupabaseClient,
    private readonly storage: ProductMediaStorage,
  ) {}

  async load(userId: string, assetId: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
    const { data, error } = await this.db
      .from('product_media_assets')
      .select('id,user_id,analysis_status,storage_path,mime_type')
      .eq('id', assetId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error('MEDIA_STORAGE_TEMPORARILY_UNAVAILABLE');
    // O mesmo código cobre inexistência e tentativa cross-user sem revelar o asset.
    if (!data || data.id !== assetId || data.user_id !== userId) {
      throw new Error('MEDIA_ASSET_NOT_FOUND');
    }
    if (data.analysis_status !== 'completed' || typeof data.storage_path !== 'string' || !data.storage_path) {
      throw new Error('MEDIA_INVALID');
    }
    const storagePath = data.storage_path.replace(/\\/g, '/');
    if (!storagePath.startsWith(`${userId}/`) || storagePath.split('/').includes('..')) {
      throw new Error('MEDIA_INVALID');
    }

    let stored: { bytes: Uint8Array; mimeType: string };
    try {
      stored = await this.storage.read(storagePath);
    } catch (readError) {
      const message = readError instanceof Error ? readError.message : '';
      if (INVALID_MEDIA_ERRORS.test(message)) throw new Error('MEDIA_INVALID');
      throw new Error('MEDIA_STORAGE_TEMPORARILY_UNAVAILABLE');
    }
    let validatedMimeType: string;
    try {
      validatedMimeType = validateImage(stored.bytes, stored.mimeType).mimeType;
    } catch {
      throw new Error('MEDIA_INVALID');
    }
    if ((data.mime_type && data.mime_type !== validatedMimeType)) {
      throw new Error('MEDIA_INVALID');
    }
    return { bytes: stored.bytes, mimeType: validatedMimeType };
  }
}
