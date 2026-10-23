-- +goose Up

-- 问题库展示优先级：数值越大越靠前（与 PRD Top3 顺序对齐）。
alter table problems add column if not exists priority int not null default 0;

create index if not exists problems_priority_idx on problems (priority desc, id asc);

-- +goose Down

drop index if exists problems_priority_idx;
alter table problems drop column if exists priority;
