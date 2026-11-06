const pageSize = 25;

function hostedApi() {
  if (location.hostname.endsWith(".supabase.co")) return `${location.origin}/functions/v1/admin-api`;
  return "https://tbqzhnwrgqmmameyrnlx.supabase.co/functions/v1/admin-api";
}

const state = {
  api: localStorage.getItem("enduro.admin.api") || hostedApi(),
  clientId: localStorage.getItem("enduro.admin.client") || "9177209930",
  token: sessionStorage.getItem("enduro.admin.token") || "",
  role: sessionStorage.getItem("enduro.admin.role") || "",
  name: sessionStorage.getItem("enduro.admin.name") || "",
  route: location.hash || "#/dashboard",
  error: "",
  toast: "",
  dashboard: null,
  users: { rows: [], total: 0, query: "", status: "", window: "", sort: "registered_at", dir: "desc", offset: 0 },
  card: null,
  audit: { rows: [], total: 0, action: "", actor: "", telegramId: "", offset: 0 },
  admins: [],
  ownerTelegramId: "",
  settings: null,
  dialog: null,
  notified: false,
};

const root = document.querySelector("#app");
root.addEventListener("click", onClick);
root.addEventListener("input", onInput);
root.addEventListener("change", onChange);
root.addEventListener("submit", onSubmit);
window.addEventListener("hashchange", () => {
  state.route = location.hash || "#/dashboard";
  state.dialog = null;
  load();
});
load();
setInterval(() => {
  if (!state.token || state.dialog || document.hidden) return;
  load();
}, 30000);

async function load() {
  state.route = location.hash || "#/dashboard";
  if (!state.token) {
    render();
    return;
  }
  try {
    if (state.route.startsWith("#/user/") || state.route.startsWith("#/reservation/")) await loadCard();
    else if (state.route.startsWith("#/log")) await loadAudit();
    else if (state.route.startsWith("#/admins")) await loadAdmins();
    else if (state.route.startsWith("#/settings")) state.settings = await api("settings");
    else if (state.route.startsWith("#/users")) await loadUsers();
    else {
      const data = await api("dashboard", { notify: !state.notified });
      state.dashboard = data.stats;
      state.notified = true;
    }
    state.error = "";
  } catch (error) {
    if (error.message !== "auth") state.error = error.message;
  }
  render();
}

async function loadUsers() {
  const data = await api("users", {
    query: state.users.query,
    status: state.users.status,
    window: state.users.window,
    sort: state.users.sort,
    dir: state.users.dir,
    limit: pageSize,
    offset: state.users.offset,
  });
  state.users.rows = data.rows || [];
  state.users.total = data.total || 0;
}

async function loadCard() {
  const reservation = state.route.startsWith("#/reservation/");
  const key = decodeURIComponent(state.route.split("/").pop() || "");
  state.card = await api("user", reservation ? { telegramId: key } : { id: key });
}

async function loadAudit() {
  const data = await api("audit", {
    action: state.audit.action,
    actor: state.audit.actor,
    telegramId: state.audit.telegramId,
    limit: 50,
    offset: state.audit.offset,
  });
  state.audit.rows = data.rows || [];
  state.audit.total = data.total || 0;
}

async function loadAdmins() {
  const data = await api("admins");
  state.admins = data.rows || [];
  state.ownerTelegramId = data.ownerTelegramId || "";
}

