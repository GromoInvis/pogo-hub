const { useState, useEffect, useRef, useMemo } = React;

const EVENTS_URL = "https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json";
const LOCALE_MAP = { ua: "uk-UA", en: "en-US", ru: "ru-RU" };
const HTML_LANG = { ua: "uk", en: "en", ru: "ru" };
const EVENT_WINDOWS = {
  spotlight: { startHour: 18, endHour: 19 },
  comday: { startHour: 14, endHour: 17 },
  daytime: { startHour: 10, endHour: 18 }
};
const DEFAULT_ACCOUNTS = ["Main", "Alt 1"];
const DEFAULT_ENTRIES = [
  { id: 1, account: "Main", name: "Rayquaza", dexNo: 384, isShiny: true, bg: "Mega Rayquaza", costume: "None", size: "None", note: "Lucky 98%" },
  { id: 2, account: "Alt 1", name: "Charmander", dexNo: 4, isShiny: true, bg: "Okinawa", costume: "None", size: "None", note: "Swimming goggles" }
];

function loadJson(key, fallback, validate) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (validate && !validate(parsed)) return fallback;
    return parsed;
  } catch (err) {
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // Private mode or a full quota should not take the UI down.
  }
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

function fallbackCopy(text) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch (err) {
    ok = false;
  }
  document.body.removeChild(area);
  return ok;
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}

function findCoordsByText(text) {
  const lower = (text || "").toLowerCase();
  const ranked = [];
  (window.CITY_COORDS || []).forEach((city) => {
    (city.keys || []).forEach((key) => ranked.push({ key, city }));
  });
  ranked.sort((a, b) => b.key.length - a.key.length);
  for (let i = 0; i < ranked.length; i += 1) {
    if (lower.includes(ranked[i].key)) return ranked[i].city;
  }
  return null;
}

function isInPersonEvent(ev) {
  const name = (ev.name || "").toLowerCase();
  const type = (ev.eventType || ev.type || "").toLowerCase();
  if (/\bglobal\b/.test(name)) return false;
  if (type === "wild-area" || type === "pokemon-go-tour" || type === "safari-zone" || type === "city-safari") return true;
  if (/safari|in-person|in person|city safari|night out/.test(name)) return true;
  if (/safari|in-person|in person/.test(type)) return true;
  return false;
}

function eventDetails(item) {
  if (!item) return "";
  if (typeof item.details === "string" && item.details.trim()) return item.details;
  const bonus = item.extraData && item.extraData.communityday && item.extraData.communityday.bonus;
  return typeof bonus === "string" ? bonus : "";
}

function prepareCurated(list) {
  return (list || []).map((ev) => ({
    ...ev,
    curated: true,
    details: ev.details || (Array.isArray(ev.bonuses) ? ev.bonuses.join(" • ") : "")
  }));
}

function detectLocalEvents(data) {
  return data.filter(isInPersonEvent).map((ev) => {
    const geo = findCoordsByText(`${ev.name} ${ev.heading || ""}`);
    return {
      id: ev.eventID || ev.name,
      name: ev.name,
      locationName: (geo && geo.label) || ev.heading || "In-person",
      country: (geo && geo.country) || "In-person",
      coords: geo ? { lat: geo.lat, lng: geo.lng } : null,
      start: ev.start,
      end: ev.end,
      image: ev.image || ev.headerImage,
      link: ev.link,
      details: eventDetails(ev)
    };
  });
}

function mergeLocal(curated, detected) {
  const names = new Set(curated.map((ev) => (ev.name || "").toLowerCase()));
  return curated.concat(detected.filter((ev) => !names.has((ev.name || "").toLowerCase())));
}

function getEventStatus(startStr, endStr) {
  if (!startStr || !endStr) return "finished";
  if (String(startStr).includes("Локальний") || String(startStr).includes("Local") || String(startStr).includes("Місцевий")) {
    return "finished";
  }
  const now = new Date();
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
    if (now >= start && now <= end) return "active";
    if (now < start) return "upcoming";
    return "finished";
  }
  return "finished";
}

function sortEvents(list) {
  const rank = { active: 0, upcoming: 1, finished: 2 };
  return list.slice().sort((a, b) => {
    const diff = rank[getEventStatus(a.start, a.end)] - rank[getEventStatus(b.start, b.end)];
    if (diff !== 0) return diff;
    const aTime = new Date(a.start).getTime();
    const bTime = new Date(b.start).getTime();
    if (isNaN(aTime) || isNaN(bTime)) return 0;
    return aTime - bTime;
  });
}

function getHubStatus(hub, now, rule) {
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: hub.tz,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    });
    const parts = formatter.formatToParts(now);
    let hour = parseInt(parts.find((part) => part.type === "hour").value, 10);
    const minute = parseInt(parts.find((part) => part.type === "minute").value, 10);
    if (hour === 24) hour = 0;
    const timeString = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const isActive = hour >= rule.startHour && hour < rule.endHour;
    const minutesLeft = isActive ? (rule.endHour * 60) - (hour * 60 + minute) : 0;
    return { timeString, isActive, minutesLeft };
  } catch (err) {
    return { timeString: "--:--", isActive: false, minutesLeft: 0 };
  }
}

function hubIcon(isActive) {
  if (isActive) {
    return `
      <div class="relative w-8 h-8 flex items-center justify-center">
        <div class="active-ping"></div>
        <div class="relative w-6 h-6 rounded-full bg-gradient-to-tr from-amber-500 to-rose-600 border-2 border-white flex items-center justify-center text-xs shadow-lg font-bold text-white">🔥</div>
      </div>`;
  }
  return `
    <div class="w-5 h-5 rounded-full bg-slate-800 border border-slate-500 flex items-center justify-center text-[10px] text-slate-300">📍</div>`;
}

function localIcon(isActive) {
  if (isActive) {
    return `
      <div class="relative w-8 h-8 flex items-center justify-center">
        <div class="active-ping" style="background-color:#f59e0b"></div>
        <div class="relative w-6 h-6 rounded-full bg-amber-400 border-2 border-white flex items-center justify-center text-xs shadow-lg">📍</div>
      </div>`;
  }
  return `<div class="w-4 h-4 rounded-full bg-amber-400 border-2 border-white shadow"></div>`;
}

