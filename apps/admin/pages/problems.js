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

        function jsonText(v, fallback) {
          if (v === undefined || v === null) return fallback;
          try {
            return JSON.stringify(v, null, 2);
          } catch (_) {
            return fallback;
          }
        }

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
            <span class="pill pill--soft" data-unsaved-badge style="margin-left:8px;${state.dirty ? "" : "display:none;"}">未保存</span>
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
                : tab === "questions"
                ? `
              <div class="row" style="justify-content:space-between;align-items:flex-end;gap:12px;">
                <div>
                  <div style="font-weight:900;">Questions</div>
                  <div class="card__subtle">追问列表/编辑（v0.1）</div>
                </div>
                <button class="btn btn--primary" type="button" id="qCreateBtn">新建追问</button>
              </div>

              <div class="problems-layout" style="grid-template-columns: 1fr 1fr; margin-top: 12px;">
                <div>
                  <div class="pill pill--soft" style="margin:0 0 10px;">列表</div>
                  <div id="qList" class="problems-list" style="max-height: 420px;"></div>
                </div>
                <div>
                  <div class="pill pill--soft" style="margin:0 0 10px;">编辑</div>
                  <div id="qEditorArea" class="empty-hint">点左侧选一条追问，或先新建一条～</div>
                </div>
              </div>
            `
                : tab === "suggestions"
                ? `
              <div class="row" style="justify-content:space-between;align-items:flex-end;gap:12px;">
                <div>
                  <div style="font-weight:900;">Suggestions</div>
                  <div class="card__subtle">建议列表/编辑（v0.1）</div>
                </div>
                <button class="btn btn--primary" type="button" id="sCreateBtn">新建建议</button>
              </div>

              <div class="problems-layout" style="grid-template-columns: 1fr 1fr; margin-top: 12px;">
                <div>
                  <div class="pill pill--soft" style="margin:0 0 10px;">列表</div>
                  <div id="sList" class="problems-list" style="max-height: 420px;"></div>
                </div>
                <div>
                  <div class="pill pill--soft" style="margin:0 0 10px;">编辑</div>
                  <div id="sEditorArea" class="empty-hint">点左侧选一条建议，或先新建一条～</div>
                </div>
              </div>
            `
                : tab === "tools"
                ? `
              <div class="row" style="justify-content:space-between;align-items:flex-end;gap:12px;">
                <div>
                  <div style="font-weight:900;">Tools Guide</div>
                  <div class="card__subtle">工具区（按 problem_id 1:1 upsert）</div>
                </div>
                <button class="btn btn--primary" type="button" id="tgSaveBtn">保存</button>
              </div>

              <div id="tgNotice" class="empty-hint" style="margin-top:10px;"></div>

              <div class="kv" style="margin-top:12px;">
                <div class="field">
                  <label>collapsed_by_default</label>
                  <select class="input" id="tgCollapsed">
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                </div>

                <div class="field">
                  <label>guide_bullets（JSON 数组）</label>
                  <textarea class="input textarea" id="tgBullets" placeholder='["...","..."]'></textarea>
                </div>

                <div class="field">
                  <label>efficiency_items（JSON 数组）</label>
                  <textarea class="input textarea" id="tgEfficiency" placeholder='["...","..."]'></textarea>
                </div>

                <div class="field">
                  <label>status</label>
                  <select class="input" id="tgStatus">
                    <option value="draft">draft</option>
                    <option value="published">published</option>
                    <option value="archived">archived</option>
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
            state.dirty = true;
            const badge = editorEl.querySelector("[data-unsaved-badge]");
            if (badge) badge.style.display = "inline-flex";
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

        if (tab === "questions") {
          // lazy init
          state.qState = state.qState || {
            items: [],
            selectedId: "",
            form: {
              priority: 0,
              text: "",
              type: "single_choice",
              optionsText: "[]",
              conditionText: "{}",
              status: "draft",
            },
          };

          const qState = state.qState;
          const list = $("#qList", editorEl);
          const area = $("#qEditorArea", editorEl);
          const createBtn = $("#qCreateBtn", editorEl);

          async function loadQuestions() {
            if (!list) return;
            list.innerHTML = `
              <div class="skeleton" style="width: 70%"></div>
              <div class="skeleton" style="width: 54%"></div>
              <div class="skeleton" style="width: 62%"></div>
            `;
            try {
              const res = await apiFetch(
                `/admin/questions?problem_id=${encodeURIComponent(state.selectedId)}`
              );
              qState.items = Array.isArray(res.items) ? res.items : [];
              renderQuestionsList();
              renderQuestionEditor();
            } catch (err) {
              const msg = `加载 questions 失败：${String(err && err.message ? err.message : err)}`;
              showToast(msg, "danger");
              if (list) list.innerHTML = `<pre class="code-block">${escapeHTML(msg)}</pre>`;
            }
          }

          function renderQuestionsList() {
            if (!list) return;
            if (!qState.items.length) {
              list.innerHTML = `<div class="empty-hint">还没有追问～点“新建追问”创建一个吧。</div>`;
              return;
            }
            list.innerHTML = qState.items
              .map((q) => {
                const id = String(q.id || "");
                const active = id && id === qState.selectedId ? "is-active" : "";
                const title = String(q.text || q.id || "");
                const meta = `${q.priority ?? 0} · ${q.status || ""}`;
                return `
                  <button type="button" class="problems-item ${active}" data-qid="${escapeHTML(
                  id
                )}">
                    <div class="problems-item__title">${escapeHTML(title)}</div>
                    <div class="problems-item__meta">
                      <span class="pill pill--soft">#${escapeHTML(id)}</span>
                      <span class="pill pill--soft">${escapeHTML(meta)}</span>
                    </div>
                  </button>
                `;
              })
              .join("");
          }

          function setFormFromQuestion(q) {
            qState.form = {
              priority: Number(q.priority || 0),
              text: String(q.text || ""),
              type: String(q.type || "single_choice"),
              optionsText: jsonText(q.options, "[]"),
              conditionText: jsonText(q.condition, "{}"),
              status: String(q.status || "draft"),
            };
            state.dirty = false;
          }

          function renderQuestionEditor() {
            if (!area) return;
            if (!qState.selectedId) {
              area.innerHTML = `<div class="empty-hint">点左侧选一条追问，或先新建一条～</div>`;
              return;
            }
            area.innerHTML = `
              <div class="row" style="justify-content:space-between;align-items:flex-end;gap:12px;margin:0 0 10px;">
                <div>
                  <div style="font-weight:900;">编辑追问</div>
                  <div class="card__subtle"><span class="cell-mono">#${escapeHTML(
                    qState.selectedId
                  )}</span></div>
                </div>
                <button class="btn btn--primary" type="button" id="qSaveBtn">保存</button>
              </div>

              <div class="kv">
                <div class="field">
                  <label>priority</label>
                  <input class="input" id="qPriority" type="number" value="${escapeHTML(
                    String(qState.form.priority ?? 0)
                  )}" />
                </div>
                <div class="field">
                  <label>type</label>
                  <select class="input" id="qType">
                    ${["single_choice", "multi_choice", "text"]
                      .map((t) => {
                        const sel = qState.form.type === t ? "selected" : "";
                        return `<option value="${t}" ${sel}>${t}</option>`;
                      })
                      .join("")}
                  </select>
                </div>
                <div class="field">
                  <label>text</label>
                  <textarea class="input textarea" id="qText">${escapeHTML(
                    qState.form.text
                  )}</textarea>
                </div>
                <div class="field">
                  <label>options（JSON 数组）</label>
                  <textarea class="input textarea" id="qOptions" placeholder='["a","b"]'>${escapeHTML(
                    qState.form.optionsText
                  )}</textarea>
                </div>
                <div class="field">
                  <label>condition（JSON 对象，可选）</label>
                  <textarea class="input textarea" id="qCondition" placeholder='{"if":"..."}'>${escapeHTML(
                    qState.form.conditionText
                  )}</textarea>
                </div>
                <div class="field">
                  <label>status</label>
                  <select class="input" id="qStatus">
                    ${["draft", "published", "archived"]
                      .map((s) => {
                        const sel = qState.form.status === s ? "selected" : "";
                        return `<option value="${s}" ${sel}>${s}</option>`;
                      })
                      .join("")}
                  </select>
                </div>
              </div>
            `;

            const priorityEl = $("#qPriority", area);
            const typeEl = $("#qType", area);
            const textEl = $("#qText", area);
            const optionsEl = $("#qOptions", area);
            const condEl = $("#qCondition", area);
            const statusEl = $("#qStatus", area);
            const saveEl = $("#qSaveBtn", area);

            function markDirty() {
              state.dirty = true;
              const badge = editorEl.querySelector("[data-unsaved-badge]");
              if (badge) badge.style.display = "inline-flex";
            }

            if (priorityEl)
              priorityEl.addEventListener("input", () => {
                qState.form.priority = Number(priorityEl.value || 0);
                markDirty();
              });
            if (typeEl)
              typeEl.addEventListener("change", () => {
                qState.form.type = String(typeEl.value || "");
                markDirty();
              });
            if (textEl)
              textEl.addEventListener("input", () => {
                qState.form.text = String(textEl.value || "");
                markDirty();
              });
            if (optionsEl)
              optionsEl.addEventListener("input", () => {
                qState.form.optionsText = String(optionsEl.value || "");
                markDirty();
              });
            if (condEl)
              condEl.addEventListener("input", () => {
                qState.form.conditionText = String(condEl.value || "");
                markDirty();
              });
            if (statusEl)
              statusEl.addEventListener("change", () => {
                qState.form.status = String(statusEl.value || "draft");
                markDirty();
              });

            if (saveEl)
              saveEl.addEventListener("click", async () => {
                try {
                  let optionsVal;
                  let conditionVal;
                  const optTxt = String(qState.form.optionsText || "").trim();
                  const condTxt = String(qState.form.conditionText || "").trim();
                  optionsVal = optTxt ? JSON.parse(optTxt) : [];
                  conditionVal = condTxt ? JSON.parse(condTxt) : {};

                  const body = {
                    actor: "admin",
                    priority: Number(qState.form.priority || 0),
                    text: String(qState.form.text || "").trim(),
                    type: String(qState.form.type || "").trim(),
                    options: optionsVal,
                    condition: conditionVal,
                    status: String(qState.form.status || "draft"),
                  };

                  await apiFetch(`/admin/questions/${encodeURIComponent(qState.selectedId)}`, {
                    method: "PATCH",
                    body,
                  });
                  showToast("追问已保存～", "success");
                  state.dirty = false;
                  await loadQuestions();
                } catch (err) {
                  showToast(`保存失败：${String(err && err.message ? err.message : err)}`, "danger");
                }
              });
          }

          if (createBtn)
            createBtn.addEventListener("click", async () => {
              try {
                const id = `q_${state.selectedId}_${Date.now()}`;
                await apiFetch("/admin/questions", {
                  method: "POST",
                  body: {
                    actor: "admin",
                    id,
                    problem_id: state.selectedId,
                    priority: 0,
                    text: "（新追问）请编辑这条追问文本…",
                    type: "single_choice",
                    options: ["是", "否"],
                    condition: {},
                  },
                });
                showToast("已新建追问～", "success");
                qState.selectedId = id;
                await loadQuestions();
              } catch (err) {
                showToast(`新建失败：${String(err && err.message ? err.message : err)}`, "danger");
              }
            });

          if (list)
            list.addEventListener("click", (e) => {
              const btn =
                e.target && e.target.closest ? e.target.closest("[data-qid]") : null;
              if (!btn) return;
              const id = btn.getAttribute("data-qid") || "";
              if (!id || id === qState.selectedId) return;
              void (async () => {
                const ok = await confirmDiscardIfDirty("切换追问");
                if (!ok) return;
                qState.selectedId = id;
                const q = qState.items.find((x) => String(x.id) === id) || {};
                setFormFromQuestion(q);
                renderQuestionsList();
                renderQuestionEditor();
              })();
            });

          // initial load
          if (!qState._loadedFor || qState._loadedFor !== state.selectedId) {
            qState._loadedFor = state.selectedId;
            qState.selectedId = "";
            void loadQuestions();
          } else {
            renderQuestionsList();
            renderQuestionEditor();
          }
        }

        if (tab === "suggestions") {
          state.sState = state.sState || {
            items: [],
            selectedId: "",
            form: {
              priority: 0,
              title: "",
              stepsText: "[]",
              conditionText: "{}",
              status: "draft",
            },
          };
          const sState = state.sState;
          const list = $("#sList", editorEl);
          const area = $("#sEditorArea", editorEl);
          const createBtn = $("#sCreateBtn", editorEl);

          async function loadSuggestions() {
            if (!list) return;
            list.innerHTML = `
              <div class="skeleton" style="width: 70%"></div>
              <div class="skeleton" style="width: 54%"></div>
              <div class="skeleton" style="width: 62%"></div>
            `;
            try {
              const res = await apiFetch(
                `/admin/suggestions?problem_id=${encodeURIComponent(state.selectedId)}`
              );
              sState.items = Array.isArray(res.items) ? res.items : [];
              renderSuggestionsList();
              renderSuggestionEditor();
            } catch (err) {
              const msg = `加载 suggestions 失败：${String(err && err.message ? err.message : err)}`;
              showToast(msg, "danger");
              if (list) list.innerHTML = `<pre class="code-block">${escapeHTML(msg)}</pre>`;
            }
          }

          function renderSuggestionsList() {
            if (!list) return;
            if (!sState.items.length) {
              list.innerHTML = `<div class="empty-hint">还没有建议～点“新建建议”创建一个吧。</div>`;
              return;
            }
            list.innerHTML = sState.items
              .map((s) => {
                const id = String(s.id || "");
                const active = id && id === sState.selectedId ? "is-active" : "";
                const title = String(s.title || s.id || "");
                const meta = `${s.priority ?? 0} · ${s.status || ""}`;
                return `
                  <button type="button" class="problems-item ${active}" data-sid="${escapeHTML(
                  id
                )}">
                    <div class="problems-item__title">${escapeHTML(title)}</div>
                    <div class="problems-item__meta">
                      <span class="pill pill--soft">#${escapeHTML(id)}</span>
                      <span class="pill pill--soft">${escapeHTML(meta)}</span>
                    </div>
                  </button>
                `;
              })
              .join("");
          }

          function setFormFromSuggestion(s) {
            sState.form = {
              priority: Number(s.priority || 0),
              title: String(s.title || ""),
              stepsText: jsonText(s.steps, "[]"),
              conditionText: jsonText(s.condition, "{}"),
              status: String(s.status || "draft"),
            };
            state.dirty = false;
          }

          function renderSuggestionEditor() {
            if (!area) return;
            if (!sState.selectedId) {
              area.innerHTML = `<div class="empty-hint">点左侧选一条建议，或先新建一条～</div>`;
              return;
            }
            area.innerHTML = `
              <div class="row" style="justify-content:space-between;align-items:flex-end;gap:12px;margin:0 0 10px;">
                <div>
                  <div style="font-weight:900;">编辑建议</div>
                  <div class="card__subtle"><span class="cell-mono">#${escapeHTML(
                    sState.selectedId
                  )}</span></div>
                </div>
                <button class="btn btn--primary" type="button" id="sSaveBtn">保存</button>
              </div>

              <div class="kv">
                <div class="field">
                  <label>priority</label>
                  <input class="input" id="sPriority" type="number" value="${escapeHTML(
                    String(sState.form.priority ?? 0)
                  )}" />
                </div>
                <div class="field">
                  <label>title</label>
                  <input class="input" id="sTitle" value="${escapeHTML(
                    sState.form.title
                  )}" placeholder="例如：晚上加一段互动游戏" />
                </div>
                <div class="field">
                  <label>steps（JSON 数组）</label>
                  <textarea class="input textarea" id="sSteps" placeholder='["step1","step2"]'>${escapeHTML(
                    sState.form.stepsText
                  )}</textarea>
                </div>
                <div class="field">
                  <label>condition（JSON 对象，可选）</label>
                  <textarea class="input textarea" id="sCondition" placeholder='{"if":"..."}'>${escapeHTML(
                    sState.form.conditionText
                  )}</textarea>
                </div>
                <div class="field">
                  <label>status</label>
                  <select class="input" id="sStatus">
                    ${["draft", "published", "archived"]
                      .map((st) => {
                        const sel = sState.form.status === st ? "selected" : "";
                        return `<option value="${st}" ${sel}>${st}</option>`;
                      })
                      .join("")}
                  </select>
                </div>
              </div>
            `;

            const priorityEl = $("#sPriority", area);
            const titleEl = $("#sTitle", area);
            const stepsEl = $("#sSteps", area);
            const condEl = $("#sCondition", area);
            const statusEl = $("#sStatus", area);
            const saveEl = $("#sSaveBtn", area);

            function markDirty() {
              state.dirty = true;
              const badge = editorEl.querySelector("[data-unsaved-badge]");
              if (badge) badge.style.display = "inline-flex";
            }

            if (priorityEl)
              priorityEl.addEventListener("input", () => {
                sState.form.priority = Number(priorityEl.value || 0);
                markDirty();
              });
            if (titleEl)
              titleEl.addEventListener("input", () => {
                sState.form.title = String(titleEl.value || "");
                markDirty();
              });
            if (stepsEl)
              stepsEl.addEventListener("input", () => {
                sState.form.stepsText = String(stepsEl.value || "");
                markDirty();
              });
            if (condEl)
              condEl.addEventListener("input", () => {
                sState.form.conditionText = String(condEl.value || "");
                markDirty();
              });
            if (statusEl)
              statusEl.addEventListener("change", () => {
                sState.form.status = String(statusEl.value || "draft");
                markDirty();
              });

            if (saveEl)
              saveEl.addEventListener("click", async () => {
                try {
                  const stepsTxt = String(sState.form.stepsText || "").trim();
                  const condTxt = String(sState.form.conditionText || "").trim();
                  const stepsVal = stepsTxt ? JSON.parse(stepsTxt) : [];
                  const condVal = condTxt ? JSON.parse(condTxt) : {};

                  const body = {
                    actor: "admin",
                    priority: Number(sState.form.priority || 0),
                    title: String(sState.form.title || "").trim(),
                    steps: stepsVal,
                    condition: condVal,
                    status: String(sState.form.status || "draft"),
                  };

                  await apiFetch(`/admin/suggestions/${encodeURIComponent(sState.selectedId)}`, {
                    method: "PATCH",
                    body,
                  });
                  showToast("建议已保存～", "success");
                  state.dirty = false;
                  await loadSuggestions();
                } catch (err) {
                  showToast(`保存失败：${String(err && err.message ? err.message : err)}`, "danger");
                }
              });
          }

          if (createBtn)
            createBtn.addEventListener("click", async () => {
              try {
                const id = `s_${state.selectedId}_${Date.now()}`;
                await apiFetch("/admin/suggestions", {
                  method: "POST",
                  body: {
                    actor: "admin",
                    id,
                    problem_id: state.selectedId,
                    priority: 0,
                    title: "（新建议）请编辑建议标题…",
                    steps: ["（步骤1）…", "（步骤2）…"],
                    condition: {},
                  },
                });
                showToast("已新建建议～", "success");
                sState.selectedId = id;
                await loadSuggestions();
              } catch (err) {
                showToast(`新建失败：${String(err && err.message ? err.message : err)}`, "danger");
              }
            });

          if (list)
            list.addEventListener("click", (e) => {
              const btn =
                e.target && e.target.closest ? e.target.closest("[data-sid]") : null;
              if (!btn) return;
              const id = btn.getAttribute("data-sid") || "";
              if (!id || id === sState.selectedId) return;
              void (async () => {
                const ok = await confirmDiscardIfDirty("切换建议");
                if (!ok) return;
                sState.selectedId = id;
                const s = sState.items.find((x) => String(x.id) === id) || {};
                setFormFromSuggestion(s);
                renderSuggestionsList();
                renderSuggestionEditor();
              })();
            });

          if (!sState._loadedFor || sState._loadedFor !== state.selectedId) {
            sState._loadedFor = state.selectedId;
            sState.selectedId = "";
            void loadSuggestions();
          } else {
            renderSuggestionsList();
            renderSuggestionEditor();
          }
        }

        if (tab === "tools") {
          state.tgState = state.tgState || {
            exists: false,
            form: {
              collapsed: true,
              bulletsText: "[]",
              efficiencyText: "[]",
              status: "draft",
            },
          };

          const tg = state.tgState;
          const notice = $("#tgNotice", editorEl);
          const collapsedEl = $("#tgCollapsed", editorEl);
          const bulletsEl = $("#tgBullets", editorEl);
          const effEl = $("#tgEfficiency", editorEl);
          const statusEl = $("#tgStatus", editorEl);
          const saveEl = $("#tgSaveBtn", editorEl);

          function markDirty() {
            state.dirty = true;
            const badge = editorEl.querySelector("[data-unsaved-badge]");
            if (badge) badge.style.display = "inline-flex";
          }

          async function loadToolsGuide() {
            if (notice) notice.textContent = "正在加载工具区…";
            try {
              const res = await apiFetch(
                `/admin/tools-guides?problem_id=${encodeURIComponent(state.selectedId)}`
              );
              tg.exists = true;
              tg.form = {
                collapsed: !!res.collapsed_by_default,
                bulletsText: jsonText(res.guide_bullets, "[]"),
                efficiencyText: jsonText(res.efficiency_items, "[]"),
                status: String(res.status || "draft"),
              };
              state.dirty = false;
              hydrateToolsForm();
              if (notice) notice.textContent = "已加载（存在记录）。";
            } catch (err) {
              const msg = String(err && err.message ? err.message : err);
              // apiFetch throws Error(text). For 404, backend body is "404 page not found".
              tg.exists = false;
              tg.form = {
                collapsed: true,
                bulletsText: "[]",
                efficiencyText: "[]",
                status: "draft",
              };
              state.dirty = false;
              hydrateToolsForm();
              if (notice) notice.textContent = `尚未创建（保存时会自动创建）。${msg.includes("404") ? "" : msg}`;
            }
          }

          function hydrateToolsForm() {
            if (collapsedEl) collapsedEl.value = tg.form.collapsed ? "true" : "false";
            if (bulletsEl) bulletsEl.value = tg.form.bulletsText;
            if (effEl) effEl.value = tg.form.efficiencyText;
            if (statusEl) statusEl.value = tg.form.status;
          }

          if (collapsedEl)
            collapsedEl.addEventListener("change", () => {
              tg.form.collapsed = collapsedEl.value === "true";
              markDirty();
            });
          if (bulletsEl)
            bulletsEl.addEventListener("input", () => {
              tg.form.bulletsText = String(bulletsEl.value || "");
              markDirty();
            });
          if (effEl)
            effEl.addEventListener("input", () => {
              tg.form.efficiencyText = String(effEl.value || "");
              markDirty();
            });
          if (statusEl)
            statusEl.addEventListener("change", () => {
              tg.form.status = String(statusEl.value || "draft");
              markDirty();
            });

          if (saveEl)
            saveEl.addEventListener("click", async () => {
              try {
                const bulletsTxt = String(tg.form.bulletsText || "").trim();
                const effTxt = String(tg.form.efficiencyText || "").trim();
                const bulletsVal = bulletsTxt ? JSON.parse(bulletsTxt) : [];
                const effVal = effTxt ? JSON.parse(effTxt) : [];
                const body = {
                  actor: "admin",
                  collapsed_by_default: !!tg.form.collapsed,
                  guide_bullets: bulletsVal,
                  efficiency_items: effVal,
                  status: String(tg.form.status || "draft"),
                };
                await apiFetch(`/admin/tools-guides/${encodeURIComponent(state.selectedId)}`, {
                  method: "PUT",
                  body,
                });
                showToast("工具区已保存～", "success");
                state.dirty = false;
                await loadToolsGuide();
              } catch (err) {
                showToast(`保存失败：${String(err && err.message ? err.message : err)}`, "danger");
              }
            });

          if (!tg._loadedFor || tg._loadedFor !== state.selectedId) {
            tg._loadedFor = state.selectedId;
            void loadToolsGuide();
          } else {
            hydrateToolsForm();
          }
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
