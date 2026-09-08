/**
 * AfiliHub — Contrato do Provider WhatsApp
 *
 * Define a interface que qualquer implementação de WhatsApp deve seguir.
 *
 * Arquitetura futura:
 *
 *   WhatsAppProvider (esta interface)
 *     ├── WhatsAppWebProvider  ← Bloco 2 (QR Code via whatsapp-web.js ou Baileys)
 *     └── MetaCloudProvider   ← Futuro (Meta Cloud API)
 *
 * O restante do sistema (Campanhas, Monitoramento, Filas) depende apenas
 * desta interface — nunca de uma implementação específica.
 *
 * A implementação atual é o WhatsAppWebProvider, inclusive para transporte de
 * saída normalizado sem expor tipos do SDK.
 */

import type { AppResult } from '../errors';
import type {
  WhatsAppConnectionStatus,
  WhatsAppGroupSendInput,
  WhatsAppGroupSendPreflightResult,
  WhatsAppGroupSendResult,
  WhatsAppProviderGroup,
} from './types';
import type { NormalizedMediaReference } from './mediaReferences';

export interface WhatsAppProvider {
  /**
   * Inicia o processo de conexão de uma conta.
   * Para WhatsAppWebProvider, isso gera um QR Code.
   */
  connect(): Promise<AppResult<void>>;

  /**
   * Encerra a sessão de uma conta conectada.
   */
  disconnect(): Promise<AppResult<void>>;

  /** Encerra recursos e opcionalmente revoga a sessão no WhatsApp. */
  destroy(revokeSession?: boolean): Promise<void>;

  /**
   * Retorna o status atual de uma conexão.
   */
  getConnectionStatus(): WhatsAppConnectionStatus;

  /**
   * Lista os grupos disponíveis na conta conectada.
   */
  getGroups(): Promise<AppResult<WhatsAppProviderGroup[]>>;

  /** Preflight ao vivo de existência, membership e permissão de escrita. */
  inspectGroupSend?(externalGroupId: string): Promise<WhatsAppGroupSendPreflightResult>;

  /** Envia conteúdo pronto sem alterar texto, link ou composição. */
  sendGroupMessage?(input: WhatsAppGroupSendInput): Promise<WhatsAppGroupSendResult>;

  /** Download seletivo por referência estável; objetos do SDK nunca saem do provider. */
  downloadMedia?(reference: { externalGroupId: string; externalMessageId: string }): Promise<{ bytes: Uint8Array; mimeType: string | null } | null>;
  downloadMediaReference?(reference: NormalizedMediaReference): Promise<{success:true;bytes:Uint8Array;mimeType:string|null}|{success:false;errorCode:string;transient:boolean}>;
}
