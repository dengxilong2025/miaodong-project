// Admin Dashboard page (Vanilla JS, no build chain)
(function () {
  "use strict";

  window.AdminPages = window.AdminPages || {};

  const DAY_MS = 24 * 60 * 60 * 1000;

  function dashboardLoadingHTML() {
    return `
      <div class="page page--wide">
        <div class="compare-grid">
          <div class="card card--panel">
            <div class="card__header">
              <div>
                <div class="card__title-sm">最新发布</div>
                <div class="card__subtle">正在抓取最新版本…</div>
              </div>
            </div>
            <div class="card__row">
              <div class="skeleton" style="width: 52%"></div>
              <div class="skeleton" style="width: 70%"></div>
              <div class="skeleton" style="width: 46%"></div>
            </div>
          </div>

          <div class="card card--panel">
            <div class="card__header">
              <div>
                <div class="card__title-sm">24h 对比</div>
                <div class="card__subtle">Metrics Compare 加载中…</div>
              </div>
            </div>
            <div class="card__row">
              <div class="skeleton" style="width: 58%"></div>
              <div class="skeleton" style="width: 64%"></div>
              <div class="skeleton" style="width: 44%"></div>
            </div>
          </div>

          <div class="card card--panel">
            <div class="card__header">
              <div>
                <div class="card__title-sm">72h 对比</div>
                <div class="card__subtle">Metrics Compare 加载中…</div>
              </div>
            </div>
            <div class="card__row">
              <div class="skeleton" style="width: 58%"></div>
              <div class="skeleton" style="width: 64%"></div>
              <div class="skeleton" style="width: 44%"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function compareQuery(fromA, toA, fromB, toB) {
    const q = new URLSearchParams();
    q.set("from_a", String(fromA));
    q.set("to_a", String(toA));
    q.set("from_b", String(fromB));
    q.set("to_b", String(toB));
    return `/admin/metrics/compare?${q.toString()}`;
  }

  function deltaHTML(delta, { kind }) {
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

  function compareCardHTML(title, subtitle, compareRes) {
    const { escapeHTML, formatNumber, formatPercent01, formatDateTime } =
      window.AdminLib;

    const a = compareRes && compareRes.a ? compareRes.a : null;
    const b = compareRes && compareRes.b ? compareRes.b : null;
    const d = compareRes && compareRes.delta ? compareRes.delta : null;

    const winA = a && a.window ? a.window : null;
    const winB = b && b.window ? b.window : null;

    const eventsTotal = b ? b.events_total : null;
    const distinctUsers = b ? b.distinct_users : null;
    const helpfulRate = b && b.feedback ? b.feedback.helpful_rate : null;

    const deltaEvents = d ? d.events_total : null;
    const deltaUV = d ? d.distinct_users : null;
    const deltaHelpful = d ? d.feedback_helpful_rate : null;

    return `
      <div class="card card--panel compare-card">
        <div class="card__header">
          <div>
            <div class="card__title-sm">${escapeHTML(title)}</div>
            <div class="card__subtle">${escapeHTML(subtitle)}</div>
          </div>
          <span class="pill pill--soft">B - A</span>
        </div>

        <div class="compare-meta">
          <div class="pill pill--soft">A：${escapeHTML(
            winA ? `${formatDateTime(winA.from_ts_ms)} → ${formatDateTime(winA.to_ts_ms)}` : "-"
          )}</div>
          <div class="pill pill--soft">B：${escapeHTML(
            winB ? `${formatDateTime(winB.from_ts_ms)} → ${formatDateTime(winB.to_ts_ms)}` : "-"
          )}</div>
        </div>

        <div class="stats stats--3">
          <div class="stat">
            <div class="stat__k">events_total</div>
            <div class="stat__v">${escapeHTML(formatNumber(eventsTotal))}</div>
            <div class="stat__delta">${deltaHTML(deltaEvents, { kind: "int" })}</div>
          </div>
          <div class="stat">
            <div class="stat__k">distinct_users</div>
            <div class="stat__v">${escapeHTML(formatNumber(distinctUsers))}</div>
            <div class="stat__delta">${deltaHTML(deltaUV, { kind: "int" })}</div>
          </div>
          <div class="stat">
            <div class="stat__k">feedback.helpful_rate</div>
            <div class="stat__v">${escapeHTML(formatPercent01(helpfulRate, 1))}</div>
            <div class="stat__delta">${deltaHTML(deltaHelpful, { kind: "pp" })}</div>
          </div>
        </div>
      </div>
    `;
  }

  function latestReleaseCardHTML(latest) {
    const { escapeHTML, formatDateTime } = window.AdminLib;
    if (!latest) {
      return `
        <div class="card card--panel">
          <div class="card__header">
            <div>
              <div class="card__title-sm">最新发布</div>
              <div class="card__subtle">Release · 版本与灰度状态</div>
            </div>
            <span class="pill pill--soft">暂无发布记录</span>
          </div>
          <div class="empty-hint">喵～目前还没有发布记录。可以先去 Releases 页面发布一个版本～</div>
        </div>
      `;
    }

    return `
      <div class="card card--panel">
        <div class="card__header">
          <div>
            <div class="card__title-sm">最新发布</div>
            <div class="card__subtle">Release · 版本与灰度状态</div>
          </div>
          <span class="pill pill--soft">#${escapeHTML(
            String(latest.content_version)
          )}</span>
        </div>

        <div class="kv">
          <div class="kv__row">
            <div class="kv__k">content_version</div>
            <div class="kv__v">${escapeHTML(String(latest.content_version))}</div>
          </div>
          <div class="kv__row">
            <div class="kv__k">rollout_percent</div>
            <div class="kv__v">${escapeHTML(String(latest.rollout_percent))}%</div>
          </div>
          <div class="kv__row">
            <div class="kv__k">created_by</div>
            <div class="kv__v">${escapeHTML(latest.created_by || "-")}</div>
          </div>
          <div class="kv__row">
            <div class="kv__k">created_at</div>
            <div class="kv__v">${escapeHTML(formatDateTime(latest.created_at))}</div>
          </div>
        </div>
      </div>
    `;
  }

  async function loadDashboardCompare() {
    const { apiFetch } = window.AdminLib;
    const now = Date.now();

    const from24A = now - 48 * 60 * 60 * 1000;
    const to24A = now - 24 * 60 * 60 * 1000;
    const from24B = now - 24 * 60 * 60 * 1000;
    const to24B = now;

    const from72A = now - 144 * 60 * 60 * 1000;
    const to72A = now - 72 * 60 * 60 * 1000;
    const from72B = now - 72 * 60 * 60 * 1000;
    const to72B = now;

    const [releases, compare24, compare72] = await Promise.all([
      apiFetch("/admin/releases"),
      apiFetch(compareQuery(from24A, to24A, from24B, to24B)),
      apiFetch(compareQuery(from72A, to72A, from72B, to72B)),
    ]);

    const items = releases && typeof releases === "object" ? releases.items : [];
    const latest = Array.isArray(items) && items.length ? items[0] : null;

    return { latestRelease: latest, compare24, compare72, now };
  }

  window.AdminPages.dashboard = {
    /**
     * @param {HTMLElement} el
     * @param {{ensureActive?:()=>boolean}=} ctx
     */
    render(el, ctx) {
      const { showToast, escapeHTML } = window.AdminLib;
      const ensureActive =
        ctx && typeof ctx.ensureActive === "function" ? ctx.ensureActive : () => true;

      el.innerHTML = dashboardLoadingHTML();

      loadDashboardCompare()
        .then(({ latestRelease, compare24, compare72, now }) => {
          if (!ensureActive()) return;

          const html = `
            <div class="page page--wide">
              <div class="compare-grid">
                ${latestReleaseCardHTML(latestRelease)}
                ${compareCardHTML(
                  "24h 对比",
                  `窗口 B：[now-24h, now] vs 窗口 A：[now-48h, now-24h] · 基准=${escapeHTML(
                    new Date(now).toLocaleString("zh-CN", { hour12: false })
                  )}`,
                  compare24
                )}
                ${compareCardHTML(
                  "72h 对比",
                  `窗口 B：[now-72h, now] vs 窗口 A：[now-144h, now-72h] · 基准=${escapeHTML(
                    new Date(now).toLocaleString("zh-CN", { hour12: false })
                  )}`,
                  compare72
                )}
              </div>
            </div>
          `;

          el.innerHTML = html;
        })
        .catch((err) => {
          if (!ensureActive()) return;
          showToast(
            `Dashboard 加载失败：${String(err && err.message ? err.message : err)}`,
            "danger"
          );
          el.innerHTML = `
            <div class="card card--welcome">
              <div class="card__kawaii" aria-hidden="true">
                <span class="sparkle"></span>
                <span class="sparkle"></span>
                <span class="sparkle"></span>
              </div>
              <h1 class="card__title">Dashboard 加载失败</h1>
              <p class="card__desc">喵…可能是网络/口令/服务端出了一点小状况。稍后刷新试试，或重新登录～</p>
              <pre class="code-block">${escapeHTML(
                String(err && err.message ? err.message : err)
              )}</pre>
            </div>
          `;
        });
    },
  };
})();