async function api(action, payload = {}) {
  if (!state.api) throw new Error("Укажите адрес функции admin-api.");
  const response = await fetch(state.api, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(state.token ? { authorization: `Bearer ${state.token}` } : {}),
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json().catch(() => ({ ok: false, message: "Нет ответа сервера." }));
  if (response.status === 401 && action !== "session") {
    clearSession();
    state.error = data.message || "Войдите снова.";
    render();
    throw new Error("auth");
  }
  if (!response.ok || data.ok === false) throw new Error(data.message || "Не удалось выполнить действие.");
  return data;
}

function clearSession() {
  state.token = "";
  state.role = "";
  state.name = "";
  sessionStorage.removeItem("enduro.admin.token");
  sessionStorage.removeItem("enduro.admin.role");
  sessionStorage.removeItem("enduro.admin.name");
}

async function onTelegramIdToken(idToken) {
  try {
    const data = await api("session", { id_token: idToken });
    state.token = data.token;
    state.role = data.role;
    state.name = data.name || "Администратор";
    state.notified = false;
    sessionStorage.setItem("enduro.admin.token", data.token);
    sessionStorage.setItem("enduro.admin.role", data.role);
    sessionStorage.setItem("enduro.admin.name", state.name);
    location.hash = "#/dashboard";
    await load();
  } catch (error) {
    state.error = error.message;
    render();
  }
}

function render() {
  const focusId = document.activeElement?.id;
  const caret = document.activeElement?.selectionStart;
  root.innerHTML = state.token ? shell() : login();
  if (focusId) {
    const field = document.getElementById(focusId);
    if (field) {
      field.focus();
      if (typeof caret === "number" && field.setSelectionRange) field.setSelectionRange(caret, caret);
    }
  }
}

function login() {
  return `<main class="login">
    <h1>Enduro Tracker</h1>
    <p class="muted">Вход только для владельца и администраторов. Проверка проходит на сервере, обычный пользователь приложения сюда не попадает.</p>
    <form id="login-form" class="stack">
      <label>Адрес admin-api<input id="api" name="api" value="${esc(state.api)}" placeholder="https://project.supabase.co/functions/v1/admin-api" required></label>
      <label>Client ID<input id="client" name="client" value="${esc(state.clientId)}" inputmode="numeric" required></label>
      <button class="button" type="button" data-action="telegram-login">Войти через Telegram</button>
    </form>
    ${state.error ? `<p class="error">${esc(state.error)}</p>` : ""}
  </main>`;
}

function shell() {
  const route = state.route;
  return `<div class="app">
    <header class="topbar">
      <div class="brand"><strong>Enduro Tracker</strong><span>${esc(state.name)} · ${state.role === "OWNER" ? "владелец" : "администратор"}</span></div>
      <nav aria-label="Разделы">
        ${link("#/dashboard", "Сводка", route === "#/dashboard" || route === "")}
        ${link("#/users", "Пользователи", route.startsWith("#/users") || route.startsWith("#/user/") || route.startsWith("#/reservation/"))}
        ${link("#/log", "Журнал", route.startsWith("#/log"))}
        ${link("#/admins", "Администраторы", route.startsWith("#/admins"))}
        ${link("#/settings", "Настройки", route.startsWith("#/settings"))}
      </nav>
      <button class="ghost" type="button" data-action="logout">Выйти</button>
    </header>
    <main class="layout">
      ${state.error ? `<p class="error">${esc(state.error)}</p>` : ""}
      ${screen()}
    </main>
    ${state.toast ? `<div class="toast" role="status">${esc(state.toast)}</div>` : ""}
    ${state.dialog ? dialog() : ""}
  </div>`;
}

function screen() {
  if (state.route.startsWith("#/user/") || state.route.startsWith("#/reservation/")) return card();
  if (state.route.startsWith("#/log")) return logScreen();
  if (state.route.startsWith("#/admins")) return adminsScreen();
  if (state.route.startsWith("#/settings")) return settingsScreen();
  if (state.route.startsWith("#/users")) return usersScreen();
  return dashboardScreen();
}

function dashboardScreen() {
  const stats = state.dashboard;
  if (!stats) return "<p>Загрузка сводки…</p>";
  const cards = [
    ["Пользователи", stats.registered, ""],
    ["Активный доступ", stats.active, "ACTIVE"],
    ["Без доступа", stats.withoutAccess, "PENDING"],
    ["Срок истёк", stats.expired, "EXPIRED"],
    ["Заблокированы", stats.blocked, "SUSPENDED"],
    ["Истекают за 3 дня", stats.expiring3, "", "3"],
    ["Истекают за 7 дней", stats.expiring7, "", "7"],
    ["Новые за 7 дней", stats.registered7, ""],
    ["Новые за 30 дней", stats.registered30, ""],
    ["Предварительные", stats.reserved, "RESERVATION"],
    ["Групповые заезды", stats.groupRides, ""],
    ["Участники заездов за 7 дней", stats.riders7, ""],
  ];
  return `<section>
    <div class="stats">${cards.map(([label, value, status, horizon]) => {
      const actionable = Boolean(status || horizon);
      return actionable
        ? `<button class="stat" type="button" data-action="filter" data-status="${esc(status)}" data-window="${esc(horizon || "")}"><span>${esc(label)}</span><b>${esc(value ?? "—")}</b></button>`
        : `<div class="stat"><span>${esc(label)}</span><b>${esc(value ?? "—")}</b></div>`;
    }).join("")}</div>
    <p class="note">Личные поездки хранятся на устройстве и в эту сводку не входят. Групповые заезды читаются из уже существующей базы. Срок, который истёк, переводится в EXPIRED при открытии сводки или списка.</p>
  </section>`;
}

function usersScreen() {
  const users = state.users;
  const pages = Math.max(1, Math.ceil(users.total / pageSize));
  const page = Math.floor(users.offset / pageSize) + 1;
  return `<section>
    <div class="toolbar">
      <input id="user-search" class="search" placeholder="Telegram ID, имя или username" value="${esc(users.query)}" data-field="query">
      <button class="button" type="button" data-action="add-user">Добавить по Telegram ID</button>
    </div>
    <div class="filters">
      <select id="status-filter" data-field="status">${options([["", "Все статусы"], ["ACTIVE", "Активен"], ["EXPIRED", "Истёк"], ["SUSPENDED", "Заблокирован"], ["PENDING", "Ожидает"], ["REJECTED", "Нет доступа"], ["RESERVATION", "Предварительно"]], users.status)}</select>
      <select id="window-filter" data-field="window">${options([["", "Любая дата окончания"], ["3", "Заканчивается за 3 дня"], ["7", "Заканчивается за 7 дней"]], users.window)}</select>
      <span class="muted">${esc(users.total)} записей</span>
    </div>
    <div class="table-wrap"><table>
      <thead><tr>
        ${sortHead("Имя", "display_name")}${sortHead("Telegram", "telegram_id")}${sortHead("Регистрация", "registered_at")}${sortHead("Статус", "effective_status")}${sortHead("Окончание", "expires_at")}${sortHead("Осталось", "expires_at")}${sortHead("Активность", "last_activity_at")}${sortHead("Заезды", "rides")}<th></th>
      </tr></thead>
      <tbody>${users.rows.map(userRow).join("") || `<tr><td colspan="9">Никого не найдено.</td></tr>`}</tbody>
    </table></div>
    <div class="toolbar">
      <button class="ghost" type="button" data-action="page" data-offset="${Math.max(0, users.offset - pageSize)}" ${page === 1 ? "disabled" : ""}>Назад</button>
      <span>${page} / ${pages}</span>
      <button class="ghost" type="button" data-action="page" data-offset="${users.offset + pageSize}" ${page >= pages ? "disabled" : ""}>Дальше</button>
    </div>
  </section>`;
}

function userRow(user) {
  const href = user.kind === "reservation" ? `#/reservation/${encodeURIComponent(user.telegramId)}` : `#/user/${user.id}`;
  return `<tr>
    <td data-label="Имя"><a href="${esc(href)}">${esc(user.firstName || user.lastName ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : user.kind === "reservation" ? "Ещё не входил" : "—")}</a><div class="muted">${esc(user.username ? "@" + user.username : "")}</div></td>
    <td data-label="Telegram">${esc(user.telegramId)}</td>
    <td data-label="Регистрация">${date(user.registeredAt)}</td>
    <td data-label="Статус">${badge(user.effectiveStatus)}<div class="muted">${esc(accessType(user.accessType))}</div></td>
    <td data-label="Окончание">${user.expiresAt ? date(user.expiresAt) : user.accessType === "permanent" ? "бессрочно" : "—"}</td>
    <td data-label="Осталось">${days(user)}</td>
    <td data-label="Активность">${date(user.lastActivityAt)}</td>
    <td data-label="Заезды">${esc(user.rides ?? 0)}</td>
    <td data-label=""><button class="ghost" type="button" data-action="quick-extend" data-id="${esc(user.id || "")}" data-telegram="${esc(user.telegramId)}">7 дней</button></td>
  </tr>`;
}

function card() {
  const data = state.card;
  if (!data?.user) return "<p>Загрузка карточки…</p>";
  const user = data.user;
  const name = `${user.firstName || ""} ${user.lastName || ""}`.trim() || (user.kind === "reservation" ? "Ещё не входил" : "—");
  return `<section class="panel" style="padding:16px">
    <div class="card-head">
      <div><a href="#/users">К списку</a><h1>${esc(name)}</h1><p class="muted">${esc(user.username ? "@" + user.username : "")} · ${esc(user.telegramId)}</p></div>
      ${badge(user.effectiveStatus)}
    </div>
    <div class="facts">
      ${fact("Регистрация", date(user.registeredAt))}
      ${fact("Начало доступа", date(user.accessStartsAt))}
      ${fact("Окончание", user.expiresAt ? date(user.expiresAt) : user.accessType === "permanent" ? "бессрочно" : "—")}
      ${fact("Осталось", days(user))}
      ${fact("Тип", accessType(user.accessType))}
      ${fact("Последняя активность", date(user.lastActivityAt))}
      ${fact("Групповые заезды", user.rides ?? 0)}
      ${fact("Роль", user.role === "PLATFORM_ADMIN" ? "администратор" : user.role === "USER" ? "пользователь" : "—")}
    </div>
    ${user.reason ? `<p>Причина: ${esc(user.reason)}</p>` : ""}
    <div class="row-actions">
      ${[1, 7, 14, 30, 90, 180, 365].map((count) => `<button class="ghost" type="button" data-action="ask" data-op="grant_days" data-days="${count}">Выдать ${count} дн.</button>`).join("")}
      <button class="button" type="button" data-action="ask" data-op="extend_days" data-days="7">Продлить на 7 дней</button>
      <button class="ghost" type="button" data-action="ask" data-op="grant_forever">Бессрочно</button>
      <button class="ghost" type="button" data-action="ask" data-op="set_expiry">Изменить дату</button>
      <button class="ghost" type="button" data-action="ask" data-op="end">Отозвать доступ</button>
      <button class="danger" type="button" data-action="ask" data-op="suspend">Заблокировать</button>
      <button class="ghost" type="button" data-action="ask" data-op="resume">Разблокировать</button>
      ${user.effectiveStatus === "PENDING" ? `<button class="ghost" type="button" data-action="ask" data-op="reject">Отклонить заявку</button>` : ""}
      ${state.role === "OWNER" && user.kind === "user" ? `<button class="ghost" type="button" data-action="ask" data-op="${user.role === "PLATFORM_ADMIN" ? "demote" : "promote"}">${user.role === "PLATFORM_ADMIN" ? "Снять админа" : "Сделать админом"}</button>` : ""}
      ${state.role === "OWNER" && user.kind === "user" ? `<button class="danger" type="button" data-action="ask" data-op="delete">Удалить пользователя</button>` : ""}
    </div>
    ${groups(data.groups)}
    <h2>Последние действия</h2>
    ${auditTable(data.audit || [])}
  </section>`;
}

function groups(items) {
  if (!items?.length) return "";
  return `<h2>Группы</h2><ul>${items.map((item) => `<li>${esc(item.name)} · ${esc(item.role)}</li>`).join("")}</ul>`;
}

function logScreen() {
  return `<section>
    <div class="filters">
      <input id="audit-telegram" placeholder="Telegram ID пользователя" value="${esc(state.audit.telegramId)}" data-audit="telegramId">
      <input id="audit-actor" placeholder="Telegram ID администратора" value="${esc(state.audit.actor)}" data-audit="actor">
      <select id="audit-action" data-audit="action">${options([["", "Все действия"], ["GRANT", "Выдача"], ["EXTEND", "Продление"], ["SET_EXPIRY", "Изменение срока"], ["INDEFINITE", "Бессрочно"], ["REVOKE", "Отзыв"], ["BLOCK", "Блокировка"], ["UNBLOCK", "Разблокировка"], ["REJECT", "Отклонение"], ["PREGRANT", "Предварительное добавление"], ["LINK_INVITE", "Связка при входе"], ["EXPIRE", "Истечение"], ["DELETE_USER", "Удаление"], ["GRANT_ADMIN", "Права админа"], ["REVOKE_ADMIN", "Снятие прав"]], state.audit.action)}</select>
      <button class="button" type="button" data-action="reload-audit">Показать</button>
    </div>
    ${auditTable(state.audit.rows)}
    <div class="toolbar">
      <button class="ghost" type="button" data-action="audit-page" data-offset="${Math.max(0, state.audit.offset - 50)}">Назад</button>
      <button class="ghost" type="button" data-action="audit-page" data-offset="${state.audit.offset + 50}">Дальше</button>
    </div>
    <p class="note">Журнал нельзя изменить или удалить из админки. В нём остаются и старые записи бота, где действием был сам статус.</p>
  </section>`;
}

function adminsScreen() {
  return `<section>
    <p class="note">Владелец задаётся секретом PLATFORM_OWNER_TELEGRAM_ID и здесь не снимается. Администратор может управлять доступом, но не ролями и не удалением.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Имя</th><th>Telegram</th><th>Роль</th><th></th></tr></thead>
      <tbody>${state.admins.map((admin) => `<tr>
        <td data-label="Имя">${esc(`${admin.firstName || ""} ${admin.lastName || ""}`.trim() || "—")}<div class="muted">${esc(admin.username ? "@" + admin.username : "")}</div></td>
        <td data-label="Telegram">${esc(admin.telegramId)}</td>
        <td data-label="Роль">${admin.owner ? "владелец" : "администратор"}${admin.pendingLogin ? " · ещё не входил в приложение" : ""}</td>
        <td>${state.role === "OWNER" && !admin.owner && admin.id ? `<button class="ghost" type="button" data-action="demote" data-id="${esc(admin.id)}">Снять права</button>` : ""}</td>
      </tr>`).join("") || `<tr><td colspan="4">Администраторов пока нет.</td></tr>`}</tbody>
    </table></div>
    ${state.role === "OWNER" ? `<form id="promote-form" class="toolbar"><input id="promote-id" placeholder="Telegram ID уже вошедшего пользователя" required><button class="button" type="submit">Назначить администратором</button></form>` : ""}
  </section>`;
}

function settingsScreen() {
  const settings = state.settings;
  if (!settings) return "<p>Загрузка…</p>";
  return `<section class="panel" style="padding:16px">
    <h1>Настройки</h1>
    <div class="facts">
      ${fact("Владелец в конфигурации", settings.ownerConfigured ? "задан" : "не задан")}
      ${fact("Сессия админки", `${settings.sessionHours} ч`)}
      ${fact("Ваша роль", settings.role === "OWNER" ? "владелец" : "администратор")}
    </div>
    <p>Бот и эта панель меняют одну таблицу доступа. Личные поездки по-прежнему остаются на телефоне. Service role и токен бота в браузер не передаются.</p>
    <p class="note">Домен, с которого открыта эта страница, нужно указать в BotFather для Login Widget. Иначе кнопка Telegram не завершит вход.</p>
  </section>`;
}

function dialog() {
  const dialog = state.dialog;
  const titles = {
    grant_days: `Выдать доступ на ${dialog.days} дн.`,
    extend_days: `Продлить на ${dialog.days} дн.`,
    grant_forever: "Сделать доступ бессрочным",
    set_expiry: "Изменить дату окончания",
    end: "Отозвать доступ",
    suspend: "Заблокировать пользователя",
    resume: "Разблокировать пользователя",
    reject: "Отклонить заявку",
    promote: "Назначить администратором",
    demote: "Снять права администратора",
    delete: "Удалить пользователя",
    add: "Добавить по Telegram ID",
  };
  return `<div class="backdrop"><form class="dialog" id="action-form">
    <h2>${esc(titles[dialog.op] || "Подтверждение")}</h2>
    ${dialog.op === "add" ? `<label>Telegram ID<input id="dialog-telegram" value="${esc(dialog.telegramId || "")}" required></label><label>Срок<select id="dialog-days">${options([["", "Без доступа, только заявка"], ["1", "1 день"], ["7", "7 дней"], ["14", "14 дней"], ["30", "30 дней"], ["90", "90 дней"], ["365", "365 дней"], ["0", "Бессрочно"]], dialog.days ?? "")}</select></label>` : ""}
    ${dialog.op === "set_expiry" ? `<label>Дата окончания<input id="dialog-date" type="date" value="${esc(dialog.date || "")}" required></label>` : ""}
    ${dialog.op === "delete" ? `<p>Будут удалены учётная запись и личный профиль. Группы и заезды других участников не удаляются. Если пользователь владеет группой или создавал заезд, удаление будет отклонено.</p><label>Введите Telegram ID<input id="dialog-confirm" required></label>` : ""}
    <label>Комментарий${dialog.op === "suspend" ? " (обязателен)" : ""}<input id="dialog-comment" value="${esc(dialog.comment || "")}"></label>
    ${dialog.preview?.message ? `<p>${esc(dialog.preview.message)}</p>` : ""}
    ${dialog.error ? `<p class="error">${esc(dialog.error)}</p>` : ""}
    <div class="dialog-actions">
      <button class="button" type="submit" ${dialog.busy ? "disabled" : ""}>Подтвердить</button>
      <button class="ghost" type="button" data-action="close-dialog">Отмена</button>
    </div>
  </form></div>`;
}

function auditTable(rows) {
  if (!rows.length) return "<p class=\"note\">Записей нет.</p>";
  return `<div class="table-wrap"><table>
    <thead><tr><th>Когда</th><th>Кто</th><th>Действие</th><th>Было</th><th>Стало</th><th>Комментарий</th></tr></thead>
    <tbody>${rows.map((row) => `<tr>
      <td data-label="Когда">${date(row.createdAt || row.created_at)}</td>
      <td data-label="Кто">${esc(row.actorTelegramId || row.actor_telegram_id || "система")}</td>
      <td data-label="Действие">${esc(actionLabel(row.action))}</td>
      <td data-label="Было">${esc(row.previousStatus || row.previousValue || "—")}</td>
      <td data-label="Стало">${esc(row.newStatus || row.newValue || "—")}${row.newExpiresAt ? `<div class="muted">${date(row.newExpiresAt)}</div>` : ""}</td>
      <td data-label="Комментарий">${esc(row.comment || "—")}</td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function link(href, label, current) {
  return `<a class="nav-link" href="${href}" ${current ? "aria-current=\"page\"" : ""}>${label}</a>`;
}

function sortHead(label, column) {
  const mark = state.users.sort === column ? (state.users.dir === "asc" ? " ↑" : " ↓") : "";
  return `<th><button type="button" data-action="sort" data-sort="${column}">${label}${mark}</button></th>`;
}

function options(items, selected) {
  return items.map(([value, label]) => `<option value="${esc(value)}" ${String(selected) === String(value) ? "selected" : ""}>${esc(label)}</option>`).join("");
}

function fact(label, value) {
  return `<div><span class="muted">${esc(label)}</span><strong>${esc(value)}</strong></div>`;
}

function badge(status) {
  const labels = { ACTIVE: "ACTIVE", EXPIRED: "EXPIRED", SUSPENDED: "BLOCKED", PENDING: "PENDING", REJECTED: "NO ACCESS", RESERVATION: "ПРЕДВАРИТЕЛЬНО" };
  return `<span class="badge badge-${esc(String(status || "").toLowerCase())}">${esc(labels[status] || status || "—")}</span>`;
}

function accessType(type) {
  return { permanent: "постоянный", temporary: "временный", none: "нет" }[type] || "—";
}

function days(user) {
  if (user.accessType === "permanent") return "бессрочно";
  if (user.daysLeft == null) return "—";
  return String(Math.max(0, user.daysLeft));
}

function date(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function actionLabel(action) {
  const labels = {
    GRANT: "Выдача", EXTEND: "Продление", SET_EXPIRY: "Изменение срока", INDEFINITE: "Бессрочно",
    REVOKE: "Отзыв", BLOCK: "Блокировка", UNBLOCK: "Разблокировка", REJECT: "Отклонение",
    PREGRANT: "Предварительное добавление", LINK_INVITE: "Связка при входе", EXPIRE: "Истечение",
    DELETE_USER: "Удаление", GRANT_ADMIN: "Права администратора", REVOKE_ADMIN: "Снятие прав",
    ACTIVE: "Статус: активен", PENDING: "Статус: ожидает", REJECTED: "Статус: отклонён",
    SUSPENDED: "Статус: закрыт", EXPIRED: "Статус: истёк",
  };
  return labels[action] || action || "—";
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
}

function loadTelegramLogin() {
  if (window.Telegram && window.Telegram.Login) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://oauth.telegram.org/js/telegram-login.js?3";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Не удалось открыть вход Telegram."));
    document.head.appendChild(script);
  });
}

async function startTelegramLogin() {
  const apiField = document.querySelector("#api");
  const clientField = document.querySelector("#client");
  state.api = apiField ? apiField.value.trim() : state.api;
  state.clientId = clientField ? clientField.value.trim() : state.clientId;
  localStorage.setItem("enduro.admin.api", state.api);
  localStorage.setItem("enduro.admin.client", state.clientId);
  if (!/^[1-9]\d{0,15}$/.test(state.clientId)) {
    state.error = "Client ID — число из BotFather, раздел Login Widget.";
    render();
    return;
  }
  state.error = "";
  try {
    await loadTelegramLogin();
    window.Telegram.Login.auth({ client_id: Number(state.clientId), scope: ["profile"], lang: "ru" }, (data) => {
      if (!data || !data.id_token) {
        state.error = (data && data.error) || "Вход в Telegram отменён.";
        render();
        return;
      }
      onTelegramIdToken(data.id_token);
    });
  } catch (error) {
    state.error = error.message;
    render();
  }
}

function onSubmit(event) {
  if (event.target.id === "login-form") event.preventDefault();
  if (event.target.id === "action-form") {
    event.preventDefault();
    commitDialog();
  }
  if (event.target.id === "promote-form") {
    event.preventDefault();
    promoteByTelegram(document.querySelector("#promote-id").value.trim());
  }
}

function onInput(event) {
  const field = event.target.dataset.field;
  if (field && state.users[field] !== undefined && field === "query") {
    state.users.query = event.target.value;
    state.users.offset = 0;
    queueUsers();
  }
  if (event.target.dataset.audit) state.audit[event.target.dataset.audit] = event.target.value;
  if (event.target.id === "dialog-comment" && state.dialog) state.dialog.comment = event.target.value;
  if (event.target.id === "dialog-telegram" && state.dialog) state.dialog.telegramId = event.target.value;
  if (event.target.id === "dialog-date" && state.dialog) state.dialog.date = event.target.value;
}

function onChange(event) {
  const field = event.target.dataset.field;
  if (field) {
    state.users[field] = event.target.value;
    state.users.offset = 0;
    load();
  }
  const audit = event.target.dataset.audit;
  if (audit) state.audit[audit] = event.target.value;
  if (event.target.id === "dialog-days" && state.dialog) state.dialog.days = event.target.value;
}

let usersTimer = 0;
function queueUsers() {
  clearTimeout(usersTimer);
  usersTimer = setTimeout(() => load(), 300);
}

async function onClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "telegram-login") {
    startTelegramLogin();
    return;
  }
  if (action === "logout") {
    clearSession();
    render();
  }
  if (action === "filter") {
    if (!target.dataset.status && !target.dataset.window) return;
    state.users.status = target.dataset.status || "";
    state.users.window = target.dataset.window || "";
    state.users.offset = 0;
    if ((location.hash || "#/dashboard") !== "#/users") location.hash = "#/users";
    else load();
  }
  if (action === "sort") {
    const column = target.dataset.sort;
    state.users.dir = state.users.sort === column && state.users.dir === "desc" ? "asc" : "desc";
    state.users.sort = column;
    load();
  }
  if (action === "page") {
    state.users.offset = Number(target.dataset.offset) || 0;
    load();
  }
  if (action === "audit-page") {
    state.audit.offset = Number(target.dataset.offset) || 0;
    load();
  }
  if (action === "reload-audit") {
    state.audit.offset = 0;
    load();
  }
  if (action === "close-dialog") {
    state.dialog = null;
    render();
  }
  if (action === "add-user") {
    state.dialog = { op: "add", days: "7", comment: "", telegramId: "" };
    render();
  }
  if (action === "quick-extend") await ask("extend_days", { days: 7, userId: target.dataset.id, telegramId: target.dataset.telegram });
  if (action === "ask") await ask(target.dataset.op, { days: Number(target.dataset.days) || 7 });
  if (action === "demote") await ask("demote", { userId: target.dataset.id });
}

