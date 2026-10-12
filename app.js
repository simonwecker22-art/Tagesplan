(function () {
  "use strict";

  const cfg = window.TAGESPLAN_CONFIG || {};
  const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const demoWeekly = [
    ["Montag","Mittagessen","","","Gemüsesuppe mit Brot","","🍲","ja"],
    ["Montag","Abendessen","","","Jause","","🥪","ja"],
    ["Montag","Aktivität","14:00","16:00","Maria ist da","Gemeinsame Zeit","👩","ja"],
    ["Montag","Aktivität","16:00","18:00","Peter ist da","Gemeinsame Zeit","👨","ja"],
    ["Dienstag","Aktivität","09:00","13:00","Christine ist da","Gemeinsame Zeit","👩","ja"],
    ["Mittwoch","Aktivität","09:00","13:00","Sarah ist da","Gemeinsame Zeit","👩","ja"],
    ["Donnerstag","Aktivität","09:00","13:00","Sarah ist da","Gemeinsame Zeit","👩","ja"],
    ["Freitag","Aktivität","14:00","18:00","Maria ist da","Gemeinsame Zeit","👩","ja"],
    ["Freitag","Aktivität","18:00","23:59","Karin bleibt über Nacht","","🌙","ja"],
    ["Samstag","Aktivität","09:00","18:00","Mutter ist da","Zeit noch anpassen","❤️","ja"],
    ["Sonntag","Aktivität","09:00","18:00","Mutter ist da","Zeit noch anpassen","❤️","ja"]
  ];

  const el = id => document.getElementById(id);
  let currentData = { weekly: [], exceptions: [] };

  function csvUrl(gid) {
    return `https://docs.google.com/spreadsheets/d/e/${encodeURIComponent(cfg.publishedId)}/pub?output=csv&gid=${encodeURIComponent(gid)}&_=${Date.now()}`;
  }

  function parseCsv(text) {
    const rows = [];
    let row = [], field = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], next = text[i + 1];
      if (c === '"' && quoted && next === '"') { field += '"'; i++; }
      else if (c === '"') quoted = !quoted;
      else if (c === ',' && !quoted) { row.push(field.trim()); field = ""; }
      else if ((c === '\n' || c === '\r') && !quoted) {
        if (c === '\r' && next === '\n') i++;
        row.push(field.trim());
        if (row.some(Boolean)) rows.push(row);
        row = []; field = "";
      } else field += c;
    }
    if (field || row.length) { row.push(field.trim()); rows.push(row); }
    const headers = (rows.shift() || []).map(normalizeHeader);
    return rows.map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] || "").trim()])));
  }

  function normalizeHeader(v) {
    return String(v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");
  }

  function normalizeRows(matrix, headers) {
    return matrix.map(row => Object.fromEntries(headers.map((h, i) => [h, row[i] || ""])));
  }

  function truthy(v) { return !["nein", "0", "false", "aus"].includes(String(v || "ja").toLowerCase()); }
  function todayKey(d = new Date()) {
    return new Intl.DateTimeFormat("sv-SE", { timeZone: cfg.timeZone || "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  }
  function localParts(d = new Date()) {
    const parts = new Intl.DateTimeFormat("de-DE", { timeZone: cfg.timeZone || "Europe/Vienna", weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
    const get = t => parts.find(p => p.type === t)?.value || "";
    return { weekday: get("weekday"), minutes: Number(get("hour")) * 60 + Number(get("minute")) };
  }
  function mins(t) {
    const m = String(t).match(/(\d{1,2}):(\d{2})/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
  }
  function kind(row) { return normalizeHeader(row.typ || ""); }

  async function loadData() {
    const configured = cfg.publishedId && !cfg.publishedId.startsWith("HIER_");
    if (!configured) {
      currentData.weekly = normalizeRows(demoWeekly, ["wochentag","typ","start","ende","titel","zusatz","symbol","aktiv"]);
      currentData.exceptions = [];
      el("status").textContent = "Vorschau mit Beispieldaten";
      render();
      return;
    }
    try {
      const [weeklyRes, exceptionsRes] = await Promise.all([fetch(csvUrl(cfg.weeklyGid)), fetch(csvUrl(cfg.exceptionsGid))]);
      if (!weeklyRes.ok || !exceptionsRes.ok) throw new Error("Tabelle nicht erreichbar");
      currentData.weekly = parseCsv(await weeklyRes.text());
      currentData.exceptions = parseCsv(await exceptionsRes.text());
      el("status").textContent = `Aktualisiert um ${new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
      render();
    } catch (err) {
      el("status").textContent = "Keine Verbindung – letzter Stand bleibt sichtbar";
      console.error(err);
    }
  }

  function buildDay() {
    const now = new Date();
    const date = todayKey(now);
    const weekday = WEEKDAYS[now.getDay()];
    const weekly = currentData.weekly.filter(r => truthy(r.aktiv) && String(r.wochentag).toLowerCase() === weekday.toLowerCase());
    const exceptions = currentData.exceptions.filter(r => truthy(r.aktiv) && String(r.datum).slice(0, 10) === date);

    function meal(type, fallbackIcon) {
      const ex = exceptions.find(r => kind(r) === normalizeHeader(type));
      if (ex) return { title: String(ex.modus).toLowerCase() === "entfallt" ? "Entfällt" : (ex.titel || "Noch nicht eingetragen"), icon: ex.symbol || fallbackIcon };
      const base = weekly.find(r => kind(r) === normalizeHeader(type));
      return { title: base?.titel || "Noch nicht eingetragen", icon: base?.symbol || fallbackIcon };
    }

    let activities = weekly.filter(r => kind(r) === "aktivitat");
    const activityEx = exceptions.filter(r => kind(r) === "aktivitat");
    if (activityEx.some(r => String(r.modus).toLowerCase() === "ersetzen")) activities = [];
    for (const ex of activityEx) {
      const mode = String(ex.modus).toLowerCase();
      if (mode === "entfallt") activities = activities.filter(a => !ex.zielstart || a.start !== ex.zielstart);
      else activities.push(ex);
    }
    activities.sort((a, b) => mins(a.start) - mins(b.start));
    return { lunch: meal("mittagessen", "🍲"), dinner: meal("abendessen", "🥣"), activities };
  }

  function render() {
    const now = new Date();
    const weekday = WEEKDAYS[now.getDay()];
    el("weekday").textContent = weekday;
    el("date").textContent = new Intl.DateTimeFormat(cfg.locale || "de-AT", { timeZone: cfg.timeZone || "Europe/Vienna", day: "2-digit", month: "long", year: "numeric" }).format(now);
    el("clock").textContent = new Intl.DateTimeFormat("de-DE", { timeZone: cfg.timeZone || "Europe/Vienna", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);

    const day = buildDay();
    el("lunch").textContent = day.lunch.title;
    el("lunch-icon").textContent = day.lunch.icon;
    el("dinner").textContent = day.dinner.title;
    el("dinner-icon").textContent = day.dinner.icon;

    const host = el("activities");
    host.replaceChildren();
    if (!day.activities.length) {
      const empty = document.createElement("div"); empty.className = "empty"; empty.textContent = "Heute ist nichts eingetragen."; host.appendChild(empty); return;
    }
    host.style.gridTemplateRows = `repeat(${day.activities.length}, minmax(0, 1fr))`;
    const nowMins = localParts(now).minutes;
    day.activities.slice(0, 8).forEach(a => {
      const isCurrent = mins(a.start) <= nowMins && nowMins < mins(a.ende);
      const card = document.createElement("article"); card.className = `activity${isCurrent ? " current" : ""}`;
      const time = document.createElement("div"); time.className = "time"; time.textContent = a.start && a.ende ? `${a.start}–${a.ende}` : (a.start || "");
      const text = document.createElement("div");
      const title = document.createElement("div"); title.className = "activity-title"; title.textContent = a.titel || "Aktivität";
      if (isCurrent) { const badge = document.createElement("span"); badge.className = "now-label"; badge.textContent = "JETZT"; title.appendChild(badge); }
      text.appendChild(title);
      if (a.zusatz) { const detail = document.createElement("div"); detail.className = "detail"; detail.textContent = a.zusatz; text.appendChild(detail); }
      const icon = document.createElement("div"); icon.className = "activity-icon"; icon.textContent = a.symbol || "";
      card.append(time, text, icon); host.appendChild(card);
    });
  }

  document.addEventListener("contextmenu", e => e.preventDefault());
  document.addEventListener("dragstart", e => e.preventDefault());
  loadData();
  setInterval(render, 30_000);
  setInterval(loadData, Math.max(1, Number(cfg.refreshMinutes) || 3) * 60_000);
})();
