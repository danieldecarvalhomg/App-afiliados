import React from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import type {
  ProductReviewCondition,
  ProductReviewConditionField,
  ProductReviewRule,
} from '../../domain/monitoring/ReviewSettingsRepository';

function id(): string { return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`; }

const fields: Array<{ value: ProductReviewConditionField; label: string }> = [
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'confidence', label: 'Confiança da análise' },
  { value: 'discount_percent', label: 'Desconto' },
  { value: 'coupon_exists', label: 'Possui cupom' },
  { value: 'free_shipping', label: 'Frete grátis' },
];
const marketplaces = [
  ['shopee', 'Shopee'], ['amazon', 'Amazon'], ['mercado_livre', 'Mercado Livre'],
  ['magalu', 'Magalu'], ['aliexpress', 'AliExpress'], ['other', 'Outro'], ['unknown', 'Não identificado'],
] as const;
const inputClass = 'rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] px-3 py-2 text-xs text-[#D4D4D8] outline-none focus:border-emerald-700';

function defaultCondition(field: ProductReviewConditionField = 'marketplace'): ProductReviewCondition {
  if (field === 'marketplace') return { id: id(), field, operator: 'equals', value: 'shopee' };
  if (field === 'confidence') return { id: id(), field, operator: 'greater_or_equal', value: 0.9 };
  if (field === 'discount_percent') return { id: id(), field, operator: 'greater_or_equal', value: 20 };
  return { id: id(), field, operator: 'equals', value: true };
}

function conditionValue(condition: ProductReviewCondition, onChange: (condition: ProductReviewCondition) => void): React.ReactNode {
  if (condition.field === 'marketplace') {
    return <select className={inputClass} value={String(condition.value)} onChange={(event) => onChange({ ...condition, value: event.target.value as ProductReviewCondition['value'] })}>
      {marketplaces.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>;
  }
  if (condition.field === 'coupon_exists' || condition.field === 'free_shipping') {
    return <select className={inputClass} value={String(condition.value)} onChange={(event) => onChange({ ...condition, value: event.target.value === 'true' })}>
      <option value="true">Sim</option><option value="false">Não</option>
    </select>;
  }
  const percentValue = condition.field === 'confidence' ? Number(condition.value) * 100 : Number(condition.value);
  return <div className="relative">
    <input className={`${inputClass} w-28 pr-8`} type="number" min="0" max="100" step="1" value={Number.isFinite(percentValue) ? percentValue : 0}
      onChange={(event) => onChange({ ...condition, value: condition.field === 'confidence' ? Number(event.target.value) / 100 : Number(event.target.value) })} />
    <span className="pointer-events-none absolute right-3 top-2 text-xs text-[#9CA3AF]">%</span>
  </div>;
}

export function ProductReviewRulesEditor({ rules, active, saving, dirty, onChange, onSave }: {
  rules: ProductReviewRule[];
  active: boolean;
  saving: boolean;
  dirty: boolean;
  onChange: (rules: ProductReviewRule[]) => void;
  onSave: () => void;
}): React.ReactNode {
  function updateRule(ruleId: string, patch: Partial<ProductReviewRule>): void {
    onChange(rules.map((rule) => rule.id === ruleId ? { ...rule, ...patch } : rule));
  }
  function addRule(): void {
    onChange([...rules, {
      id: id(), name: 'Aprovar produtos da Shopee', enabled: true,
      conditionMode: 'all', conditions: [defaultCondition()],
    }]);
  }
  function updateCondition(rule: ProductReviewRule, conditionId: string, next: ProductReviewCondition): void {
    updateRule(rule.id, { conditions: rule.conditions.map((condition) => condition.id === conditionId ? next : condition) });
  }

  return <div className="mt-5 border-t border-[#E8E9ED] pt-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="text-sm font-medium text-[#D4D4D8]">Condições de aprovação automática</h3>
        <p className="mt-1 text-xs leading-5 text-[#9CA3AF]">As regras são avaliadas na ordem abaixo. Sem correspondência, o produto continua aguardando revisão manual.</p>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={addRule} disabled={saving || rules.length >= 20} className="flex items-center gap-1.5 rounded-lg border border-[#D4D4D8] px-3 py-2 text-xs text-[#D4D4D8] disabled:opacity-40"><Plus className="h-3.5 w-3.5" />Nova regra</button>
        <button type="button" onClick={onSave} disabled={saving || !dirty} className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-medium text-emerald-950 disabled:opacity-40"><Save className="h-3.5 w-3.5" />{saving ? 'Salvando…' : 'Salvar regras'}</button>
      </div>
    </div>

    {!active && <div className="mt-4 rounded-lg border border-amber-900/50 bg-amber-950/15 px-3 py-2 text-xs text-amber-300">As regras estão salvas, mas pausadas enquanto a revisão global estiver OFF.</div>}
    {rules.length === 0 ? <div className="mt-4 rounded-lg border border-dashed border-[#D4D4D8] p-5 text-center text-xs text-[#9CA3AF]">Nenhuma exceção automática. Toda promoção aguardará sua aprovação.</div> : <div className="mt-4 space-y-3">
      {rules.map((rule, ruleIndex) => <div key={rule.id} className="rounded-xl border border-[#E8E9ED] bg-[#F8FAFC] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="text-xs text-[#6B6F7B]">#{ruleIndex + 1}</span>
          <input aria-label="Nome da regra" className={`${inputClass} min-w-0 flex-1`} maxLength={80} value={rule.name} onChange={(event) => updateRule(rule.id, { name: event.target.value })} />
          <label className="flex items-center gap-2 text-xs text-[#6B6F7B]"><input type="checkbox" checked={rule.enabled} onChange={(event) => updateRule(rule.id, { enabled: event.target.checked })} />Ativa</label>
          <button type="button" aria-label="Excluir regra" onClick={() => onChange(rules.filter((item) => item.id !== rule.id))} className="rounded-md p-2 text-[#9CA3AF] hover:bg-red-950/30 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#9CA3AF]">
          <span>Aprovar automaticamente quando</span>
          <select className={inputClass} value={rule.conditionMode} onChange={(event) => updateRule(rule.id, { conditionMode: event.target.value as 'all' | 'any' })}>
            <option value="all">todas as condições</option><option value="any">qualquer condição</option>
          </select>
          <span>forem atendidas:</span>
        </div>
        <div className="mt-3 space-y-2">
          {rule.conditions.map((condition) => <div key={condition.id} className="flex flex-wrap items-center gap-2">
            <select className={inputClass} value={condition.field} onChange={(event) => updateCondition(rule, condition.id, { ...defaultCondition(event.target.value as ProductReviewConditionField), id: condition.id })}>
              {fields.map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}
            </select>
            <span className="text-xs text-[#9CA3AF]">{condition.operator === 'greater_or_equal' ? 'é no mínimo' : 'é'}</span>
            {conditionValue(condition, (next) => updateCondition(rule, condition.id, next))}
            <button type="button" aria-label="Remover condição" disabled={rule.conditions.length === 1} onClick={() => updateRule(rule.id, { conditions: rule.conditions.filter((item) => item.id !== condition.id) })} className="rounded-md p-2 text-[#9CA3AF] hover:text-red-300 disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>)}
        </div>
        <button type="button" disabled={rule.conditions.length >= 10} onClick={() => updateRule(rule.id, { conditions: [...rule.conditions, defaultCondition()] })} className="mt-3 flex items-center gap-1 text-xs text-emerald-600 disabled:opacity-40"><Plus className="h-3.5 w-3.5" />Adicionar condição</button>
      </div>)}
    </div>}
  </div>;
}
