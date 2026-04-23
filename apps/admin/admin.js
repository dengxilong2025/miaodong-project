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

  function tagsArrayToInput(tags) {
    return Array.isArray(tags) ? tags.filter(Boolean).join(", ") : "";
  }

  function tagsInputToArray(s) {
    return String(s || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
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

  function problemsLoadingHTML() {
    return `
      <div class="page page--wide">
        <div class="problems-layout">
          <div class="card card--panel">
            <div class="card__header">
              <div>
                <div class="card__title-sm">问题列表</div>
                <div class="card__subtle">GET /admin/problems</div>
              </div>
              <div class="row">
                <button class="btn btn--primary" type="button" id="problemsNewBtn">新建</button>
                <button class="btn btn--ghost" type="button" id="problemsRefreshBtn">刷新</button>
              </div>
            </div>
            <div id="problemsList" class="problems-list">
              <div class="skeleton" style="width: 70%"></div>
              <div class="skeleton" style="width: 54%"></div>
              <div class="skeleton" style="width: 62%"></div>
              <div class="skeleton" style="width: 46%"></div>
            </div>
          </div>

          <div class="card card--panel">
            <div class="card__header">
              <div>
                <div class="card__title-sm">详情编辑</div>
                <div class="card__subtle">点击左侧条目加载并编辑</div>
              </div>
              <div class="row">
                <button class="btn btn--ghost" type="button" id="problemsReloadBtn" disabled>重新加载</button>
                <button class="btn btn--primary" type="button" id="problemsSaveBtn" disabled>保存</button>
              </div>
            </div>
            <div id="problemsEditor">
              <div class="empty-hint">喵～先在左侧选一个问题，右侧才会出现编辑表单～</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function openModal({ title, bodyHTML, onClose }) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-label="${escapeHTML(
        title || "弹窗"
      )}">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;">
          <div style="font-weight:900;">${escapeHTML(title || "")}</div>
          <button class="btn btn--ghost" type="button" data-modal-close>关闭</button>
        </div>
        ${bodyHTML || ""}
      </div>
    `;
    function close() {
      backdrop.remove();
      if (typeof onClose === "function") onClose();
    }
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
      const btn = e.target && e.target.closest ? e.target.closest("[data-modal-close]") : null;
      if (btn) close();
    });
    document.body.appendChild(backdrop);
    return { close, backdrop };
  }

  function openCreateProblemModal({ onCreated }) {
    const m = openModal({
      title: "新建 Problem",
      bodyHTML: `
        <form id="createProblemForm" class="form" autocomplete="off">
          <div class="pill pill--soft">POST /admin/problems · status 默认为 draft</div>

          <div class="field">
            <label for="createProblemId">id（必填，唯一）</label>
            <input id="createProblemId" class="input" placeholder="例如：cat_litter_box_issue" />
          </div>

          <div class="field">
            <label for="createProblemTitle">title（必填）</label>
            <input id="createProblemTitle" class="input" placeholder="例如：猫砂盆不埋便便怎么办？" />
          </div>

          <div class="field">
            <label for="createProblemSummary">summary（必填）</label>
            <textarea id="createProblemSummary" class="input textarea" placeholder="用 1～3 句概括核心问题与目标…"></textarea>
          </div>

          <div class="field">
            <label for="createProblemTags">tags（逗号分隔）</label>
            <input id="createProblemTags" class="input" placeholder="例如：猫砂, 如厕, 行为" />
          </div>

          <div class="row" style="margin-top:6px;">
            <button class="btn btn--primary" type="submit" id="createProblemSubmitBtn">创建喵～</button>
            <button class="btn btn--ghost" type="button" data-modal-close>取消</button>
          </div>
        </form>
      `,
    });

    const form = $("#createProblemForm", m.backdrop);
    const idInput = $("#createProblemId", m.backdrop);
    const titleInput = $("#createProblemTitle", m.backdrop);
    const summaryInput = $("#createProblemSummary", m.backdrop);
    const tagsInput = $("#createProblemTags", m.backdrop);
    const submitBtn = $("#createProblemSubmitBtn", m.backdrop);

    if (idInput) idInput.focus();

    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const id = (idInput && idInput.value ? idInput.value : "").trim();
        const title = (titleInput && titleInput.value ? titleInput.value : "").trim();
        const summary = (summaryInput && summaryInput.value ? summaryInput.value : "").trim();
        const tags = tagsInputToArray(tagsInput && tagsInput.value ? tagsInput.value : "");

        if (!id || !title || !summary) {
          showToast("id / title / summary 都要填喵～", "danger");
          return;
        }

        if (submitBtn) submitBtn.disabled = true;
        try {
          await apiFetch("/admin/problems", {
            method: "POST",
            body: { actor: "admin-ui", id, title, summary, tags },
          });
          showToast("创建成功～小问题诞生啦！", "success");
          m.close();
          if (typeof onCreated === "function") onCreated(id);
        } catch (err) {
          showToast(
            `创建失败：${String(err && err.message ? err.message : err)}`,
            "danger"
          );
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }
  }

  function renderProblems(pageEl, seq) {
    if (!pageEl) return;
    pageEl.innerHTML = problemsLoadingHTML();

    const listEl = $("#problemsList", pageEl);
    const editorEl = $("#problemsEditor", pageEl);
    const refreshBtn = $("#problemsRefreshBtn", pageEl);
    const newBtn = $("#problemsNewBtn", pageEl);
    const reloadBtn = $("#problemsReloadBtn", pageEl);
    const saveBtn = $("#problemsSaveBtn", pageEl);

    /** @type {{items:any[], selectedId:string, detail:any|null}} */
    const state = { items: [], selectedId: "", detail: null };

    function ensureSeq() {
      return seq === renderSeq;
    }

    function renderList() {
      if (!listEl) return;
      if (!state.items || !state.items.length) {
        listEl.innerHTML = `<div class="empty-hint">喵～还没有任何问题条目。点右上角「新建」来添加第一条吧～</div>`;
        return;
      }

      listEl.innerHTML = `
        ${state.items
          .map((p) => {
            const active = p.id === state.selectedId ? "is-active" : "";
            const tags = Array.isArray(p.tags) && p.tags.length ? p.tags.slice(0, 3).join(" · ") : "";
            const status = p.status ? String(p.status) : "-";
            return `
              <button type="button" class="problems-item ${active}" data-problem-id="${escapeHTML(
                String(p.id)
              )}">
                <div class="problems-item__title">${escapeHTML(p.title || p.id)}</div>
                <div class="problems-item__meta">
                  <span class="pill pill--soft">#${escapeHTML(String(p.id))}</span>
                  <span class="pill pill--soft">${escapeHTML(status)}</span>
                  ${
                    tags
                      ? `<span class="pill pill--soft">${escapeHTML(tags)}</span>`
                      : ""
                  }
                </div>
              </button>
            `;
          })
          .join("")}
      `;
    }

    function renderEditorEmpty(hint) {
      if (!editorEl) return;
      editorEl.innerHTML = `<div class="empty-hint">${
        hint ? escapeHTML(hint) : "喵～先从左侧选择一个问题～"
      }</div>`;
      if (reloadBtn) reloadBtn.disabled = true;
      if (saveBtn) saveBtn.disabled = true;
    }

    function renderEditorLoading() {
      if (!editorEl) return;
      editorEl.innerHTML = `
        <div class="card__row">
          <div class="skeleton" style="width: 42%"></div>
          <div class="skeleton" style="width: 86%"></div>
          <div class="skeleton" style="width: 64%"></div>
          <div class="skeleton" style="width: 92%"></div>
        </div>
      `;
      if (reloadBtn) reloadBtn.disabled = false;
      if (saveBtn) saveBtn.disabled = true;
    }

    function renderEditorForm(p) {
      if (!editorEl) return;
      if (!p) {
        renderEditorEmpty();
        return;
      }

      const tagsStr = tagsArrayToInput(p.tags);
      const status = p.status || "draft";
      const updatedAt = p.updated_at || p.updatedAt || "";

      editorEl.innerHTML = `
        <div class="pill pill--soft" style="margin-bottom:10px;">
          GET /admin/problems/${escapeHTML(String(p.id))} · updated_at: ${escapeHTML(
        formatDateTime(updatedAt)
      )}
        </div>

        <form id="problemEditForm" class="form" autocomplete="off">
          <div class="field">
            <label for="problemTitle">title</label>
            <input id="problemTitle" class="input" value="${escapeHTML(
              p.title || ""
            )}" />
          </div>

          <div class="field">
            <label for="problemSummary">summary</label>
            <textarea id="problemSummary" class="input textarea">${escapeHTML(
              p.summary || ""
            )}</textarea>
          </div>

          <div class="field">
            <label for="problemTags">tags（逗号分隔）</label>
            <input id="problemTags" class="input" value="${escapeHTML(tagsStr)}" />
          </div>

          <div class="field">
            <label for="problemStatus">status</label>
            <select id="problemStatus" class="input">
              ${["draft", "published"]
                .map((s) => {
                  const sel = s === status ? "selected" : "";
                  return `<option value="${escapeHTML(s)}" ${sel}>${escapeHTML(
                    s
                  )}</option>`;
                })
                .join("")}
            </select>
          </div>

          <div class="row" style="margin-top:4px;">
            <button class="btn btn--primary" type="submit">保存</button>
            <button class="btn btn--ghost" type="button" id="problemResetBtn">重置为已加载版本</button>
          </div>
        </form>
      `;

      if (reloadBtn) reloadBtn.disabled = false;
      if (saveBtn) saveBtn.disabled = false;

      const form = $("#problemEditForm", editorEl);
      const resetBtn = $("#problemResetBtn", editorEl);
      if (form) {
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          void saveCurrent();
        });
      }
      if (resetBtn) {
        resetBtn.addEventListener("click", () => {
          // re-render form from latest loaded detail
          renderEditorForm(state.detail);
          showToast("已重置～回到上次加载的版本啦", "success");
        });
      }
    }

    async function loadList({ selectId } = {}) {
      if (!ensureSeq()) return;
      if (listEl) {
        listEl.innerHTML = `
          <div class="card__row">
            <div class="skeleton" style="width: 70%"></div>
            <div class="skeleton" style="width: 54%"></div>
            <div class="skeleton" style="width: 62%"></div>
            <div class="skeleton" style="width: 46%"></div>
          </div>
        `;
      }
      try {
        const res = await apiFetch("/admin/problems");
        if (!ensureSeq()) return;
        const items = res && res.items ? res.items : [];
        state.items = Array.isArray(items) ? items : [];
        if (selectId) state.selectedId = selectId;
        if (!state.selectedId && state.items.length) state.selectedId = state.items[0].id;
        renderList();
        if (state.selectedId) void loadDetail(state.selectedId);
        else renderEditorEmpty("喵～列表是空的，先新建一个吧～");
      } catch (err) {
        if (!ensureSeq()) return;
        showToast(
          `Problems 列表加载失败：${String(err && err.message ? err.message : err)}`,
          "danger"
        );
        if (listEl) {
          listEl.innerHTML = `<pre class="code-block">${escapeHTML(
            String(err && err.message ? err.message : err)
          )}</pre>`;
        }
        renderEditorEmpty("列表加载失败了喵…先检查服务端是否正常～");
      }
    }

    async function loadDetail(id) {
      if (!ensureSeq()) return;
      if (!id) return;
      state.selectedId = id;
      renderList();
      renderEditorLoading();
      try {
        const p = await apiFetch(`/admin/problems/${encodeURIComponent(id)}`);
        if (!ensureSeq()) return;
        state.detail = p;
        renderEditorForm(p);
      } catch (err) {
        if (!ensureSeq()) return;
        showToast(
          `详情加载失败：${String(err && err.message ? err.message : err)}`,
          "danger"
        );
        if (editorEl) {
          editorEl.innerHTML = `<pre class="code-block">${escapeHTML(
            String(err && err.message ? err.message : err)
          )}</pre>`;
        }
        if (reloadBtn) reloadBtn.disabled = false;
        if (saveBtn) saveBtn.disabled = true;
      }
    }

    async function saveCurrent() {
      if (!ensureSeq()) return;
      const id = state.selectedId;
      if (!id) return;
      const titleEl = $("#problemTitle", editorEl);
      const summaryEl = $("#problemSummary", editorEl);
      const tagsEl = $("#problemTags", editorEl);
      const statusEl = $("#problemStatus", editorEl);

      const title = (titleEl && titleEl.value ? titleEl.value : "").trim();
      const summary = (summaryEl && summaryEl.value ? summaryEl.value : "").trim();
      const tags = tagsInputToArray(tagsEl && tagsEl.value ? tagsEl.value : "");
      const status = (statusEl && statusEl.value ? statusEl.value : "draft").trim();

      if (!title || !summary) {
        showToast("title / summary 不能为空喵～", "danger");
        return;
      }

      if (saveBtn) saveBtn.disabled = true;
      if (reloadBtn) reloadBtn.disabled = true;
      showToast("保存中…喵喵加油！", "success");

      try {
        await apiFetch(`/admin/problems/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: { actor: "admin-ui", title, summary, tags, status },
        });
        if (!ensureSeq()) return;
        showToast("保存成功～香香的更新已写进数据库啦！", "success");
        await loadList({ selectId: id });
      } catch (err) {
        if (!ensureSeq()) return;
        showToast(
          `保存失败：${String(err && err.message ? err.message : err)}`,
          "danger"
        );
        if (reloadBtn) reloadBtn.disabled = false;
        if (saveBtn) saveBtn.disabled = false;
      }
    }

    if (refreshBtn) refreshBtn.addEventListener("click", () => void loadList({ selectId: state.selectedId }));
    if (listEl) {
      listEl.addEventListener("click", (e) => {
        const btn = e.target && e.target.closest ? e.target.closest("[data-problem-id]") : null;
        if (!btn) return;
        const id = btn.getAttribute("data-problem-id");
        if (!id) return;
        void loadDetail(id);
      });
    }
    if (reloadBtn) reloadBtn.addEventListener("click", () => void loadDetail(state.selectedId));
    if (saveBtn) saveBtn.addEventListener("click", () => void saveCurrent());
    if (newBtn) {
      newBtn.addEventListener("click", () => {
        openCreateProblemModal({
          onCreated: (newId) => void loadList({ selectId: newId }),
        });
      });
    }

    void loadList();
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
    if (route === "problems") {
      renderProblems(pageRoot, seq);
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
