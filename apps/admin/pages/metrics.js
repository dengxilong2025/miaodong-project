// Admin Metrics page (Vanilla JS, no build chain)
// Supports:
// 1) single window: GET /admin/metrics
// 2) compare mode:  GET /admin/metrics/compare  (triggered by #/metrics?mode=compare&from_a..&to_a..&from_b..&to_b..)
(function () {
  "use strict";

  window.AdminPages = window.AdminPages || {};

  const DAY_MS = 24 * 60 * 60 * 1000;

  function parseMsStrict(inputValue) {
    const raw = String(inputValue || "").trim();
    if (!raw) return NaN;
    const n = Number(raw);
    if (!Number.isFinite(n)) return NaN;
    return Math.floor(n);
  }

  function deltaCellHTML(delta, { kind }) {
    const { escapeHTML, formatNumber } = window.AdminLib;
    const n = typeof delta === "number" ? delta : Number(delta);
    if (!Number.isFinite(n)) return `<span class="delta delta-flat">-</span>`;

    const cls = n > 0 ? "delta-up" : n < 0 ? "delta-down" : "delta-flat";
    const arrow = n > 0 ? "↑" : n < 0 ? "↓" : "→";
    const sign = n > 0 ? "+" : "";

    let txt = "";
    if (kind === "pp") {
      txt = `${sign}${(n * 100).toFixed(1)}pp`;
    } else {
      txt = `${sign}${formatNumber(n)}`;
    }
    return `<span class="delta ${cls}">${escapeHTML(arrow)} ${escapeHTML(txt)}</span>`;
  }

  function metricsSingleLoadingHTML() {
    return `
      <div class="page page--wide">
        <div class="card card--panel">
          <div class="card__header">
            <div>
              <div class="card__title-sm">查询条件</div>
              <div class="card__subtle">GET /admin/metrics?from_ts_ms=&to_ts_ms=&problem_id=</div>
            </div>
            <span class="pill pill--soft">时间窗支持快捷</span>
          </div>

          <form id="metricsForm" class="form" autocomplete="off">
            <div class="row">
              <button class="btn btn--ghost" type="button" data-metrics-quick="24h">近 24h</button>
              <button class="btn btn--ghost" type="button" data-metrics-quick="7d">近 7d</button>
              <button class="btn btn--ghost" type="button" data-metrics-quick="30d">近 30d</button>
              <span class="pill pill--soft">from/to 用 ms 时间戳</span>
            </div>

            <div class="metrics-filter-grid">
              <div class="field">
                <label for="metricsFrom">from_ts_ms</label>
                <input id="metricsFrom" class="input cell-mono" inputmode="numeric" placeholder="例如：1713840000000" />
              </div>
              <div class="field">
                <label for="metricsTo">to_ts_ms</label>
                <input id="metricsTo" class="input cell-mono" inputmode="numeric" placeholder="例如：1713926400000" />
              </div>
              <div class="field">
                <label for="metricsProblemId">problem_id（可选）</label>
                <input id="metricsProblemId" class="input" placeholder="例如：night_meow" />
              </div>
              <div class="field">
                <label>&nbsp;</label>
                <button class="btn btn--primary" type="submit" id="metricsQueryBtn">查询</button>
              </div>
            </div>
          </form>
        </div>

        <div class="grid" style="margin-top:14px;">
          <div class="card card--panel">
            <div class="card__header">
              <div>
                <div class="card__title-sm">汇总</div>
                <div class="card__subtle" id="metricsWindowHint">-</div>
              </div>
              <span class="pill pill--soft">events / users</span>
            </div>
            <div id="metricsSummary">
              <div class="card__row">
                <div class="skeleton" style="width: 52%"></div>
                <div class="skeleton" style="width: 68%"></div>
                <div class="skeleton" style="width: 46%"></div>
              </div>
            </div>
          </div>

          <div class="card card--panel">
            <div class="card__header">
              <div>
                <div class="card__title-sm">反馈</div>
                <div class="card__subtle">event_name=feedback_submitted</div>
              </div>
              <span class="pill pill--soft">helpful_rate</span>
            </div>
            <div id="metricsFeedback">
              <div class="card__row">
                <div class="skeleton" style="width: 56%"></div>
                <div class="skeleton" style="width: 62%"></div>
                <div class="skeleton" style="width: 44%"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="card card--panel" style="margin-top:14px;">
          <div class="card__header">
            <div>
              <div class="card__title-sm">by_event_name Top10</div>
              <div class="card__subtle">按事件名聚合（count desc）</div>
            </div>
            <span class="pill pill--soft">Top 10</span>
          </div>
          <div id="metricsByEvent" class="table-wrap" aria-label="by_event_name Top10">
            <div class="skeleton" style="width: 72%"></div>
            <div class="skeleton" style="width: 56%"></div>
            <div class="skeleton" style="width: 64%"></div>
          </div>
        </div>
      </div>
    `;
  }

  function metricsCompareLoadingHTML() {
    return `
      <div class="page page--wide">
        <div class="card card--panel">
          <div class="card__header">
            <div>
              <div class="card__title-sm">窗口对比</div>
              <div class="card__subtle">GET /admin/metrics/compare?from_a=&to_a=&from_b=&to_b=&problem_id=</div>
            </div>
            <span class="pill pill--soft">mode=compare</span>
          </div>

          <form id="metricsCompareForm" class="form" autocomplete="off">
            <div class="row">
              <a class="btn btn--ghost" href="#/metrics">返回单窗口</a>
              <span class="pill pill--soft">A/B 都用 ms 时间戳</span>
            </div>

            <div class="metrics-filter-grid" style="grid-template-columns: repeat(4, minmax(0, 1fr)) auto;">
              <div class="field">
                <label for="metricsFromA">from_a</label>
                <input id="metricsFromA" class="input cell-mono" inputmode="numeric" placeholder="A 开始" />
              </div>
              <div class="field">
                <label for="metricsToA">to_a</label>
                <input id="metricsToA" class="input cell-mono" inputmode="numeric" placeholder="A 结束" />
              </div>
              <div class="field">
                <label for="metricsFromB">from_b</label>
                <input id="metricsFromB" class="input cell-mono" inputmode="numeric" placeholder="B 开始" />
              </div>
              <div class="field">
                <label for="metricsToB">to_b</label>
                <input id="metricsToB" class="input cell-mono" inputmode="numeric" placeholder="B 结束" />
              </div>
              <div class="field">
                <label>&nbsp;</label>
                <button class="btn btn--primary" type="submit" id="metricsCompareBtn">对比</button>
              </div>
            </div>

            <div class="metrics-filter-grid" style="grid-template-columns: 1fr auto;align-items:end;">
              <div class="field">
                <label for="metricsCompareProblemId">problem_id（可选）</label>
                <input id="metricsCompareProblemId" class="input" placeholder="例如：night_meow" />
              </div>
              <div class="field">
                <label>&nbsp;</label>
                <div class="pill pill--soft">渲染：A / B / Δ（B-A）</div>
              </div>
            </div>
          </form>
        </div>

        <div class="card card--panel" style="margin-top:14px;">
          <div class="card__header">
            <div>
              <div class="card__title-sm">对比结果</div>
              <div class="card__subtle" id="metricsCompareHint">-</div>
            </div>
            <span class="pill pill--soft">B - A</span>
          </div>

          <div id="metricsCompareTable" class="table-wrap" aria-label="Metrics Compare">
            <div class="skeleton" style="width: 70%"></div>
            <div class="skeleton" style="width: 54%"></div>
            <div class="skeleton" style="width: 62%"></div>
          </div>
        </div>
      </div>
    `;
  }

  function renderByEventTable(byEventEl, items) {
    const { escapeHTML, formatNumber } = window.AdminLib;
    if (!byEventEl) return;
    const arr = Array.isArray(items) ? items : [];
    const top = arr.slice(0, 10);
    if (!top.length) {
      byEventEl.innerHTML = `<div class="empty-hint">喵～这个时间窗里没有事件数据。</div>`;
      return;
    }
    byEventEl.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th style="width:64px;">#</th>
            <th>event_name</th>
            <th style="width:140px;">count</th>
          </tr>
        </thead>
        <tbody>
          ${top
            .map((it, idx) => {
              const name = it && it.event_name !== undefined ? String(it.event_name) : "-";
              const cnt = it && it.count !== undefined ? it.count : "-";
              return `
                <tr>
                  <td class="cell-mono">${escapeHTML(String(idx + 1))}</td>
                  <td class="cell-mono">${escapeHTML(name)}</td>
                  <td class="cell-mono">${escapeHTML(formatNumber(cnt))}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    `;
  }

  function renderSingle(el, ctx) {
    const { $, apiFetch, showToast, escapeHTML, formatDateTime, formatNumber, formatPercent01 } =
      window.AdminLib;
    const ensureActive =
      ctx && typeof ctx.ensureActive === "function" ? ctx.ensureActive : () => true;

    el.innerHTML = metricsSingleLoadingHTML();

    const form = $("#metricsForm", el);
    const fromEl = $("#metricsFrom", el);
    const toEl = $("#metricsTo", el);
    const problemIdEl = $("#metricsProblemId", el);
    const queryBtn = $("#metricsQueryBtn", el);

    const windowHintEl = $("#metricsWindowHint", el);
    const summaryEl = $("#metricsSummary", el);
    const feedbackEl = $("#metricsFeedback", el);
    const byEventEl = $("#metricsByEvent", el);

    function setWindowInputs(from, to) {
      if (fromEl) fromEl.value = String(from);
      if (toEl) toEl.value = String(to);
    }

    function renderLoading() {
      if (summaryEl) {
        summaryEl.innerHTML = `
          <div class="card__row">
            <div class="skeleton" style="width: 52%"></div>
            <div class="skeleton" style="width: 68%"></div>
            <div class="skeleton" style="width: 46%"></div>
          </div>
        `;
      }
      if (feedbackEl) {
        feedbackEl.innerHTML = `
          <div class="card__row">
            <div class="skeleton" style="width: 56%"></div>
            <div class="skeleton" style="width: 62%"></div>
            <div class="skeleton" style="width: 44%"></div>
          </div>
        `;
      }
      if (byEventEl) {
        byEventEl.innerHTML = `
          <div class="skeleton" style="width: 72%"></div>
          <div class="skeleton" style="width: 56%"></div>
          <div class="skeleton" style="width: 64%"></div>
        `;
      }
    }

    function renderData(data) {
      if (!ensureActive()) return;

      const w = data && data.window ? data.window : null;
      const f = data && data.filter ? data.filter : null;
      const from = w && w.from_ts_ms !== undefined ? w.from_ts_ms : null;
      const to = w && w.to_ts_ms !== undefined ? w.to_ts_ms : null;
      const pid = f && f.problem_id !== undefined ? f.problem_id : "";

      if (windowHintEl) {
        const hint = `${formatDateTime(from)} ～ ${formatDateTime(to)}${
          pid ? ` · problem_id=${String(pid)}` : ""
        }`;
        windowHintEl.textContent = hint;
      }

      const eventsTotal = data ? data.events_total : null;
      const distinctUsers = data ? data.distinct_users : null;
      const fb = data && data.feedback ? data.feedback : null;
      const fbTotal = fb ? fb.total : null;
      const fbHelpful = fb ? fb.helpful : null;
      const fbRate = fb ? fb.helpful_rate : null;

      if (summaryEl) {
        summaryEl.innerHTML = `
          <div class="stats stats--2">
            <div class="stat">
              <div class="stat__k">events_total</div>
              <div class="stat__v">${escapeHTML(formatNumber(eventsTotal))}</div>
            </div>
            <div class="stat">
              <div class="stat__k">distinct_users</div>
              <div class="stat__v">${escapeHTML(formatNumber(distinctUsers))}</div>
            </div>
          </div>
        `;
      }

      if (feedbackEl) {
        feedbackEl.innerHTML = `
          <div class="stats stats--3">
            <div class="stat">
              <div class="stat__k">feedback.total</div>
              <div class="stat__v">${escapeHTML(formatNumber(fbTotal))}</div>
            </div>
            <div class="stat">
              <div class="stat__k">feedback.helpful</div>
              <div class="stat__v">${escapeHTML(formatNumber(fbHelpful))}</div>
            </div>
            <div class="stat">
              <div class="stat__k">feedback.helpful_rate</div>
              <div class="stat__v">${escapeHTML(formatPercent01(fbRate, 1))}</div>
            </div>
          </div>
        `;
      }

      renderByEventTable(byEventEl, data ? data.by_event_name : []);
    }

    async function doQuery() {
      if (!ensureActive()) return;
      const from = parseMsStrict(fromEl && fromEl.value ? fromEl.value : "");
      const to = parseMsStrict(toEl && toEl.value ? toEl.value : "");
      const problemId = (problemIdEl && problemIdEl.value ? problemIdEl.value : "").trim();

      if (!Number.isFinite(from) || !Number.isFinite(to)) {
        showToast("from_ts_ms / to_ts_ms 需要是 ms 时间戳（整数）喵～", "danger");
        return;
      }
      if (from > to) {
        showToast("from_ts_ms 不能大于 to_ts_ms 喵～", "danger");
        return;
      }

      if (queryBtn) queryBtn.disabled = true;
      renderLoading();
      if (windowHintEl)
        windowHintEl.textContent = `${formatDateTime(from)} ～ ${formatDateTime(to)}${
          problemId ? ` · problem_id=${problemId}` : ""
        }`;

      const params = new URLSearchParams();
      params.set("from_ts_ms", String(from));
      params.set("to_ts_ms", String(to));
      params.set("problem_id", problemId);

      try {
        const data = await apiFetch(`/admin/metrics?${params.toString()}`);
        if (!ensureActive()) return;
        renderData(data);
      } catch (err) {
        if (!ensureActive()) return;
        showToast(`查询失败：${String(err && err.message ? err.message : err)}`, "danger");
        if (summaryEl) {
          summaryEl.innerHTML = `<pre class="code-block">${escapeHTML(
            String(err && err.message ? err.message : err)
          )}</pre>`;
        }
        if (feedbackEl) feedbackEl.innerHTML = `<div class="empty-hint">反馈统计暂不可用。</div>`;
        if (byEventEl) byEventEl.innerHTML = `<div class="empty-hint">事件表暂不可用。</div>`;
      } finally {
        if (queryBtn) queryBtn.disabled = false;
      }
    }

    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        void doQuery();
      });
    }

    // quick window buttons
    el.addEventListener("click", (e) => {
      const btn = e.target && e.target.closest ? e.target.closest("[data-metrics-quick]") : null;
      if (!btn) return;
      const key = btn.getAttribute("data-metrics-quick") || "";
      const now = Date.now();
      if (key === "24h") setWindowInputs(now - 1 * DAY_MS, now);
      else if (key === "7d") setWindowInputs(now - 7 * DAY_MS, now);
      else if (key === "30d") setWindowInputs(now - 30 * DAY_MS, now);
      void doQuery();
    });

    // default: last 24h and auto query
    const now = Date.now();
    setWindowInputs(now - 1 * DAY_MS, now);
    void doQuery();
  }

  function renderCompare(el, ctx) {
    const { $, apiFetch, showToast, escapeHTML, formatDateTime, formatNumber, formatPercent01 } =
      window.AdminLib;
    const ensureActive =
      ctx && typeof ctx.ensureActive === "function" ? ctx.ensureActive : () => true;
    const routeQuery = ctx && ctx.routeQuery ? ctx.routeQuery : {};

    el.innerHTML = metricsCompareLoadingHTML();

    const form = $("#metricsCompareForm", el);
    const fromAEl = $("#metricsFromA", el);
    const toAEl = $("#metricsToA", el);
    const fromBEl = $("#metricsFromB", el);
    const toBEl = $("#metricsToB", el);
    const problemIdEl = $("#metricsCompareProblemId", el);
    const btn = $("#metricsCompareBtn", el);
    const hintEl = $("#metricsCompareHint", el);
    const tableWrapEl = $("#metricsCompareTable", el);

    function renderLoading() {
      if (!tableWrapEl) return;
      tableWrapEl.innerHTML = `
        <div class="skeleton" style="width: 70%"></div>
        <div class="skeleton" style="width: 54%"></div>
        <div class="skeleton" style="width: 62%"></div>
      `;
    }

    function renderCompareTable(data) {
      if (!ensureActive()) return;
      if (!tableWrapEl) return;

      const a = data && data.a ? data.a : null;
      const b = data && data.b ? data.b : null;
      const d = data && data.delta ? data.delta : null;

      const aEvents = a ? a.events_total : null;
      const bEvents = b ? b.events_total : null;
      const dEvents = d ? d.events_total : null;

      const aUV = a ? a.distinct_users : null;
      const bUV = b ? b.distinct_users : null;
      const dUV = d ? d.distinct_users : null;

      const aHR = a && a.feedback ? a.feedback.helpful_rate : null;
      const bHR = b && b.feedback ? b.feedback.helpful_rate : null;
      const dHR = d ? d.feedback_helpful_rate : null;

      tableWrapEl.innerHTML = `
        <table class="table">
          <thead>
            <tr>
              <th>metric</th>
              <th style="width:180px;">A</th>
              <th style="width:180px;">B</th>
              <th style="width:200px;">Δ（B-A）</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="cell-mono">events_total</td>
              <td class="cell-mono">${escapeHTML(formatNumber(aEvents))}</td>
              <td class="cell-mono">${escapeHTML(formatNumber(bEvents))}</td>
              <td class="cell-mono">${deltaCellHTML(dEvents, { kind: "int" })}</td>
            </tr>
            <tr>
              <td class="cell-mono">distinct_users</td>
              <td class="cell-mono">${escapeHTML(formatNumber(aUV))}</td>
              <td class="cell-mono">${escapeHTML(formatNumber(bUV))}</td>
              <td class="cell-mono">${deltaCellHTML(dUV, { kind: "int" })}</td>
            </tr>
            <tr>
              <td class="cell-mono">feedback.helpful_rate</td>
              <td class="cell-mono">${escapeHTML(formatPercent01(aHR, 1))}</td>
              <td class="cell-mono">${escapeHTML(formatPercent01(bHR, 1))}</td>
              <td class="cell-mono">${deltaCellHTML(dHR, { kind: "pp" })}</td>
            </tr>
          </tbody>
        </table>
      `;
    }

    async function doCompare() {
      if (!ensureActive()) return;
      const fromA = parseMsStrict(fromAEl && fromAEl.value ? fromAEl.value : "");
      const toA = parseMsStrict(toAEl && toAEl.value ? toAEl.value : "");
      const fromB = parseMsStrict(fromBEl && fromBEl.value ? fromBEl.value : "");
      const toB = parseMsStrict(toBEl && toBEl.value ? toBEl.value : "");
      const problemId = (problemIdEl && problemIdEl.value ? problemIdEl.value : "").trim();

      if (
        !Number.isFinite(fromA) ||
        !Number.isFinite(toA) ||
        !Number.isFinite(fromB) ||
        !Number.isFinite(toB)
      ) {
        showToast("from_a/to_a/from_b/to_b 都要填 ms 时间戳（整数）喵～", "danger");
        return;
      }
      if (fromA > toA || fromB > toB) {
        showToast("from 不能大于 to 喵～", "danger");
        return;
      }

      if (btn) btn.disabled = true;
      renderLoading();

      if (hintEl) {
        hintEl.textContent = `A：${formatDateTime(fromA)} ～ ${formatDateTime(toA)} · B：${formatDateTime(
          fromB
        )} ～ ${formatDateTime(toB)}${problemId ? ` · problem_id=${problemId}` : ""}`;
      }

      const params = new URLSearchParams();
      params.set("from_a", String(fromA));
      params.set("to_a", String(toA));
      params.set("from_b", String(fromB));
      params.set("to_b", String(toB));
      params.set("problem_id", problemId);

      try {
        const data = await apiFetch(`/admin/metrics/compare?${params.toString()}`);
        if (!ensureActive()) return;
        renderCompareTable(data);
      } catch (err) {
        if (!ensureActive()) return;
        showToast(`对比失败：${String(err && err.message ? err.message : err)}`, "danger");
        if (tableWrapEl) {
          tableWrapEl.innerHTML = `<pre class="code-block">${escapeHTML(
            String(err && err.message ? err.message : err)
          )}</pre>`;
        }
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    // init values from routeQuery
    const initFromA = parseMsStrict(routeQuery.from_a);
    const initToA = parseMsStrict(routeQuery.to_a);
    const initFromB = parseMsStrict(routeQuery.from_b);
    const initToB = parseMsStrict(routeQuery.to_b);
    const initProblemId = routeQuery.problem_id ? String(routeQuery.problem_id) : "";

    if (fromAEl && Number.isFinite(initFromA)) fromAEl.value = String(initFromA);
    if (toAEl && Number.isFinite(initToA)) toAEl.value = String(initToA);
    if (fromBEl && Number.isFinite(initFromB)) fromBEl.value = String(initFromB);
    if (toBEl && Number.isFinite(initToB)) toBEl.value = String(initToB);
    if (problemIdEl) problemIdEl.value = initProblemId;

    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        void doCompare();
      });
    }

    // If query is complete, auto-run; otherwise show a gentle hint.
    if (
      Number.isFinite(initFromA) &&
      Number.isFinite(initToA) &&
      Number.isFinite(initFromB) &&
      Number.isFinite(initToB)
    ) {
      void doCompare();
    } else {
      if (hintEl) hintEl.textContent = "喵～请先填好 A/B 两个窗口，再点「对比」～";
      renderLoading();
      if (tableWrapEl) {
        tableWrapEl.innerHTML = `<div class="empty-hint">等待你输入窗口参数～（从 Releases 点 24h/72h 对比会自动带上）</div>`;
      }
    }
  }

  window.AdminPages.metrics = {
    /**
     * @param {HTMLElement} el
     * @param {{ensureActive?:()=>boolean, routeQuery?:Record<string,string>}=} ctx
     */
    render(el, ctx) {
      const q = (ctx && ctx.routeQuery) || {};
      const mode = q && q.mode ? String(q.mode) : "";
      if (mode === "compare") {
        renderCompare(el, ctx);
        return;
      }
      renderSingle(el, ctx);
    },
  };
})();