async function ask(op, extra) {
  const user = state.card?.user;
  state.dialog = {
    op,
    days: extra.days || 7,
    comment: "",
    date: "",
    userId: extra.userId || user?.id || "",
    telegramId: extra.telegramId || user?.telegramId || "",
    preview: null,
    error: "",
  };
  render();
  if (!state.dialog.userId || ["suspend", "delete", "promote", "demote", "add", "set_expiry"].includes(op)) return;
  try {
    state.dialog.preview = await api("preview", {
      op,
      userId: state.dialog.userId || null,
      telegramId: state.dialog.telegramId,
      days: state.dialog.days,
    });
  } catch (error) {
    state.dialog.error = error.message;
  }
  render();
}

async function commitDialog() {
  const dialog = state.dialog;
  if (!dialog) return;
  dialog.busy = true;
  dialog.error = "";
  render();
  try {
    if (dialog.op === "add") await addUser(dialog);
    else if (dialog.op === "delete") await removeUser(dialog);
    else if (dialog.op === "promote" || dialog.op === "demote") await changeRole(dialog);
    else if (dialog.op === "set_expiry") await commitAccess("set_expiry", endOfDay(dialog.date));
    else await commitAccess(dialog.op);
    state.dialog = null;
    showToast("Готово");
    await load();
  } catch (error) {
    dialog.busy = false;
    dialog.error = error.message;
    render();
  }
}

