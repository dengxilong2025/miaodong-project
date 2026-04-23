-- +goose Up

-- 用户与猫档案（MVP：先占位，后续补字段与索引）
create table if not exists users (
  id text primary key,
  created_at timestamptz not null default now()
);

create table if not exists pets (
  id text primary key,
  user_id text not null references users(id),
  name text,
  age_group text,
  multi_cat_home boolean,
  created_at timestamptz not null default now()
);

-- 内容权威层（运营可编辑）
create table if not exists problems (
  id text primary key,
  title text not null,
  summary text not null,
  tags jsonb not null default '[]'::jsonb,
  cause_framework jsonb not null default '[]'::jsonb,
  retest_plan_72h jsonb not null default '[]'::jsonb,
  risk_level_copy jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  updated_at timestamptz not null default now()
);

create table if not exists questions (
  id text primary key,
  problem_id text references problems(id),
  priority int not null default 0,
  text text not null,
  type text not null,
  options jsonb not null default '[]'::jsonb,
  condition jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  updated_at timestamptz not null default now()
);

create table if not exists suggestions (
  id text primary key,
  problem_id text references problems(id),
  priority int not null default 0,
  title text not null,
  steps jsonb not null default '[]'::jsonb,
  expected_window_hours int not null default 0,
  retest_tip text not null default '',
  condition jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  updated_at timestamptz not null default now()
);

create table if not exists tools_guides (
  id text primary key,
  problem_id text unique references problems(id),
  collapsed_by_default boolean not null default true,
  guide_bullets jsonb not null default '[]'::jsonb,
  efficiency_items jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  updated_at timestamptz not null default now()
);

-- 策略层（MVP：先存 DB，后续可抽配置中心 + Redis）
create table if not exists runtime_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- 埋点事件（MVP：先落库，后续接入更专业的数仓/事件平台）
create table if not exists analytics_events (
  id bigserial primary key,
  event_name text not null,
  ts_ms bigint not null,
  user_id text,
  session_id text,
  platform text,
  app_version text,
  content_version int,
  request_id text,
  payload jsonb not null default '{}'::jsonb
);

-- +goose Down

drop table if exists analytics_events;
drop table if exists runtime_config;
drop table if exists tools_guides;
drop table if exists suggestions;
drop table if exists questions;
drop table if exists problems;
drop table if exists pets;
drop table if exists users;

