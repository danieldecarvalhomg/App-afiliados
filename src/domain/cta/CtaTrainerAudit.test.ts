import { describe, expect, it, vi } from "vitest";
import { CtaIntelligenceService } from "./CtaIntelligenceService";
import { CtaPreferenceAgent } from "./CtaPreferenceAgent";
import { TrainingIngestionService } from "./TrainingIngestionService";

const interpretation = (patch = {}) => ({ scope: "persistent", profilePatch: {}, ruleChanges: [], structureOperations: [], requiresConfirmation: false, reply: "Entendido.", changeSummary: [], ...patch });
function setup(output: unknown) {
  const repository = {
    getOrCreateProfile: vi.fn().mockResolvedValue({ id: "p", userId: "u", version: 1 }),
    listRules: vi.fn().mockResolvedValue([]), listRecentGenerations: vi.fn().mockResolvedValue([]),
    addConversation: vi.fn(), updateProfile: vi.fn(), addRule: vi.fn(), addExample: vi.fn(),
    addFeedback: vi.fn(), addInference: vi.fn(), recordMemoryItems: vi.fn(),
  };
  const provider = { interpretCtaInstruction: vi.fn().mockResolvedValue({ output }) };
  const quota = { assertFeature: vi.fn(), consume: vi.fn() };
  const service = new CtaIntelligenceService(repository as never, provider as never, undefined, undefined, undefined, undefined, quota as never);
  return { repository, provider, quota, service };
}

describe("auditoria do treinador: efeitos persistentes", () => {
  it("mantém escopos independentes num comando com regra geral e exceção",async()=>{
    const ruleChanges=[{action:"add",ruleType:"style",value:"Use tom natural",scope:"persistent"},{action:"add",ruleType:"style",value:"Um emoji em brinquedos",scope:"exception",condition:[{field:"category",operator:"eq",value:"Brinquedos"}]}];
    const {service,repository}=setup(interpretation({ruleChanges,changeSummary:["Alterado estilo"]}));
    await service.assistant("u","Natural no geral, mas um emoji em brinquedos");
    expect(repository.addRule).toHaveBeenCalledWith("u","p",expect.objectContaining({scope:"exception",condition:ruleChanges[1].condition}));
    const items=repository.recordMemoryItems.mock.calls[0][2];
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({scope:"exception",condition:{conditions:ruleChanges[1].condition}});
  });
  it("salva todos os exemplos distintos de uma mensagem, aceitando o formato antigo", async () => {
    const positive={text:"Uma ajuda discreta para a rotina",sentiment:"positive",traits:[]};
    const negative={text:"Oferta milagrosa, compre agora!",sentiment:"negative",traits:[]};
    const {service,repository}=setup(interpretation({examples:[positive,negative],example:positive}));
    await service.assistant("u","Registre os dois exemplos");
    expect(repository.addExample).toHaveBeenCalledTimes(2);
    expect(repository.addExample).toHaveBeenCalledWith("u",expect.objectContaining(negative));
  });
  it.each(["one_off","persistent"])("não salva exemplos sem autorização atual: %s",async(scope)=>{
    const {service,repository}=setup(interpretation({scope,requiresConfirmation:scope==="persistent",examples:[{text:"Referência",sentiment:"positive",traits:[]}]}));
    await service.assistant("u","Só uma ideia, não salve ainda");
    expect(repository.addExample).not.toHaveBeenCalled();
  });
  it("envia memória e histórico e arquiva apenas IDs ativos do contexto",async()=>{
    const {service,repository,provider}=setup(interpretation({archiveMemoryIds:["active","foreign","active"]}));
    const memory=[{id:"active",active:true,semanticText:"Curto"}];
    const conversation=[{role:"user",content:"Prefiro tamanho médio"}];
    Object.assign(repository,{listMemoryItems:vi.fn().mockResolvedValue(memory),listConversation:vi.fn().mockResolvedValue(conversation),deleteMemoryItem:vi.fn()});
    await service.assistant("u","Sim, pode aplicar");
    expect(provider.interpretCtaInstruction).toHaveBeenCalledWith(expect.objectContaining({memory,conversation}));
    expect((repository as any).deleteMemoryItem).toHaveBeenCalledExactlyOnceWith("u","active");
  });
  it.each([null, [], {count:2}, {count:"3"}, {instruction:123}])("recusa teste de CTA malformado antes de consumir franquia: %j", async (input) => {
    const {service,quota}=setup(interpretation());
    await expect(service.testCta("u","p",input as never)).rejects.toThrow("CTA_TEST_REQUEST_INVALID");
    expect(quota.consume).not.toHaveBeenCalled();
  });
  it("não grava exemplos nem feedback de inferência pendente", async () => {
    const { service, repository } = setup(interpretation({ requiresConfirmation: true, example: { text: "Gostou desse Echo Dot?", sentiment: "positive", traits: [] }, feedback: { strength: "positive", aspects: {} } }));
    await service.assistant("u", "Você acha que prefiro esse estilo?");
    expect(repository.addExample).not.toHaveBeenCalled();
    expect(repository.addFeedback).not.toHaveBeenCalled();
    expect(repository.recordMemoryItems).not.toHaveBeenCalled();
  });
  it("não aplica preferências condicionais ao perfil global", async () => {
    const { service, repository } = setup(interpretation({ scope: "conditional", profilePatch: { emojiLevel: "heavy" }, changeSummary: ["Use emojis apenas em brinquedos"] }));
    await service.assistant("u", "Use emojis apenas em brinquedos");
    expect(repository.updateProfile).not.toHaveBeenCalled();
    expect(repository.recordMemoryItems).toHaveBeenCalledWith("u", "p", expect.arrayContaining([expect.objectContaining({ scope: "conditional" })]));
  });
  it("pedido estrutural não altera estilo como efeito colateral", async () => {
    const { service, repository } = setup(interpretation({ structureOperations: [{ type: "move_block", blockId: "price", toIndex: 0 }], profilePatch: { tone: "urgente" }, ruleChanges: [{ action: "add", ruleType: "required_word", value: "compre" }] }));
    const result = await service.assistant("u", "Mova o preço para o topo");
    expect(result.applied).toBe(false);
    expect(repository.updateProfile).not.toHaveBeenCalled();
    expect(repository.addRule).not.toHaveBeenCalled();
  });
  it("nega acesso antes de gravar conversa ou consumir IA", async () => {
    const { service, repository, provider, quota } = setup(interpretation());
    quota.assertFeature.mockRejectedValue(new Error("FEATURE_NOT_AVAILABLE_AI_TRAINER"));
    await expect(service.assistant("u", "Sempre natural")).rejects.toThrow("FEATURE_NOT_AVAILABLE");
    expect(repository.addConversation).not.toHaveBeenCalled();
    expect(provider.interpretCtaInstruction).not.toHaveBeenCalled();
    expect(quota.consume).not.toHaveBeenCalled();
  });
  it("não cobra análise de fonte inválida", async () => {
    const { service, quota } = setup(interpretation());
    await expect(service.trainingReview("u", " ")).rejects.toThrow("CTA_TRAINING_SOURCE_REQUIRED");
    expect(quota.consume).not.toHaveBeenCalled();
  });
  it.each([null, 3, {}, { text: 4, sentiment: "positive" }, { text: "CTA", sentiment: "invalid" }])("rejeita exemplo HTTP inválido %j", async (input) => {
    const { service, repository } = setup(interpretation());
    await expect(service.addExample("u", input as never)).rejects.toThrow("CTA_EXAMPLE_INVALID");
    expect(repository.addExample).not.toHaveBeenCalled();
  });
});

