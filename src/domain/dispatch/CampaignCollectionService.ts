import type { DispatchRepository } from './DispatchRepository';
import type { CreateCampaignCollectionInput } from './types';

function normalize(input: CreateCampaignCollectionInput): CreateCampaignCollectionInput {
  const name = input.name?.trim();
  if (!name || name.length > 100) throw new Error('CAMPAIGN_NAME_INVALID');
  const groupIds = [...new Set(input.groupIds ?? [])];
  if (!input.connectionId || groupIds.length === 0) {
    throw new Error('CAMPAIGN_DESTINATIONS_REQUIRED');
  }
  return { name, connectionId: input.connectionId, groupIds };
}

export class CampaignCollectionService {
  constructor(private readonly repository: DispatchRepository) {}

  list(userId: string) {
    return this.repository.listCampaignCollections(userId);
  }

  get(userId: string, id: string) {
    return this.repository.getCampaignCollection(userId, id);
  }

  private async validateDestinations(userId: string, connectionId: string, groupIds: string[]) {
    const connection = await this.repository.getConnection(userId, connectionId);
    if (!connection) throw new Error('CAMPAIGN_CONNECTION_FORBIDDEN');
    const groups = await this.repository.getGroups(userId, connectionId, groupIds);
    if (groups.length !== new Set(groupIds).size) throw new Error('CAMPAIGN_GROUP_FORBIDDEN');
    if (groups.some((group) => group.connectionId !== connectionId || group.syncStatus !== 'active')) {
      throw new Error('CAMPAIGN_GROUP_UNAVAILABLE');
    }
  }

  async create(userId: string, input: CreateCampaignCollectionInput) {
    const value = normalize(input);
    await this.validateDestinations(userId, value.connectionId, value.groupIds);
    const campaign = await this.repository.createCampaignCollection(userId, value);
    await this.repository.recordEvent(userId, 'campaign.collection.created', {
      campaign_id: campaign.id,
      connection_id: campaign.connectionId,
      groups: campaign.groups.length,
    });
    return campaign;
  }

  async update(userId: string, id: string, input: CreateCampaignCollectionInput) {
    const current = await this.repository.getCampaignCollection(userId, id);
    if (!current) throw new Error('CAMPAIGN_NOT_FOUND');
    const value = normalize(input);
    await this.validateDestinations(userId, value.connectionId, value.groupIds);
    const campaign = await this.repository.updateCampaignCollection(userId, id, value);
    if (!campaign) throw new Error('CAMPAIGN_NOT_FOUND');
    await this.repository.recordEvent(userId, 'campaign.collection.updated', {
      campaign_id: campaign.id,
      connection_id: campaign.connectionId,
      groups: campaign.groups.length,
    });
    return campaign;
  }
}
