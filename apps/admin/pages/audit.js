// Admin Audit page (Vanilla JS, no build chain)
(function () {
  "use strict";

  window.AdminPages = window.AdminPages || {};

  function buildAuditURL(params) {
    const p = new URLSearchParams();
    p.set("limit", String((params && params.limit) || 200));
    if (params && params.cursor) p.set("cursor", String(params.cursor));
    if (params && params.actor) p.set("actor", params.actor);
    if (params && params.action) p.set("action", params.action);
    if (params && params.entity_type) p.set("entity_type", params.entity_type);
    if (params && params.entity_id) p.set("entity_id", params.entity_id);
    if (params && params.from) p.set("from", String(params.from));
    if (params && params.to) p.set("to", String(params.to));
    return `/admin/audit?${p.toString()}`;
  }

  function auditLoadingHTML() {
    return `
      <div class="page page--wide">
        <div class="card card--panel">
          <div class="card__header">
            <div>
              <div class="card__title-sm">Audit · 操作日志</div>
              <div class="card__subtle">GET /admin/audit?limit=200 · 服务端筛选 + 本地二次过滤</div>
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

  function parseMsOptional(inputValue) {
    const raw = String(inputValue || "").trim();
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return NaN;
    return Math.floor(n);
  }

  function normalizeServerParams(p) {
    const out = {
      actor: String(p && p.actor ? p.actor : "").trim(),
      action: String(p && p.action ? p.action : "").trim(),
      entity_type: String(p && p.entity_type ? p.entity_type : "").trim(),
      entity_id: String(p && p.entity_id ? p.entity_id : "").trim(),
      from: p && p.from !== undefined ? p.from : null,
      to: p && p.to !== undefined ? p.to : null,
    };
    return out;
  }

  async function fetchAudit(params) {
    const { apiFetch } = window.AdminLib;
    const res = await apiFetch(buildAuditURL(params || {}));
    const items = res && typeof res === "object" ? res.items : [];
    const next = res && typeof res === "object" ? res.next_cursor : null;
    return {
      items: Array.isArray(items) ? items : [],
      next_cursor: next === undefined ? null : next,
    };
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

      const state = {
        items: [],
        q: "",
        server: normalizeServerParams({}),
        nextCursor: null,
        loading: false,
      };

      function rerender() {
        const q = normalizeSearch(state.q);
        const filtered = state.items.filter((it) => matches(it, q));
        const tableHost = $("#auditTableHost", el);
        if (tableHost) renderTable(tableHost, filtered);
        renderPager();
      }

      function renderShell() {
        el.innerHTML = `
          <div class="page page--wide">
            <div class="card card--panel">
              <div class="card__header">
                <div>
                  <div class="card__title-sm">Audit · 操作日志</div>
                  <div class="card__subtle">GET /admin/audit · 服务端筛选 + 本地二次过滤 + diff 折叠</div>
                </div>
              </div>
              <form id="auditServerForm" class="form" autocomplete="off">
                <div class="row" style="gap:10px;align-items:center;">
                  <button class="btn btn--ghost" type="button" data-audit-quick="24h">近 24h</button>
                  <button class="btn btn--ghost" type="button" data-audit-quick="7d">近 7d</button>
                  <span class="pill pill--soft">from/to 用 ms 时间戳</span>
                  <div style="margin-left:auto;width:240px;">
                    <input class="input" id="auditSearchInput" placeholder="本地搜索 actor/action/entity_type/entity_id…" />
                  </div>
                </div>

                <div class="audit-filter-grid">
                  <div class="field">
                    <label for="auditActor">actor</label>
                    <input id="auditActor" class="input" placeholder="例如：admin" />
                  </div>
                  <div class="field">
                    <label for="auditAction">action</label>
                    <input id="auditAction" class="input" placeholder="例如：publish" />
                  </div>
                  <div class="field">
                    <label for="auditEntityType">entity_type</label>
                    <input id="auditEntityType" class="input" placeholder="例如：release" />
                  </div>
                  <div class="field">
                    <label for="auditEntityId">entity_id</label>
                    <input id="auditEntityId" class="input" placeholder="例如：12" />
                  </div>
                  <div class="field">
                    <label for="auditFrom">from (ms)</label>
                    <input
                      id="auditFrom"
                      class="input cell-mono"
                      inputmode="numeric"
                      placeholder="例如：1713840000000"
                    />
                  </div>
                  <div class="field">
                    <label for="auditTo">to (ms)</label>
                    <input
                      id="auditTo"
                      class="input cell-mono"
                      inputmode="numeric"
                      placeholder="例如：1713926400000"
                    />
                  </div>
                  <div class="field">
                    <label>&nbsp;</label>
                    <button class="btn btn--primary" type="submit" id="auditQueryBtn">查询</button>
                  </div>
                </div>
              </form>
              <div id="auditTableHost"></div>
              <div id="auditPager" class="audit-pager"></div>
            </div>
          </div>
        `;

        const input = $("#auditSearchInput", el);
        const form = $("#auditServerForm", el);

        const actorEl = $("#auditActor", el);
        const actionEl = $("#auditAction", el);
        const entityTypeEl = $("#auditEntityType", el);
        const entityIdEl = $("#auditEntityId", el);
        const fromEl = $("#auditFrom", el);
        const toEl = $("#auditTo", el);
        const queryBtn = $("#auditQueryBtn", el);

        if (input) {
          input.value = state.q;
          input.addEventListener("input", () => {
            state.q = input.value || "";
            rerender();
          });
        }

        // restore last server params
        if (actorEl) actorEl.value = state.server.actor || "";
        if (actionEl) actionEl.value = state.server.action || "";
        if (entityTypeEl) entityTypeEl.value = state.server.entity_type || "";
        if (entityIdEl) entityIdEl.value = state.server.entity_id || "";
        if (fromEl) fromEl.value = state.server.from ? String(state.server.from) : "";
        if (toEl) toEl.value = state.server.to ? String(state.server.to) : "";

        function setLoading(v) {
          state.loading = Boolean(v);
          if (queryBtn) queryBtn.disabled = state.loading;
          const moreBtn = $("#auditLoadMoreBtn", el);
          if (moreBtn) moreBtn.disabled = state.loading;
        }

        function applyQuick(kind) {
          const now = Date.now();
          const delta = kind === "7d" ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
          const from = now - delta;
          const to = now;
          if (fromEl) fromEl.value = String(from);
          if (toEl) toEl.value = String(to);
        }

        el.querySelectorAll("[data-audit-quick]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const kind = btn.getAttribute("data-audit-quick");
            if (kind) applyQuick(kind);
          });
        });

        async function queryFirstPage() {
          if (state.loading) return;

          const from = parseMsOptional(fromEl ? fromEl.value : "");
          const to = parseMsOptional(toEl ? toEl.value : "");
          if (Number.isNaN(from)) {
            showToast("from 不是合法的 ms 时间戳", "danger");
            return;
          }
          if (Number.isNaN(to)) {
            showToast("to 不是合法的 ms 时间戳", "danger");
            return;
          }

          state.server = normalizeServerParams({
            actor: actorEl ? actorEl.value : "",
            action: actionEl ? actionEl.value : "",
            entity_type: entityTypeEl ? entityTypeEl.value : "",
            entity_id: entityIdEl ? entityIdEl.value : "",
            from,
            to,
          });

          setLoading(true);
          try {
            const res = await fetchAudit({
              limit: 200,
              cursor: null,
              actor: state.server.actor || undefined,
              action: state.server.action || undefined,
              entity_type: state.server.entity_type || undefined,
              entity_id: state.server.entity_id || undefined,
              from: state.server.from || undefined,
              to: state.server.to || undefined,
            });
            if (!ensureActive()) return;
            state.items = res.items || [];
            state.nextCursor = res.next_cursor || null;
            rerender();
          } catch (err) {
            if (!ensureActive()) return;
            showToast(
              `Audit 查询失败：${String(err && err.message ? err.message : err)}`,
              "danger"
            );
          } finally {
            setLoading(false);
          }
        }

        async function loadMore() {
          if (state.loading) return;
          if (!state.nextCursor) return;

          setLoading(true);
          try {
            const res = await fetchAudit({
              limit: 200,
              cursor: state.nextCursor,
              actor: state.server.actor || undefined,
              action: state.server.action || undefined,
              entity_type: state.server.entity_type || undefined,
              entity_id: state.server.entity_id || undefined,
              from: state.server.from || undefined,
              to: state.server.to || undefined,
            });
            if (!ensureActive()) return;
            const more = res.items || [];
            state.items = state.items.concat(more);
            state.nextCursor = res.next_cursor || null;
            rerender();
          } catch (err) {
            if (!ensureActive()) return;
            showToast(
              `Audit 加载更多失败：${String(err && err.message ? err.message : err)}`,
              "danger"
            );
          } finally {
            setLoading(false);
          }
        }

        if (form) {
          form.addEventListener("submit", (e) => {
            e.preventDefault();
            queryFirstPage();
          });
        }

        // expose for pager button binding
        state._loadMore = loadMore;
        state._queryFirstPage = queryFirstPage;
      }

      function renderPager() {
        const host = $("#auditPager", el);
        if (!host) return;

        if (!state.items.length && !state.loading) {
          host.innerHTML = "";
          return;
        }

        if (state.nextCursor) {
          host.innerHTML = `
            <button class="btn btn--ghost" type="button" id="auditLoadMoreBtn">加载更多</button>
          `;
          const btn = $("#auditLoadMoreBtn", el);
          if (btn) {
            btn.disabled = Boolean(state.loading);
            btn.addEventListener("click", () => {
              if (typeof state._loadMore === "function") state._loadMore();
            });
          }
          return;
        }

        host.innerHTML = `<div class="empty-hint">喵～到底啦</div>`;
      }

      async function load() {
        try {
          const res = await fetchAudit({ limit: 200 });
          if (!ensureActive()) return;
          state.items = res.items || [];
          state.nextCursor = res.next_cursor || null;
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
