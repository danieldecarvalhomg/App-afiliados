/**
 * AfiliHub — Contrato do Serviço de CTA
 *
 * O motor definitivo de geração de CTA será construído em bloco futuro.
 * Até lá, todas as operações retornam NOT_IMPLEMENTED.
 *
 * Arquitetura futura:
 *
 *   CtaService (este contrato)
 *     ↓
 *   AIProvider
 *     ├── GeminiProvider   ← Bloco futuro
 *     └── outros providers
 *
 * O CtaService nunca acoplará diretamente a um provider de IA específico.
 */

import type { AppResult } from '../errors';
import type { CtaProfile, CtaGenerateParams, CtaHistoryEntry, CtaConversationMessage } from './types';

export interface CtaService {
  /**
   * Gera uma CTA com base no perfil do usuário e no contexto da oferta.
   * Retorna NOT_IMPLEMENTED até implementação definitiva.
   */
  generate(params: CtaGenerateParams): Promise<AppResult<string>>;

  /**
   * Retorna o perfil de CTA do usuário.
   */
  getProfile(userId: string): Promise<AppResult<CtaProfile>>;

  /**
   * Atualiza as preferências do perfil de CTA.
   */
  updateProfile(userId: string, updates: Partial<Omit<CtaProfile, 'id' | 'userId' | 'createdAt'>>): Promise<AppResult<CtaProfile>>;

  /**
   * Processa uma instrução de texto do usuário para atualizar o perfil.
   * (Funcionalidade de chat futuro)
   * Retorna NOT_IMPLEMENTED até implementação definitiva.
   */
  processInstruction(userId: string, instruction: string): Promise<AppResult<void>>;

  /**
   * Retorna o histórico de CTAs geradas pelo usuário.
   */
  getHistory(userId: string): Promise<AppResult<CtaHistoryEntry[]>>;

  /**
   * Retorna as mensagens da conversa de configuração de CTA.
   */
  getConversation(userId: string): Promise<AppResult<CtaConversationMessage[]>>;
}
