import { describe, expect, it, vi } from "vitest";
import { CampaignService } from "./CampaignService";
import { QueueService } from "./QueueService";
import { WhatsAppDispatchWorker } from "./WhatsAppDispatchWorker";
import type { DispatchRepository } from "./DispatchRepository";
import type { Campaign, QueueDelivery, QueueItem } from "./types";

const campaign: Campaign = {
  id: "campaign-1",
  userId: "user-a",
  name: "Ofertas",
  connectionId: "connection-a",
  connectionLabel: "Principal",
  status: "active",
  defaultIntervalSeconds: 30,
  intervalBetweenItemsSeconds: 30,
  timezone: "America/Sao_Paulo",
  mode: "continuous",
  allowedStartTime: "00:00",
  allowedEndTime: "23:59",
  allowedDays: [1, 2, 3, 4, 5, 6, 7],
  fixedSlots: [],
  groups: [
    {
      id: "destination-1",
      campaignId: "campaign-1",
      userId: "user-a",
      whatsappGroupId: "group-a",
      name: "Promoções",
      externalGroupId: "120@g.us",
      participantsCount: 10,
      syncStatus: "active",
      createdAt: "2026-08-21T00:00:00.000Z",
    },
  ],
  pendingItems: 0,
  historyItems: 0,
  currentItemId: null,
  nextExecutionAt: null,
  lastItemCompletedAt: null,
  lastDispatchedAt: null,
  createdAt: "2026-08-21T00:00:00.000Z",
  updatedAt: "2026-08-21T00:00:00.000Z",
};

const delivery: QueueDelivery = {
  id: "delivery-1",
  userId: "user-a",
  queueItemId: "item-1",
  campaignId: campaign.id,
  connectionId: campaign.connectionId,
  whatsappGroupId: "group-a",
  groupName: "Promoções",
  externalGroupId: "120@g.us",
  status: "claimed",
  scheduledAt: "2026-08-21T00:00:00.000Z",
  nextAttemptAt: null,
  attemptCount: 0,
  lastErrorCode: null,
  lastErrorAt: null,
  claimedAt: "2026-08-21T00:00:00.000Z",
  claimedBy: "worker",
  sendingStartedAt: null,
  sentAt: null,
  externalMessageId: null,
  createdAt: "2026-08-21T00:00:00.000Z",
  updatedAt: "2026-08-21T00:00:00.000Z",
};

const item = (overrides: Partial<QueueItem> = {}): QueueItem => ({
  id: "item-1",
  userId: "user-a",
  campaignId: campaign.id,
  campaignName: campaign.name,
  connectionId: campaign.connectionId,
  connectionLabel: campaign.connectionLabel,
  sourceType: "cta_generation",
  sourceReferenceId: "generation-1",
  contentSnapshot: {
    text: "Oferta real\nhttps://s.shopee.com.br/affiliate",
    caption: null,
    primaryMediaAssetId: null,
    hasMedia: false,
    watermark: {
      enabled: false,
      text: "",
      position: "bottom-right",
      opacity: 0.72,
    },
    affiliateUrl: "https://s.shopee.com.br/affiliate",
    sourceUrl: "https://shopee.com.br/product/123456/987654",
    productId: "product-1",
    productTitle: "Echo Dot",
    ctaGenerationId: "generation-1",
    templateId: "template-1",
    templateVersion: 2,
    generatedAt: "2026-08-21T00:00:00.000Z",
  },
  destinationSnapshot: [
    {
      whatsappGroupId: "group-a",
      name: "Promoções",
      externalGroupId: "120@g.us",
    },
  ],
  queueConfigSnapshot: {
    mode: "continuous",
    intervalBetweenItemsSeconds: 30,
    timezone: "America/Sao_Paulo",
    allowedStartTime: "00:00",
    allowedEndTime: "23:59",
    allowedDays: [1, 2, 3, 4, 5, 6, 7],
    fixedSlots: [],
  },
  position: 1,
  nextExecutionAt: "2026-08-21T00:00:00.000Z",
  manualRequestedAt: null,
  startedAt: null,
  completedAt: null,
  scheduledAt: "2026-08-21T00:00:00.000Z",
  status: "queued",
  idempotencyKey: "key-1",
  progress: { total: 1, sent: 0, failed: 0, pending: 1, uncertain: 0 },
  createdAt: "2026-08-21T00:00:00.000Z",
  updatedAt: "2026-08-21T00:00:00.000Z",
  ...overrides,
});

