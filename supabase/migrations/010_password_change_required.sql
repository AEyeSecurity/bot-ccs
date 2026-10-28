-- Cambio de contraseña forzado en el primer acceso (y tras un reset desde el panel).
-- Se crea/activa al dar de alta un usuario y al resetear su contraseña; el usuario
-- debe elegir una contraseña nueva antes de entrar al panel.

alter table public.operators
  add column if not exists password_change_required boolean not null default false;
