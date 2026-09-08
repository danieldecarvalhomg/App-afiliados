import type { AutomationOptions, AutomationPreparationConfig } from "./types";

export const eligibleDryRunProducts = (
  products: AutomationOptions["products"],
  messageMode: AutomationPreparationConfig["messageMode"],
) =>
  messageMode === "original_message"
    ? products.filter((product) => product.sourceType === "whatsapp")
    : products;
