# 开发与文档对齐流程（每日执行）

目标：**代码、文档、WBS、CI、GitHub 始终一致**，避免“文档写了但代码没做”或“代码做了但文档过期”。

---

## 1. 单一事实来源

按以下优先级阅读与更新：

1. `docs/product/PRD.md`：产品意图、边界、渠道策略
2. `docs/project/WBS_MILESTONES.md`：里程碑、工作包、状态
3. `docs/tech/ARCHITECTURE.md`：分层、跨端、音频链路
4. `docs/tech/API_CONTRACT.md`：接口契约
5. `docs/tech/CONTENT_DATA_MODEL.md`：内容模型
6. `docs/tech/ANALYTICS_SPEC.md`：埋点与指标口径
7. `docs/adr/*`：关键决策
8. `docs/superpowers/specs|plans/*`：单次迭代的设计与实施计划

冲突时：**先确认文档，再改代码**；如果文档本身错了，先改文档并记录原因（必要时新增 ADR），不要用代码“偷偷覆盖”。

---

## 2. 文档状态标签

所有计划/设计文档必须使用以下标签之一：

- `已实现`：代码 + 测试已落地，CI 绿
- `进行中`：当前迭代，允许代码未合并
- `计划中`：已排期，未开发
- `废弃`：不再执行，需注明替代方案

禁止把“计划中”写成“已实现”。

---

## 3. 每日循环（建议固定时段）

1. **同步**：`git pull --rebase`，确认本地与 `origin/main` 一致
2. **对齐**：读当天要动的 WBS 工作包与相关文档
3. **开发**：先写/改测试，再实现（TDD）
4. **验证**：
   - Go：`cd services/api && go test ./...`
   - Flutter：`cd apps/mobile && flutter analyze && flutter test`
   - 仓库：`python scripts/ci/validate_repo.py`
   - JS：`node --check apps/admin/admin.js ...`
5. **文档**：更新 WBS 状态、接口契约/埋点（如涉及）
6. **提交**：小步提交，提交信息说明“为什么”
7. **推送**：`git push origin main`
8. **CI**：确认 5 个 job 全绿；失败当天修复

---

## 4. Definition of Done（每个工作包）

- [ ] 代码实现
- [ ] 单元/契约/集成测试（按影响面选择）
- [ ] `validate_repo.py` 通过
- [ ] 相关文档更新（WBS 状态 + 接口/模型/口径）
- [ ] CI 全绿
- [ ] 已提交并推送到 `origin/main`

---

## 5. Git 与 GitHub 规则

- `main` 始终跟踪 `origin/main`，避免长期分叉
- 提交前先 `git pull --rebase`；不强制推送 `main`
- 小步提交：一个工作包一个提交，避免“大杂烩”
- **每天至少推送一次**；如果当天无法完成，也推送可编译、测试通过的中途状态
- CI 失败不隔夜
- 不提交密钥、`.env`、构建产物
- 不跳过 hooks，不使用 `--no-verify`

常用：

```bash
git status
git pull --rebase
git add <files>
git commit -m "feat(scope): ..."
git push origin main
gh run list --limit 3
```

---

## 6. 文档与代码对齐检查

每次提交前自问：

1. 我改的接口/字段，`API_CONTRACT.md` 是否同步？
2. 我改的内容模型/迁移，`CONTENT_DATA_MODEL.md` 是否同步？
3. 我改的事件/指标，`ANALYTICS_SPEC.md` 是否同步？
4. 我完成的工作包，`WBS_MILESTONES.md` 状态是否更新？
5. 我做的取舍，是否需要新增/更新 ADR？
6. 新文档是否加入 `docs/README.md` 导航？

`scripts/ci/validate_repo.py` 会检查关键文档与迁移存在；语义一致性仍需人工确认。

---

## 7. 每周复盘

- 更新 WBS 状态与 `docs/ops/MVP_LAUNCH_CHECKLIST.md`
- 对比“计划 vs 实际”，删除不再做的范围
- 检查是否有文档长期“计划中”但代码已做/反之
- 确认 GitHub 与本地一致，CI 连续绿

---

## 8. 紧急修复

允许先修复线上问题，但必须：

1. 当天补测试
2. 当天补文档/ADR
3. 当天推送并确认 CI
