/* Northwind ERP: a static, hash-routed demo ERP modelled on a modern ERP web client.
 * Query parameters (in location.search or in the hash query, e.g. #/customers/new?lang=da):
 *   lang=en|da|de   UI language (persisted in localStorage)
 *   v=1|2           layout version (v2 moves actions into a ribbon, renames some ids, moves a field)
 *   reset=1         reseed the demo data
 */
(function () {
  "use strict";

  var I18N = window.NW_I18N;
  var LS = { lang: "northwind.lang", layout: "northwind.layout", data: "northwind.data.v1", collapsed: "northwind.fasttabs" };
  var LANGS = [
    { code: "en", label: "English", locale: "en-GB" },
    { code: "da", label: "Dansk", locale: "da-DK" },
    { code: "de", label: "Deutsch", locale: "de-DE" },
  ];
  var COMPANY = "Northwind Traders A/S";
  var USER = { name: "Anna Jensen", initials: "AJ" };
  var VAT_RATE = 0.25;

  // ------------------------------------------------------------------ storage + params
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }

  function readParams() {
    var out = new URLSearchParams(location.search);
    var h = location.hash;
    var qi = h.indexOf("?");
    if (qi >= 0) new URLSearchParams(h.slice(qi + 1)).forEach(function (v, k) { out.set(k, v); });
    return out;
  }

  function stripParams(keys) {
    var url = new URL(location.href);
    var changed = false;
    keys.forEach(function (k) { if (url.searchParams.has(k)) { url.searchParams.delete(k); changed = true; } });
    var hash = url.hash;
    var qi = hash.indexOf("?");
    if (qi >= 0) {
      var hp = new URLSearchParams(hash.slice(qi + 1));
      keys.forEach(function (k) { if (hp.has(k)) { hp.delete(k); changed = true; } });
      var rest = hp.toString();
      hash = hash.slice(0, qi) + (rest ? "?" + rest : "");
    }
    if (changed) {
      url.hash = hash;
      history.replaceState(history.state, "", url.toString());
    }
  }

  var S = {
    lang: "en",
    layout: 1,
    data: null,
    path: null,
    draft: null,
    draftPath: null,
    selected: {},
    filter: {},
    collapsed: {},
    highlight: null,
  };

  function initialLang() {
    var stored = lsGet(LS.lang);
    if (stored && I18N[stored]) return stored;
    var nav = (navigator.language || "en").slice(0, 2).toLowerCase();
    return I18N[nav] ? nav : "en";
  }

  function loadData() {
    try {
      var raw = lsGet(LS.data);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && d.version === 1 && d.customers) return d;
      }
    } catch (e) { /* reseed */ }
    return window.NW_SEED();
  }
  function saveData() { lsSet(LS.data, JSON.stringify(S.data)); }

  function applyParams() {
    var p = readParams();
    var lang = p.get("lang");
    if (lang && I18N[lang]) { S.lang = lang; lsSet(LS.lang, lang); }
    var v = p.get("v");
    if (v) { S.layout = v === "2" ? 2 : 1; lsSet(LS.layout, String(S.layout)); }
    if (p.get("reset") === "1") {
      S.data = window.NW_SEED();
      saveData();
      S.selected = {};
      S.filter = {};
      S.draft = null;
      S.draftPath = null;
    }
    stripParams(["lang", "v", "reset"]);
  }

  // ------------------------------------------------------------------ i18n + formatting
  function t(key, vars) {
    var s = (I18N[S.lang] && I18N[S.lang][key]) || I18N.en[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split("{" + k + "}").join(vars[k]); });
    return s;
  }
  function locale() { return LANGS.filter(function (l) { return l.code === S.lang; })[0].locale; }
  function num(n, dec) {
    return new Intl.NumberFormat(locale(), { minimumFractionDigits: dec == null ? 2 : dec, maximumFractionDigits: dec == null ? 2 : dec }).format(n || 0);
  }
  function money(n, cur) { return num(n) + (cur ? " " + cur : ""); }
  function fdate(iso) {
    if (!iso) return "";
    return new Intl.DateTimeFormat(locale(), { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso + "T12:00:00"));
  }
  function parseNum(s) {
    if (typeof s === "number") return s;
    s = String(s || "").trim().replace(/\s/g, "");
    if (!s) return 0;
    // accept both 1.234,50 and 1,234.50
    var lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function today() { return window.NW_DAY(0); }

  // ------------------------------------------------------------------ icons (Fluent-style strokes)
  var ICONS = {
    plus: '<path d="M10 4v12M4 10h12"/>',
    edit: '<path d="M13.5 3.5l3 3L7 16H4v-3z"/><path d="M11.5 5.5l3 3"/>',
    trash: '<path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10"/>',
    save: '<path d="M4 4h9l3 3v9H4z"/><path d="M7 4v4h6V4M7 16v-5h6v5"/>',
    post: '<path d="M5 3h7l3 3v11H5z"/><path d="M8 11l2 2 3-4"/>',
    release: '<rect x="4" y="9" width="12" height="8" rx="1"/><path d="M7 9V6a3 3 0 0 1 6 0"/>',
    approve: '<circle cx="10" cy="10" r="7"/><path d="M7 10l2 2 4-4"/>',
    reject: '<circle cx="10" cy="10" r="7"/><path d="M7.5 7.5l5 5M12.5 7.5l-5 5"/>',
    back: '<path d="M16 10H4M9 5l-5 5 5 5"/>',
    search: '<circle cx="9" cy="9" r="5"/><path d="M13 13l4 4"/>',
    chevronDown: '<path d="M5 8l5 5 5-5"/>',
    chevronRight: '<path d="M8 5l5 5-5 5"/>',
    home: '<path d="M3 9l7-6 7 6v8H3z"/><path d="M8 17v-5h4v5"/>',
    customers: '<circle cx="8" cy="7" r="3"/><path d="M2.5 17c.5-3 2.8-4.5 5.5-4.5s5 1.5 5.5 4.5"/><path d="M13 4.2a3 3 0 0 1 0 5.6M15.5 12.8c1.2.7 1.8 2 2 4.2"/>',
    orders: '<path d="M3 4h2l2 9h8l2-6H6"/><circle cx="8" cy="16" r="1"/><circle cx="14" cy="16" r="1"/>',
    items: '<path d="M10 2l7 4v8l-7 4-7-4V6z"/><path d="M3 6l7 4 7-4M10 10v8"/>',
    invoices: '<path d="M5 2h10v16l-2-1.5L11 18l-2-1.5L7 18l-2-1.5z"/><path d="M8 6h4M8 9h4M8 12h2"/>',
    bell: '<path d="M5 14V9a5 5 0 0 1 10 0v5l1.5 2h-13z"/><path d="M8.5 18h3"/>',
    help: '<circle cx="10" cy="10" r="7.5"/><path d="M8 8a2 2 0 1 1 3 1.7c-.6.4-1 .8-1 1.6M10 14v.1"/>',
    gear: '<circle cx="10" cy="10" r="2.5"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>',
    globe: '<circle cx="10" cy="10" r="7.5"/><path d="M2.5 10h15M10 2.5c2.2 2.3 3 4.8 3 7.5s-.8 5.2-3 7.5c-2.2-2.3-3-4.8-3-7.5s.8-5.2 3-7.5z"/>',
    waffle: '<path d="M4 4h2v2H4zM9 4h2v2H9zM14 4h2v2h-2zM4 9h2v2H4zM9 9h2v2H9zM14 9h2v2h-2zM4 14h2v2H4zM9 14h2v2H9zM14 14h2v2h-2z"/>',
    excel: '<rect x="3" y="3" width="14" height="14" rx="1.5"/><path d="M7 7l6 6M13 7l-6 6"/>',
    chart: '<path d="M3 17h14M6 14V9M10 14V5M14 14v-3"/>',
    ledger: '<path d="M4 3h10a2 2 0 0 1 2 2v12H6a2 2 0 0 1-2-2z"/><path d="M7 7h6M7 10h6M7 13h3"/>',
    print: '<path d="M6 7V3h8v4M6 14H4V8h12v6h-2"/><path d="M6 11h8v6H6z"/>',
    filter: '<path d="M3 4h14l-5.5 6.5V16l-3 1.5v-7z"/>',
    more: '<circle cx="5" cy="10" r="1"/><circle cx="10" cy="10" r="1"/><circle cx="15" cy="10" r="1"/>',
    close: '<path d="M5 5l10 10M15 5L5 15"/>',
    info: '<circle cx="10" cy="10" r="7.5"/><path d="M10 9v5M10 6v.1"/>',
    warn: '<path d="M10 3l8 14H2z"/><path d="M10 8v4M10 14.5v.1"/>',
    check: '<path d="M4 10.5l4 4 8-9"/>',
    vendor: '<path d="M3 8l1.5-4h11L17 8"/><path d="M3 8h14v9H3zM8 17v-5h4v5"/>',
    star: '<path d="M10 2.8l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 8.1l5-.7z"/>',
  };
  function icon(name, cls) {
    return '<svg class="ico ' + (cls || "") + '" viewBox="0 0 20 20" aria-hidden="true" focusable="false">' + (ICONS[name] || "") + "</svg>";
  }

  // ------------------------------------------------------------------ option lists (values stay language-independent)
  var OPTIONS = {
    country: ["DK", "DE", "GB", "SE", "NO", "NL", "FR", "US"],
    postingGroup: ["DOMESTIC", "EU", "FOREIGN"],
    paymentTerms: ["7D", "14D", "30D", "CM"],
    currency: ["", "EUR", "GBP", "SEK", "NOK", "USD"],
    blocked: ["", "ship", "invoice", "all"],
    category: ["CHAIR", "DESK", "TABLE", "STORAGE", "LAMP", "OFFICE"],
    uom: ["PCS", "BOX", "SET"],
    vatGroup: ["STANDARD", "REDUCED", "ZERO"],
    shipmentMethod: ["DELIVERY", "PICKUP", "EXW"],
  };
  function optLabel(list, value) {
    if (list === "currency") return value ? value : t("currency.lcy");
    if (!value && list !== "blocked") return "";
    return t(list + "." + (value || "blank"));
  }
  function optionsHtml(list, selected, withBlank) {
    var vals = OPTIONS[list];
    var out = withBlank ? '<option value=""' + (selected ? "" : " selected") + "></option>" : "";
    vals.forEach(function (v) {
      out += '<option value="' + esc(v) + '"' + (v === selected ? " selected" : "") + ">" + esc(optLabel(list, v)) + "</option>";
    });
    return out;
  }

  // ------------------------------------------------------------------ data helpers
  function customer(no) { return S.data.customers.filter(function (c) { return c.no === no; })[0]; }
  function item(no) { return S.data.items.filter(function (i) { return i.no === no; })[0]; }
  function order(no) { return S.data.orders.filter(function (o) { return o.no === no; })[0]; }
  function invoice(no) { return S.data.invoices.filter(function (i) { return i.no === no; })[0]; }
  function lineAmount(l) { return (Number(l.qty) || 0) * (Number(l.unitPrice) || 0); }
  function orderAmount(o) { return o.lines.reduce(function (s, l) { return s + lineAmount(l); }, 0); }
  function orderVat(o) {
    var c = customer(o.customerNo);
    return c && c.taxLiable ? orderAmount(o) * VAT_RATE : 0;
  }
  function invoiceAmount(inv) { return inv.lines.reduce(function (s, l) { return s + l.qty * l.unitCost; }, 0); }
  function pad(n, w) { var s = String(n); while (s.length < w) s = "0" + s; return s; }

  // ------------------------------------------------------------------ shell
  var NAV = [
    { path: "/home", key: "nav.home", icon: "home" },
    { path: "/customers", key: "nav.customers", icon: "customers" },
    { path: "/sales-orders", key: "nav.salesOrders", icon: "orders" },
    { path: "/items", key: "nav.items", icon: "items" },
    { path: "/purchase-invoices", key: "nav.purchaseInvoices", icon: "invoices" },
  ];
  var MORE = ["more.vendors", "more.chartOfAccounts", "more.bankAccounts", "more.reports"];

  function navActive(path) {
    var top = "/" + (S.path || "/home").split("/")[1];
    return top === path || (path === "/home" && top === "/");
  }

  function renderShell() {
    document.documentElement.lang = S.lang;
    document.body.classList.toggle("layout-v2", S.layout === 2);
    document.body.classList.toggle("layout-v1", S.layout !== 2);

    var bar = document.getElementById("appbar");
    bar.innerHTML =
      '<div class="appbar-left">' +
      '<button type="button" class="icon-btn waffle" data-act="apps" aria-label="' + esc(t("appbar.apps")) + '">' + icon("waffle") + "</button>" +
      '<a class="brand" href="#/home"><span class="brand-mark" aria-hidden="true">N</span><span class="brand-name">Northwind ERP</span></a>' +
      '<span class="appbar-sep" aria-hidden="true"></span>' +
      '<span class="company">' + esc(COMPANY) + "</span>" +
      (S.layout === 2 ? '<span class="preview-badge">' + esc(t("appbar.newLayout")) + "</span>" : "") +
      "</div>" +
      '<div class="appbar-search" role="search">' + icon("search") +
      '<input type="search" id="tell-me" autocomplete="off" aria-label="' + esc(t("appbar.search")) + '" placeholder="' + esc(t("appbar.tellMe")) + '">' +
      '<ul class="tell-me-results" id="tell-me-results" role="listbox" aria-label="' + esc(t("appbar.search")) + '" hidden></ul>' +
      "</div>" +
      '<div class="appbar-right">' +
      '<div class="lang-switch">' + icon("globe") +
      '<select id="language-switcher" aria-label="' + esc(t("appbar.language")) + '">' +
      LANGS.map(function (l) { return '<option value="' + l.code + '"' + (l.code === S.lang ? " selected" : "") + ">" + l.label + "</option>"; }).join("") +
      "</select></div>" +
      '<button type="button" class="icon-btn" data-act="notifications" aria-label="' + esc(t("appbar.notifications")) + '">' + icon("bell") + '<span class="dot" aria-hidden="true"></span></button>' +
      '<button type="button" class="icon-btn" data-act="settings" aria-label="' + esc(t("appbar.settings")) + '">' + icon("gear") + "</button>" +
      '<button type="button" class="icon-btn" data-act="help" aria-label="' + esc(t("appbar.help")) + '">' + icon("help") + "</button>" +
      '<button type="button" class="avatar" data-act="user" aria-label="' + esc(USER.name) + '">' + USER.initials + "</button>" +
      "</div>";

    var nav = document.getElementById("app-nav");
    var links = NAV.map(function (n) {
      var cur = navActive(n.path) ? ' aria-current="page"' : "";
      return '<li><a href="#' + n.path + '"' + cur + ">" + (S.layout === 2 ? icon(n.icon) : "") + "<span>" + esc(t(n.key)) + "</span></a></li>";
    }).join("");
    var more =
      '<div class="nav-more">' +
      '<button type="button" class="nav-more-btn" id="nav-more" aria-haspopup="menu" aria-expanded="false" aria-controls="nav-more-menu">' + (S.layout === 2 ? icon("more") : "") +
      "<span>" + esc(t("nav.more")) + "</span>" + icon("chevronDown", "chev") + "</button>" +
      '<ul class="menu" id="nav-more-menu" role="menu" aria-labelledby="nav-more" hidden>' +
      MORE.map(function (k) { return '<li role="none"><button type="button" role="menuitem" data-act="unavailable">' + esc(t(k)) + "</button></li>"; }).join("") +
      "</ul></div>";
    nav.setAttribute("aria-label", t("nav.label"));
    nav.innerHTML =
      '<div class="role-name">' + esc(t("nav.role")) + "</div>" +
      "<ul class=\"nav-links\">" + links + "</ul>" + more;
  }

  // ------------------------------------------------------------------ toasts + dialogs
  function toast(msg, kind) {
    var host = document.getElementById("toasts");
    var el = document.createElement("div");
    el.className = "toast " + (kind || "success");
    el.innerHTML = icon(kind === "error" ? "warn" : kind === "info" ? "info" : "check") + "<span>" + esc(msg) + "</span>";
    host.appendChild(el);
    setTimeout(function () { el.classList.add("leaving"); }, 4200);
    setTimeout(function () { el.remove(); }, 4600);
  }

  /** Modal dialog. opts: {title, message, yes, no, comment: {label, required}} → Promise<{ok, comment}> */
  function dialog(opts) {
    return new Promise(function (resolve) {
      var root = document.getElementById("dialog-root");
      var prevFocus = document.activeElement;
      root.innerHTML =
        '<div class="dialog-backdrop">' +
        '<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-message">' +
        '<div class="dialog-head"><span class="dialog-icon">' + icon(opts.icon || "info") + '</span><h2 id="dialog-title">' + esc(opts.title) + "</h2></div>" +
        '<p id="dialog-message" class="dialog-message">' + esc(opts.message) + "</p>" +
        (opts.comment
          ? '<div class="dialog-field"><label for="approval-comment">' + esc(opts.comment.label) + '</label><textarea id="approval-comment" rows="3"></textarea><div class="field-error" id="approval-comment-error" hidden></div></div>'
          : "") +
        '<div class="dialog-actions"><button type="button" class="btn primary" data-dlg="yes">' + esc(opts.yes) + '</button><button type="button" class="btn" data-dlg="no">' + esc(opts.no) + "</button></div>" +
        "</div></div>";
      document.getElementById("app").setAttribute("inert", "");
      var dlg = root.querySelector(".dialog");
      function close(ok) {
        var comment = opts.comment ? root.querySelector("#approval-comment").value.trim() : "";
        if (ok && opts.comment && opts.comment.required && !comment) {
          var err = root.querySelector("#approval-comment-error");
          err.textContent = t("msg.commentRequired");
          err.hidden = false;
          return;
        }
        root.innerHTML = "";
        document.getElementById("app").removeAttribute("inert");
        document.removeEventListener("keydown", onKey, true);
        if (prevFocus && prevFocus.focus && prevFocus.isConnected) prevFocus.focus();
        resolve({ ok: ok, comment: comment });
      }
      function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(false); } }
      document.addEventListener("keydown", onKey, true);
      dlg.addEventListener("click", function (e) {
        var b = e.target.closest("[data-dlg]");
        if (b) close(b.getAttribute("data-dlg") === "yes");
      });
      setTimeout(function () {
        var f = root.querySelector("textarea") || root.querySelector("[data-dlg=yes]");
        if (f) f.focus();
      }, 0);
    });
  }

  // ------------------------------------------------------------------ building blocks
  function setTitle(key) { document.title = t(key) + " – Northwind ERP"; }

  /** actions: [{act, label, icon, id?, primary?, disabled?, group: "actions"|"manage"|"navigate"|"report"}] */
  function actionBar(actions, extraHtml) {
    if (S.layout === 2) {
      var groups = ["manage", "actions", "process", "navigate", "report"];
      var html = '<div class="ribbon" role="toolbar" aria-label="' + esc(t("ab.actions")) + '">';
      groups.forEach(function (g) {
        var inGroup = actions.filter(function (a) { return (a.group || "actions") === g; });
        if (!inGroup.length) return;
        html += '<div class="rg" role="group" aria-labelledby="rg-' + g + '"><div class="rg-btns">';
        inGroup.forEach(function (a) {
          html += '<button type="button" class="rb' + (a.primary ? " primary" : "") + '"' + (a.id2 ? ' id="' + a.id2 + '"' : "") + ' data-act="' + a.act + '"' + (a.disabled ? " disabled" : "") + ">" + icon(a.icon, "big") + "<span>" + esc(a.label) + "</span></button>";
        });
        html += '</div><div class="rg-label" id="rg-' + g + '">' + esc(t("rg." + g)) + "</div></div>";
      });
      return html + (extraHtml ? '<div class="rg rg-extra">' + extraHtml + "</div>" : "") + "</div>";
    }
    var out = '<div class="action-bar" role="toolbar" aria-label="' + esc(t("ab.actions")) + '">';
    var lastGroup = null;
    actions.forEach(function (a) {
      var g = a.group || "actions";
      if (lastGroup && g !== lastGroup && (g === "navigate" || g === "report")) out += '<span class="ab-sep" aria-hidden="true"></span>';
      lastGroup = g;
      out += '<button type="button" class="ab-btn' + (a.primary ? " primary" : "") + '"' + (a.id ? ' id="' + a.id + '"' : "") + ' data-act="' + a.act + '"' + (a.disabled ? " disabled" : "") + ">" + icon(a.icon) + "<span>" + esc(a.label) + "</span></button>";
    });
    return out + (extraHtml ? '<span class="ab-spacer"></span>' + extraHtml : "") + "</div>";
  }

  function fasttab(key, titleKey, body, summary) {
    var collapsed = !!S.collapsed[key];
    return (
      '<section class="fasttab' + (collapsed ? " collapsed" : "") + '" aria-labelledby="ft-' + key + '-label">' +
      '<h2 class="ft-head"><button type="button" class="ft-toggle" id="ft-' + key + '-label" aria-expanded="' + !collapsed + '" aria-controls="ft-' + key + '-body" data-act="fasttab" data-ft="' + key + '">' +
      icon("chevronDown", "chev") + "<span>" + esc(t(titleKey)) + "</span></button>" +
      (summary ? '<span class="ft-summary" aria-hidden="true">' + esc(summary) + "</span>" : "") + "</h2>" +
      '<div class="ft-body" id="ft-' + key + '-body"' + (collapsed ? " hidden" : "") + ">" + body + "</div></section>"
    );
  }

  function field(id, labelKey, control, opts) {
    opts = opts || {};
    return (
      '<div class="field' + (opts.wide ? " wide" : "") + (opts.cls ? " " + opts.cls : "") + '">' +
      "<label for=\"" + id + "\"" + (opts.required ? ' class="required"' : "") + ">" + esc(t(labelKey)) + "</label>" +
      '<div class="control">' + control + (opts.error ? '<div class="field-error" id="' + id + '-error" hidden></div>' : "") + "</div></div>"
    );
  }
  function input(id, bind, value, attrs) {
    return '<input id="' + id + '" data-bind="' + bind + '" value="' + esc(value) + '" ' + (attrs || 'type="text"') + ">";
  }
  function select(id, bind, list, value, attrs, withBlank) {
    return '<select id="' + id + '" data-bind="' + bind + '" ' + (attrs || "") + ">" + optionsHtml(list, value, withBlank) + "</select>";
  }
  function toggle(id, bind, checked, attrs) {
    return '<input type="checkbox" class="switch" id="' + id + '" data-bind="' + bind + '"' + (checked ? " checked" : "") + " " + (attrs || "") + ">";
  }
  function readonly(id, value) {
    return '<input id="' + id + '" type="text" value="' + esc(value) + '" readonly tabindex="-1" class="ro">';
  }
  function badge(status, prefix) {
    return '<span class="badge st-' + status + '">' + esc(t(prefix + "." + status)) + "</span>";
  }

  function pageHead(captionKey, title, extra) {
    return (
      '<div class="card-head">' +
      '<button type="button" class="icon-btn back" data-act="back" aria-label="' + esc(t("ab.back")) + '">' + icon("back") + "</button>" +
      '<div class="card-titles"><div class="caption">' + esc(t(captionKey)) + "</div><h1>" + title + "</h1></div>" +
      (extra || "") +
      "</div>"
    );
  }

  // ------------------------------------------------------------------ home (role centre)
  function renderHome() {
    setTitle("page.home");
    var d = S.data;
    var hour = new Date().getHours();
    var greet = hour < 12 ? "home.greetMorning" : hour < 18 ? "home.greetAfternoon" : "home.greetEvening";
    var since = window.NW_DAY(-30);
    var posted = d.orders.filter(function (o) { return o.status === "posted" && o.orderDate >= since; });
    var salesLcy = posted.reduce(function (s, o) { return s + orderAmount(o); }, 0);
    var openOrders = d.orders.filter(function (o) { return o.status !== "posted"; });
    var openAmount = openOrders.reduce(function (s, o) { return s + orderAmount(o); }, 0);
    var pending = d.invoices.filter(function (i) { return i.status === "pending"; });
    var low = d.items.filter(function (i) { return i.inventory < i.reorderPoint; });
    var overdueBal = d.customers.reduce(function (s, c) { return s + (c.balance > 50000 ? c.balance * 0.18 : 0); }, 0);

    function tile(labelKey, value, href, tone, sub) {
      return '<a class="tile ' + (tone || "") + '" href="#' + href + '"><span class="tile-label">' + esc(t(labelKey)) + '</span><span class="tile-value">' + value + "</span>" + (sub ? '<span class="tile-sub">' + esc(sub) + "</span>" : "") + "</a>";
    }

    // top customers by sales (posted + open orders)
    var byCust = {};
    d.orders.forEach(function (o) { byCust[o.customerNo] = (byCust[o.customerNo] || 0) + orderAmount(o); });
    var top = Object.keys(byCust).map(function (k) { return { c: customer(k), v: byCust[k] }; }).filter(function (x) { return x.c; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 5);
    var max = top.length ? top[0].v : 1;
    var bars = top.map(function (x) {
      return '<li><span class="bar-name">' + esc(x.c.name) + '</span><span class="bar-track"><span class="bar-fill" style="width:' + Math.max(4, Math.round((x.v / max) * 100)) + '%"></span></span><span class="bar-val">' + num(x.v, 0) + "</span></li>";
    }).join("");

    var recent = d.orders.slice().sort(function (a, b) { return a.no < b.no ? 1 : -1; }).slice(0, 6).map(function (o) {
      var c = customer(o.customerNo);
      return '<tr><td><a href="#/sales-orders/' + o.no + '">' + o.no + '</a></td><td class="ellipsis">' + esc(c ? c.name : "") + '</td><td class="num">' + num(orderAmount(o)) + "</td><td>" + badge(o.status, "orderStatus") + "</td></tr>";
    }).join("");

    var approvals = pending.map(function (i) {
      return '<li><a href="#/purchase-invoices/' + i.no + '"><span class="ap-no">' + i.no + '</span><span class="ap-vendor">' + esc(i.vendor) + '</span><span class="ap-amt">' + money(invoiceAmount(i), i.currency) + "</span></a></li>";
    }).join("");

    var main = document.getElementById("main");
    main.innerHTML =
      '<div class="page home">' +
      '<section class="headline" aria-labelledby="home-greeting">' +
      '<div class="eyebrow">' + esc(t("home.headline")) + "</div>" +
      '<h1 id="home-greeting">' + esc(t(greet, { name: USER.name.split(" ")[0] })) + "</h1>" +
      "<p>" + esc(t("home.insight", { n: String(pending.length) })) + "</p>" +
      '<div class="quick-actions" role="group" aria-label="' + esc(t("home.new")) + '"><span class="qa-label">' + esc(t("home.new")) + "</span>" +
      '<a class="qa" href="#/sales-orders/new">' + icon("plus") + esc(t("home.newSalesOrder")) + "</a>" +
      '<a class="qa" href="#/customers/new">' + icon("plus") + esc(t("home.newCustomer")) + "</a>" +
      '<a class="qa" href="#/items/new">' + icon("plus") + esc(t("home.newItem")) + "</a>" +
      "</div></section>" +
      '<section class="activities" aria-labelledby="home-activities"><h2 id="home-activities">' + esc(t("home.activities")) + "</h2>" +
      '<div class="tiles">' +
      tile("home.salesThisMonth", num(salesLcy, 0), "/sales-orders", "good", "DKK · " + t("home.last30")) +
      tile("home.openOrders", String(openOrders.length), "/sales-orders", "", money(openAmount, "DKK")) +
      tile("home.overdue", num(overdueBal, 0), "/customers", "bad", "DKK") +
      tile("home.pendingApproval", String(pending.length), "/purchase-invoices", pending.length ? "warn" : "", t("home.purchaseInvoices")) +
      tile("home.lowStock", String(low.length), "/items", low.length ? "bad" : "", t("home.items")) +
      tile("home.customers", String(d.customers.length), "/customers", "", t("home.active")) +
      "</div></section>" +
      '<div class="home-grid">' +
      '<section class="panel" aria-labelledby="home-top"><h2 id="home-top">' + esc(t("home.topCustomers")) + '</h2><ul class="bars">' + bars + "</ul></section>" +
      '<section class="panel" aria-labelledby="home-recent"><h2 id="home-recent">' + esc(t("home.recentOrders")) + "</h2>" +
      '<table class="grid compact"><thead><tr><th>' + esc(t("col.no")) + "</th><th>" + esc(t("col.customerName")) + '</th><th class="num">' + esc(t("col.amount")) + "</th><th>" + esc(t("col.status")) + "</th></tr></thead><tbody>" + recent + "</tbody></table></section>" +
      '<section class="panel" aria-labelledby="home-approvals"><h2 id="home-approvals">' + esc(t("home.approvals")) + "</h2>" +
      (approvals ? '<ul class="approvals">' + approvals + "</ul>" : '<p class="empty">' + esc(t("home.noApprovals")) + "</p>") + "</section>" +
      "</div></div>";
  }

  // ------------------------------------------------------------------ list pages
  var LISTS = {
    customers: {
      title: "page.customers", route: "/customers", key: "no",
      rows: function () { return S.data.customers; },
      cols: [
        { h: "col.no", v: function (c) { return '<a href="#/customers/' + c.no + '">' + c.no + "</a>"; } },
        { h: "col.name", v: function (c) { return esc(c.name); }, cls: "strong" },
        { h: "col.city", v: function (c) { return esc(c.city); } },
        { h: "col.country", v: function (c) { return esc(optLabel("country", c.country)); } },
        { h: "col.contact", v: function (c) { return esc(c.contact); } },
        { h: "col.phone", v: function (c) { return esc(c.phone); } },
        { h: "col.balance", v: function (c) { return num(c.balance); }, num: true },
        { h: "col.creditLimit", v: function (c) { return num(c.creditLimit); }, num: true },
      ],
      text: function (c) { return [c.no, c.name, c.city, c.contact, c.email].join(" "); },
      del: function (no) { S.data.customers = S.data.customers.filter(function (c) { return c.no !== no; }); },
      label: function (no) { var c = customer(no); return c ? c.name : no; },
      count: "list.countCustomers",
    },
    "sales-orders": {
      title: "page.salesOrders", route: "/sales-orders", key: "no",
      rows: function () { return S.data.orders.slice().sort(function (a, b) { return a.no < b.no ? 1 : -1; }); },
      cols: [
        { h: "col.no", v: function (o) { return '<a href="#/sales-orders/' + o.no + '">' + o.no + "</a>"; } },
        { h: "col.customerNo", v: function (o) { return esc(o.customerNo); } },
        { h: "col.customerName", v: function (o) { var c = customer(o.customerNo); return esc(c ? c.name : ""); }, cls: "strong" },
        { h: "col.externalNo", v: function (o) { return esc(o.externalNo); } },
        { h: "col.orderDate", v: function (o) { return fdate(o.orderDate); } },
        { h: "col.status", v: function (o) { return badge(o.status, "orderStatus"); } },
        { h: "col.amountExclVat", v: function (o) { return num(orderAmount(o)); }, num: true },
      ],
      text: function (o) { var c = customer(o.customerNo); return [o.no, o.customerNo, c ? c.name : "", o.externalNo].join(" "); },
      del: function (no) { S.data.orders = S.data.orders.filter(function (o) { return o.no !== no; }); },
      canDelete: function (no) { var o = order(no); return o && o.status !== "posted"; },
      label: function (no) { return no; },
      count: "list.countOrders",
    },
    items: {
      title: "page.items", route: "/items", key: "no",
      rows: function () { return S.data.items; },
      cols: [
        { h: "col.no", v: function (i) { return '<a href="#/items/' + i.no + '">' + i.no + "</a>"; } },
        { h: "col.description", v: function (i) { return esc(i.description) + (i.blocked ? ' <span class="badge st-blocked">' + esc(t("status.blocked")) + "</span>" : ""); }, cls: "strong" },
        { h: "col.category", v: function (i) { return esc(optLabel("category", i.category)); } },
        { h: "col.uom", v: function (i) { return esc(optLabel("uom", i.uom)); } },
        { h: "col.inventory", v: function (i) { return '<span class="' + (i.inventory < i.reorderPoint ? "neg" : "") + '">' + num(i.inventory, 0) + "</span>"; }, num: true },
        { h: "col.unitCost", v: function (i) { return num(i.unitCost); }, num: true },
        { h: "col.unitPrice", v: function (i) { return num(i.unitPrice); }, num: true },
      ],
      text: function (i) { return [i.no, i.description, i.category].join(" "); },
      del: function (no) { S.data.items = S.data.items.filter(function (i) { return i.no !== no; }); },
      label: function (no) { var i = item(no); return i ? i.description : no; },
      count: "list.countItems",
    },
    "purchase-invoices": {
      title: "page.purchaseInvoices", route: "/purchase-invoices", key: "no",
      rows: function () { return S.data.invoices.slice().sort(function (a, b) { return a.no < b.no ? 1 : -1; }); },
      cols: [
        { h: "col.no", v: function (i) { return '<a href="#/purchase-invoices/' + i.no + '">' + i.no + "</a>"; } },
        { h: "col.vendorName", v: function (i) { return esc(i.vendor); }, cls: "strong" },
        { h: "col.vendorInvoiceNo", v: function (i) { return esc(i.vendorInvoiceNo); } },
        { h: "col.postingDate", v: function (i) { return fdate(i.postingDate); } },
        { h: "col.dueDate", v: function (i) { return fdate(i.dueDate); } },
        { h: "col.status", v: function (i) { return badge(i.status, "invStatus"); } },
        { h: "col.currency", v: function (i) { return esc(i.currency); } },
        { h: "col.amount", v: function (i) { return num(invoiceAmount(i)); }, num: true },
      ],
      text: function (i) { return [i.no, i.vendor, i.vendorInvoiceNo].join(" "); },
      noNew: true,
      del: function (no) { S.data.invoices = S.data.invoices.filter(function (i) { return i.no !== no; }); },
      canDelete: function (no) { var i = invoice(no); return i && i.status !== "posted"; },
      label: function (no) { return no; },
      count: "list.countInvoices",
    },
  };

  function renderList(name) {
    var L = LISTS[name];
    setTitle(L.title);
    var sel = S.selected[name];
    var rowsAll = L.rows();
    if (sel && !rowsAll.some(function (r) { return r[L.key] === sel; })) sel = S.selected[name] = null;
    var rows = filteredRows(name);
    var canDel = sel && (!L.canDelete || L.canDelete(sel));
    var actions = [];
    if (!L.noNew) actions.push({ act: "new", label: t("ab.new"), icon: "plus", group: "manage" });
    actions.push({ act: "edit", label: t(name === "purchase-invoices" ? "ab.open" : "ab.edit"), icon: "edit", group: "manage", disabled: !sel });
    actions.push({ act: "delete", label: t("ab.delete"), icon: "trash", group: "manage", disabled: !canDel });
    actions.push({ act: "excel", label: t("ab.openInExcel"), icon: "excel", group: "report" });
    actions.push({ act: "print", label: t("ab.print"), icon: "print", group: "report" });
    var search = '<div class="list-search">' + icon("search") + '<input type="search" id="list-search" data-list="' + name + '" aria-label="' + esc(t("list.search")) + '" placeholder="' + esc(t("list.search")) + '" value="' + esc(S.filter[name] || "") + '"></div>';

    var head = "<tr>" + L.cols.map(function (c) { return '<th scope="col"' + (c.num ? ' class="num"' : "") + ">" + esc(t(c.h)) + "</th>"; }).join("") + "</tr>";
    document.getElementById("main").innerHTML =
      '<div class="page list-page" data-list="' + name + '">' +
      '<div class="list-head"><h1>' + esc(t(L.title)) + "</h1></div>" +
      actionBar(actions, search) +
      '<div class="list-card"><table class="grid" aria-label="' + esc(t(L.title)) + '"><thead>' + head + '</thead><tbody id="list-body">' + listRowsHtml(name, rows) + "</tbody></table>" +
      '<div class="list-foot" id="list-foot">' + esc(t(L.count, { n: String(rows.length) })) + "</div></div></div>";
    S.highlight = null;
  }

  function filteredRows(name) {
    var L = LISTS[name];
    var q = (S.filter[name] || "").toLowerCase();
    var rowsAll = L.rows();
    return q ? rowsAll.filter(function (r) { return L.text(r).toLowerCase().indexOf(q) >= 0; }) : rowsAll;
  }

  function listRowsHtml(name, rows) {
    var L = LISTS[name];
    var sel = S.selected[name];
    var body = rows.map(function (r) {
      var k = r[L.key];
      return '<tr data-key="' + esc(k) + '" aria-selected="' + (k === sel) + '"' + (S.highlight === k ? ' class="flash"' : "") + ">" +
        L.cols.map(function (c) { return "<td" + (c.num || c.cls ? ' class="' + (c.num ? "num " : "") + (c.cls || "") + '"' : "") + ">" + c.v(r) + "</td>"; }).join("") + "</tr>";
    }).join("");
    return body || '<tr class="empty-row"><td colspan="' + L.cols.length + '">' + esc(t("list.empty")) + "</td></tr>";
  }

  /** Live filtering: only the rows change, so the search box keeps focus and its change event. */
  function refreshListRows(name) {
    var rows = filteredRows(name);
    var body = document.getElementById("list-body");
    var foot = document.getElementById("list-foot");
    if (body) body.innerHTML = listRowsHtml(name, rows);
    if (foot) foot.textContent = t(LISTS[name].count, { n: String(rows.length) });
  }

  // ------------------------------------------------------------------ customer card
  function customerDraft(no) {
    var c = no ? customer(no) : null;
    if (c) return JSON.parse(JSON.stringify(c));
    return { no: "C" + pad(S.data.seq.customer, 5), name: "", address: "", postCode: "", city: "", country: "", contact: "", phone: "", email: "", postingGroup: "DOMESTIC", paymentTerms: "30D", currency: "", creditLimit: 0, taxLiable: false, blocked: "", balance: 0, isNew: true };
  }

  function renderCustomerCard(no) {
    if (no && !customer(no)) return renderNotFound();
    var c = getDraft(function () { return customerDraft(no); });
    setTitle("page.customerCard");
    var v2 = S.layout === 2;
    var emailField = field(v2 ? "customer-email-address" : "customer-email", "f.email", input(v2 ? "customer-email-address" : "customer-email", "email", c.email, 'type="email" autocomplete="off"'));
    var general =
      '<div class="field-grid">' +
      field("customer-no", "f.no", readonly("customer-no", c.no)) +
      field("customer-name", "f.name", input("customer-name", "name", c.name, 'type="text" autocomplete="off" aria-required="true"'), { required: true, error: true }) +
      field("customer-address", "f.address", input("customer-address", "address", c.address)) +
      field("customer-post-code", "f.postCode", input("customer-post-code", "postCode", c.postCode)) +
      field("customer-city", "f.city", input("customer-city", "city", c.city)) +
      field("customer-country", "f.country", select("customer-country", "country", "country", c.country, "", true)) +
      field("customer-contact", "f.contact", input("customer-contact", "contact", c.contact)) +
      (v2 ? emailField : "") +
      "</div>";
    var comm =
      '<div class="field-grid">' +
      field("customer-phone", "f.phone", input("customer-phone", "phone", c.phone, 'type="tel"')) +
      (v2 ? "" : emailField) +
      field("customer-language", "f.language", '<select id="customer-language" data-bind="docLang"><option value="DAN">Dansk</option><option value="DEU">Deutsch</option><option value="ENU">English</option></select>') +
      "</div>";
    var creditId = v2 ? "customer-credit-limit-lcy" : "customer-credit-limit";
    var invoicing =
      '<div class="field-grid">' +
      field("customer-posting-group", "f.postingGroup", select("customer-posting-group", "postingGroup", "postingGroup", c.postingGroup)) +
      field("customer-payment-terms", "f.paymentTerms", select("customer-payment-terms", "paymentTerms", "paymentTerms", c.paymentTerms)) +
      field("customer-currency", "f.currency", select("customer-currency", "currency", "currency", c.currency)) +
      field(creditId, "f.creditLimit", input(creditId, "creditLimit", c.creditLimit ? num(c.creditLimit) : "", 'type="text" inputmode="decimal" class="num"')) +
      field("customer-tax-liable", "f.taxLiable", toggle("customer-tax-liable", "taxLiable", c.taxLiable)) +
      field("customer-blocked", "f.blocked", select("customer-blocked", "blocked", "blocked", c.blocked)) +
      "</div>";

    var actions = [
      { act: "save-customer", label: t("ab.save"), icon: "save", id: "customer-save", id2: "save-customer-action", primary: true, group: "actions" },
      { act: "delete-customer", label: t("ab.delete"), icon: "trash", group: "actions", disabled: !!c.isNew },
      { act: "new-order-for", label: t("ab.newSalesOrder"), icon: "orders", group: "process", disabled: !!c.isNew },
      { act: "unavailable", label: t("ab.ledgerEntries"), icon: "ledger", group: "navigate" },
      { act: "unavailable", label: t("ab.statistics"), icon: "chart", group: "navigate" },
    ];
    var orders = S.data.orders.filter(function (o) { return o.customerNo === c.no; });
    var outstanding = orders.filter(function (o) { return o.status !== "posted"; }).reduce(function (s, o) { return s + orderAmount(o); }, 0);
    var factbox =
      '<aside class="factbox" aria-labelledby="fb-title"><h2 id="fb-title">' + esc(t("fb.customerStats")) + "</h2><dl>" +
      "<dt>" + esc(t("fb.balance")) + "</dt><dd>" + num(c.balance) + "</dd>" +
      "<dt>" + esc(t("fb.outstandingOrders")) + "</dt><dd>" + num(outstanding) + "</dd>" +
      "<dt>" + esc(t("fb.creditLimit")) + "</dt><dd>" + num(c.creditLimit) + "</dd>" +
      "<dt>" + esc(t("fb.availableCredit")) + '</dt><dd class="' + (c.creditLimit - c.balance - outstanding < 0 ? "neg" : "good") + '">' + num(c.creditLimit - c.balance - outstanding) + "</dd>" +
      "<dt>" + esc(t("fb.orders")) + "</dt><dd>" + orders.length + "</dd></dl>" +
      '<div class="fb-note">' + icon("info") + "<span>" + esc(t("fb.lcyNote")) + "</span></div></aside>";

    document.getElementById("main").innerHTML =
      '<div class="page card-page">' +
      pageHead("cap.customerCard", c.isNew ? esc(t("title.newCustomer")) : esc(c.no) + ' <span class="title-sep">·</span> ' + esc(c.name)) +
      actionBar(actions) +
      '<div class="card-layout"><div class="fasttabs">' +
      fasttab("general", "ft.general", general, [c.name, optLabel("country", c.country)].filter(Boolean).join(" · ")) +
      fasttab("communication", "ft.communication", comm, [c.phone, v2 ? "" : c.email].filter(Boolean).join(" · ")) +
      fasttab("invoicing", "ft.invoicing", invoicing, optLabel("paymentTerms", c.paymentTerms)) +
      "</div>" + factbox + "</div></div>";
    document.getElementById("customer-language").value = c.docLang || ({ DK: "DAN", DE: "DEU" })[c.country] || "ENU";
  }

  function saveCustomer() {
    var c = S.draft;
    if (!c.name || !c.name.trim()) {
      showFieldError("customer-name", t("msg.nameRequired"));
      toast(t("msg.nameRequired"), "error");
      return;
    }
    c.creditLimit = parseNum(c.creditLimit);
    var isNew = !!c.isNew;
    delete c.isNew;
    if (isNew) {
      S.data.customers.push(c);
      S.data.seq.customer += 10;
    } else {
      var i = S.data.customers.findIndex(function (x) { return x.no === c.no; });
      S.data.customers[i] = c;
    }
    saveData();
    toast(t("msg.customerSaved", { no: c.no, name: c.name }));
    S.selected.customers = c.no;
    S.highlight = c.no;
    clearDraft();
    go("/customers");
  }

  // ------------------------------------------------------------------ item card
  function itemDraft(no) {
    var it = no ? item(no) : null;
    if (it) return JSON.parse(JSON.stringify(it));
    return { no: S.data.seq.item + "-S", description: "", category: "CHAIR", uom: "PCS", unitPrice: 0, unitCost: 0, inventory: 0, reorderPoint: 0, vatGroup: "STANDARD", blocked: false, isNew: true };
  }

  function renderItemCard(no) {
    if (no && !item(no)) return renderNotFound();
    var it = getDraft(function () { return itemDraft(no); });
    setTitle("page.itemCard");
    var v2 = S.layout === 2;
    var general =
      '<div class="field-grid">' +
      field("item-no", "f.no", readonly("item-no", it.no)) +
      field("item-description", "f.description", input("item-description", "description", it.description, 'type="text" autocomplete="off" aria-required="true"'), { required: true, error: true }) +
      field("item-category", "f.category", select("item-category", "category", "category", it.category)) +
      field("item-uom", "f.uom", select("item-uom", "uom", "uom", it.uom)) +
      field("item-blocked", "f.itemBlocked", toggle("item-blocked", "blocked", it.blocked)) +
      "</div>";
    var inventory =
      '<div class="field-grid">' +
      field("item-inventory", "f.inventory", readonly("item-inventory", num(it.inventory, 0))) +
      field("item-reorder-point", "f.reorderPoint", input("item-reorder-point", "reorderPoint", it.reorderPoint || "", 'type="text" inputmode="numeric" class="num"')) +
      "</div>";
    var priceId = v2 ? "item-price" : "item-unit-price";
    var prices =
      '<div class="field-grid">' +
      field(priceId, "f.unitPrice", input(priceId, "unitPrice", it.unitPrice ? num(it.unitPrice) : "", 'type="text" inputmode="decimal" class="num"')) +
      field("item-unit-cost", "f.unitCost", input("item-unit-cost", "unitCost", it.unitCost ? num(it.unitCost) : "", 'type="text" inputmode="decimal" class="num"')) +
      field("item-vat-group", "f.vatGroup", select("item-vat-group", "vatGroup", "vatGroup", it.vatGroup)) +
      "</div>";
    var actions = [
      { act: "save-item", label: t("ab.save"), icon: "save", id: "item-save", id2: "save-item-action", primary: true, group: "actions" },
      { act: "delete-item", label: t("ab.delete"), icon: "trash", group: "actions", disabled: !!it.isNew },
      { act: "unavailable", label: t("ab.ledgerEntries"), icon: "ledger", group: "navigate" },
    ];
    var margin = it.unitPrice ? Math.round(((parseNum(it.unitPrice) - parseNum(it.unitCost)) / parseNum(it.unitPrice)) * 100) : 0;
    var factbox =
      '<aside class="factbox" aria-labelledby="fb-title"><h2 id="fb-title">' + esc(t("fb.itemDetails")) + "</h2><dl>" +
      "<dt>" + esc(t("fb.inventory")) + "</dt><dd>" + num(it.inventory, 0) + "</dd>" +
      "<dt>" + esc(t("fb.reorderPoint")) + "</dt><dd>" + num(parseNum(it.reorderPoint), 0) + "</dd>" +
      "<dt>" + esc(t("fb.profit")) + "</dt><dd>" + margin + " %</dd></dl></aside>";
    document.getElementById("main").innerHTML =
      '<div class="page card-page">' +
      pageHead("cap.itemCard", it.isNew ? esc(t("title.newItem")) : esc(it.no) + ' <span class="title-sep">·</span> ' + esc(it.description)) +
      actionBar(actions) +
      '<div class="card-layout"><div class="fasttabs">' +
      fasttab("item-general", "ft.item", general, [it.description, optLabel("category", it.category)].filter(Boolean).join(" · ")) +
      fasttab("item-inventory", "ft.inventory", inventory, "") +
      fasttab("item-prices", "ft.pricesSales", prices, it.unitPrice ? num(parseNum(it.unitPrice)) : "") +
      "</div>" + factbox + "</div></div>";
  }

  function saveItem() {
    var it = S.draft;
    if (!it.description || !it.description.trim()) {
      showFieldError("item-description", t("msg.descriptionRequired"));
      toast(t("msg.descriptionRequired"), "error");
      return;
    }
    it.unitPrice = parseNum(it.unitPrice);
    it.unitCost = parseNum(it.unitCost);
    it.reorderPoint = parseNum(it.reorderPoint);
    var isNew = !!it.isNew;
    delete it.isNew;
    if (isNew) {
      S.data.items.push(it);
      S.data.seq.item += 4;
    } else {
      var i = S.data.items.findIndex(function (x) { return x.no === it.no; });
      S.data.items[i] = it;
    }
    saveData();
    toast(t("msg.itemSaved", { no: it.no, name: it.description }));
    S.selected.items = it.no;
    S.highlight = it.no;
    clearDraft();
    go("/items");
  }

  // ------------------------------------------------------------------ sales order
  function orderDraft(no) {
    var o = no ? order(no) : null;
    if (o) return JSON.parse(JSON.stringify(o));
    return { no: "SO-" + S.data.seq.order, customerNo: S.pendingCustomer || "", orderDate: today(), externalNo: "", status: "open", shipmentMethod: "DELIVERY", lines: [], isNew: true };
  }

  function linesHtml(o, ro) {
    var itemOpts = function (sel) {
      return '<option value=""></option>' + S.data.items.filter(function (i) { return !i.blocked || i.no === sel; }).map(function (i) {
        return '<option value="' + i.no + '"' + (i.no === sel ? " selected" : "") + ">" + esc(i.description) + "</option>";
      }).join("");
    };
    var rows = o.lines.map(function (l, idx) {
      var n = idx + 1;
      var it = item(l.itemNo);
      return '<tr data-line="' + idx + '">' +
        '<td class="ln">' + n + "</td>" +
        '<td><select id="line-' + n + '-item" aria-label="' + esc(t("col.item")) + '" data-lfield="itemNo"' + (ro ? " disabled" : "") + ">" + itemOpts(l.itemNo) + "</select></td>" +
        '<td class="muted" data-cell="no">' + esc(it ? it.no : "") + "</td>" +
        '<td><input id="line-' + n + '-qty" type="text" inputmode="decimal" class="num" aria-label="' + esc(t("col.quantity")) + '" data-lfield="qty" value="' + esc(l.qty === "" ? "" : num(l.qty, 0)) + '"' + (ro ? " disabled" : "") + "></td>" +
        '<td class="muted c-uom" data-cell="uom">' + esc(it ? optLabel("uom", it.uom) : "") + "</td>" +
        '<td class="num" data-cell="price">' + (it ? num(l.unitPrice) : "") + "</td>" +
        '<td class="num strong" data-cell="amount">' + (it ? num(lineAmount(l)) : "") + "</td>" +
        "<td>" + (ro ? "" : '<button type="button" class="icon-btn small" data-act="delete-line" aria-label="' + esc(t("ab.deleteLine")) + '">' + icon("trash") + "</button>") + "</td></tr>";
    }).join("");
    return '<div class="lines-wrap"><table class="grid lines" aria-label="' + esc(t("ft.lines")) + '"><thead><tr><th class="ln">#</th><th>' + esc(t("col.item")) + "</th><th>" + esc(t("col.no")) + '</th><th class="num">' + esc(t("col.quantity")) + '</th><th class="c-uom">' + esc(t("col.uom")) + '</th><th class="num">' + esc(t("col.unitPriceExcl")) + '</th><th class="num">' + esc(t("col.lineAmount")) + "</th><th></th></tr></thead><tbody>" +
      (rows || '<tr class="empty-row"><td colspan="8">' + esc(t("lines.empty")) + "</td></tr>") + "</tbody></table></div>";
  }

  function totalsHtml(o) {
    var c = customer(o.customerNo);
    var sub = orderAmount(o);
    var vat = c && c.taxLiable ? sub * VAT_RATE : 0;
    return '<div class="totals" id="order-totals"><dl>' +
      "<dt>" + esc(t("tot.subtotal")) + "</dt><dd>" + num(sub) + "</dd>" +
      "<dt>" + esc(t("tot.vat")) + "</dt><dd>" + num(vat) + "</dd>" +
      '<dt class="grand">' + esc(t("tot.total")) + '</dt><dd class="grand">' + money(sub + vat, "DKK") + "</dd></dl></div>";
  }

  function renderOrderCard(no) {
    if (no && !order(no)) return renderNotFound();
    var o = getDraft(function () { return orderDraft(no); });
    setTitle("page.salesOrder");
    var v2 = S.layout === 2;
    var ro = o.status === "posted";
    var dis = ro ? " disabled" : "";
    var c = customer(o.customerNo);
    var custOpts = '<option value=""></option>' + S.data.customers.map(function (x) {
      return '<option value="' + x.no + '"' + (x.no === o.customerNo ? " selected" : "") + ">" + esc(x.name) + "</option>";
    }).join("");
    var orderDateField = field("order-date", "f.orderDate", '<input id="order-date" type="date" data-bind="orderDate" value="' + esc(o.orderDate) + '"' + dis + ">");
    var general =
      '<div class="field-grid">' +
      field("order-no", "f.no", readonly("order-no", o.no)) +
      field("order-customer", "f.customerName", '<select id="order-customer" data-bind="customerNo" aria-required="true"' + dis + ">" + custOpts + "</select>", { required: true, error: true }) +
      field("order-contact", "f.contact", readonly("order-contact", c ? c.contact : "")) +
      (v2 ? "" : orderDateField) +
      field("order-external-no", "f.externalNo", input("order-external-no", "externalNo", o.externalNo, 'type="text"' + dis)) +
      field("order-status", "f.status", readonly("order-status", t("orderStatus." + o.status))) +
      "</div>";
    var shipping =
      '<div class="field-grid">' +
      (v2 ? orderDateField : "") +
      field("order-shipment-method", "f.shipmentMethod", select("order-shipment-method", "shipmentMethod", "shipmentMethod", o.shipmentMethod, dis)) +
      field("order-ship-to", "f.shipTo", readonly("order-ship-to", c ? [c.address, c.postCode + " " + c.city].join(", ") : "")) +
      "</div>";
    var lines =
      '<section class="fasttab lines-part" aria-labelledby="ft-lines-label">' +
      '<h2 class="ft-head"><span class="ft-static" id="ft-lines-label">' + esc(t("ft.lines")) + "</span>" +
      (ro ? "" : '<span class="part-actions"><button type="button" class="ab-btn" data-act="add-line">' + icon("plus") + "<span>" + esc(t("ab.addLine")) + "</span></button></span>") + "</h2>" +
      '<div class="ft-body" id="order-lines">' + linesHtml(o, ro) + totalsHtml(o) + "</div></section>";
    var actions = [
      { act: "post-order", label: t("ab.post"), icon: "post", id: "order-post", id2: "post-order-action", primary: true, disabled: ro, group: "actions" },
      { act: "release-order", label: t("ab.release"), icon: "release", id: "order-release", id2: "release-order-action", disabled: ro || o.status === "released", group: "actions" },
      { act: "save-order", label: t("ab.save"), icon: "save", id: "order-save", id2: "save-order-action", disabled: ro, group: "actions" },
      { act: "delete-order", label: t("ab.delete"), icon: "trash", disabled: ro || !!o.isNew, group: "actions" },
      { act: "unavailable", label: t("ab.statistics"), icon: "chart", group: "navigate" },
      { act: "unavailable", label: t("ab.print"), icon: "print", group: "report" },
    ];
    var factbox = c
      ? '<aside class="factbox" aria-labelledby="fb-title"><h2 id="fb-title">' + esc(t("fb.customerDetails")) + "</h2>" +
        '<div class="fb-name">' + esc(c.name) + '</div><div class="fb-addr">' + esc(c.address) + "<br>" + esc(c.postCode + " " + c.city) + "<br>" + esc(optLabel("country", c.country)) + "</div><dl>" +
        "<dt>" + esc(t("fb.balance")) + "</dt><dd>" + num(c.balance) + "</dd>" +
        "<dt>" + esc(t("fb.creditLimit")) + "</dt><dd>" + num(c.creditLimit) + "</dd>" +
        "<dt>" + esc(t("f.paymentTerms")) + "</dt><dd>" + esc(optLabel("paymentTerms", c.paymentTerms)) + "</dd></dl></aside>"
      : '<aside class="factbox" aria-labelledby="fb-title"><h2 id="fb-title">' + esc(t("fb.customerDetails")) + '</h2><p class="empty">' + esc(t("fb.chooseCustomer")) + "</p></aside>";
    document.getElementById("main").innerHTML =
      '<div class="page card-page">' +
      pageHead("cap.salesOrder", o.isNew ? esc(o.no) + ' <span class="title-sep">·</span> <span class="muted">' + esc(t("title.newOrder")) + "</span>" : esc(o.no) + ' <span class="title-sep">·</span> ' + esc(c ? c.name : ""), '<div class="head-status">' + badge(o.status, "orderStatus") + "</div>") +
      actionBar(actions) +
      '<div class="card-layout"><div class="fasttabs">' +
      fasttab("order-general", "ft.general", general, [c ? c.name : "", fdate(o.orderDate)].filter(Boolean).join(" · ")) +
      lines +
      fasttab("order-shipping", "ft.shipping", shipping, optLabel("shipmentMethod", o.shipmentMethod)) +
      "</div>" + factbox + "</div></div>";
  }

  function refreshLines() {
    var host = document.getElementById("order-lines");
    if (host) host.innerHTML = linesHtml(S.draft, false) + totalsHtml(S.draft);
  }
  function refreshLineCells(idx) {
    var o = S.draft;
    var l = o.lines[idx];
    var tr = document.querySelector('#order-lines tr[data-line="' + idx + '"]');
    if (!tr) return;
    var it = item(l.itemNo);
    tr.querySelector('[data-cell="no"]').textContent = it ? it.no : "";
    tr.querySelector('[data-cell="uom"]').textContent = it ? optLabel("uom", it.uom) : "";
    tr.querySelector('[data-cell="price"]').textContent = it ? num(l.unitPrice) : "";
    tr.querySelector('[data-cell="amount"]').textContent = it ? num(lineAmount(l)) : "";
    var tot = document.getElementById("order-totals");
    if (tot) tot.outerHTML = totalsHtml(o);
  }

  function commitOrder(status) {
    var o = S.draft;
    o.lines = o.lines.filter(function (l) { return l.itemNo; }).map(function (l) { return { itemNo: l.itemNo, qty: parseNum(l.qty), unitPrice: l.unitPrice }; });
    if (status) o.status = status;
    var isNew = !!o.isNew;
    delete o.isNew;
    if (isNew) {
      S.data.orders.push(o);
      S.data.seq.order += 1;
    } else {
      var i = S.data.orders.findIndex(function (x) { return x.no === o.no; });
      S.data.orders[i] = o;
    }
    saveData();
    return o;
  }

  function validateOrder() {
    var o = S.draft;
    if (!o.customerNo) {
      showFieldError("order-customer", t("msg.customerRequired"));
      toast(t("msg.customerRequired"), "error");
      return false;
    }
    var valid = o.lines.filter(function (l) { return l.itemNo && parseNum(l.qty) > 0; });
    if (!valid.length) {
      toast(t("msg.linesRequired"), "error");
      return false;
    }
    return true;
  }

  function postOrder() {
    if (!validateOrder()) return;
    dialog({ title: t("dlg.postTitle"), message: t("dlg.postOrder"), yes: t("dlg.yes"), no: t("dlg.no"), icon: "post" }).then(function (r) {
      if (!r.ok) return;
      var o = commitOrder("posted");
      o.postedAt = today();
      o.lines.forEach(function (l) { var it = item(l.itemNo); if (it) it.inventory = Math.max(0, it.inventory - l.qty); });
      var c = customer(o.customerNo);
      if (c) c.balance += orderAmount(o) + orderVat(o);
      saveData();
      toast(t("msg.orderPosted", { no: o.no }));
      S.selected["sales-orders"] = o.no;
      S.highlight = o.no;
      clearDraft();
      go("/sales-orders");
    });
  }

  // ------------------------------------------------------------------ purchase invoice
  function renderInvoiceCard(no) {
    var inv = invoice(no);
    if (!inv) return renderNotFound();
    setTitle("page.purchaseInvoice");
    var total = invoiceAmount(inv);
    var general =
      '<div class="field-grid">' +
      field("invoice-vendor", "f.vendorName", readonly("invoice-vendor", inv.vendor)) +
      field("invoice-vendor-no", "f.vendorInvoiceNo", readonly("invoice-vendor-no", inv.vendorInvoiceNo)) +
      field("invoice-document-date", "f.documentDate", readonly("invoice-document-date", fdate(inv.documentDate))) +
      field("invoice-posting-date", "f.postingDate", readonly("invoice-posting-date", fdate(inv.postingDate))) +
      field("invoice-due-date", "f.dueDate", readonly("invoice-due-date", fdate(inv.dueDate))) +
      field("invoice-currency", "f.currency", readonly("invoice-currency", inv.currency)) +
      field("invoice-status", "f.status", readonly("invoice-status", t("invStatus." + inv.status))) +
      "</div>";
    var lines = '<table class="grid lines" aria-label="' + esc(t("ft.lines")) + '"><thead><tr><th class="ln">#</th><th>' + esc(t("col.description")) + '</th><th class="num">' + esc(t("col.quantity")) + '</th><th class="num">' + esc(t("col.directUnitCost")) + '</th><th class="num">' + esc(t("col.lineAmount")) + "</th></tr></thead><tbody>" +
      inv.lines.map(function (l, i) { return '<tr><td class="ln">' + (i + 1) + "</td><td>" + esc(l.description) + '</td><td class="num">' + num(l.qty, 0) + '</td><td class="num">' + num(l.unitCost) + '</td><td class="num strong">' + num(l.qty * l.unitCost) + "</td></tr>"; }).join("") +
      "</tbody></table>" +
      '<div class="totals"><dl><dt>' + esc(t("tot.subtotal")) + "</dt><dd>" + num(total) + '</dd><dt class="grand">' + esc(t("tot.totalInvoice")) + '</dt><dd class="grand">' + money(total, inv.currency) + "</dd></dl></div>";
    var history = inv.comments.length
      ? '<ol class="timeline">' + inv.comments.map(function (cm) {
          return '<li class="tl-' + cm.action + '"><div class="tl-head"><strong>' + esc(cm.by) + "</strong> · " + esc(t("invStatus." + cm.action)) + ' · <span class="muted">' + fdate(cm.at) + "</span></div>" + (cm.text ? '<div class="tl-text">' + esc(cm.text) + "</div>" : "") + "</li>";
        }).join("") + "</ol>"
      : '<p class="empty">' + esc(t("approval.none")) + "</p>";
    var pending = inv.status === "pending";
    var actions = [
      { act: "approve-invoice", label: t("ab.approve"), icon: "approve", id: "invoice-approve", id2: "approve-invoice-action", primary: pending, disabled: !pending, group: "actions" },
      { act: "reject-invoice", label: t("ab.reject"), icon: "reject", id: "invoice-reject", id2: "reject-invoice-action", disabled: !pending, group: "actions" },
      { act: "post-invoice", label: t("ab.post"), icon: "post", id: "invoice-post", id2: "post-invoice-action", primary: inv.status === "approved", disabled: inv.status !== "approved", group: "actions" },
      { act: "unavailable", label: t("ab.vendor"), icon: "vendor", group: "navigate" },
      { act: "unavailable", label: t("ab.print"), icon: "print", group: "report" },
    ];
    var factbox =
      '<aside class="factbox" aria-labelledby="fb-title"><h2 id="fb-title">' + esc(t("fb.invoiceDetails")) + "</h2><dl>" +
      "<dt>" + esc(t("fb.amount")) + "</dt><dd>" + money(total, inv.currency) + "</dd>" +
      "<dt>" + esc(t("f.dueDate")) + "</dt><dd>" + fdate(inv.dueDate) + "</dd>" +
      "<dt>" + esc(t("fb.approver")) + "</dt><dd>" + esc(USER.name) + "</dd></dl>" +
      '<div class="fb-note">' + icon("info") + "<span>" + esc(t("fb.approvalNote")) + "</span></div></aside>";
    document.getElementById("main").innerHTML =
      '<div class="page card-page">' +
      pageHead("cap.purchaseInvoice", esc(inv.no) + ' <span class="title-sep">·</span> ' + esc(inv.vendor), '<div class="head-status">' + badge(inv.status, "invStatus") + "</div>") +
      actionBar(actions) +
      '<div class="card-layout"><div class="fasttabs">' +
      fasttab("invoice-general", "ft.general", general, [inv.vendorInvoiceNo, fdate(inv.dueDate)].join(" · ")) +
      fasttab("invoice-lines", "ft.lines", lines, money(total, inv.currency)) +
      fasttab("invoice-approval", "ft.approval", history, String(inv.comments.length)) +
      "</div>" + factbox + "</div></div>";
  }

  function decideInvoice(no, approve) {
    var inv = invoice(no);
    dialog({
      title: t(approve ? "dlg.approveTitle" : "dlg.rejectTitle"),
      message: t(approve ? "dlg.approveInvoice" : "dlg.rejectInvoice", { no: inv.no, vendor: inv.vendor, amount: money(invoiceAmount(inv), inv.currency) }),
      yes: t("dlg.ok"),
      no: t("dlg.cancel"),
      icon: approve ? "approve" : "reject",
      comment: { label: t("f.comment"), required: !approve },
    }).then(function (r) {
      if (!r.ok) return;
      inv.status = approve ? "approved" : "rejected";
      inv.comments.push({ by: USER.name, action: inv.status, at: today(), text: r.comment });
      saveData();
      toast(t(approve ? "msg.invoiceApproved" : "msg.invoiceRejected", { no: inv.no }));
      render();
    });
  }

  function postInvoice(no) {
    var inv = invoice(no);
    dialog({ title: t("dlg.postTitle"), message: t("dlg.postInvoice"), yes: t("dlg.yes"), no: t("dlg.no"), icon: "post" }).then(function (r) {
      if (!r.ok) return;
      inv.status = "posted";
      saveData();
      toast(t("msg.invoicePosted", { no: inv.no }));
      render();
    });
  }

  function renderNotFound() {
    setTitle("page.notFound");
    document.getElementById("main").innerHTML = '<div class="page"><div class="empty-state"><h1>' + esc(t("page.notFound")) + "</h1><p>" + esc(t("msg.notFound")) + '</p><a class="btn primary" href="#/home">' + esc(t("nav.home")) + "</a></div></div>";
  }

  // ------------------------------------------------------------------ drafts + router
  function getDraft(make) {
    if (!S.draft || S.draftPath !== S.path) {
      S.draft = make();
      S.draftPath = S.path;
    }
    return S.draft;
  }
  function clearDraft() { S.draft = null; S.draftPath = null; }

  function showFieldError(id, msg) {
    var el = document.getElementById(id);
    var err = document.getElementById(id + "-error");
    if (el) { el.setAttribute("aria-invalid", "true"); el.focus(); }
    if (err) { err.textContent = msg; err.hidden = false; }
  }

  function currentPath() {
    var h = location.hash.replace(/^#/, "");
    var p = h.split("?")[0] || "/home";
    if (p === "/") p = "/home";
    return p;
  }

  function go(path) {
    if (currentPath() === path) render();
    else location.hash = "#" + path;
  }

  var ROUTES = [
    [/^\/home$/, function () { renderHome(); }],
    [/^\/customers$/, function () { renderList("customers"); }],
    [/^\/customers\/new$/, function () { renderCustomerCard(null); }],
    [/^\/customers\/([^/]+)$/, function (m) { renderCustomerCard(decodeURIComponent(m[1])); }],
    [/^\/sales-orders$/, function () { renderList("sales-orders"); }],
    [/^\/sales-orders\/new$/, function () { renderOrderCard(null); }],
    [/^\/sales-orders\/([^/]+)$/, function (m) { renderOrderCard(decodeURIComponent(m[1])); }],
    [/^\/items$/, function () { renderList("items"); }],
    [/^\/items\/new$/, function () { renderItemCard(null); }],
    [/^\/items\/([^/]+)$/, function (m) { renderItemCard(decodeURIComponent(m[1])); }],
    [/^\/purchase-invoices$/, function () { renderList("purchase-invoices"); }],
    [/^\/purchase-invoices\/([^/]+)$/, function (m) { renderInvoiceCard(decodeURIComponent(m[1])); }],
  ];

  function render() {
    var path = currentPath();
    if (path !== S.path) {
      if (S.draftPath && S.draftPath !== path) clearDraft();
      S.path = path;
      window.scrollTo(0, 0);
    }
    renderShell();
    for (var i = 0; i < ROUTES.length; i++) {
      var m = path.match(ROUTES[i][0]);
      if (m) { ROUTES[i][1](m); return; }
    }
    renderNotFound();
  }

  function onRoute() {
    applyParams();
    S.pendingCustomer = S.pendingCustomerNext || "";
    S.pendingCustomerNext = "";
    render();
  }

  // ------------------------------------------------------------------ event wiring
  function closeMenus() {
    document.querySelectorAll('[aria-haspopup="menu"][aria-expanded="true"]').forEach(function (b) {
      b.setAttribute("aria-expanded", "false");
      var m = document.getElementById(b.getAttribute("aria-controls"));
      if (m) m.hidden = true;
    });
  }

  function listName() {
    var p = document.querySelector(".list-page");
    return p ? p.getAttribute("data-list") : null;
  }

  function handleAction(act, el) {
    var lname = listName();
    switch (act) {
      case "back":
        go("/" + S.path.split("/")[1]);
        return;
      case "new":
        go(LISTS[lname].route + "/new");
        return;
      case "edit":
        if (S.selected[lname]) go(LISTS[lname].route + "/" + encodeURIComponent(S.selected[lname]));
        return;
      case "delete": {
        var key = S.selected[lname];
        if (!key) return;
        var L = LISTS[lname];
        dialog({ title: t("dlg.deleteTitle"), message: t("dlg.delete", { name: L.label(key) }), yes: t("dlg.yes"), no: t("dlg.no"), icon: "warn" }).then(function (r) {
          if (!r.ok) return;
          L.del(key);
          S.selected[lname] = null;
          saveData();
          toast(t("msg.deleted", { name: L.label(key) || key }));
          render();
        });
        return;
      }
      case "excel":
        toast(t("msg.exported"), "info");
        return;
      case "print":
      case "unavailable":
      case "apps":
      case "notifications":
      case "settings":
      case "help":
      case "user":
        closeMenus();
        toast(t("msg.unavailable"), "info");
        return;
      case "fasttab": {
        var k = el.getAttribute("data-ft");
        S.collapsed[k] = !S.collapsed[k];
        lsSet(LS.collapsed, JSON.stringify(S.collapsed));
        var sec = el.closest(".fasttab");
        var body = document.getElementById(el.getAttribute("aria-controls"));
        el.setAttribute("aria-expanded", String(!S.collapsed[k]));
        sec.classList.toggle("collapsed", !!S.collapsed[k]);
        if (body) body.hidden = !!S.collapsed[k];
        return;
      }
      case "save-customer": saveCustomer(); return;
      case "delete-customer":
        dialog({ title: t("dlg.deleteTitle"), message: t("dlg.delete", { name: S.draft.name }), yes: t("dlg.yes"), no: t("dlg.no"), icon: "warn" }).then(function (r) {
          if (!r.ok) return;
          LISTS.customers.del(S.draft.no);
          saveData();
          toast(t("msg.deleted", { name: S.draft.name }));
          clearDraft();
          go("/customers");
        });
        return;
      case "new-order-for":
        S.pendingCustomerNext = S.draft.no;
        go("/sales-orders/new");
        return;
      case "save-item": saveItem(); return;
      case "delete-item":
        dialog({ title: t("dlg.deleteTitle"), message: t("dlg.delete", { name: S.draft.description }), yes: t("dlg.yes"), no: t("dlg.no"), icon: "warn" }).then(function (r) {
          if (!r.ok) return;
          LISTS.items.del(S.draft.no);
          saveData();
          clearDraft();
          go("/items");
        });
        return;
      case "add-line": {
        S.draft.lines.push({ itemNo: "", qty: 1, unitPrice: 0 });
        refreshLines();
        return;
      }
      case "delete-line": {
        var tr = el.closest("tr[data-line]");
        S.draft.lines.splice(Number(tr.getAttribute("data-line")), 1);
        refreshLines();
        return;
      }
      case "save-order":
        if (!S.draft.customerNo) { showFieldError("order-customer", t("msg.customerRequired")); toast(t("msg.customerRequired"), "error"); return; }
        var so = commitOrder();
        toast(t("msg.orderSaved", { no: so.no }));
        clearDraft();
        go("/sales-orders/" + so.no);
        return;
      case "release-order":
        if (!validateOrder()) return;
        var rel = commitOrder("released");
        toast(t("msg.orderReleased", { no: rel.no }));
        clearDraft();
        if (currentPath() === "/sales-orders/" + rel.no) render(); else go("/sales-orders/" + rel.no);
        return;
      case "post-order": postOrder(); return;
      case "delete-order":
        dialog({ title: t("dlg.deleteTitle"), message: t("dlg.delete", { name: S.draft.no }), yes: t("dlg.yes"), no: t("dlg.no"), icon: "warn" }).then(function (r) {
          if (!r.ok) return;
          LISTS["sales-orders"].del(S.draft.no);
          saveData();
          clearDraft();
          go("/sales-orders");
        });
        return;
      case "approve-invoice": decideInvoice(S.path.split("/")[2], true); return;
      case "reject-invoice": decideInvoice(S.path.split("/")[2], false); return;
      case "post-invoice": postInvoice(S.path.split("/")[2]); return;
    }
  }

  function updateListButtons(name) {
    var L = LISTS[name];
    var sel = S.selected[name];
    document.querySelectorAll('[data-act="edit"]').forEach(function (b) { b.disabled = !sel; });
    document.querySelectorAll('[data-act="delete"]').forEach(function (b) { b.disabled = !(sel && (!L.canDelete || L.canDelete(sel))); });
  }

  function onClick(e) {
    var target = e.target;
    // menus
    var menuBtn = target.closest('[aria-haspopup="menu"]');
    if (menuBtn) {
      var open = menuBtn.getAttribute("aria-expanded") === "true";
      closeMenus();
      if (!open) {
        menuBtn.setAttribute("aria-expanded", "true");
        var m = document.getElementById(menuBtn.getAttribute("aria-controls"));
        if (m) { m.hidden = false; var first = m.querySelector("[role=menuitem]"); if (first) first.focus(); }
      }
      return;
    }
    if (!target.closest('[role="menu"]')) closeMenus();
    // tell-me results
    var res = target.closest("#tell-me-results [data-go]");
    if (res) { closeTellMe(); go(res.getAttribute("data-go")); return; }
    if (!target.closest(".appbar-search")) closeTellMe();

    var a = target.closest("[data-act]");
    if (a && !a.disabled) { handleAction(a.getAttribute("data-act"), a); return; }
    // list row selection
    var tr = target.closest(".list-page tbody tr[data-key]");
    if (tr && !target.closest("a")) {
      var name = listName();
      S.selected[name] = tr.getAttribute("data-key");
      tr.parentElement.querySelectorAll("tr[aria-selected=true]").forEach(function (r) { r.setAttribute("aria-selected", "false"); });
      tr.setAttribute("aria-selected", "true");
      updateListButtons(name);
    }
  }

  function onDblClick(e) {
    var tr = e.target.closest(".list-page tbody tr[data-key]");
    if (tr) {
      var name = listName();
      go(LISTS[name].route + "/" + encodeURIComponent(tr.getAttribute("data-key")));
    }
  }

  function bindValue(el) {
    if (!S.draft) return;
    var bind = el.getAttribute("data-bind");
    if (bind) {
      S.draft[bind] = el.type === "checkbox" ? el.checked : el.value;
      el.removeAttribute("aria-invalid");
      var err = document.getElementById(el.id + "-error");
      if (err) err.hidden = true;
      return bind;
    }
    var lf = el.getAttribute("data-lfield");
    if (lf) {
      var idx = Number(el.closest("tr[data-line]").getAttribute("data-line"));
      var line = S.draft.lines[idx];
      if (lf === "itemNo") {
        line.itemNo = el.value;
        var it = item(el.value);
        line.unitPrice = it ? it.unitPrice : 0;
      } else if (lf === "qty") {
        line.qty = el.value;
      }
      refreshLineCells(idx);
      return lf;
    }
  }

  function onInput(e) {
    var el = e.target;
    if (el.id === "tell-me") return updateTellMe(el.value);
    if (el.id === "list-search") {
      S.filter[el.getAttribute("data-list")] = el.value;
      refreshListRows(el.getAttribute("data-list"));
      return;
    }
    if (el.matches("input[type=text], input[type=email], input[type=tel], input[type=date], textarea")) bindValue(el);
  }

  function onChange(e) {
    var el = e.target;
    if (el.id === "language-switcher") {
      S.lang = el.value;
      lsSet(LS.lang, S.lang);
      render();
      var sw = document.getElementById("language-switcher");
      if (sw) sw.focus();
      return;
    }
    var b = bindValue(el);
    if (b === "customerNo" && S.path.indexOf("/sales-orders/") === 0) {
      // the customer drives contact, ship-to, VAT and the FactBox: re-render the document (keeps the draft)
      render();
    }
  }

  // ------------------------------------------------------------------ "Tell me" search
  function searchTargets() {
    var out = NAV.map(function (n) { return { label: t(n.key), path: n.path, kind: t("tell.page") }; });
    out.push({ label: t("home.newCustomer"), path: "/customers/new", kind: t("tell.task") });
    out.push({ label: t("home.newSalesOrder"), path: "/sales-orders/new", kind: t("tell.task") });
    out.push({ label: t("home.newItem"), path: "/items/new", kind: t("tell.task") });
    S.data.customers.forEach(function (c) { out.push({ label: c.name, path: "/customers/" + c.no, kind: t("cap.customerCard") }); });
    S.data.items.forEach(function (i) { out.push({ label: i.description, path: "/items/" + i.no, kind: t("cap.itemCard") }); });
    return out;
  }
  function updateTellMe(q) {
    var ul = document.getElementById("tell-me-results");
    q = (q || "").trim().toLowerCase();
    if (!q) { ul.hidden = true; ul.innerHTML = ""; return; }
    var hits = searchTargets().filter(function (x) { return x.label.toLowerCase().indexOf(q) >= 0; }).slice(0, 8);
    ul.innerHTML = hits.length
      ? hits.map(function (h, i) { return '<li role="option" aria-selected="' + (i === 0) + '" data-go="' + esc(h.path) + '"><span>' + esc(h.label) + '</span><span class="tm-kind">' + esc(h.kind) + "</span></li>"; }).join("")
      : '<li class="tm-empty">' + esc(t("tell.none")) + "</li>";
    ul.hidden = false;
  }
  function closeTellMe() {
    var ul = document.getElementById("tell-me-results");
    if (ul) ul.hidden = true;
  }

  function onKeyDown(e) {
    if (e.key === "Escape") { closeMenus(); closeTellMe(); }
    if (e.target && e.target.id === "tell-me" && e.key === "Enter") {
      var first = document.querySelector("#tell-me-results [data-go]");
      if (first) { e.preventDefault(); var p = first.getAttribute("data-go"); e.target.value = ""; closeTellMe(); go(p); }
    }
    if ((e.altKey && (e.key === "q" || e.key === "Q"))) {
      var tm = document.getElementById("tell-me");
      if (tm) { e.preventDefault(); tm.focus(); }
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
      var save = document.querySelector('[data-act^="save-"]:not([disabled])');
      if (save) { e.preventDefault(); save.click(); }
    }
  }

  // ------------------------------------------------------------------ boot
  function boot() {
    S.lang = initialLang();
    S.layout = lsGet(LS.layout) === "2" ? 2 : 1;
    try { S.collapsed = JSON.parse(lsGet(LS.collapsed) || "{}") || {}; } catch (e) { S.collapsed = {}; }
    S.data = loadData();
    applyParams();
    if (!location.hash || location.hash === "#" || location.hash === "#/") history.replaceState(null, "", "#/home");
    document.addEventListener("click", onClick);
    document.addEventListener("dblclick", onDblClick);
    document.addEventListener("input", onInput);
    document.addEventListener("change", onChange);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("hashchange", onRoute);
    window.addEventListener("storage", function (e) { if (e.key === LS.data) { S.data = loadData(); render(); } });
    render();
    document.body.classList.add("ready");
  }

  window.NorthwindERP = { t: t, reset: function () { S.data = window.NW_SEED(); saveData(); render(); }, state: S };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
