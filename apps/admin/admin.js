// 喵懂 Admin Web (Vanilla JS, no build chain)
// Entry: routing + shell + dispatch (no bundler; shared logic in lib/ and pages/)
(function () {
  "use strict";

  const AdminLib = window.AdminLib;
  if (!AdminLib) {
    throw new Error("AdminLib is missing: ensure ./lib/api.js is loaded first");
  }

  const {
    $,
    escapeHTML,
    getToken,
    setToken,
    clearToken,
    apiFetch,
    showToast,
    openModal,
    formatDateTime,
    formatNumber,
    formatPercent01,
    tagsArrayToInput,
    tagsInputToArray,
    setUnauthorizedHandler,
  } = AdminLib;

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

  function parseRouteFromHash() {
    const h = window.location.hash || "";
    // Support routes like:
    // - #/metrics
    // - #/metrics?mode=compare&from_a=...&to_a=...&from_b=...&to_b=...
    const m = h.match(/^#\/([a-zA-Z0-9_-]+)(?:\?.*)?$/);
    const r = m ? m[1] : "";
    return ROUTES.includes(r) ? r : "";
  }

  function parseHashQuery() {
    const h = window.location.hash || "";
    const idx = h.indexOf("?");
    if (idx === -1) return {};
    const qs = h.slice(idx + 1);
    const p = new URLSearchParams(qs);
    const out = {};
    for (const [k, v] of p.entries()) out[k] = v;
    return out;
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
          desc: "发布后 24h / 72h 指标对比 + 最新发布概览",
        };
      case "problems":
        return {
          title: "Problems",
          desc: "问题列表/编辑器施工中～小锤锤敲敲敲！",
        };
      case "releases":
        return { title: "Releases", desc: "发布/回滚页面准备中～别急别急～" };
      case "metrics":
        return {
          title: "Metrics",
          desc: "指标查询：时间窗/Problem 过滤 + Top10 事件统计 + 反馈帮助率",
        };
      case "audit":
        return { title: "Audit", desc: "审计日志：最近 200 条操作记录 + 本地过滤" };
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

  function renderAudit(pageEl, seq) {
    if (!pageEl) return;
    const p = window.AdminPages && window.AdminPages.audit;
    if (p && typeof p.render === "function") {
      p.render(pageEl, { ensureActive: () => seq === renderSeq });
      return;
    }
    renderPlaceholder(pageEl, {
      title: "Audit",
      desc: "Audit 模块未加载（请检查 pages/audit.js 是否正确引入）",
    });
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
    const p = window.AdminPages && window.AdminPages.dashboard;
    if (p && typeof p.render === "function") {
      p.render(pageEl, { ensureActive: () => seq === renderSeq });
      return;
    }
    renderPlaceholder(pageEl, {
      title: "Dashboard",
      desc: "Dashboard 模块未加载（请检查 pages/dashboard.js 是否正确引入）",
    });
  }

  function renderPageViaModule(route, pageEl, seq, routeQuery) {
    if (!pageEl) return false;
    const p = window.AdminPages && window.AdminPages[route];
    if (p && typeof p.render === "function") {
      p.render(pageEl, {
        route,
        routeQuery: routeQuery || {},
        ensureActive: () => seq === renderSeq,
      });
      return true;
    }
    return false;
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

  function releasesLoadingHTML() {
    return `
      <div class="page page--wide">
        <div class="releases-layout">
          <div class="releases-side">
            <div class="card card--panel">
              <div class="card__header">
                <div>
                  <div class="card__title-sm">发布</div>
                  <div class="card__subtle">POST /admin/release</div>
                </div>
                <span class="pill pill--soft">需二次确认</span>
              </div>

              <form id="publishForm" class="form" autocomplete="off">
                <div class="field">
                  <label for="publishRolloutPercent">rollout_percent（默认 100）</label>
                  <input id="publishRolloutPercent" class="input" inputmode="numeric" placeholder="1~100" value="100" />
                </div>

                <div class="field">
                  <label for="publishNotes">notes</label>
                  <textarea id="publishNotes" class="input textarea" placeholder="写点备注：本次发布内容/原因/风险…"></textarea>
                </div>

                <div class="row" style="margin-top:6px;">
                  <button class="btn btn--primary" type="submit" id="publishBtn">发布</button>
                  <button class="btn btn--ghost" type="button" id="publishResetBtn">重置</button>
                </div>
              </form>
            </div>

            <div class="card card--panel">
              <div class="card__header">
                <div>
                  <div class="card__title-sm">回滚</div>
                  <div class="card__subtle">POST /admin/rollback</div>
                </div>
                <span class="pill pill--soft">强二次确认</span>
              </div>

              <form id="rollbackForm" class="form" autocomplete="off">
                <div class="field">
                  <label for="rollbackTarget">target_content_version（必填）</label>
                  <input id="rollbackTarget" class="input" inputmode="numeric" placeholder="例如：12" />
                </div>

                <div class="field">
                  <label for="rollbackNotes">notes</label>
                  <textarea id="rollbackNotes" class="input textarea" placeholder="写点备注：回滚原因/影响范围/处理人…"></textarea>
                </div>

                <div class="row" style="margin-top:6px;">
                  <button class="btn btn--danger" type="submit" id="rollbackBtn">回滚</button>
                  <button class="btn btn--ghost" type="button" id="rollbackResetBtn">重置</button>
                </div>
              </form>
            </div>
          </div>

          <div class="card card--panel">
            <div class="card__header">
              <div>
                <div class="card__title-sm">发布记录</div>
                <div class="card__subtle">GET /admin/releases</div>
              </div>
              <div class="row">
                <button class="btn btn--ghost" type="button" id="releasesRefreshBtn">刷新</button>
              </div>
            </div>

            <div id="releasesList" class="table-wrap" aria-label="Releases 列表">
              <div class="skeleton" style="width: 72%"></div>
              <div class="skeleton" style="width: 56%"></div>
              <div class="skeleton" style="width: 64%"></div>
              <div class="skeleton" style="width: 48%"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderReleasesTable(listEl, items) {
    if (!listEl) return;
    const arr = Array.isArray(items) ? items : [];
    if (!arr.length) {
      listEl.innerHTML = `<div class="empty-hint">喵～暂无发布记录。可以先在左侧发布一个版本～</div>`;
      return;
    }

    function statusPill(status) {
      const s = String(status || "-");
      const cls =
        s === "published"
          ? "pill pill--success"
          : s === "rolled_back"
            ? "pill pill--danger"
            : "pill pill--soft";
      return `<span class="${cls}">${escapeHTML(s)}</span>`;
    }

    listEl.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>content_version</th>
            <th>status</th>
            <th>rollout_percent</th>
            <th>created_by</th>
            <th>created_at</th>
            <th>notes</th>
          </tr>
        </thead>
        <tbody>
          ${arr
            .map((it) => {
              const v = it && it.content_version !== undefined ? it.content_version : "-";
              const st = it ? it.status : "-";
              const rp = it && it.rollout_percent !== undefined ? it.rollout_percent : "-";
              const by = it ? it.created_by : "-";
              const at = it ? it.created_at : "-";
              const notes = it ? it.notes : "";
              return `
                <tr>
                  <td class="cell-mono">${escapeHTML(String(v))}</td>
                  <td>${statusPill(st)}</td>
                  <td>${escapeHTML(String(rp))}%</td>
                  <td>${escapeHTML(by || "-")}</td>
                  <td>${escapeHTML(formatDateTime(at))}</td>
                  <td><div class="cell-notes">${escapeHTML(notes || "")}</div></td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    `;
  }

  function renderReleases(pageEl, seq) {
    if (!pageEl) return;
    pageEl.innerHTML = releasesLoadingHTML();

    const listEl = $("#releasesList", pageEl);
    const refreshBtn = $("#releasesRefreshBtn", pageEl);

    const publishForm = $("#publishForm", pageEl);
    const publishBtn = $("#publishBtn", pageEl);
    const publishResetBtn = $("#publishResetBtn", pageEl);
    const publishRolloutEl = $("#publishRolloutPercent", pageEl);
    const publishNotesEl = $("#publishNotes", pageEl);

    const rollbackForm = $("#rollbackForm", pageEl);
    const rollbackBtn = $("#rollbackBtn", pageEl);
    const rollbackResetBtn = $("#rollbackResetBtn", pageEl);
    const rollbackTargetEl = $("#rollbackTarget", pageEl);
    const rollbackNotesEl = $("#rollbackNotes", pageEl);

    function ensureSeq() {
      return seq === renderSeq;
    }

    async function loadList() {
      if (!ensureSeq()) return;
      if (listEl) {
        listEl.innerHTML = `
          <div class="skeleton" style="width: 72%"></div>
          <div class="skeleton" style="width: 56%"></div>
          <div class="skeleton" style="width: 64%"></div>
        `;
      }
      try {
        const data = await apiFetch("/admin/releases");
        if (!ensureSeq()) return;
        const items = data && typeof data === "object" ? data.items : [];
        renderReleasesTable(listEl, items);
      } catch (err) {
        if (!ensureSeq()) return;
        showToast(
          `列表加载失败：${String(err && err.message ? err.message : err)}`,
          "danger"
        );
        if (listEl) {
          listEl.innerHTML = `<pre class="code-block">${escapeHTML(
            String(err && err.message ? err.message : err)
          )}</pre>`;
        }
      }
    }

    function parsePercent(inputValue) {
      const raw = String(inputValue || "").trim();
      if (!raw) return 100;
      const n = Number(raw);
      if (!Number.isFinite(n)) return NaN;
      const v = Math.floor(n);
      if (v < 1 || v > 100) return NaN;
      return v;
    }

    function parseIntStrict(inputValue) {
      const raw = String(inputValue || "").trim();
      if (!raw) return NaN;
      const n = Number(raw);
      if (!Number.isFinite(n)) return NaN;
      const v = Math.floor(n);
      return v;
    }

    function openPublishConfirmModal({ rolloutPercent, notes }) {
      const m = openModal({
        title: "确认发布",
        bodyHTML: `
          <div class="pill pill--soft">即将发布一个新 content_version</div>
          <div class="kv" style="margin-top:10px;">
            <div class="kv__row">
              <div class="kv__k">rollout_percent</div>
              <div class="kv__v">${escapeHTML(String(rolloutPercent))}%</div>
            </div>
            <div class="kv__row">
              <div class="kv__k">notes</div>
              <div class="kv__v" style="max-width:340px;text-align:right;">${escapeHTML(
                notes || "-"
              )}</div>
            </div>
          </div>
          <div class="row" style="margin-top:12px;">
            <button class="btn btn--primary" type="button" id="publishConfirmBtn">确认发布</button>
            <button class="btn btn--ghost" type="button" data-modal-close>取消</button>
          </div>
          <div class="empty-hint" style="margin-top:8px;">
            小提示：发布会自动生成新的 content_version（服务端 max+1）。
          </div>
        `,
      });

      const confirmBtn = $("#publishConfirmBtn", m.backdrop);
      if (confirmBtn) {
        confirmBtn.addEventListener("click", async () => {
          if (!ensureSeq()) return;
          confirmBtn.disabled = true;
          try {
            const res = await apiFetch("/admin/release", {
              method: "POST",
              body: { actor: "admin-ui", rollout_percent: rolloutPercent, notes },
            });
            if (!ensureSeq()) return;
            showToast(
              `发布成功：content_version=${String(
                res && res.content_version !== undefined ? res.content_version : "?"
              )}`,
              "success"
            );
            m.close();
            await loadList();
          } catch (err) {
            if (!ensureSeq()) return;
            showToast(
              `发布失败：${String(err && err.message ? err.message : err)}`,
              "danger"
            );
            confirmBtn.disabled = false;
          }
        });
      }
    }

    function openRollbackConfirmModal({ targetContentVersion, notes }) {
      const m = openModal({
        title: "确认回滚（请再次输入版本号）",
        bodyHTML: `
          <div class="pill pill--soft">本操作会将当前 published 标记为 rolled_back，并将目标版本重新发布（rollout_percent=100）。</div>
          <div class="kv" style="margin-top:10px;">
            <div class="kv__row">
              <div class="kv__k">target_content_version</div>
              <div class="kv__v">${escapeHTML(String(targetContentVersion))}</div>
            </div>
            <div class="kv__row">
              <div class="kv__k">notes</div>
              <div class="kv__v" style="max-width:340px;text-align:right;">${escapeHTML(
                notes || "-"
              )}</div>
            </div>
          </div>

          <form id="rollbackConfirmForm" class="form" style="margin-top:12px;" autocomplete="off">
            <div class="field">
              <label for="rollbackConfirmInput">再次输入同样的版本号才能确认</label>
              <input id="rollbackConfirmInput" class="input" inputmode="numeric" placeholder="例如：${escapeHTML(
                String(targetContentVersion)
              )}" />
            </div>
            <div class="row" style="margin-top:6px;">
              <button class="btn btn--danger" type="submit" id="rollbackConfirmBtn" disabled>确认回滚</button>
              <button class="btn btn--ghost" type="button" data-modal-close>取消</button>
            </div>
          </form>
        `,
      });

      const confirmInput = $("#rollbackConfirmInput", m.backdrop);
      const confirmForm = $("#rollbackConfirmForm", m.backdrop);
      const confirmBtn = $("#rollbackConfirmBtn", m.backdrop);

      function syncEnabled() {
        const v = parseIntStrict(confirmInput && confirmInput.value ? confirmInput.value : "");
        const ok = v === targetContentVersion;
        if (confirmBtn) confirmBtn.disabled = !ok;
      }
      if (confirmInput) {
        confirmInput.addEventListener("input", syncEnabled);
        confirmInput.focus();
      }

      if (confirmForm) {
        confirmForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          if (!ensureSeq()) return;
          syncEnabled();
          if (!confirmBtn || confirmBtn.disabled) {
            showToast("版本号不一致，不能确认回滚喵～", "danger");
            return;
          }
          confirmBtn.disabled = true;
          try {
            const res = await apiFetch("/admin/rollback", {
              method: "POST",
              body: {
                actor: "admin-ui",
                target_content_version: targetContentVersion,
                notes,
              },
            });
            if (!ensureSeq()) return;
            showToast(
              `回滚成功：content_version=${String(
                res && res.content_version !== undefined ? res.content_version : "?"
              )}`,
              "success"
            );
            m.close();
            await loadList();
          } catch (err) {
            if (!ensureSeq()) return;
            showToast(
              `回滚失败：${String(err && err.message ? err.message : err)}`,
              "danger"
            );
            confirmBtn.disabled = false;
          }
        });
      }
    }

    if (publishResetBtn) {
      publishResetBtn.addEventListener("click", () => {
        if (publishRolloutEl) publishRolloutEl.value = "100";
        if (publishNotesEl) publishNotesEl.value = "";
      });
    }

    if (rollbackResetBtn) {
      rollbackResetBtn.addEventListener("click", () => {
        if (rollbackTargetEl) rollbackTargetEl.value = "";
        if (rollbackNotesEl) rollbackNotesEl.value = "";
      });
    }

    if (publishForm) {
      publishForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const rolloutPercent = parsePercent(
          publishRolloutEl && publishRolloutEl.value ? publishRolloutEl.value : ""
        );
        const notes = (publishNotesEl && publishNotesEl.value ? publishNotesEl.value : "").trim();
        if (!Number.isFinite(rolloutPercent)) {
          showToast("rollout_percent 需要是 1~100 的整数喵～", "danger");
          return;
        }
        openPublishConfirmModal({ rolloutPercent, notes });
      });
    }

    if (rollbackForm) {
      rollbackForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const target = parseIntStrict(
          rollbackTargetEl && rollbackTargetEl.value ? rollbackTargetEl.value : ""
        );
        const notes = (rollbackNotesEl && rollbackNotesEl.value ? rollbackNotesEl.value : "").trim();
        if (!Number.isFinite(target) || target <= 0) {
          showToast("target_content_version 必须是正整数喵～", "danger");
          return;
        }
        openRollbackConfirmModal({ targetContentVersion: target, notes });
      });
    }

    if (refreshBtn) refreshBtn.addEventListener("click", () => void loadList());

    // 初次加载
    void loadList();
  }

  function metricsLoadingHTML() {
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

  function renderMetrics(pageEl, seq) {
    if (!pageEl) return;
    pageEl.innerHTML = metricsLoadingHTML();

    const form = $("#metricsForm", pageEl);
    const fromEl = $("#metricsFrom", pageEl);
    const toEl = $("#metricsTo", pageEl);
    const problemIdEl = $("#metricsProblemId", pageEl);
    const queryBtn = $("#metricsQueryBtn", pageEl);

    const windowHintEl = $("#metricsWindowHint", pageEl);
    const summaryEl = $("#metricsSummary", pageEl);
    const feedbackEl = $("#metricsFeedback", pageEl);
    const byEventEl = $("#metricsByEvent", pageEl);

    function ensureSeq() {
      return seq === renderSeq;
    }

    function parseMsStrict(inputValue) {
      const raw = String(inputValue || "").trim();
      if (!raw) return NaN;
      const n = Number(raw);
      if (!Number.isFinite(n)) return NaN;
      // ms timestamp can be large; but Number still safe enough at current epoch.
      const v = Math.floor(n);
      return v;
    }

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

    function renderByEventTable(items) {
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

    function renderData(data) {
      if (!ensureSeq()) return;

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

      renderByEventTable(data ? data.by_event_name : []);
    }

    async function doQuery() {
      if (!ensureSeq()) return;
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
      if (windowHintEl) windowHintEl.textContent = `${formatDateTime(from)} ～ ${formatDateTime(to)}${problemId ? ` · problem_id=${problemId}` : ""}`;

      const params = new URLSearchParams();
      params.set("from_ts_ms", String(from));
      params.set("to_ts_ms", String(to));
      // 保持与后端约定一致：可传空 problem_id
      params.set("problem_id", problemId);

      try {
        const data = await apiFetch(`/admin/metrics?${params.toString()}`);
        if (!ensureSeq()) return;
        renderData(data);
      } catch (err) {
        if (!ensureSeq()) return;
        showToast(
          `查询失败：${String(err && err.message ? err.message : err)}`,
          "danger"
        );
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
    pageEl.addEventListener("click", (e) => {
      const btn =
        e.target && e.target.closest
          ? e.target.closest("[data-metrics-quick]")
          : null;
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
    // If hash is missing or invalid route, normalize to default route (no query needed).
    if (!parseRouteFromHash()) window.location.hash = `#/${route}`;
    const routeQuery = parseHashQuery();

    renderSeq++;
    renderShell(route);

    const app = $("#app");
    const pageRoot = app ? $("#pageRoot", app) : null;

    if (!pageRoot) return;

    const seq = renderSeq;
    if (route === "dashboard") {
      // Prefer module-based pages (pages/dashboard.js).
      if (renderPageViaModule("dashboard", pageRoot, seq, routeQuery)) return;
      renderDashboard(pageRoot, seq);
      return;
    }
    if (route === "problems") {
      renderProblems(pageRoot, seq);
      return;
    }
    if (route === "releases") {
      // Prefer module-based pages (pages/releases.js).
      if (renderPageViaModule("releases", pageRoot, seq, routeQuery)) return;
      renderReleases(pageRoot, seq);
      return;
    }
    if (route === "metrics") {
      // Prefer module-based pages (pages/metrics.js).
      if (renderPageViaModule("metrics", pageRoot, seq, routeQuery)) return;
      renderMetrics(pageRoot, seq);
      return;
    }
    if (route === "audit") {
      // Prefer module-based pages (pages/audit.js).
      if (renderPageViaModule("audit", pageRoot, seq, routeQuery)) return;
      renderAudit(pageRoot, seq);
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

    // Let apiFetch (in AdminLib) trigger the same auto-logout behavior on 401.
    try {
      setUnauthorizedHandler(logoutAndGoLogin);
    } catch (_) {
      // ignore
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