function queueRepository() {
  const stored = item();
  return {
    getCampaign: vi.fn(async () => campaign),
    getCtaDispatchSource: vi.fn(async () => ({
      generationId: "generation-1",
      productId: "product-1",
      productTitle: "Echo Dot",
      finalText: "Oferta real\nhttps://s.shopee.com.br/affiliate",
      publishable: true,
      affiliateUrl: "https://s.shopee.com.br/affiliate",
      sourceUrl: "https://shopee.com.br/product/123456/987654",
      primaryMediaAssetId: null as string | null,
      templateId: "template-1",
      templateVersion: 2,
      presentation: {
        defaultCaption: "",
        watermark: {
          enabled: false,
          text: "",
          position: "bottom-right" as const,
          opacity: 0.72,
        },
      },
      generatedAt: "2026-08-21T00:00:00.000Z",
    })),
    ownsMediaAsset: vi.fn(async () => true),
    listQueue: vi.fn(async () => []),
    enqueue: vi.fn(async (_userId, input) => ({
      ...stored,
      contentSnapshot: input.snapshot,
      scheduledAt: input.scheduledAt,
      idempotencyKey: input.idempotencyKey,
    })),
    recordEvent: vi.fn(async () => undefined),
  };
}

describe("CampaignService", () => {
  it("aceita apenas grupos ativos pertencentes à conexão do usuário", async () => {
    const repository = {
      getConnection: vi.fn(async () => ({
        id: "connection-a",
        userId: "user-a",
      })),
      getGroups: vi.fn(async () => []),
      createCampaign: vi.fn(),
    };
    const service = new CampaignService(
      repository as unknown as DispatchRepository,
    );
    await expect(
      service.create("user-a", {
        name: "Campanha",
        connectionId: "connection-a",
        groupIds: ["group-from-b"],
      }),
    ).rejects.toThrow("CAMPAIGN_GROUP_FORBIDDEN");
    expect(repository.createCampaign).not.toHaveBeenCalled();
  });
});

