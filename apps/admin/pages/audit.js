// Admin Audit page (Vanilla JS, no build chain)
(function () {
  "use strict";

  window.AdminPages = window.AdminPages || {};

  function auditLoadingHTML() {
    return `
      <div class="page page--wide">
        <div class="card card--panel">
          <div class="card__header">
            <div>
              <div class="card__title-sm">Audit · 操作日志</div>
              <div class="card__subtle">GET /admin/audit?limit=200</div>
            </div>
            <div class="row">
              <div class="skeleton" style="width: 220px;height: 36px;border-radius: 14px;"></div>
              <div class="skeleton" style="width: 86px;height: 36px;border-radius: 14px;"></div>
            </div>
          </div>
          <div class="card__row">
            <div class="skeleton" style="width: 90%"></div>
            <div class="skeleton" style="width: 84%"></div>
            <div class="skeleton" style="width: 88%"></div>
          </div>
        </div>
      </div>
    `;
  }

  function normalizeSearch(s) {
    return String(s || "").trim().toLowerCase();
  }

  function matches(item, q) {
    if (!q) return true;
    const hay = [
      item && item.actor ? item.actor : "",
      item && item.action ? item.action : "",
      item && item.entity_type ? item.entity_type : "",
      item && item.entity_id ? item.entity_id : "",
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  }

  function safePrettyJSON(v) {
    try {
      if (v === null || v === undefined) return "";
      if (typeof v === "string") {
        // try parse JSON string; otherwise print raw
        const trimmed = v.trim();
        if (
          (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
          (trimmed.startsWith("[") && trimmed.endsWith("]"))
        ) {
          return JSON.stringify(JSON.parse(trimmed), null, 2);
        }
        return v;
      }
      return JSON.stringify(v, null, 2);
    } catch (_) {
      return String(v);
    }
  }

  function diffSummary(v) {
    if (!v) return "diff: -";
    if (typeof v === "string") return v.length > 40 ? `diff: ${v.slice(0, 40)}…` : `diff: ${v}`;
    if (typeof v === "object") {
      const keys = Object.keys(v);
      if (!keys.length) return "diff: {}";
      return `diff: ${keys.slice(0, 4).join(", ")}${keys.length > 4 ? "…" : ""}`;
    }
    return `diff: ${String(v)}`;
  }

  function renderTable(el, items) {
    const { escapeHTML, formatDateTime } = window.AdminLib;

    if (!items || !items.length) {
      el.innerHTML = `<div class="empty-hint">喵～暂时没有审计日志（或过滤后为空）。</div>`;
      return;
    }

    el.innerHTML = `
      <div class="table-wrap">
        <table class="table audit-table">
          <thead>
            <tr>
              <th style="width:170px;">created_at</th>
              <th style="width:120px;">actor</th>
              <th style="width:120px;">action</th>
              <th style="width:120px;">entity_type</th>
              <th style="width:120px;">entity_id</th>
              <th>diff</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map((it) => {
                const diff = it ? it.diff : null;
                const pretty = safePrettyJSON(diff);
                return `
                  <tr>
                    <td class="cell-mono">${escapeHTML(formatDateTime(it.created_at))}</td>
                    <td>${escapeHTML(it.actor || "-")}</td>
                    <td>${escapeHTML(it.action || "-")}</td>
                    <td>${escapeHTML(it.entity_type || "-")}</td>
                    <td class="cell-mono">${escapeHTML(it.entity_id || "-")}</td>
                    <td>
                      <details class="diff-details">
                        <summary class="diff-summary">${escapeHTML(diffSummary(diff))}</summary>
                        <pre class="code-block diff-pre">${escapeHTML(pretty || "-")}</pre>
                      </details>
                    </td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  async function fetchAudit() {
    const { apiFetch } = window.AdminLib;
    const res = await apiFetch("/admin/audit?limit=200");
    const items = res && typeof res === "object" ? res.items : [];
    return Array.isArray(items) ? items : [];
  }

  window.AdminPages.audit = {
    /**
     * @param {HTMLElement} el
     * @param {{ensureActive?:()=>boolean}=} ctx
     */
    render(el, ctx) {
      const { $, showToast, escapeHTML } = window.AdminLib;
      const ensureActive =
        ctx && typeof ctx.ensureActive === "function" ? ctx.ensureActive : () => true;

      el.innerHTML = auditLoadingHTML();

      const state = { items: [], q: "" };

      function rerender() {
        const q = normalizeSearch(state.q);
        const filtered = state.items.filter((it) => matches(it, q));
        const tableHost = $("#auditTableHost", el);
        if (tableHost) renderTable(tableHost, filtered);
      }

      function renderShell() {
        el.innerHTML = `
          <div class="page page--wide">
            <div class="card card--panel">
              <div class="card__header">
                <div>
                  <div class="card__title-sm">Audit · 操作日志</div>
                  <div class="card__subtle">GET /admin/audit?limit=200 · 本地过滤 + diff 折叠</div>
                </div>
                <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap;">
                  <div style="width:240px;">
                    <input class="input" id="auditSearchInput" placeholder="搜索 actor/action/entity_type/entity_id…" />
                  </div>
                  <button class="btn btn--ghost" type="button" id="auditRefreshBtn">刷新</button>
                </div>
              </div>
              <div id="auditTableHost"></div>
            </div>
          </div>
        `;

        const input = $("#auditSearchInput", el);
        const refreshBtn = $("#auditRefreshBtn", el);

        if (input) {
          input.value = state.q;
          input.addEventListener("input", () => {
            state.q = input.value || "";
            rerender();
          });
        }

        if (refreshBtn) {
          refreshBtn.addEventListener("click", () => {
            load();
          });
        }
      }

      async function load() {
        try {
          const items = await fetchAudit();
          if (!ensureActive()) return;
          state.items = items;
          renderShell();
          rerender();
        } catch (err) {
          if (!ensureActive()) return;
          showToast(
            `Audit 加载失败：${String(err && err.message ? err.message : err)}`,
            "danger"
          );
          el.innerHTML = `
            <div class="card card--welcome">
              <div class="card__kawaii" aria-hidden="true">
                <span class="sparkle"></span>
                <span class="sparkle"></span>
                <span class="sparkle"></span>
              </div>
              <h1 class="card__title">Audit 加载失败</h1>
              <p class="card__desc">喵…可能是网络/口令/服务端出了一点小状况。稍后刷新试试，或重新登录～</p>
              <pre class="code-block">${escapeHTML(
                String(err && err.message ? err.message : err)
              )}</pre>
            </div>
          `;
        }
      }

      load();
    },
  };
})();

