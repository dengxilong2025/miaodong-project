# 喵懂 Admin：审计日志 v0.2（服务端筛选 + 游标分页 + 端到端验证）设计稿

日期：2026-04-24  
状态：已确认（用户确认“v0.2 审计增强”）  
目标关键词：可扩展 / 可维护 / 解耦 / 可测试

---

## 1. 背景

当前已具备：

- 数据表：`audit_log`（见 `services/api/migrations/0002_release_and_audit.sql`）
- 写入：关键管理动作写入审计日志（create/update/publish/rollback）
- 读取（v0.1）：`GET /admin/audit?limit=200` 返回最近 N 条
- Admin Web：`#/audit` 已可展示日志 + 本地过滤 + diff 折叠

不足：

- 数据量稍大时，前端只能拉“固定最近 N 条”，缺乏服务端筛选与分页
- 缺少端到端（DB 写入→API 读取）的系统验证，容易出现“接口存在但无数据/字段不对”的回归

---

## 2. 目标（v0.2）

1) `/admin/audit` 支持 **服务端筛选 + 游标分页**  
2) 前端 Audit 页支持筛选面板与“加载更多”  
3) CI 的 `e2e-db` 增加端到端校验：**触发审计 → 查询审计 → 校验字段/数量**

---

## 3. 非目标

- RBAC/多角色权限（仍用 `X-Admin-Token`）
- 高级全文检索（先精确匹配；模糊搜索先留给前端本地 search）
- 字段级 diff 可视化（继续展示 diff JSON + 折叠）

---

## 4. 后端接口设计

### 4.1 Endpoint

`GET /admin/audit`

Query 参数（均可选）：

- `limit`：默认 200，最大 500
- `cursor`：游标分页，使用 `id`（语义：返回 **id < cursor** 的更早记录）
- `actor`：精确匹配
- `action`：精确匹配（create/update/publish/rollback）
- `entity_type`：精确匹配（problem/release/...）
- `entity_id`：精确匹配
- `from` / `to`：毫秒时间戳（过滤 `created_at`）

### 4.2 Response

```json
{
  "items": [
    {
      "id": 123,
      "actor": "admin-ui",
      "action": "publish",
      "entity_type": "release",
      "entity_id": "12",
      "diff": { "rollout_percent": 20, "notes": "..." },
      "created_at": "2026-04-23T10:00:00Z"
    }
  ],
  "next_cursor": 120
}
```

规则：

- `next_cursor`：
  - 若 `items` 非空：取本页最后一条的 `id`
  - 若 `items` 为空：返回 `null` 或省略（实现时统一为 `null`）

### 4.3 SQL 语义（可维护）

排序：`order by created_at desc, id desc`（稳定）

过滤：

- `cursor` → `id < $cursor`
- `from/to` → `created_at >= from_ts` / `created_at <= to_ts`
- 字段筛选 → `actor=$x` 等

---

## 5. 解耦与代码结构

### 5.1 Store 层（纯 SQL + 数据结构）

位置：`services/api/internal/audit/store.go`

新增：

- `type ListParams struct { Limit int; Cursor *int64; Actor, Action, EntityType, EntityID string; FromMs, ToMs *int64 }`
- `func ListPage(ctx context.Context, db *sql.DB, p ListParams) (items []Item, nextCursor *int64, err error)`

说明：

- store 负责“参数 clamp + SQL 拼装 + Scan”
- handler 不关心 SQL 细节

### 5.2 Handler 层（HTTP 胶水）

位置：`services/api/internal/http/handlers/admin_audit_list.go`

增强：

- 解析 query → 组装 ListParams → 调 store → JSON 输出
- 鉴权仍用 `requireAdmin()`

### 5.3 前端（页面负责 UI，lib 负责通用能力）

位置：

- `apps/admin/pages/audit.js`：
  - 增加筛选表单（actor/action/entity_type/entity_id/from/to）
  - 增加“加载更多”按钮（使用 next_cursor）
  - 保留本地 search 作为二次过滤（不作为唯一过滤手段）

---

## 6. 系统测试（关键里程碑必须有）

### 6.1 单元测试（Go）

目标：覆盖边界，不依赖真实 DB。

- query 解析边界：limit clamp、cursor 非法输入、from/to 非法输入
- method not allowed、unauthorized（已存在）
- store 的参数 clamp 与 SQL 构造（可通过拆出 buildWhereClause() 做纯函数测试，或最小覆盖）

### 6.2 e2e-db（GitHub Actions）

在 `e2e-db` 作业里新增步骤（依赖：docker compose 已启动 Postgres、已跑 migrations/seed）：

1) 触发审计写入（任选其一）：
   - `POST /admin/release`（最简单，必写 audit_log）
2) 再调用：
   - `GET /admin/audit?limit=10`
3) 断言：
   - `items.length >= 1`
   - 第一条包含 `id/actor/action/entity_type/created_at`
4) 分页基本验证：
   - `next_cursor` 存在时，用 `cursor=<next_cursor>` 再拉一次，确保接口可用且不报错

> 端到端只验证“可用性与契约稳定”，不做复杂断言，避免 flaky。

---

## 7. 验收标准（DoD）

1) `/admin/audit` 支持服务端筛选 + 游标分页（limit/cursor/from/to/actor/action/entity_type/entity_id）  
2) Admin Web Audit 页面支持筛选与“加载更多”  
3) CI `e2e-db` 增加端到端审计验证并稳定通过  
4) 代码结构清晰：store/handler/UI 分层明确、后续扩展不需要大改  

