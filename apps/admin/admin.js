// 喵懂 Admin Web (Vanilla JS, no build chain)
// Task 3: token login + X-Admin-Token injection + hash routing + 401 auto logout
(function () {
  "use strict";

  const LS_TOKEN_KEY = "miaodong_admin_token";
  const DEFAULT_ROUTE = "dashboard";
  const ROUTES = /** @type {const} */ ([
    "dashboard",
    "problems",
    "releases",
    "metrics",
    "audit",
  ]);
  const DAY_MS = 24 * 60 * 60 * 1000;
  let renderSeq = 0;

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function escapeHTML(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getToken() {
    return localStorage.getItem(LS_TOKEN_KEY) || "";
  }
  function setToken(t) {
    localStorage.setItem(LS_TOKEN_KEY, t);
  }
  function clearToken() {
    localStorage.removeItem(LS_TOKEN_KEY);
  }

  function showToast(message, variant) {
    const el = document.createElement("div");
    el.className = ["toast", variant ? `toast--${variant}` : ""]
      .filter(Boolean)
      .join(" ");
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.textContent = message;

    document.body.appendChild(el);
    window.setTimeout(() => {
      el.style.opacity = "0";
      el.style.transition = "opacity 180ms ease";
      window.setTimeout(() => el.remove(), 220);
    }, 2400);
  }

  function formatDateTime(ts) {
    if (!ts) return "-";
    const d = ts instanceof Date ? ts : new Date(ts);
    if (Number.isNaN(d.getTime())) return String(ts);
    return d.toLocaleString("zh-CN", { hour12: false });
  }

  function formatNumber(n) {
    if (n === null || n === undefined || n === "") return "-";
    const v = typeof n === "number" ? n : Number(n);
    if (Number.isNaN(v)) return String(n);
    return new Intl.NumberFormat("zh-CN").format(v);
  }

  function formatPercent01(v, digits) {
    if (v === null || v === undefined || v === "") return "-";
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isNaN(n)) return String(v);
    const p = Math.max(0, Math.min(1, n)) * 100;
    return `${p.toFixed(typeof digits === "number" ? digits : 1)}%`;
  }

  async function loadDashboard() {
    const now = Date.now();
    const from = now - 7 * DAY_MS;
    const [releases, metrics] = await Promise.all([
      apiFetch("/admin/releases"),
      apiFetch(`/admin/metrics?from_ts_ms=${from}&to_ts_ms=${now}`),
    ]);

    const items = releases && typeof releases === "object" ? releases.items : [];
    const latest = Array.isArray(items) && items.length ? items[0] : null;
    return { latestRelease: latest, metrics, window: { from, to: now } };
  }

  function parseRouteFromHash() {
    const h = window.location.hash || "";
    const m = h.match(/^#\/([a-zA-Z0-9_-]+)$/);
    const r = m ? m[1] : "";
    return ROUTES.includes(r) ? r : "";
  }

  function ensureAuthedDefaultRoute() {
    const route = parseRouteFromHash();
    if (!route) window.location.hash = `#/${DEFAULT_ROUTE}`;
  }

  function logoutAndGoLogin(reason) {
    clearToken();
    // keep hash simple; login page does not need routing for now
    window.location.hash = "";
    renderLogin(reason || "已退出～下次再来玩也欢迎喵！");
  }

  async function apiFetch(path, { method = "GET", body } = {}) {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const token = getToken();
    if (token) headers["X-Admin-Token"] = token;

    const res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      showToast("口令好像不对喵…请重新登录～", "danger");
      logoutAndGoLogin("口令无效或已过期，请重新输入～");
      throw new Error("unauthorized");
    }

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || `request failed: ${res.status}`);
    }

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return await res.json();
    return await res.text();
  }

  function renderLogin(hint) {
    const app = $("#app");
    if (!app) return;

    app.innerHTML = `
      <div class="app-shell" role="application" aria-label="喵懂运营后台">
        <aside class="sidebar" aria-label="侧边栏">
          <div class="sidebar__brand">
            <div class="brand-mark" aria-hidden="true">喵</div>
            <div class="brand-text">
              <div class="brand-title">喵懂</div>
              <div class="brand-subtitle">Admin</div>
            </div>
          </div>

          <div style="padding:6px;">
            <div class="pill pill--soft">这里是入口处～先登录再进去喵</div>
          </div>

          <div class="sidebar__footer">
            <span class="pill pill--soft">奶油系 · 安全第一</span>
          </div>
        </aside>

        <main class="main" aria-label="主内容">
          <header class="topbar">
            <div class="topbar__title">喵懂 · 运营后台</div>
            <div class="topbar__actions">
              <span class="pill pill--soft">奶油系 · 请先输入口令喵</span>
            </div>
          </header>

          <section class="content" aria-label="内容区">
            <div class="card card--welcome">
              <div class="card__kawaii" aria-hidden="true">
                <span class="sparkle"></span>
                <span class="sparkle"></span>
                <span class="sparkle"></span>
              </div>
              <h1 class="card__title">欢迎回来～</h1>
              <p class="card__desc">${
                hint ? escapeHTML(hint) : "请输入口令，喵会乖乖带你进后台～"
              }</p>

              <form id="loginForm" class="card__row" autocomplete="off">
                <label>
                  <div style="font-size:12px;color:var(--muted);margin:0 0 6px;">口令</div>
                  <input id="tokenInput" class="input" type="password" placeholder="在这里悄悄输入…" />
                </label>
                <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                  <button class="btn btn--primary" type="submit">登录喵～</button>
                  <button class="btn btn--ghost" type="button" id="clearBtn">清空</button>
                </div>
                <div style="font-size:12px;color:var(--muted);line-height:1.5;">
                  小提示：口令会保存在本地浏览器（localStorage）里，方便你下次直接开工～
                </div>
              </form>
            </div>
          </section>
        </main>
      </div>
    `;

    const form = $("#loginForm", app);
    const input = $("#tokenInput", app);
    const clearBtn = $("#clearBtn", app);

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (input) input.value = "";
        showToast("已清空～重新输入一枚香香口令吧！", "success");
      });
    }

    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const t = (input && input.value ? input.value : "").trim();
        if (!t) {
          showToast("口令是空的喵…先填一下下～", "danger");
          return;
        }
        setToken(t);
        showToast("登录成功～开工开工！", "success");
        ensureAuthedDefaultRoute();
        renderRoute();
      });
    }

    // focus for convenience
    if (input) input.focus();
  }

  function shellNavHTML(activeRoute) {
    function item(route, label) {
      const active = route === activeRoute ? "is-active" : "";
      return `<a class="nav__item ${active}" href="#/${route}" data-route="${route}">${label}</a>`;
    }
    return `
      <nav class="nav" aria-label="导航">
        ${item("dashboard", "Dashboard")}
        ${item("problems", "Problems")}
        ${item("releases", "Releases")}
        ${item("metrics", "Metrics")}
        ${item("audit", "Audit")}
      </nav>
    `;
  }

  function routeMeta(route) {
    switch (route) {
      case "dashboard":
        return {
          title: "Dashboard",
          desc: "今日份概览准备中～（先放个占位卡片喵）",
        };
      case "problems":
        return {
          title: "Problems",
          desc: "问题列表/编辑器施工中～小锤锤敲敲敲！",
        };
      case "releases":
        return { title: "Releases", desc: "发布/回滚页面准备中～别急别急～" };
      case "metrics":
        return { title: "Metrics", desc: "指标看板准备中～数据在路上啦～" };
      case "audit":
        return { title: "Audit", desc: "喵～日志页即将上线，先喝口奶茶等一下～" };
      default:
        return { title: "Unknown", desc: "咦？这页迷路了…我们回 Dashboard 吧～" };
    }
  }

  function renderPlaceholder(pageEl, meta) {
    if (!pageEl) return;
    pageEl.innerHTML = `
      <div class="card card--welcome">
        <div class="card__kawaii" aria-hidden="true">
          <span class="sparkle"></span>
          <span class="sparkle"></span>
          <span class="sparkle"></span>
        </div>
        <h1 class="card__title">${escapeHTML(meta.title)}</h1>
        <p class="card__desc">${escapeHTML(meta.desc)}</p>
        <div class="card__row">
          <div class="skeleton" style="width: 48%"></div>
          <div class="skeleton" style="width: 72%"></div>
          <div class="skeleton" style="width: 58%"></div>
        </div>
      </div>
    `;
  }

  function dashboardLoadingHTML() {
    return `
      <div class="page page--wide">
        <div class="grid">
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
                <div class="card__title-sm">最近 7 天摘要</div>
                <div class="card__subtle">指标汇总生成中…</div>
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

  function renderDashboard(pageEl, seq) {
    if (!pageEl) return;
    pageEl.innerHTML = dashboardLoadingHTML();

    loadDashboard()
      .then(({ latestRelease, metrics, window: w }) => {
        if (seq !== renderSeq) return; // route changed

        const rel = latestRelease;
        const contentVersion = rel ? rel.content_version : null;
        const rolloutPercent = rel ? rel.rollout_percent : null;
        const createdBy = rel ? rel.created_by : null;
        const createdAt = rel ? rel.created_at : null;

        const eventsTotal = metrics ? metrics.events_total : null;
        const distinctUsers = metrics ? metrics.distinct_users : null;
        const helpfulRate =
          metrics && metrics.feedback ? metrics.feedback.helpful_rate : null;

        const emptyRel = !rel;
        const emptyMetrics = !metrics;

        pageEl.innerHTML = `
          <div class="page page--wide">
            <div class="grid">
              <div class="card card--panel">
                <div class="card__header">
                  <div>
                    <div class="card__title-sm">最新发布</div>
                    <div class="card__subtle">Release · 版本与灰度状态</div>
                  </div>
                  ${
                    emptyRel
                      ? `<span class="pill pill--soft">暂无发布记录</span>`
                      : `<span class="pill pill--soft">#${escapeHTML(
                          String(contentVersion)
                        )}</span>`
                  }
                </div>

                ${
                  emptyRel
                    ? `<div class="empty-hint">喵～目前还没有发布记录。可以先去 Releases 页面发布一个版本～</div>`
                    : `
                      <div class="kv">
                        <div class="kv__row">
                          <div class="kv__k">content_version</div>
                          <div class="kv__v">${escapeHTML(
                            String(contentVersion)
                          )}</div>
                        </div>
                        <div class="kv__row">
                          <div class="kv__k">rollout_percent</div>
                          <div class="kv__v">${escapeHTML(
                            String(rolloutPercent)
                          )}%</div>
                        </div>
                        <div class="kv__row">
                          <div class="kv__k">created_by</div>
                          <div class="kv__v">${escapeHTML(
                            createdBy || "-"
                          )}</div>
                        </div>
                        <div class="kv__row">
                          <div class="kv__k">created_at</div>
                          <div class="kv__v">${escapeHTML(
                            formatDateTime(createdAt)
                          )}</div>
                        </div>
                      </div>
                    `
                }
              </div>

              <div class="card card--panel">
                <div class="card__header">
                  <div>
                    <div class="card__title-sm">最近 7 天摘要</div>
                    <div class="card__subtle">Metrics · ${escapeHTML(
                      formatDateTime(w.from)
                    )} ～ ${escapeHTML(formatDateTime(w.to))}</div>
                  </div>
                  <span class="pill pill--soft">默认窗口</span>
                </div>

                ${
                  emptyMetrics
                    ? `<div class="empty-hint">喵～暂时没有取到指标数据。</div>`
                    : `
                      <div class="stats">
                        <div class="stat">
                          <div class="stat__k">events_total</div>
                          <div class="stat__v">${escapeHTML(
                            formatNumber(eventsTotal)
                          )}</div>
                        </div>
                        <div class="stat">
                          <div class="stat__k">distinct_users</div>
                          <div class="stat__v">${escapeHTML(
                            formatNumber(distinctUsers)
                          )}</div>
                        </div>
                        <div class="stat">
                          <div class="stat__k">feedback.helpful_rate</div>
                          <div class="stat__v">${escapeHTML(
                            formatPercent01(helpfulRate, 1)
                          )}</div>
                        </div>
                      </div>
                    `
                }
              </div>
            </div>
          </div>
        `;
      })
      .catch((err) => {
        if (seq !== renderSeq) return;
        showToast(`Dashboard 加载失败：${String(err && err.message ? err.message : err)}`, "danger");
        pageEl.innerHTML = `
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
  }

  function renderShell(route) {
    const app = $("#app");
    if (!app) return;

    const meta = routeMeta(route);
    app.innerHTML = `
      <div class="app-shell" role="application" aria-label="喵懂运营后台">
        <aside class="sidebar" aria-label="侧边栏">
          <div class="sidebar__brand">
            <div class="brand-mark" aria-hidden="true">喵</div>
            <div class="brand-text">
              <div class="brand-title">喵懂</div>
              <div class="brand-subtitle">Admin</div>
            </div>
          </div>

          ${shellNavHTML(route)}

          <div class="sidebar__footer">
            <span class="pill pill--soft">奶油系 · 努力施工中</span>
          </div>
        </aside>

        <main class="main" aria-label="主内容">
          <header class="topbar">
            <div class="topbar__title">${escapeHTML(meta.title)} · 喵懂</div>
            <div class="topbar__actions">
              <button class="btn btn--danger" type="button" id="logoutBtn">登出</button>
            </div>
          </header>

          <section class="content" aria-label="内容区">
            <div id="pageRoot"></div>
          </section>
        </main>
      </div>
    `;

    const logoutBtn = $("#logoutBtn", app);
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        showToast("已登出～去输入口令再回来吧！", "success");
        logoutAndGoLogin("已登出～要继续的话，再输入一次口令喵！");
      });
    }

    const pageRoot = $("#pageRoot", app);
    if (pageRoot) renderPlaceholder(pageRoot, meta);
  }

  function renderRoute() {
    const token = getToken();
    if (!token) {
      renderLogin();
      return;
    }

    const route = parseRouteFromHash() || DEFAULT_ROUTE;
    if (!parseRouteFromHash()) window.location.hash = `#/${route}`;

    renderSeq++;
    renderShell(route);

    const app = $("#app");
    const pageRoot = app ? $("#pageRoot", app) : null;

    if (!pageRoot) return;

    const seq = renderSeq;
    if (route === "dashboard") {
      renderDashboard(pageRoot, seq);
      return;
    }

    renderPlaceholder(pageRoot, routeMeta(route));
  }

  function init() {
    window.addEventListener("hashchange", renderRoute);

    if (!$("#app")) {
      // If index.html changes unexpectedly, be resilient.
      const div = document.createElement("div");
      div.id = "app";
      document.body.appendChild(div);
    }

    const token = getToken();
    if (token) ensureAuthedDefaultRoute();
    renderRoute();

    // Expose apiFetch for quick manual debugging in devtools (non-enumerable).
    try {
      Object.defineProperty(window, "__miaodongAdminApiFetch", {
        value: apiFetch,
        enumerable: false,
      });
    } catch (_) {
      // ignore
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
