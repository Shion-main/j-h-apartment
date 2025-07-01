ALTER TABLE public.tenants DROP CONSTRAINT tenants_room_id_key;

CREATE UNIQUE INDEX tenants_unique_active_room_id_idx ON public.tenants (room_id) WHERE is_active = true;
