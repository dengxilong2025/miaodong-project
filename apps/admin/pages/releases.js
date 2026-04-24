// Admin Releases page (Vanilla JS, no build chain)
// Adds release-anchored 24h/72h compare shortcuts that jump to:
//   #/metrics?mode=compare&from_a=...&to_a=...&from_b=...&to_b=...
(function () {
  "use strict";

  window.AdminPages = window.AdminPages || {};

  const HOUR_MS = 60 * 60 * 1000;

  function toMsFromISO(iso) {
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : null;
  }

  function buildCompareHash(tMs, hours) {
    const toB = tMs;
    const fromB = tMs - hours * HOUR_MS;
    const toA = fromB;
    const fromA = toA - hours * HOUR_MS;
    const p = new URLSearchParams({
      mode: "compare",
      from_a: String(fromA),
      to_a: String(toA),
      from_b: String(fromB),
      to_b: String(toB),
    });
    return `#/metrics?${p.toString()}`;
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
    const { escapeHTML, formatDateTime } = window.AdminLib;
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
            <th>compare</th>
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
              const atEsc = escapeHTML(String(at || ""));
              return `
                <tr>
                  <td class="cell-mono">${escapeHTML(String(v))}</td>
                  <td>${statusPill(st)}</td>
                  <td>${escapeHTML(String(rp))}%</td>
                  <td>${escapeHTML(by || "-")}</td>
                  <td>${escapeHTML(formatDateTime(at))}</td>
                  <td>
                    <div class="row" style="gap:8px;">
                      <button
                        class="btn btn--ghost"
                        type="button"
                        data-release-compare="24"
                        data-release-created-at="${atEsc}"
                        title="以 created_at 为锚点，对比前后 24h 指标"
                      >24h 对比</button>
                      <button
                        class="btn btn--ghost"
                        type="button"
                        data-release-compare="72"
                        data-release-created-at="${atEsc}"
                        title="以 created_at 为锚点，对比前后 72h 指标"
                      >72h 对比</button>
                    </div>
                  </td>
                  <td><div class="cell-notes">${escapeHTML(notes || "")}</div></td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    `;
  }

  window.AdminPages.releases = {
    /**
     * @param {HTMLElement} pageEl
     * @param {{ensureActive?:()=>boolean}=} ctx
     */
    render(pageEl, ctx) {
      const { $, apiFetch, showToast, escapeHTML, openModal } = window.AdminLib;
      const ensureActive =
        ctx && typeof ctx.ensureActive === "function" ? ctx.ensureActive : () => true;

      pageEl.innerHTML = releasesLoadingHTML();

      const listEl = $("#releasesList", pageEl);
      const refreshBtn = $("#releasesRefreshBtn", pageEl);

      const publishForm = $("#publishForm", pageEl);
      const publishResetBtn = $("#publishResetBtn", pageEl);
      const publishRolloutEl = $("#publishRolloutPercent", pageEl);
      const publishNotesEl = $("#publishNotes", pageEl);

      const rollbackForm = $("#rollbackForm", pageEl);
      const rollbackResetBtn = $("#rollbackResetBtn", pageEl);
      const rollbackTargetEl = $("#rollbackTarget", pageEl);
      const rollbackNotesEl = $("#rollbackNotes", pageEl);

      async function loadList() {
        if (!ensureActive()) return;
        if (listEl) {
          listEl.innerHTML = `
            <div class="skeleton" style="width: 72%"></div>
            <div class="skeleton" style="width: 56%"></div>
            <div class="skeleton" style="width: 64%"></div>
          `;
        }
        try {
          const data = await apiFetch("/admin/releases");
          if (!ensureActive()) return;
          const items = data && typeof data === "object" ? data.items : [];
          renderReleasesTable(listEl, items);
        } catch (err) {
          if (!ensureActive()) return;
          showToast(`列表加载失败：${String(err && err.message ? err.message : err)}`, "danger");
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
        return Math.floor(n);
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
            if (!ensureActive()) return;
            confirmBtn.disabled = true;
            try {
              const res = await apiFetch("/admin/release", {
                method: "POST",
                body: { actor: "admin-ui", rollout_percent: rolloutPercent, notes },
              });
              if (!ensureActive()) return;
              showToast(
                `发布成功：content_version=${String(
                  res && res.content_version !== undefined ? res.content_version : "?"
                )}`,
                "success"
              );
              m.close();
              await loadList();
            } catch (err) {
              if (!ensureActive()) return;
              showToast(`发布失败：${String(err && err.message ? err.message : err)}`, "danger");
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
            if (!ensureActive()) return;
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
              if (!ensureActive()) return;
              showToast(
                `回滚成功：content_version=${String(
                  res && res.content_version !== undefined ? res.content_version : "?"
                )}`,
                "success"
              );
              m.close();
              await loadList();
            } catch (err) {
              if (!ensureActive()) return;
              showToast(`回滚失败：${String(err && err.message ? err.message : err)}`, "danger");
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

      // compare shortcut buttons (event delegation)
      pageEl.addEventListener("click", (e) => {
        const btn = e.target && e.target.closest ? e.target.closest("[data-release-compare]") : null;
        if (!btn) return;
        const hours = Number(btn.getAttribute("data-release-compare") || "");
        const at = btn.getAttribute("data-release-created-at") || "";
        if (!Number.isFinite(hours) || (hours !== 24 && hours !== 72)) return;
        const tMs = toMsFromISO(at);
        if (!tMs) {
          showToast("这条 release 的 created_at 不太对…没法当锚点喵～", "danger");
          return;
        }
        window.location.hash = buildCompareHash(tMs, hours);
      });

      // 初次加载
      void loadList();
    },
  };
})();