describe("QueueService snapshots", () => {
  it("carrega CTA publicável no backend e preserva o texto final sem alteração", async () => {
    const repository = queueRepository();
    const service = new QueueService(
      repository as unknown as DispatchRepository,
    );
    const input = {
      campaignId: campaign.id,
      sourceType: "cta_generation" as const,
      sourceReferenceId: "generation-1",
      scheduledAt: "2026-08-21T10:00:00.000Z",
      idempotencyKey: "request-1",
    };
    const preview = await service.preview("user-a", input);
    const created = await service.create("user-a", {
      ...input,
      expectedSnapshotHash: preview.snapshotHash,
    });
    expect(created.contentSnapshot.text).toBe(
      "Oferta real\nhttps://s.shopee.com.br/affiliate",
    );
    expect(repository.getCtaDispatchSource).toHaveBeenCalledWith(
      "user-a",
      "generation-1",
    );
    expect(repository.enqueue).toHaveBeenCalledWith(
      "user-a",
      expect.objectContaining({ snapshot: preview.snapshot }),
    );
  });

  it("não aplica descrição de preview como legenda de foto escolhida no app", async () => {
    const repository = queueRepository();
    repository.getCtaDispatchSource.mockResolvedValue({
      ...(await repository.getCtaDispatchSource()),
      primaryMediaAssetId: "asset-from-url",
    });
    const service = new QueueService(
      repository as unknown as DispatchRepository,
    );
    const preview = await service.preview("user-a", {
      campaignId: campaign.id,
      sourceType: "cta_generation",
      sourceReferenceId: "generation-1",
      captionMode: "custom",
      caption: "@minhaloja\nLink na mensagem",
      watermark: {
        enabled: true,
        text: "@minhaloja",
        position: "bottom-left",
        opacity: 0.6,
      },
      scheduledAt: "2026-08-21T10:00:00.000Z",
      idempotencyKey: "caption-1",
    });
    expect(preview.snapshot.caption).toBeNull();
    expect(preview.snapshot.watermark).toEqual({
      enabled: true,
      text: "@minhaloja",
      position: "bottom-left",
      opacity: 0.6,
    });
  });

  it("congela a descrição personalizada para o cartão de prévia do link", async () => {
    const repository = queueRepository();
    const service = new QueueService(
      repository as unknown as DispatchRepository,
    );
    const preview = await service.preview("user-a", {
      campaignId: campaign.id,
      sourceType: "cta_generation",
      sourceReferenceId: "generation-1",
      captionMode: "custom",
      caption: "@minhaloja",
      scheduledAt: "2026-08-21T10:00:00.000Z",
      idempotencyKey: "preview-description-1",
    });
    expect(preview.snapshot.caption).toBe("@minhaloja");
  });

  it("restringe o snapshot e a entrega a um grupo da campanha", async () => {
    const repository = queueRepository();
    repository.getCampaign.mockResolvedValue({
      ...campaign,
      groups: [
        ...campaign.groups,
        {
          ...campaign.groups[0],
          id: "destination-2",
          whatsappGroupId: "group-b",
          name: "Achadinhos",
          externalGroupId: "121@g.us",
        },
      ],
    });
    const service = new QueueService(
      repository as unknown as DispatchRepository,
    );
    const input = {
      campaignId: campaign.id,
      whatsappGroupId: "group-b",
      sourceType: "cta_generation" as const,
      sourceReferenceId: "generation-1",
      scheduledAt: "2026-08-21T10:00:00.000Z",
      idempotencyKey: "single-group-1",
    };
    const preview = await service.preview("user-a", input);
    expect(preview.destinations).toEqual([
      expect.objectContaining({ whatsappGroupId: "group-b", name: "Achadinhos" }),
    ]);
    await service.create("user-a", {
      ...input,
      expectedSnapshotHash: preview.snapshotHash,
    });
    expect(repository.enqueue).toHaveBeenCalledWith(
      "user-a",
      expect.objectContaining({ whatsappGroupId: "group-b" }),
    );
  });

  it("impede escolher um grupo que não pertence à campanha", async () => {
    const repository = queueRepository();
    const service = new QueueService(
      repository as unknown as DispatchRepository,
    );
    await expect(
      service.preview("user-a", {
        campaignId: campaign.id,
        whatsappGroupId: "group-from-another-campaign",
        sourceType: "cta_generation",
        sourceReferenceId: "generation-1",
        idempotencyKey: "invalid-group-1",
      }),
    ).rejects.toThrow("QUEUE_GROUP_NOT_IN_CAMPAIGN");
  });

  it("bloqueia CTA não publicável e detecta mudança entre preview e confirmação", async () => {
    const repository = queueRepository();
    repository.getCtaDispatchSource.mockResolvedValueOnce({
      ...(await repository.getCtaDispatchSource()),
      publishable: false,
    });
    const service = new QueueService(
      repository as unknown as DispatchRepository,
    );
    await expect(
      service.preview("user-a", {
        campaignId: campaign.id,
        sourceType: "cta_generation",
        sourceReferenceId: "generation-1",
        idempotencyKey: "x",
      }),
    ).rejects.toThrow("CTA_NOT_PUBLISHABLE");
    repository.getCtaDispatchSource.mockResolvedValue({
      ...(await queueRepository().getCtaDispatchSource()),
      publishable: true,
    });
    await expect(
      service.create("user-a", {
        campaignId: campaign.id,
        sourceType: "cta_generation",
        sourceReferenceId: "generation-1",
        scheduledAt: "2026-08-21T10:00:00.000Z",
        idempotencyKey: "x",
        expectedSnapshotHash: "outro-hash",
      }),
    ).rejects.toThrow("QUEUE_SNAPSHOT_CHANGED");
  });

  it("mantém preview manual determinístico quando a data confirmada é reutilizada", async () => {
    const repository = queueRepository();
    const service = new QueueService(
      repository as unknown as DispatchRepository,
    );
    const input = {
      campaignId: campaign.id,
      sourceType: "manual" as const,
      text: "Mensagem manual",
      scheduledAt: "2026-08-21T12:00:00.000Z",
      idempotencyKey: "manual-1",
    };
    const first = await service.preview("user-a", input);
    const second = await service.preview("user-a", input);
    expect(first.snapshotHash).toBe(second.snapshotHash);
    await expect(
      service.create("user-a", {
        ...input,
        expectedSnapshotHash: first.snapshotHash,
      }),
    ).resolves.toBeTruthy();
  });
});

