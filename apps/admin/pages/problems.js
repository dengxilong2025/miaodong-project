// Admin Problems page (Vanilla JS, no build chain)
// Skeleton: left search/filter + list, right editor placeholder
(function () {
  "use strict";

  window.AdminPages = window.AdminPages || {};

  const AdminLib = window.AdminLib;
  if (!AdminLib) {
    throw new Error("AdminLib is missing: ensure ./lib/api.js is loaded first");
  }

  const {
    $,
    escapeHTML,
    apiFetch,
    showToast,
    openModal,
    tagsArrayToInput,
    tagsInputToArray,
  } = AdminLib;

  function problemsSkeletonHTML() {
    return `
      <div class="page page--wide">
        <div class="problems-layout">
          <div class="card card--panel">
            <div class="card__header">
              <div>
                <div class="card__title-sm">Problems</div>
                <div class="card__subtle">搜索/筛选后点选进行编辑（编辑区暂占位）</div>
              </div>
              <div class="row">
                <button class="btn btn--ghost" type="button" id="problemsRefreshBtn">刷新</button>
              </div>
            </div>

            <div class="card__row" style="padding-top:0;">
              <input class="input" id="problemsSearchInput" placeholder="搜索 id/title…" />
              <select class="input" id="problemsStatusSelect" style="max-width:160px;">
                <option value="">全部状态</option>
                <option value="draft">draft</option>
                <option value="published">published</option>
                <option value="archived">archived</option>
              </select>
            </div>

            <div id="problemsList" class="problems-list" aria-label="Problems 列表">
              <div class="skeleton" style="width: 70%"></div>
              <div class="skeleton" style="width: 54%"></div>
              <div class="skeleton" style="width: 62%"></div>
              <div class="skeleton" style="width: 46%"></div>
            </div>
          </div>

          <div class="card card--panel">
            <div class="card__header">
              <div>
                <div class="card__title-sm">编辑</div>
                <div class="card__subtle">选择左侧问题后开始编辑</div>
              </div>
            </div>

            <div id="problemsEditor">
              <div class="empty-hint">喵～先从左侧选一个问题，右侧才会显示编辑占位～</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function normalizeSearch(s) {
    return String(s || "").trim().toLowerCase();
  }

  function matches(p, q, status) {
    const st = String((p && p.status) || "");
    if (status && st !== status) return false;
    if (!q) return true;
    const hay = [
      p && p.id ? p.id : "",
      p && p.title ? p.title : "",
      p && p.summary ? p.summary : "",
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  }

  window.AdminPages.problems = {
    /**
     * @param {HTMLElement} pageEl
     * @param {{ensureActive?:()=>boolean}=} ctx
     */
    render(pageEl, ctx) {
      const ensureActive =
        ctx && typeof ctx.ensureActive === "function" ? ctx.ensureActive : () => true;

      pageEl.innerHTML = problemsSkeletonHTML();

      const listEl = $("#problemsList", pageEl);
      const editorEl = $("#problemsEditor", pageEl);
      const searchEl = $("#problemsSearchInput", pageEl);
      const statusEl = $("#problemsStatusSelect", pageEl);
      const refreshBtn = $("#problemsRefreshBtn", pageEl);

      /** @type {{items:any[], selectedId:string, selectedProblem:any|null, activeTab:string, dirty:boolean, form:any}} */
      const state = {
        items: [],
        selectedId: "",
        selectedProblem: null,
        activeTab: "problem", // problem | questions | suggestions | tools
        dirty: false,
        form: {
          title: "",
          summary: "",
          tagsText: "",
          status: "draft",
        },
      };

      function confirmDiscardIfDirty(nextActionLabel) {
        if (!state.dirty) return Promise.resolve(true);
        return new Promise((resolve) => {
          const handle = openModal({
            title: "有未保存更改",
            bodyHTML: `
              <div class="empty-hint" style="margin:0 0 12px;">
                你有未保存的修改。要放弃这些更改并继续${escapeHTML(
                  nextActionLabel || "操作"
                )}吗？
              </div>
              <div class="row" style="justify-content:flex-end;gap:10px;">
                <button class="btn btn--ghost" type="button" data-keep>继续编辑</button>
                <button class="btn btn--primary" type="button" data-discard>放弃更改</button>
              </div>
            `,
          });
          handle.backdrop.addEventListener("click", (e) => {
            const discard =
              e.target && e.target.closest ? e.target.closest("[data-discard]") : null;
            const keep =
              e.target && e.target.closest ? e.target.closest("[data-keep]") : null;
            if (discard) {
              handle.close();
              resolve(true);
            } else if (keep) {
              handle.close();
              resolve(false);
            }
          });
        });
      }

      function resetFormFromSelected() {
        const p = state.selectedProblem || {};
        state.form = {
          title: p.title || "",
          summary: p.summary || "",
          tagsText: tagsArrayToInput(p.tags || []),
          status: p.status || "draft",
        };
        state.dirty = false;
      }

      function renderEditor() {
        if (!editorEl) return;
        if (!state.selectedId) {
          editorEl.innerHTML = `<div class="empty-hint">喵～先从左侧选一个问题～</div>`;
          return;
        }

        const p = state.selectedProblem || {};
        const tab = state.activeTab;

        function tabBtn(key, label) {
          const active = key === tab;
          const klass = active ? "btn btn--primary" : "btn btn--ghost";
          return `<button type="button" class="${klass}" data-tab="${escapeHTML(
            key
          )}">${escapeHTML(label)}</button>`;
        }

        editorEl.innerHTML = `
          <div class="pill pill--soft" style="margin: 0 0 10px;">
            已选择：<span class="cell-mono">#${escapeHTML(state.selectedId)}</span>
            ${state.dirty ? `<span class="pill pill--soft" style="margin-left:8px;">未保存</span>` : ""}
          </div>

          <div class="row" style="gap:10px;flex-wrap:wrap;margin:0 0 12px;">
            ${tabBtn("problem", "Problem")}
            ${tabBtn("questions", "Questions")}
            ${tabBtn("suggestions", "Suggestions")}
            ${tabBtn("tools", "Tools Guide")}
          </div>

          <div class="card" style="padding:14px;">
            ${
              tab === "problem"
                ? `
              <div class="row" style="justify-content:space-between;align-items:flex-end;gap:12px;">
                <div>
                  <div style="font-weight:900;">基础信息</div>
                  <div class="card__subtle">编辑后点“保存”才会生效</div>
                </div>
                <button class="btn btn--primary" type="button" id="problemSaveBtn">保存</button>
              </div>

              <div class="kv" style="margin-top:12px;">
                <div class="field">
                  <label>ID（只读）</label>
                  <input class="input cell-mono" value="${escapeHTML(p.id || state.selectedId)}" disabled />
                </div>

                <div class="field">
                  <label>标题 title</label>
                  <input class="input" id="problemTitleInput" value="${escapeHTML(
                    state.form.title
                  )}" placeholder="例如：夜里一直喵叫" />
                </div>

                <div class="field">
                  <label>摘要 summary</label>
                  <textarea class="input textarea" id="problemSummaryInput" placeholder="一句话摘要…">${escapeHTML(
                    state.form.summary
                  )}</textarea>
                </div>

                <div class="field">
                  <label>标签 tags（逗号分隔）</label>
                  <input class="input" id="problemTagsInput" value="${escapeHTML(
                    state.form.tagsText
                  )}" placeholder="e.g. 夜间, 行为, 叫声" />
                </div>

                <div class="field">
                  <label>状态 status</label>
                  <select class="input" id="problemStatusSelect">
                    ${["draft", "published", "archived"]
                      .map((s) => {
                        const selected = String(state.form.status) === s ? "selected" : "";
                        return `<option value="${s}" ${selected}>${s}</option>`;
                      })
                      .join("")}
                  </select>
                </div>
              </div>
            `
                : `
              <div class="empty-hint">这一页先占位喵～接下来会把 ${escapeHTML(
                tab
              )} 的 CRUD 接进来。</div>
            `
            }
          </div>
        `;

        // bind tab switch
        editorEl.addEventListener(
          "click",
          async (e) => {
            const btn =
              e.target && e.target.closest ? e.target.closest("[data-tab]") : null;
            if (!btn) return;
            const nextTab = btn.getAttribute("data-tab") || "";
            if (!nextTab || nextTab === state.activeTab) return;
            const ok = await confirmDiscardIfDirty(`切换到 ${nextTab} 标签`);
            if (!ok) return;
            resetFormFromSelected();
            state.activeTab = nextTab;
            renderEditor();
          },
          { once: true }
        );

        if (tab === "problem") {
          const titleInput = $("#problemTitleInput", editorEl);
          const summaryInput = $("#problemSummaryInput", editorEl);
          const tagsInput = $("#problemTagsInput", editorEl);
          const statusSelect = $("#problemStatusSelect", editorEl);
          const saveBtn = $("#problemSaveBtn", editorEl);

          function markDirty() {
            if (!state.dirty) {
              state.dirty = true;
              // update the little "未保存" badge
              renderEditor();
            }
          }

          if (titleInput)
            titleInput.addEventListener("input", () => {
              state.form.title = titleInput.value;
              markDirty();
            });
          if (summaryInput)
            summaryInput.addEventListener("input", () => {
              state.form.summary = summaryInput.value;
              markDirty();
            });
          if (tagsInput)
            tagsInput.addEventListener("input", () => {
              state.form.tagsText = tagsInput.value;
              markDirty();
            });
          if (statusSelect)
            statusSelect.addEventListener("change", () => {
              state.form.status = statusSelect.value;
              markDirty();
            });

          if (saveBtn)
            saveBtn.addEventListener("click", async () => {
              const id = state.selectedId;
              if (!id) return;

              const patch = { actor: "admin" };
              const title = String(state.form.title || "").trim();
              const summary = String(state.form.summary || "").trim();
              const tags = tagsInputToArray(state.form.tagsText || "");
              const status = String(state.form.status || "draft");

              // Only send changed fields (reduce audit noise).
              const prev = state.selectedProblem || {};
              if (title !== String(prev.title || "")) patch.title = title;
              if (summary !== String(prev.summary || "")) patch.summary = summary;
              if (JSON.stringify(tags) !== JSON.stringify(prev.tags || [])) patch.tags = tags;
              if (status !== String(prev.status || "")) patch.status = status;

              const keys = Object.keys(patch).filter((k) => k !== "actor");
              if (!keys.length) {
                showToast("没有变更可保存～", "success");
                state.dirty = false;
                renderEditor();
                return;
              }

              try {
                await apiFetch(`/admin/problems/${encodeURIComponent(id)}`, {
                  method: "PATCH",
                  body: patch,
                });
                showToast("已保存～", "success");

                // Refresh selected problem from API so editor stays accurate
                const latest = await apiFetch(`/admin/problems/${encodeURIComponent(id)}`);
                state.selectedProblem = latest;
                resetFormFromSelected();
                renderList();
                renderEditor();
              } catch (err) {
                showToast(`保存失败：${String(err && err.message ? err.message : err)}`, "danger");
              }
            });
        }
      }

      function renderList() {
        if (!listEl) return;
        const q = normalizeSearch(searchEl && searchEl.value ? searchEl.value : "");
        const st = statusEl && statusEl.value ? String(statusEl.value) : "";
        const filtered = (state.items || []).filter((p) => matches(p, q, st));

        if (!filtered.length) {
          listEl.innerHTML = `<div class="empty-hint">喵～列表为空（或筛选后为空）。</div>`;
          return;
        }

        listEl.innerHTML = filtered
          .map((p) => {
            const id = p && p.id !== undefined ? String(p.id) : "";
            const active = id && id === state.selectedId ? "is-active" : "";
            const title = p && p.title ? String(p.title) : id;
            const status = p && p.status ? String(p.status) : "-";
            return `
              <button type="button" class="problems-item ${active}" data-problem-id="${escapeHTML(
                id
              )}">
                <div class="problems-item__title">${escapeHTML(title || id)}</div>
                <div class="problems-item__meta">
                  <span class="pill pill--soft">#${escapeHTML(id || "-")}</span>
                  <span class="pill pill--soft">${escapeHTML(status)}</span>
                </div>
              </button>
            `;
          })
          .join("");
      }

      async function loadList() {
        if (!ensureActive()) return;
        if (listEl) {
          listEl.innerHTML = `
            <div class="skeleton" style="width: 70%"></div>
            <div class="skeleton" style="width: 54%"></div>
            <div class="skeleton" style="width: 62%"></div>
            <div class="skeleton" style="width: 46%"></div>
          `;
        }

        try {
          const res = await apiFetch("/admin/problems");
          if (!ensureActive()) return;
          const items = res && typeof res === "object" ? res.items : [];
          state.items = Array.isArray(items) ? items : [];
          // keep selection if possible
          if (state.selectedId) {
            const exists = state.items.some((p) => String(p && p.id) === state.selectedId);
            if (!exists) state.selectedId = "";
          }
          renderList();
          renderEditor();
        } catch (err) {
          if (!ensureActive()) return;
          const msg = `Problems 列表加载失败：${String(err && err.message ? err.message : err)}`;
          showToast(msg, "danger");
          if (listEl) listEl.innerHTML = `<pre class="code-block">${escapeHTML(msg)}</pre>`;
        }
      }

      function syncFilter() {
        renderList();
      }

      if (searchEl) searchEl.addEventListener("input", syncFilter);
      if (statusEl) statusEl.addEventListener("change", syncFilter);
      if (refreshBtn) refreshBtn.addEventListener("click", () => void loadList());

      if (listEl) {
        listEl.addEventListener("click", (e) => {
          const btn =
            e.target && e.target.closest
              ? e.target.closest("[data-problem-id]")
              : null;
          if (!btn) return;
          const id = btn.getAttribute("data-problem-id") || "";
          if (!id) return;
          void (async () => {
            if (id === state.selectedId) return;
            const ok = await confirmDiscardIfDirty("切换问题");
            if (!ok) return;
            state.selectedId = id;
            state.activeTab = "problem";
            state.selectedProblem = null;
            state.dirty = false;
            renderList();
            renderEditor();
            try {
              const p = await apiFetch(`/admin/problems/${encodeURIComponent(id)}`);
              state.selectedProblem = p;
              resetFormFromSelected();
              renderList();
              renderEditor();
            } catch (err) {
              showToast(
                `加载问题详情失败：${String(err && err.message ? err.message : err)}`,
                "danger"
              );
            }
          })();
        });
      }

      void loadList();
    },
  };
})();