describe("auditoria do treinador: saída não confiável da IA", () => {
  it.each([null, [], "ok", interpretation({ requiresConfirmation: "false" }), interpretation({ reply: {} }), interpretation({ ruleChanges: [null] }), interpretation({ ruleChanges: [{ action: "drop", ruleType: "x", value: "x" }] }), interpretation({ ruleChanges: [{ action: "add", ruleType: "x", value: 4 }] })])("rejeita saída inválida sem efeitos parciais: %j", async (output) => {
    const { service, repository } = setup(output);
    await expect(service.assistant("u", "Sempre natural")).rejects.toThrow("CTA_ASSISTANT_OUTPUT_INVALID");
    expect(repository.updateProfile).not.toHaveBeenCalled();
    expect(repository.addRule).not.toHaveBeenCalled();
  });
  it("não modifica o objeto retornado pelo cache do provider", async () => {
    const output = interpretation({ scope: "one_off", profilePatch: { tone: "natural" } });
    const { provider } = setup(output);
    await new CtaPreferenceAgent(provider as never).interpret({ message: "Só desta vez", profile: {}, blueprint: {}, rules: [], recentGenerations: [] } as never);
    expect(output.profilePatch).toEqual({ tone: "natural" });
  });
});

const memoryItem = { kind: "instruction", scope: "persistent", semanticText: "Seja natural", condition: {}, polarity: "positive", priority: 80 };
function training(output: unknown) {
  const repository = { createTrainingSource: vi.fn().mockResolvedValue({ id: "source" }), listMemoryItems: vi.fn().mockResolvedValue([]), saveTrainingReview: vi.fn().mockImplementation(async (_u, _s, review) => review), failTrainingSource: vi.fn().mockResolvedValue(undefined) };
  const provider = { interpretTrainingChunk: vi.fn().mockResolvedValue({ output: { summary: [], items: [memoryItem] } }), reconcileTraining: vi.fn().mockResolvedValue({ output }) };
  return { repository, provider, service: new TrainingIngestionService(repository as never, provider as never) };
}
describe("auditoria do treinador: importação", () => {
  it("preserva exemplos extraídos que a reconciliação resumiu indevidamente", async () => {
    const {service,provider}=training({summary:[],items:[memoryItem],conflicts:[]});
    provider.interpretTrainingChunk.mockResolvedValue({output:{summary:[],items:[{...memoryItem,kind:"negative_example",semanticText:"Última chance, compre já!",polarity:"negative"}]}});
    const review=await service.analyze("u","Exemplo negativo: Última chance, compre já!");
    expect(review.counts.negativeExamples).toBe(1);
    expect(review.items).toContainEqual(expect.objectContaining({semanticText:"Última chance, compre já!",kind:"negative_example"}));
  });
  it.each([null, { summary: {}, items: [] }, { summary: [], items: [{ ...memoryItem, kind: "garbage" }] }, { summary: [], items: [{ ...memoryItem, condition: [] }] }, { summary: [], items: [{ ...memoryItem, semanticText: "x".repeat(5001) }] }, { summary: [], items: [memoryItem], conflicts: [null] }])("rejeita revisão malformada e preserva fonte: %j", async (output) => {
    const { service, repository } = training(output);
    await expect(service.analyze("u", "Seja natural")).rejects.toThrow("CTA_TRAINING_OUTPUT_INVALID");
    expect(repository.saveTrainingReview).not.toHaveBeenCalled();
    expect(repository.failTrainingSource).toHaveBeenCalledWith("u", "source", "CTA_TRAINING_OUTPUT_INVALID");
  });
  it("normaliza prioridade decimal antes do cast INTEGER no banco", async () => {
    const { service } = training({ summary: [], items: [{ ...memoryItem, priority: 80.5 }], conflicts: [] });
    expect((await service.analyze("u", "Seja natural")).items[0].priority).toBe(81);
  });
});
