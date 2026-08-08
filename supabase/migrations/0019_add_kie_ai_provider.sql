-- Permite registrar en auditoría las revisiones procesadas mediante Kie.ai.
alter type public.ai_provider_name add value if not exists 'kie';