async function commitAccess(op, expires) {
  const dialog = state.dialog;
  if (!dialog.userId) {
    const forever = op === "grant_forever";
    await api("addUser", {
      telegramId: dialog.telegramId,
      days: forever ? null : Number(dialog.days) || 7,
      forever,
      grant: true,
      comment: dialog.comment,
    });
    return;
  }
  await api("commit", {
    op,
    userId: dialog.userId,
    telegramId: dialog.telegramId,
    days: dialog.days,
    expires: expires || null,
    comment: dialog.comment,
  });
}

async function addUser(dialog) {
  const days = dialog.days === "" || dialog.days == null ? null : Number(dialog.days);
  await api("addUser", {
    telegramId: dialog.telegramId,
    days: days > 0 ? days : null,
    forever: days === 0,
    grant: days != null,
    comment: dialog.comment,
  });
}

async function removeUser(dialog) {
  const confirm = document.querySelector("#dialog-confirm")?.value.trim();
  await api("deleteUser", { userId: dialog.userId, confirm, comment: dialog.comment });
}

async function changeRole(dialog) {
  await api("setAdmin", {
    userId: dialog.userId,
    role: dialog.op === "promote" ? "PLATFORM_ADMIN" : "USER",
    comment: dialog.comment,
  });
}

async function promoteByTelegram(telegramId) {
  try {
    const card = await api("user", { telegramId });
    if (!card.user?.id) throw new Error("Сначала пользователь должен войти в приложение.");
    await ask("promote", { userId: card.user.id, telegramId });
  } catch (error) {
    state.error = error.message;
    render();
  }
}

function endOfDay(value) {
  if (!value) return null;
  const parsed = new Date(`${value}T23:59:59`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function showToast(message) {
  state.toast = message;
  setTimeout(() => {
    if (state.toast === message) {
      state.toast = "";
      render();
    }
  }, 2800);
}
