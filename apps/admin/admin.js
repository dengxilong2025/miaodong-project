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
  }

  function renderRoute() {
    const token = getToken();
    if (!token) {
      renderLogin();
      return;
    }

    const route = parseRouteFromHash() || DEFAULT_ROUTE;
    if (!parseRouteFromHash()) window.location.hash = `#/${route}`;
    renderShell(route);
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