function hubPopup(hub, status, rule, translate) {
  const windowLabel = `${String(rule.startHour).padStart(2, "0")}:00–${String(rule.endHour).padStart(2, "0")}:00`;
  const statusLine = status.isActive
    ? `<div style="color:#e11d48;font-weight:700;margin-top:3px;">⚡ ${escapeHtml(translate("liveBadge"))} (${status.minutesLeft} ${escapeHtml(translate("minLeft"))})</div>`
    : `<div style="color:#777;">${windowLabel}</div>`;
  return `
    <div style="font-family:sans-serif;color:#111;font-size:12px;min-width:170px;">
      <b>${escapeHtml(hub.name)}</b><br/>
      <small style="color:#666;">${escapeHtml(hub.popularSpot)}</small>
      <hr style="margin:5px 0;border:none;border-top:1px solid #ddd;"/>
      <div>${escapeHtml(translate("localTime"))} <b>${escapeHtml(status.timeString)}</b></div>
      ${statusLine}
      <div style="margin-top:5px;"><code>${hub.lat.toFixed(6)}, ${hub.lng.toFixed(6)}</code></div>
    </div>`;
}

function localPopup(ev, translate) {
  return `
    <div style="font-family:sans-serif;color:#111;font-size:12px;min-width:170px;">
      <b>${escapeHtml(ev.name)}</b><br/>
      <small style="color:#666;">${escapeHtml(ev.locationName || "")}</small>
      <div style="margin-top:5px;"><code>${ev.coords.lat.toFixed(6)}, ${ev.coords.lng.toFixed(6)}</code></div>
      <div style="margin-top:4px;color:#92400e;">${escapeHtml(translate("localEventsTitle"))}</div>
    </div>`;
}

function upsertMarker(layer, store, id, lat, lng, active, html, popup) {
  const icon = L.divIcon({ html, className: "hub-icon", iconSize: [32, 32], iconAnchor: [16, 16] });
  let marker = store.get(id);
  if (!marker) {
    marker = L.marker([lat, lng], { icon }).addTo(layer);
    marker.bindPopup(popup);
    marker._pogoActive = active;
    store.set(id, marker);
    return;
  }
  if (marker._pogoActive !== active) {
    marker.setIcon(icon);
    marker._pogoActive = active;
  }
  marker.setPopupContent(popup);
}

function normalizeImport(data) {
  if (!data || !Array.isArray(data.accounts) || !Array.isArray(data.entries)) return null;
  const accounts = [];
  data.accounts.forEach((name) => {
    const clean = String(name || "").trim();
    if (clean && accounts.indexOf(clean) === -1) accounts.push(clean);
  });
  if (!accounts.length) return null;
  const entries = data.entries.filter((entry) => entry && entry.name && entry.account).map((entry, index) => ({
    id: entry.id || Date.now() + index,
    account: String(entry.account),
    name: String(entry.name),
    dexNo: entry.dexNo == null || entry.dexNo === "" ? "-" : entry.dexNo,
    isShiny: Boolean(entry.isShiny),
    bg: entry.bg || "None",
    costume: entry.costume || "None",
    size: entry.size || "None",
    note: entry.note || ""
  }));
  return { accounts, entries };
}

