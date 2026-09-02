grant usage on schema public to anon, authenticated, service_role;

grant select on public.operators to authenticated;
grant select on public.contacts to authenticated;
grant select on public.conversations to authenticated;
grant select on public.cases to authenticated;
grant select on public.messages to authenticated;
grant select on public.knowledge_base to authenticated;
grant select on public.routing_rules to authenticated;
grant select on public.twilio_templates to authenticated;
grant select on public.conversation_events to authenticated;
grant select on public.app_settings to authenticated;

grant all privileges on public.operators to service_role;
grant all privileges on public.contacts to service_role;
grant all privileges on public.conversations to service_role;
grant all privileges on public.cases to service_role;
grant all privileges on public.messages to service_role;
grant all privileges on public.knowledge_base to service_role;
grant all privileges on public.routing_rules to service_role;
grant all privileges on public.twilio_templates to service_role;
grant all privileges on public.twilio_callbacks to service_role;
grant all privileges on public.conversation_events to service_role;
grant all privileges on public.app_settings to service_role;

grant execute on function public.is_ccs_operator() to authenticated, service_role;
grant execute on function public.is_ccs_admin() to authenticated, service_role;
grant execute on function public.purge_ccs_expired_data() to service_role;
