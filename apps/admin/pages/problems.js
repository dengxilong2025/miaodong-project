// Admin Problems page (Vanilla JS, no build chain)
// Skeleton: left search/filter + list, right editor placeholder
(function () {
  "use strict";

  window.AdminPages = window.AdminPages || {};

  const AdminLib = window.AdminLib;
  if (!AdminLib) {
    throw new Error("AdminLib is missing: ensure ./lib/api.js is loaded first");
  }

  const { $, escapeHTML, apiFetch, showToast } = AdminLib;

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

      /** @type {{items:any[], selectedId:string}} */
      const state = { items: [], selectedId: "" };

      function renderEditor() {
        if (!editorEl) return;
        if (!state.selectedId) {
          editorEl.innerHTML = `<div class="empty-hint">喵～先从左侧选一个问题～</div>`;
          return;
        }
        editorEl.innerHTML = `
          <div class="pill pill--soft" style="margin: 0 0 10px;">
            已选择：<span class="cell-mono">#${escapeHTML(state.selectedId)}</span>
          </div>
          <div class="empty-hint">编辑器施工中～这里先放个占位喵。</div>
        `;
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
          state.selectedId = id;
          renderList();
          renderEditor();
        });
      }

      void loadList();
    },
  };
})();

