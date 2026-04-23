-- +goose Up

-- 发布中心：版本、灰度与回滚
create table if not exists releases (
  content_version int primary key,
  status text not null default 'published',
  rollout_percent int not null default 100,
  created_by text not null,
  created_at timestamptz not null default now(),
  notes text not null default ''
);

-- 操作日志：轻团队也要可追溯
create table if not exists audit_log (
  id bigserial primary key,
  actor text not null,
  action text not null,          -- create/update/publish/rollback
  entity_type text not null,     -- problem/question/suggestion/tools/template/release
  entity_id text,
  diff jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- +goose Down

drop table if exists audit_log;
drop table if exists releases;

