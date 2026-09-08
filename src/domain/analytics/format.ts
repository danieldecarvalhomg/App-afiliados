export function formatPercentRatio(value: number | null | undefined) {
  return value === null || value === undefined
    ? "Não disponível"
    : `${(value * 100).toFixed(1).replace(".", ",")}%`;
}
