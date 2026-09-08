alter table public.cta_templates
  add column if not exists presentation_settings jsonb not null default jsonb_build_object(
    'defaultCaption', '',
    'watermark', jsonb_build_object(
      'enabled', false,
      'text', '',
      'position', 'bottom-right',
      'opacity', 0.72
    )
  );

-- As configurações já eram versionadas dentro do snapshot antes de ganharem
-- uma coluna própria. Preserve a apresentação mais recente ao implantar a
-- coluna, em vez de substituir marca d'água e legenda pelo valor vazio padrão.
with latest_presentation as (
  select distinct on (template_id)
    template_id,
    template_snapshot->'presentation' as presentation
  from public.cta_template_versions
  where jsonb_typeof(template_snapshot->'presentation') = 'object'
  order by template_id, version desc
)
update public.cta_templates as template
set presentation_settings = latest.presentation
from latest_presentation as latest
where template.id = latest.template_id;

comment on column public.cta_templates.presentation_settings is
  'Legenda fixa e marca d''agua padrao aplicadas as mensagens geradas por este template.';