function workerRepository(attemptCount = 0) {
  const claimed = { ...delivery, attemptCount };
  const queueItem = item();
  return {
    claimNext: vi.fn().mockResolvedValueOnce(claimed).mockResolvedValue(null),
    loadDeliveryContext: vi.fn(async () => ({
      delivery: claimed,
      campaign,
      item: queueItem,
      connectionStatus: "connected",
      groupSyncStatus: "active",
    })),
    getQueueItem: vi.fn(async () => queueItem),
    markSending: vi.fn(async () => true),
    markSent: vi.fn(async () => undefined),
    markRetry: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
    markUncertain: vi.fn(async () => undefined),
    deferDisconnected: vi.fn(async () => undefined),
    recoverStale: vi.fn(async () => ({ recovered: 0, uncertain: 0 })),
    recordEvent: vi.fn(async () => undefined),
  };
}

describe("WhatsAppDispatchWorker", () => {
  it("aguarda reconexão sem consumir tentativa e sem usar fallback", async () => {
    const repository = workerRepository();
    repository.loadDeliveryContext.mockResolvedValue({
      delivery,
      campaign,
      item: item(),
      connectionStatus: "disconnected",
      groupSyncStatus: "active",
    });
    const transport = { send: vi.fn() };
    await new WhatsAppDispatchWorker(
      repository as unknown as DispatchRepository,
      transport,
      { load: vi.fn() },
    ).processOne();
    expect(repository.deferDisconnected).toHaveBeenCalled();
    expect(transport.send).not.toHaveBeenCalled();
  });
  it("marca sent somente com confirmação e external_message_id real", async () => {
    const repository = workerRepository();
    const transport = {
      send: vi.fn(async () => ({
        success: true as const,
        externalMessageId: "wamid.real",
      })),
    };
    const worker = new WhatsAppDispatchWorker(
      repository as unknown as DispatchRepository,
      transport,
      { load: vi.fn() },
    );
    expect(await worker.processOne()).toBe(true);
    expect(repository.markSent).toHaveBeenCalledWith(
      delivery.id,
      worker.workerId,
      "wamid.real",
    );
    expect(repository.markRetry).not.toHaveBeenCalled();
  });

  it("envia imagem e texto como caption no mesmo payload", async () => {
    const repository = workerRepository();
    repository.loadDeliveryContext.mockResolvedValue({
      delivery,
      campaign,
      item: item({
        contentSnapshot: {
          ...item().contentSnapshot,
          primaryMediaAssetId: "asset-1",
          hasMedia: true,
        },
      }),
      connectionStatus: "connected",
      groupSyncStatus: "active",
    });
    const transport = {
      send: vi.fn(async () => ({
        success: true as const,
        externalMessageId: "wamid.image",
      })),
    };
    const media = {
      load: vi.fn(async () => ({
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "image/png",
      })),
    };
    await new WhatsAppDispatchWorker(
      repository as unknown as DispatchRepository,
      transport,
      media,
    ).processOne();
    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          type: "image",
          caption: item().contentSnapshot.text,
        }),
      }),
    );
  });

  it("não repete automaticamente resultado incerto", async () => {
    const repository = workerRepository();
    const transport = {
      send: vi.fn(async () => ({
        success: false as const,
        errorCode: "WHATSAPP_SEND_RESULT_UNKNOWN",
        transient: false,
        uncertain: true,
      })),
    };
    await new WhatsAppDispatchWorker(
      repository as unknown as DispatchRepository,
      transport,
      { load: vi.fn() },
    ).processOne();
    expect(repository.markUncertain).toHaveBeenCalled();
    expect(repository.markRetry).not.toHaveBeenCalled();
  });

  it("encerra falha transitória na terceira tentativa e nunca reclama item sent", async () => {
    const repository = workerRepository(2);
    const transport = {
      send: vi.fn(async () => ({
        success: false as const,
        errorCode: "WHATSAPP_TIMEOUT",
        transient: true,
      })),
    };
    const worker = new WhatsAppDispatchWorker(
      repository as unknown as DispatchRepository,
      transport,
      { load: vi.fn() },
    );
    await worker.processOne();
    expect(repository.markFailed).toHaveBeenCalled();
    expect(repository.markRetry).not.toHaveBeenCalled();
    expect(await worker.processOne()).toBe(false);
    expect(transport.send).toHaveBeenCalledTimes(1);
  });
});