function App() {
  const [tab, setTab] = useState("map");
  const [lang, setLang] = useState(() => localStorage.getItem("pogo_lang") || "ua");
  const [activeEventMode, setActiveEventMode] = useState("spotlight");
  const [now, setNow] = useState(new Date());
  const [news, setNews] = useState([]);
  const [localEvents, setLocalEvents] = useState(() => prepareCurated(window.LOCAL_IN_PERSON_EVENTS));
  const [loadingNews, setLoadingNews] = useState(true);
  const [newsError, setNewsError] = useState(false);
  const [mapFocus, setMapFocus] = useState(null);

  const t = (key) => (window.TRANSLATIONS && window.TRANSLATIONS[lang] && window.TRANSLATIONS[lang][key]) || key;

  const [accounts, setAccounts] = useState(() => loadJson(
    "pogo_accounts",
    DEFAULT_ACCOUNTS,
    (value) => Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item.trim())
  ));
  const [entries, setEntries] = useState(() => loadJson(
    "pogo_entries",
    DEFAULT_ENTRIES,
    (value) => Array.isArray(value)
  ));

  useEffect(() => {
    document.documentElement.lang = HTML_LANG[lang] || "uk";
  }, [lang]);

  const changeLanguage = (newLang) => {
    setLang(newLang);
    try {
      localStorage.setItem("pogo_lang", newLang);
    } catch (err) {
      // Ignore private-mode storage failures.
    }
  };

  useEffect(() => {
    saveJson("pogo_accounts", accounts);
  }, [accounts]);

  useEffect(() => {
    saveJson("pogo_entries", entries);
  }, [entries]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(EVENTS_URL)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (!Array.isArray(data)) throw new Error("bad payload");
        setNews(data);
        setLocalEvents(mergeLocal(prepareCurated(window.LOCAL_IN_PERSON_EVENTS), detectLocalEvents(data)));
        setNewsError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setNewsError(true);
        setLocalEvents(prepareCurated(window.LOCAL_IN_PERSON_EVENTS));
      })
      .finally(() => {
        if (!cancelled) setLoadingNews(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGoToLocation = (lat, lng, label) => {
    const text = `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
    copyText(text);
    setMapFocus({ lat: Number(lat), lng: Number(lng), label: label || text, token: Date.now() });
    setTab("map");
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="bg-dark-800 border-b border-slate-700 px-3 md:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 z-20">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🌐</span>
          <div>
            <h1 className="text-base font-black tracking-wide text-amber-400">{t("appTitle")}</h1>
            <div className="text-[11px] text-slate-400">{t("appSub")}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex bg-dark-900 rounded-lg p-1 border border-slate-700 text-[11px] font-bold">
            {["ua", "en", "ru"].map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => changeLanguage(code)}
                className={`px-2 py-1 rounded transition uppercase ${
                  lang === code ? "bg-amber-500 text-slate-950 shadow-sm" : "text-slate-400 hover:text-white"
                }`}
              >
                {code}
              </button>
            ))}
          </div>

          <div className="flex bg-dark-900 rounded-lg p-1 border border-slate-700 gap-1">
            {[
              ["map", "tabMap"],
              ["news", "tabNews"],
              ["dex", "tabDex"]
            ].map(([id, labelKey]) => (
              <button
                key={id}
                type="button"
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                  tab === id ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"
                }`}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-hidden relative">
        <div className={tab === "map" ? "h-full" : "hidden"}>
          <MapTab
            visible={tab === "map"}
            activeEventMode={activeEventMode}
            setActiveEventMode={setActiveEventMode}
            now={now}
            t={t}
            lang={lang}
            localEvents={localEvents}
            mapFocus={mapFocus}
          />
        </div>
        {tab === "news" && (
          <NewsTab
            news={news}
            localEvents={localEvents}
            loading={loadingNews}
            newsError={newsError}
            onGoToLocation={handleGoToLocation}
            t={t}
            lang={lang}
          />
        )}
        {tab === "dex" && (
          <DexTab
            accounts={accounts}
            setAccounts={setAccounts}
            entries={entries}
            setEntries={setEntries}
            t={t}
          />
        )}
      </main>
    </div>
  );
}

function MapTab({ visible, activeEventMode, setActiveEventMode, now, t, localEvents, mapFocus }) {
  const mapContainerRef = useRef(null);
  const mapInstance = useRef(null);
  const markersLayerRef = useRef(null);
  const markerById = useRef(new Map());
  const focusMarkerRef = useRef(null);
  const tRef = useRef(t);
  tRef.current = t;
  const [copiedText, setCopiedText] = useState(null);

  const eventModes = [
    { id: "spotlight", name: t("spotlightMode") },
    { id: "comday", name: t("comdayMode") },
    { id: "daytime", name: t("daytimeMode") }
  ];
  const rule = EVENT_WINDOWS[activeEventMode] || EVENT_WINDOWS.spotlight;

  useEffect(() => {
    if (!copiedText) return undefined;
    const timer = setTimeout(() => setCopiedText(null), 2500);
    return () => clearTimeout(timer);
  }, [copiedText]);

  useEffect(() => {
    if (!visible || mapInstance.current || !mapContainerRef.current) return undefined;
    const bounds = L.latLngBounds(L.latLng(-85, -180), L.latLng(85, 180));
    const map = L.map(mapContainerRef.current, {
      minZoom: 2.2,
      maxBounds: bounds,
      maxBoundsViscosity: 1.0
    }).setView([22, 10], 2.5);
    mapInstance.current = map;

    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 16,
      attribution: "Esri Canvas"
    }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    map.on("click", (event) => {
      const text = `${event.latlng.lat.toFixed(6)}, ${event.latlng.lng.toFixed(6)}`;
      setCopiedText(text);
      copyText(text).then((ok) => {
        if (!ok) setCopiedText(tRef.current("copiedFail"));
      });
      L.popup()
        .setLatLng(event.latlng)
        .setContent(`<div style="color:#111;font-size:12px;font-family:sans-serif;"><b>${escapeHtml(tRef.current("copiedAlert"))}</b><br/><code>${text}</code></div>`)
        .openOn(map);
    });
    setTimeout(() => map.invalidateSize(), 60);
    return undefined;
  }, [visible]);

  useEffect(() => {
    if (!visible || !mapInstance.current) return undefined;
    const timer = setTimeout(() => mapInstance.current && mapInstance.current.invalidateSize(), 50);
    return () => clearTimeout(timer);
  }, [visible]);

  useEffect(() => {
    if (!mapInstance.current || !markersLayerRef.current) return;
    const layer = markersLayerRef.current;
    const seen = new Set();

    (window.GLOBAL_HUBS || []).forEach((hub) => {
      seen.add(hub.id);
      const status = getHubStatus(hub, now, rule);
      upsertMarker(layer, markerById.current, hub.id, hub.lat, hub.lng, status.isActive, hubIcon(status.isActive), hubPopup(hub, status, rule, t));
    });

    (localEvents || []).forEach((ev) => {
      if (!ev.coords || getEventStatus(ev.start, ev.end) === "finished") return;
      const id = `local:${ev.id || ev.name}`;
      seen.add(id);
      const active = getEventStatus(ev.start, ev.end) === "active";
      upsertMarker(
        layer,
        markerById.current,
        id,
        ev.coords.lat,
        ev.coords.lng,
        active,
        localIcon(active),
        localPopup(ev, t)
      );
    });

    markerById.current.forEach((marker, id) => {
      if (!seen.has(id)) {
        marker.remove();
        markerById.current.delete(id);
      }
    });
  }, [activeEventMode, now, t, localEvents, rule, visible]);

  useEffect(() => {
    if (!mapFocus || !mapInstance.current) return undefined;
    const map = mapInstance.current;
    const { lat, lng, label } = mapFocus;
    const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    setCopiedText(`${label}: ${text}`);
    map.invalidateSize();
    if (!focusMarkerRef.current) {
      focusMarkerRef.current = L.marker([lat, lng], {
        zIndexOffset: 1000,
        icon: L.divIcon({
          className: "hub-icon",
          html: '<div class="w-4 h-4 rounded-full bg-amber-300 border-2 border-white shadow-lg"></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        })
      }).addTo(map);
    } else {
      focusMarkerRef.current.setLatLng([lat, lng]);
    }
    focusMarkerRef.current
      .bindPopup(`<div style="color:#111;font-size:12px;font-family:sans-serif;"><b>${escapeHtml(label)}</b><br/><code>${text}</code></div>`)
      .openPopup();
    const timer = setTimeout(() => map.flyTo([lat, lng], 12), 60);
    return () => clearTimeout(timer);
  }, [mapFocus]);

  const copyCoords = (lat, lng, label) => {
    const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    const showCopied = () => setCopiedText(`${label}: ${text}`);
    if (ReactDOM.flushSync) ReactDOM.flushSync(showCopied);
    else showCopied();
    try {
      if (mapInstance.current) mapInstance.current.flyTo([lat, lng], 13);
    } catch (err) {
      // Keep the copied confirmation even if the map animation fails.
    }
    copyText(text).catch(() => setCopiedText(t("copiedFail")));
  };

  const hubsWithStatus = (window.GLOBAL_HUBS || []).map((hub) => ({ ...hub, status: getHubStatus(hub, now, rule) }));
  const activeHubs = hubsWithStatus.filter((hub) => hub.status.isActive);
  const inactiveHubs = hubsWithStatus.filter((hub) => !hub.status.isActive);

  return (
    <div className="flex flex-col md:flex-row h-full min-h-0">
      <div className="w-full md:w-96 md:shrink-0 bg-dark-800 border-b md:border-b-0 md:border-r border-slate-700 p-4 flex flex-col gap-4 overflow-y-auto z-10 max-h-[46vh] md:max-h-none">
        <div>
          <span className="text-[11px] font-bold uppercase text-slate-400 block mb-1.5">{t("checkWindow")}</span>
          <div className="grid grid-cols-3 gap-1">
            {eventModes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setActiveEventMode(mode.id)}
                className={`text-[11px] p-2 rounded-lg text-center transition border ${
                  activeEventMode === mode.id
                    ? "bg-amber-500/20 border-amber-500 text-amber-300 font-bold"
                    : "bg-dark-700 border-slate-600 text-slate-300"
                }`}
              >
                {mode.name}
              </button>
            ))}
          </div>
        </div>

        {copiedText && (
          <div className="p-2.5 bg-emerald-950/70 border border-emerald-500/50 rounded-lg text-xs">
            <span className="text-emerald-400 font-bold">{t("copiedAlert")}</span>
            <div className="text-slate-200 text-[11px] truncate mt-0.5">{copiedText}</div>
          </div>
        )}

        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </span>
            <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400">
              {t("liveNow")} ({activeHubs.length})
            </h3>
          </div>

          {activeHubs.length > 0 ? (
            <div className="flex flex-col gap-2">
              {activeHubs.map((hub) => (
                <button
                  key={hub.id}
                  type="button"
                  onClick={() => copyCoords(hub.lat, hub.lng, hub.name)}
                  className="p-3 text-left bg-gradient-to-r from-rose-950/40 to-dark-700 border border-rose-500/50 rounded-xl cursor-pointer hover:border-rose-400 transition"
                >
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-bold text-sm text-amber-300">{hub.name}</span>
                    <span className="bg-rose-500/30 text-rose-300 text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0">
                      {hub.status.minutesLeft} {t("minLeft")}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">{hub.popularSpot}</div>
                  <div className="mt-2 flex justify-between items-center text-[10px] text-slate-400">
                    <span>{t("localTime")} <b className="text-white">{hub.status.timeString}</b></span>
                    <span className="text-amber-400 font-semibold">{t("copyBtn")}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-3 bg-dark-700/40 rounded-lg text-slate-400 text-xs border border-slate-700/60 text-center">
              {t("noActiveEvents")}
            </div>
          )}
        </div>

        <div className="flex-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{t("allHubs")}</h3>
          <div className="flex flex-col gap-1.5">
            {inactiveHubs.map((hub) => (
              <button
                key={hub.id}
                type="button"
                onClick={() => copyCoords(hub.lat, hub.lng, hub.name)}
                className="p-2 text-left bg-dark-700/60 hover:bg-dark-700 rounded-lg cursor-pointer transition flex justify-between items-center text-xs border border-slate-700/60"
              >
                <div>
                  <div className="font-medium text-slate-200">{hub.name}</div>
                  <div className="text-[10px] text-slate-500">{hub.popularSpot}</div>
                </div>
                <div className="text-right">
                  <div className="text-amber-400 font-mono">{hub.status.timeString}</div>
                  <div className="text-[10px] text-slate-500">{t("clickCopy")}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 relative min-h-[320px]">
        <div id="map" ref={mapContainerRef}></div>
      </div>
    </div>
  );
}

function NewsTab({ news, localEvents, loading, newsError, onGoToLocation, t, lang }) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [hideFinished, setHideFinished] = useState(true);

  const formatEventDate = (dateStr) => {
    if (!dateStr || String(dateStr).includes("Локальний") || String(dateStr).includes("Local")) return t("localTime");
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString(LOCALE_MAP[lang] || "uk-UA", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const renderBadge = (status) => {
    if (status === "active") {
      return <span className="bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[10px] px-2 py-0.5 rounded-md font-bold">{t("liveBadge")}</span>;
    }
    if (status === "upcoming") {
      return <span className="bg-sky-950/60 text-sky-400 border border-sky-500/30 text-[10px] px-2 py-0.5 rounded-md">{t("upcomingBadge")}</span>;
    }
    if (status === "finished") {
      return <span className="bg-slate-800 text-slate-500 text-[10px] px-2 py-0.5 rounded-md">{t("finishedBadge")}</span>;
    }
    return null;
  };

  const filterList = (list, isLocalList) => list.filter((item) => {
    const status = getEventStatus(item.start, item.end);
    if (hideFinished && status === "finished") return false;
    if (statusFilter === "active" && status !== "active") return false;
    if (statusFilter === "upcoming" && status !== "upcoming") return false;
    if (typeFilter === "local") return isLocalList;
    if (typeFilter !== "all") {
      if (isLocalList) return false;
      const type = (item.eventType || item.type || "").toLowerCase();
      return type.includes(typeFilter.toLowerCase());
    }
    return true;
  });

  const localNames = new Set((localEvents || []).map((ev) => (ev.name || "").toLowerCase()));
  const filteredLocal = sortEvents(filterList(localEvents || [], true));
  const filteredGlobal = sortEvents(
    filterList(news || [], false).filter((item) => !localNames.has((item.name || "").toLowerCase()))
  );

  return (
    <div className="h-full bg-dark-900 p-4 md:p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto flex flex-col gap-5">
        <div className="flex flex-col gap-3 bg-dark-800 p-4 rounded-2xl border border-slate-700/80 shadow-md">
          <div className="flex flex-wrap justify-between items-center gap-3 border-b border-slate-700/60 pb-3">
            <div>
              <h2 className="text-lg font-black text-amber-400 tracking-wide">{t("newsTitle")}</h2>
              <div className="text-xs text-slate-400">{t("newsSub")}</div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 bg-dark-900 p-1 rounded-xl border border-slate-700 text-xs">
              <button type="button" onClick={() => setStatusFilter("all")} className={`px-3 py-1 rounded-lg font-medium transition ${statusFilter === "all" ? "bg-slate-700 text-white font-bold" : "text-slate-400 hover:text-slate-200"}`}>{t("allStatuses")}</button>
              <button type="button" onClick={() => setStatusFilter("active")} className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1 transition ${statusFilter === "active" ? "bg-rose-500 text-white" : "text-rose-400 hover:bg-rose-950/40"}`}>{t("onlyActive")}</button>
              <button type="button" onClick={() => setStatusFilter("upcoming")} className={`px-3 py-1 rounded-lg font-medium transition ${statusFilter === "upcoming" ? "bg-sky-600 text-white font-bold" : "text-sky-400 hover:bg-sky-950/40"}`}>{t("upcoming")}</button>
            </div>
          </div>

          <div className="flex flex-wrap justify-between items-center gap-3 text-xs">
            <div className="flex flex-wrap gap-1">
              {[
                { id: "all", label: t("allTypes") },
                { id: "local", label: t("localType") },
                { id: "raid", label: t("raidType") },
                { id: "spotlight", label: t("spotlightType") },
                { id: "community", label: t("comdayType") }
              ].map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setTypeFilter(filter.id)}
                  className={`px-3 py-1 rounded-lg transition ${typeFilter === filter.id ? "bg-amber-500 text-slate-950 font-bold" : "bg-dark-700 text-slate-300 hover:bg-slate-700"}`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white select-none bg-dark-900/80 px-3 py-1.5 rounded-lg border border-slate-700">
              <input type="checkbox" checked={hideFinished} onChange={(event) => setHideFinished(event.target.checked)} className="w-3.5 h-3.5 rounded text-amber-500 bg-dark-700 border-slate-600 focus:ring-0" />
              <span>{t("hideFinished")}</span>
            </label>
          </div>
        </div>

        {newsError && (
          <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs">{t("newsError")}</div>
        )}

        {(typeFilter === "all" || typeFilter === "local") && filteredLocal.length > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-black tracking-wider uppercase text-rose-400">📍 {t("localEventsTitle")} ({filteredLocal.length})</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredLocal.map((locEv) => {
                const status = getEventStatus(locEv.start, locEv.end);
                return (
                  <div key={locEv.id || locEv.name} className="bg-dark-800 border border-rose-500/40 rounded-2xl overflow-hidden flex flex-col justify-between shadow-xl">
                    {locEv.image && (
                      <div className="w-full h-36 bg-dark-950 overflow-hidden border-b border-slate-700/50">
                        <img src={locEv.image} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={(event) => { event.target.style.display = "none"; }} />
                      </div>
                    )}
                    <div className="p-4 flex flex-col gap-3 flex-1">
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">{locEv.country}</span>
                        {renderBadge(status)}
                      </div>
                      <div>
                        <h4 className="text-base font-bold text-white mb-1">{locEv.name}</h4>
                        <div className="text-xs text-amber-300/90 font-medium">📍 {locEv.locationName}</div>
                      </div>
                      {Array.isArray(locEv.bonuses) && locEv.bonuses.length > 0 ? (
                        <ul className="text-xs text-slate-300 list-disc pl-4 space-y-1">
                          {locEv.bonuses.map((bonus) => <li key={bonus}>{bonus}</li>)}
                        </ul>
                      ) : locEv.details ? (
                        <div className="text-xs text-slate-300 leading-relaxed">{locEv.details}</div>
                      ) : null}
                    </div>
                    <div className="px-4 py-3 border-t border-slate-700/60 flex flex-wrap justify-between items-center gap-2 text-[11px]">
                      <span className="text-slate-400">{formatEventDate(locEv.start)} — {formatEventDate(locEv.end)}</span>
                      <div className="flex gap-2">
                        {locEv.link && (
                          <a href={locEv.link} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg border border-slate-600 text-slate-200 hover:border-slate-400">{t("openSource")}</a>
                        )}
                        {locEv.coords && (
                          <button type="button" onClick={() => onGoToLocation(locEv.coords.lat, locEv.coords.lng, locEv.name)} className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-3 py-1.5 rounded-lg font-bold text-xs transition">
                            {t("goToMap")}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {typeFilter !== "local" && (
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-black tracking-wider uppercase text-slate-400">{t("globalEventsTitle")} ({filteredGlobal.length})</h3>
            {loading ? (
              <div className="py-20 text-center text-slate-400 flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
                <span>{t("loadingSchedule")}</span>
              </div>
            ) : filteredGlobal.length === 0 ? (
              <div className="py-16 text-center text-slate-500 bg-dark-800/40 rounded-2xl border border-slate-800 text-sm">{t("noEventsFound")}</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredGlobal.map((item) => {
                  const status = getEventStatus(item.start, item.end);
                  const imgUrl = item.image || item.headerImage;
                  const details = eventDetails(item);
                  return (
                    <div key={item.eventID || `${item.name}-${item.start}`} className="bg-dark-800/90 border border-slate-700/80 rounded-2xl overflow-hidden flex flex-col justify-between hover:border-slate-500 transition shadow-lg">
                      <div>
                        {imgUrl ? (
                          <div className="w-full h-36 bg-dark-950 overflow-hidden relative border-b border-slate-700/50">
                            <img src={imgUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={(event) => { event.target.style.display = "none"; }} />
                            <div className="absolute top-2.5 right-2.5">{renderBadge(status)}</div>
                          </div>
                        ) : (
                          <div className="p-3 pb-0 flex justify-end">{renderBadge(status)}</div>
                        )}
                        <div className="p-4">
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">{item.eventType || "Event"}</span>
                          <h3 className="text-base font-bold text-white my-2 leading-snug">{item.name}</h3>
                          {details && <div className="text-xs text-slate-300 line-clamp-3 leading-relaxed">{details}</div>}
                        </div>
                      </div>
                      <div className="p-3.5 bg-dark-900/60 border-t border-slate-700/60 flex flex-col gap-1 text-[11px]">
                        <div className="flex justify-between items-center text-slate-400"><span>{t("start")}</span><span className="text-slate-200 font-medium">{formatEventDate(item.start)}</span></div>
                        <div className="flex justify-between items-center text-slate-400"><span>{t("end")}</span><span className="text-slate-200 font-medium">{formatEventDate(item.end)}</span></div>
                        {item.link && (
                          <a href={item.link} target="_blank" rel="noreferrer" className="mt-1 text-amber-300 hover:text-amber-200 font-semibold">{t("openSource")}</a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DexTab({ accounts, setAccounts, entries, setEntries, t }) {
  const [selectedAccount, setSelectedAccount] = useState("All");
  const [search, setSearch] = useState("");
  const [filterBgOnly, setFilterBgOnly] = useState(false);
  const [name, setName] = useState("");
  const [dexNo, setDexNo] = useState("");
  const [acc, setAcc] = useState(accounts[0] || "Main");
  const [isShiny, setIsShiny] = useState(true);
  const [activeModalItem, setActiveModalItem] = useState(null);
  const [hasBg, setHasBg] = useState(false);
  const [bgTag, setBgTag] = useState("");
  const [hasCostume, setHasCostume] = useState(false);
  const [costumeTag, setCostumeTag] = useState("");
  const [sizeTag, setSizeTag] = useState("None");
  const [note, setNote] = useState("");
  const [newAccName, setNewAccName] = useState("");
  const [renameFrom, setRenameFrom] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [formError, setFormError] = useState("");
  const [bgPresets, setBgPresets] = useState([]);
  const importRef = useRef(null);
  const lookupRef = useRef(0);

  const POPULAR_MAP = {
    bulbasaur: 1, ivysaur: 2, venusaur: 3,
    charmander: 4, charmeleon: 5, charizard: 6,
    squirtle: 7, wartortle: 8, blastoise: 9,
    pikachu: 25, raichu: 26,
    eevee: 133, vaporeon: 134, jolteon: 135, flareon: 136,
    espeon: 196, umbreon: 197,
    mewtwo: 150, mew: 151,
    lugia: 249, "ho-oh": 250,
    regice: 378, regirock: 377, registeel: 379,
    kyogre: 382, groudon: 383, rayquaza: 384,
    dialga: 483, palkia: 484, giratina: 487,
    skiddo: 672, gogoat: 673,
    necrozma: 800, zacian: 888, zamazenta: 889
  };

  useEffect(() => {
    let cancelled = false;
    fetch("backgrounds.json")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) {
          setBgPresets(data.filter((item) => typeof item === "string" && item.trim()));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeModalItem) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setActiveModalItem(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeModalItem]);

  const handleNameChange = (val) => {
    setName(val);
    const clean = val.trim().toLowerCase();
    const requestId = ++lookupRef.current;
    if (!clean) {
      setDexNo("");
      return;
    }
    if (POPULAR_MAP[clean]) {
      setDexNo(POPULAR_MAP[clean]);
      return;
    }
    if (clean.length < 3) return;
    fetch(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(clean)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (requestId !== lookupRef.current || !data || !data.id) return;
        setDexNo(data.id);
      })
      .catch(() => {});
  };

  const handleDexNoChange = (val) => {
    if (val === "") {
      setDexNo("");
      return;
    }
    const num = Math.max(1, parseInt(val, 10));
    if (isNaN(num)) return;
    setDexNo(num);
    const requestId = ++lookupRef.current;
    fetch(`https://pokeapi.co/api/v2/pokemon/${num}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (requestId !== lookupRef.current || !data || !data.name) return;
        setName(data.name.charAt(0).toUpperCase() + data.name.slice(1));
      })
      .catch(() => {});
  };

  const getSpriteUrl = (num, shiny) => {
    const cleanNo = parseInt(num, 10);
    if (isNaN(cleanNo) || cleanNo < 1) {
      return "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png";
    }
    const folder = shiny ? "shiny/" : "";
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${folder}${cleanNo}.png`;
  };

  const addAccount = () => {
    const trimmed = newAccName.trim();
    if (!trimmed) return;
    if (accounts.includes(trimmed)) {
      setFormError(t("accountExists"));
      return;
    }
    setAccounts(accounts.concat(trimmed));
    setNewAccName("");
    setFormError("");
  };

  const commitRename = () => {
    const cleanNew = renameValue.trim();
    if (!renameFrom || !cleanNew || cleanNew === renameFrom) {
      setRenameFrom(null);
      return;
    }
    if (accounts.includes(cleanNew)) {
      setFormError(t("accountExists"));
      return;
    }
    setAccounts(accounts.map((account) => (account === renameFrom ? cleanNew : account)));
    setEntries(entries.map((item) => (item.account === renameFrom ? { ...item, account: cleanNew } : item)));
    if (acc === renameFrom) setAcc(cleanNew);
    if (selectedAccount === renameFrom) setSelectedAccount(cleanNew);
    setRenameFrom(null);
    setFormError("");
  };

  const deleteAccount = (nameToDelete) => {
    if (accounts.length <= 1) {
      setFormError(t("needOneAccount"));
      return;
    }
    if (!window.confirm(t("deleteAccountConfirm").replace("{name}", nameToDelete))) return;
    const nextAccounts = accounts.filter((account) => account !== nameToDelete);
    setAccounts(nextAccounts);
    setEntries(entries.filter((item) => item.account !== nameToDelete));
    if (acc === nameToDelete) setAcc(nextAccounts[0] || "Main");
    if (selectedAccount === nameToDelete) setSelectedAccount("All");
    setFormError("");
  };

  const addPokemon = (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    lookupRef.current += 1;
    const newEntry = {
      id: Date.now(),
      account: acc,
      name: name.trim(),
      dexNo: dexNo ? parseInt(dexNo, 10) : "-",
      isShiny,
      bg: hasBg && bgTag.trim() ? bgTag.trim() : "None",
      costume: hasCostume && costumeTag.trim() ? costumeTag.trim() : "None",
      size: sizeTag !== "None" ? sizeTag : "None",
      note: note.trim()
    };
    setEntries([newEntry].concat(entries));
    setName("");
    setDexNo("");
    setHasBg(false);
    setBgTag("");
    setHasCostume(false);
    setCostumeTag("");
    setSizeTag("None");
    setNote("");
  };

  const exportDex = () => {
    const blob = new Blob([JSON.stringify({ accounts, entries }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "pogo-dex.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const onImport = (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = normalizeImport(JSON.parse(String(reader.result)));
        if (!parsed) {
          setFormError(t("importError"));
          return;
        }
        if (!window.confirm(t("importConfirm"))) return;
        setAccounts(parsed.accounts);
        setEntries(parsed.entries);
        setAcc(parsed.accounts[0]);
        setSelectedAccount("All");
        setFormError("");
      } catch (err) {
        setFormError(t("importError"));
      }
    };
    reader.readAsText(file);
  };

  const sameSpecies = (entry, group) => (
    (entry.name || "").toLowerCase() === (group.name || "").toLowerCase()
    && entry.dexNo === group.dexNo
    && Boolean(entry.isShiny) === Boolean(group.isShiny)
    && (selectedAccount === "All" || entry.account === selectedAccount)
  );

  const groupedList = useMemo(() => {
    const initialFiltered = entries.filter((item) => {
      const matchesAcc = selectedAccount === "All" || item.account === selectedAccount;
      const query = search.trim().toLowerCase();
      const matchesSearch = query === ""
        || (item.name && item.name.toLowerCase().includes(query))
        || (item.dexNo != null && String(item.dexNo).includes(query))
        || (item.bg && item.bg !== "None" && item.bg.toLowerCase().includes(query))
        || (item.costume && item.costume !== "None" && item.costume.toLowerCase().includes(query))
        || (item.size && item.size !== "None" && item.size.toLowerCase().includes(query))
        || (item.note && item.note.toLowerCase().includes(query));
      const matchesBg = !filterBgOnly || (item.bg && item.bg !== "None");
      return matchesAcc && matchesSearch && matchesBg;
    });

    const groups = {};
    initialFiltered.forEach((item) => {
      const groupKey = `${item.name}_${item.dexNo}_${item.isShiny}`.toLowerCase();
      if (!groups[groupKey]) {
        groups[groupKey] = {
          name: item.name,
          dexNo: item.dexNo,
          isShiny: item.isShiny,
          totalCount: 0,
          variants: []
        };
      }
      groups[groupKey].totalCount += 1;
      groups[groupKey].variants.push(item);
    });
    return Object.values(groups);
  }, [entries, selectedAccount, search, filterBgOnly]);

  return (
    <div className="h-full flex flex-col lg:flex-row bg-dark-900 min-h-0">
      <div className="w-full lg:w-96 lg:shrink-0 bg-dark-800 border-b lg:border-b-0 lg:border-r border-slate-700 p-5 overflow-y-auto flex flex-col gap-6 max-h-[48vh] lg:max-h-none">
        <div>
          <h2 className="text-base font-bold text-amber-400 mb-3">{t("addToDex")}</h2>
          <form onSubmit={addPokemon} className="flex flex-col gap-3 text-xs">
            <div>
              <label className="text-slate-400 mb-1 block">{t("account")}</label>
              <select value={acc} onChange={(event) => setAcc(event.target.value)} className="w-full bg-dark-700 border border-slate-600 rounded p-2 text-slate-100">
                {accounts.map((account) => <option key={account} value={account}>{account}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="text-slate-400 mb-1 block">{t("pokeName")}</label>
                <input type="text" placeholder="Pikachu, Rayquaza..." value={name} onChange={(event) => handleNameChange(event.target.value)} className="w-full bg-dark-700 border border-slate-600 rounded p-2 text-slate-100" required />
              </div>
              <div>
                <label className="text-slate-400 mb-1 block">{t("dexNo")}</label>
                <input type="number" min="1" step="1" placeholder="25" value={dexNo} onChange={(event) => handleDexNoChange(event.target.value)} onKeyDown={(event) => { if (event.key === "-" || event.key === "e") event.preventDefault(); }} className="w-full bg-dark-700 border border-slate-600 rounded p-2 text-slate-100 font-mono" />
              </div>
            </div>

            {dexNo && parseInt(dexNo, 10) > 0 && (
              <div className="flex items-center gap-3 bg-dark-900/60 p-2 rounded-xl border border-slate-700/60">
                <img src={getSpriteUrl(dexNo, isShiny)} alt="" className="w-12 h-12 object-contain" onError={(event) => { event.target.src = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png"; }} />
                <div className="text-[11px] text-slate-400">
                  <span className="text-slate-200 font-semibold">{name || `№${dexNo}`}</span>
                  <div>{isShiny ? t("shinyVersion") : t("normalVersion")}</div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 py-1">
              <input type="checkbox" id="shinyCb" checked={isShiny} onChange={(event) => setIsShiny(event.target.checked)} className="w-4 h-4 rounded text-amber-500 bg-dark-700 border-slate-600 focus:ring-0 cursor-pointer" />
              <label htmlFor="shinyCb" className="font-semibold text-amber-300 cursor-pointer select-none">{t("isShinyLabel")}</label>
            </div>

            <div className="bg-dark-900/50 p-2.5 rounded-xl border border-slate-700/70 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="hasBgCb" checked={hasBg} onChange={(event) => setHasBg(event.target.checked)} className="w-4 h-4 rounded text-indigo-500 bg-dark-700 border-slate-600 focus:ring-0 cursor-pointer" />
                <label htmlFor="hasBgCb" className="text-slate-200 font-medium cursor-pointer select-none">{t("hasBgLabel")}</label>
              </div>
              {hasBg && (
                <div className="mt-1">
                  <input type="text" list="bg-presets" placeholder={t("bgPlaceholder")} value={bgTag} onChange={(event) => setBgTag(event.target.value)} className="w-full bg-dark-700 border border-indigo-500/50 rounded p-2 text-indigo-200 placeholder-slate-500" />
                  <datalist id="bg-presets">
                    {bgPresets.map((preset) => <option key={preset} value={preset} />)}
                  </datalist>
                </div>
              )}
            </div>

            <div className="bg-dark-900/50 p-2.5 rounded-xl border border-slate-700/70 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="hasCostumeCb" checked={hasCostume} onChange={(event) => setHasCostume(event.target.checked)} className="w-4 h-4 rounded text-pink-500 bg-dark-700 border-slate-600 focus:ring-0 cursor-pointer" />
                <label htmlFor="hasCostumeCb" className="text-slate-200 font-medium cursor-pointer select-none">{t("hasCostumeLabel")}</label>
              </div>
              {hasCostume && (
                <input type="text" placeholder={t("costumePlaceholder")} value={costumeTag} onChange={(event) => setCostumeTag(event.target.value)} className="w-full bg-dark-700 border border-pink-500/50 rounded p-2 text-pink-200 placeholder-slate-500" />
              )}
            </div>

            <div>
              <label className="text-slate-400 mb-1 block">{t("sizeLabel")}</label>
              <div className="grid grid-cols-3 gap-1">
                {["None", "XXS", "XXL"].map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setSizeTag(size)}
                    className={`py-1.5 rounded border ${sizeTag === size ? "bg-amber-500/20 border-amber-500 text-amber-200 font-bold" : "bg-dark-700 border-slate-600 text-slate-300"}`}
                  >
                    {size === "None" ? t("sizeNone") : size}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-slate-400 mb-1 block">{t("noteLabel")}</label>
              <input type="text" placeholder="Lucky / IV 100% / Trade" value={note} onChange={(event) => setNote(event.target.value)} className="w-full bg-dark-700 border border-slate-600 rounded p-2 text-slate-100" />
            </div>

            <button type="submit" className="mt-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold py-2 rounded transition">{t("saveBtn")}</button>
          </form>
        </div>

        <div className="border-t border-slate-700 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{t("accountManager")}</h3>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              placeholder={t("newAccPlaceholder")}
              value={newAccName}
              onChange={(event) => setNewAccName(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addAccount(); } }}
              className="flex-1 bg-dark-700 border border-slate-600 rounded p-1.5 text-xs text-slate-100 placeholder-slate-500"
            />
            <button type="button" onClick={addAccount} className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-3 py-1.5 rounded text-xs font-bold transition">+</button>
          </div>

          <div className="flex flex-col gap-1.5">
            {accounts.map((account) => (
              <div key={account} className="flex items-center justify-between gap-2 bg-dark-700/80 px-2.5 py-1.5 rounded-lg border border-slate-600/80 text-xs">
                {renameFrom === account ? (
                  <input
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") { event.preventDefault(); commitRename(); }
                      if (event.key === "Escape") setRenameFrom(null);
                    }}
                    className="flex-1 bg-dark-900 border border-slate-600 rounded px-2 py-1 text-slate-100"
                    autoFocus
                  />
                ) : (
                  <span className="font-semibold text-slate-200 truncate mr-2">{account}</span>
                )}
                <div className="flex items-center gap-1 shrink-0">
                  {renameFrom === account ? (
                    <button type="button" onClick={commitRename} className="px-1.5 text-amber-300 font-bold">✓</button>
                  ) : (
                    <button type="button" onClick={() => { setRenameFrom(account); setRenameValue(account); setFormError(""); }} className="p-1 text-slate-400 hover:text-amber-400">✎</button>
                  )}
                  <button type="button" onClick={() => deleteAccount(account)} className="p-1 text-slate-400 hover:text-rose-400 font-bold">✕</button>
                </div>
              </div>
            ))}
          </div>
          {formError && <div className="mt-2 text-[11px] text-rose-300">{formError}</div>}
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={exportDex} className="flex-1 bg-dark-700 hover:bg-slate-700 border border-slate-600 rounded py-1.5 text-[11px] font-semibold">{t("exportDex")}</button>
            <button type="button" onClick={() => importRef.current && importRef.current.click()} className="flex-1 bg-dark-700 hover:bg-slate-700 border border-slate-600 rounded py-1.5 text-[11px] font-semibold">{t("importDex")}</button>
            <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={onImport} />
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-6 flex flex-col gap-4 overflow-hidden min-h-0">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-dark-800 p-3 rounded-lg border border-slate-700">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">{t("account")}:</span>
            <button type="button" onClick={() => setSelectedAccount("All")} className={`text-xs px-2.5 py-1 rounded ${selectedAccount === "All" ? "bg-amber-500 text-slate-900 font-bold" : "bg-dark-700 text-slate-300"}`}>{t("allFilter")}</button>
            {accounts.map((account) => (
              <button key={account} type="button" onClick={() => setSelectedAccount(account)} className={`text-xs px-2.5 py-1 rounded ${selectedAccount === account ? "bg-amber-500 text-slate-900 font-bold" : "bg-dark-700 text-slate-300"}`}>{account}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1 text-xs text-slate-300 cursor-pointer select-none">
              <input type="checkbox" checked={filterBgOnly} onChange={(event) => setFilterBgOnly(event.target.checked)} className="w-3.5 h-3.5 rounded text-amber-500 bg-dark-700 border-slate-600" />
              {t("bgOnlyFilter")}
            </label>
            <input type="text" placeholder={t("searchPlaceholder")} value={search} onChange={(event) => setSearch(event.target.value)} className="bg-dark-700 border border-slate-600 rounded px-3 py-1 text-xs text-slate-100 w-full sm:w-56" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 pr-1 content-start">
          {groupedList.length === 0 && (
            <div className="col-span-full py-16 text-center text-slate-500 text-sm">{t("emptyDex")}</div>
          )}
          {groupedList.map((item) => {
            const showsBg = item.variants.some((variant) => variant.bg && variant.bg !== "None");
            const showsCostume = item.variants.some((variant) => variant.costume && variant.costume !== "None");
            const showsSize = item.variants.find((variant) => variant.size && variant.size !== "None");
            return (
              <button
                key={`${item.name}_${item.dexNo}_${item.isShiny}`}
                type="button"
                onClick={() => setActiveModalItem(item)}
                className={`rounded-2xl p-2.5 flex flex-col justify-between text-left relative border transition hover:-translate-y-0.5 ${
                  item.isShiny
                    ? "bg-gradient-to-b from-slate-800/90 via-dark-800 to-dark-950 border-amber-500/40 hover:border-amber-400"
                    : "bg-dark-800/90 border-slate-700/80 hover:border-slate-500"
                }`}
              >
                <div className="flex justify-between items-center text-[10px] w-full">
                  <span className="bg-amber-500 text-slate-950 font-black px-1.5 py-0.5 rounded-md">×{item.totalCount}</span>
                  {item.dexNo !== "-" && <span className="text-slate-400 font-mono font-semibold">#{String(item.dexNo).padStart(3, "0")}</span>}
                </div>
                <div className="w-full h-24 flex items-center justify-center relative my-1">
                  <img src={getSpriteUrl(item.dexNo, item.isShiny)} alt="" className="max-h-full max-w-full object-contain" loading="lazy" onError={(event) => { event.target.src = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png"; }} />
                  {item.isShiny && <span className="absolute bottom-0 right-1 text-xs">✨</span>}
                </div>
                <div className="text-center pt-1 border-t border-slate-700/50 w-full">
                  <div className="text-xs font-black text-white truncate capitalize">{item.name}</div>
                  {(showsBg || showsCostume || showsSize) && (
                    <div className="mt-1 flex justify-center gap-1 text-[10px] text-slate-300">
                      {showsBg && <span>🌄</span>}
                      {showsCostume && <span>🎀</span>}
                      {showsSize && <span>{showsSize.size}</span>}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {activeModalItem && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setActiveModalItem(null)}>
            <div className="bg-dark-900 border border-slate-700 rounded-2xl p-4 w-full max-w-md shadow-2xl flex flex-col gap-3" onClick={(event) => event.stopPropagation()}>
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-white capitalize">{activeModalItem.name}</h3>
                  {activeModalItem.isShiny && <span className="text-amber-400 text-sm">✨</span>}
                  <span className="text-slate-500 text-xs font-mono">#{activeModalItem.dexNo}</span>
                </div>
                <button type="button" onClick={() => setActiveModalItem(null)} className="text-slate-400 hover:text-white font-bold text-lg leading-none p-1">✕</button>
              </div>
              <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
                {entries.filter((entry) => sameSpecies(entry, activeModalItem)).map((variant) => (
                  <div key={variant.id} className="bg-dark-800 border border-slate-700/80 rounded-xl p-2.5 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-amber-400 font-bold text-xs">{variant.account}</span>
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {variant.bg && variant.bg !== "None" && <span className="bg-indigo-950 text-indigo-300 border border-indigo-500/40 px-2 py-0.5 rounded text-[10px]">🌄 {variant.bg}</span>}
                        {variant.costume && variant.costume !== "None" && <span className="bg-pink-950 text-pink-300 border border-pink-500/40 px-2 py-0.5 rounded text-[10px]">🎀 {variant.costume}</span>}
                        {variant.size && variant.size !== "None" && <span className="bg-slate-800 text-slate-200 border border-slate-600 px-2 py-0.5 rounded text-[10px]">{variant.size}</span>}
                        <button
                          type="button"
                          title={t("deleteInstance")}
                          onClick={() => {
                            const next = entries.filter((entry) => entry.id !== variant.id);
                            setEntries(next);
                            if (!next.some((entry) => sameSpecies(entry, activeModalItem))) setActiveModalItem(null);
                          }}
                          className="bg-slate-700/60 hover:bg-rose-600/80 text-slate-300 hover:text-white rounded-md px-1.5 py-0.5 font-bold text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    {variant.note && (
                      <div className="bg-dark-900/80 text-slate-300 text-[11px] px-2 py-1 rounded border border-slate-700/50">💬 {variant.note}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
