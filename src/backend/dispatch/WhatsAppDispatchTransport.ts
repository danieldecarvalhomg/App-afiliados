import type { DispatchTransport } from "../../domain/dispatch/DispatchRepository";
import type {
  DispatchPayload,
  DispatchTransportResult,
} from "../../domain/dispatch/types";
import type { WhatsAppOutboundPayload } from "../../domain/whatsapp/types";
import { validateImage } from "../media/ImageFileValidator";
import type { WhatsAppRepository } from "../whatsapp/repository";
import { WhatsAppConnectionManager } from "../whatsapp/WhatsAppConnectionManager";

type WhatsAppDispatchDirectory = Pick<
  WhatsAppRepository,
  "getConnection" | "listGroups"
>;

function failed(
  errorCode: string,
  transient = false,
  uncertain = false,
): DispatchTransportResult {
  return {
    success: false,
    errorCode,
    transient,
    ...(uncertain ? { uncertain: true } : {}),
  };
}

function normalizePayload(
  payload: DispatchPayload,
): WhatsAppOutboundPayload | null {
  if (payload.type === "text") {
    return payload.text.trim()
      ? {
          type: "text",
          text: payload.text,
          affiliateUrl: payload.affiliateUrl,
          previewSourceUrl: payload.previewSourceUrl,
          previewDescription: payload.previewDescription,
          productTitle: payload.productTitle,
          watermark: payload.watermark,
        }
      : null;
  }
  try {
    const validated = validateImage(payload.image, payload.mimeType);
    return {
      type: "image",
      image: payload.image,
      mimeType: validated.mimeType,
      caption: payload.caption,
    };
  } catch {
    return null;
  }
}

/**
 * Adapter usado pelo worker. Ownership e grupo sincronizado são verificados
 * antes de qualquer chamada ao provider; nenhum JID arbitrário vindo da UI é
 * encaminhado ao WhatsApp.
 */
export class WhatsAppDispatchTransport implements DispatchTransport {
  constructor(
    private readonly directory: WhatsAppDispatchDirectory,
    private readonly manager: WhatsAppConnectionManager,
  ) {}

  async send(input: {
    userId: string;
    connectionId: string;
    externalGroupId: string;
    payload: DispatchPayload;
    idempotencyKey: string;
  }): Promise<DispatchTransportResult> {
    const payload = normalizePayload(input.payload);
    if (!payload)
      return failed(
        input.payload.type === "image"
          ? "WHATSAPP_MEDIA_INVALID"
          : "WHATSAPP_INVALID_PAYLOAD",
      );

    try {
      const connection = await this.directory.getConnection(input.connectionId);
      if (!connection) return failed("WHATSAPP_CONNECTION_NOT_FOUND");
      if (connection.userId !== input.userId)
        return failed("WHATSAPP_CONNECTION_FORBIDDEN");

      const groups = await this.directory.listGroups(
        input.userId,
        input.connectionId,
      );
      const group = groups.find(
        (candidate) => candidate.externalGroupId === input.externalGroupId,
      );
      if (!group) return failed("WHATSAPP_GROUP_NOT_FOUND");
      if (
        group.connectionId !== input.connectionId ||
        group.userId !== input.userId
      ) {
        return failed("WHATSAPP_GROUP_FORBIDDEN");
      }
      if (group.syncStatus !== "active")
        return failed("WHATSAPP_GROUP_UNAVAILABLE");
    } catch {
      return failed(
        "WHATSAPP_DISPATCH_DIRECTORY_TEMPORARILY_UNAVAILABLE",
        true,
      );
    }

    try {
      const result = await this.manager.sendGroupMessage({
        connectionId: input.connectionId,
        externalGroupId: input.externalGroupId,
        payload,
        idempotencyKey: input.idempotencyKey,
      });
      if (!("errorCode" in result)) return result;
      return failed(
        result.errorCode,
        result.classification === "transient",
        result.classification === "uncertain",
      );
    } catch {
      // A exceção pode ter ocorrido depois da chamada externa. Não transformar
      // em retry automático sem confirmação do provider.
      return failed("WHATSAPP_SEND_RESULT_UNKNOWN", false, true);
    }
  }
}
