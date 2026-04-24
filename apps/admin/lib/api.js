// 喵懂 Admin Web shared lib (Vanilla JS, no build chain)
// Exposes helpers via window.AdminLib (no module system).
(function () {
  "use strict";

  const LS_TOKEN_KEY = "miaodong_admin_token";

  /** @type {(reason?:string)=>void|null} */
  let unauthorizedHandler = null;

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
      clearToken();
      try {
        if (typeof unauthorizedHandler === "function") {
          unauthorizedHandler("口令无效或已过期，请重新输入～");
        }
      } catch (_) {
        // ignore
      }
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
      const btn =
        e.target && e.target.closest ? e.target.closest("[data-modal-close]") : null;
      if (btn) close();
    });
    document.body.appendChild(backdrop);
    return { close, backdrop };
  }

  function closeModal(modalHandle) {
    if (modalHandle && typeof modalHandle.close === "function") modalHandle.close();
  }

  function setUnauthorizedHandler(fn) {
    unauthorizedHandler = typeof fn === "function" ? fn : null;
  }

  window.AdminLib = {
    $,
    escapeHTML,
    getToken,
    setToken,
    clearToken,
    apiFetch,
    showToast,
    openModal,
    closeModal,
    formatDateTime,
    formatNumber,
    formatPercent01,
    tagsArrayToInput,
    tagsInputToArray,
    setUnauthorizedHandler,
  };
})();

