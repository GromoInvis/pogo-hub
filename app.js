const { useState, useEffect, useRef } = React;

function App() {
  const [tab, setTab] = useState("map"); // "map" | "news" | "dex"
  const [lang, setLang] = useState(() => localStorage.getItem("pogo_lang") || "ua");
  const [activeEventMode, setActiveEventMode] = useState("spotlight");
  const [now, setNow] = useState(new Date());

  const [news, setNews] = useState([]);
  const [localEvents, setLocalEvents] = useState([]);
  const [loadingNews, setLoadingNews] = useState(true);

  // Хелпер отримання тексту перекладу
  const t = (key) => (window.TRANSLATIONS && window.TRANSLATIONS[lang] && window.TRANSLATIONS[lang][key]) || key;

  const changeLanguage = (newLang) => {
    setLang(newLang);
    localStorage.setItem("pogo_lang", newLang);
  };

  // Стан акаунтів і збережених даних
  const [accounts, setAccounts] = useState(() => {
    const s = localStorage.getItem("pogo_accounts");
    return s ? JSON.parse(s) : ["Main", "Alt 1"];
  });

  const [entries, setEntries] = useState(() => {
    const s = localStorage.getItem("pogo_entries");
    return s ? JSON.parse(s) : [
      { id: 1, account: "Main", name: "Rayquaza", dexNo: 384, isShiny: true, bg: "Mega Rayquaza BG", note: "Lucky 98%" },
      { id: 2, account: "Alt 1", name: "Charmander", dexNo: 4, isShiny: true, bg: "Okinawa Special", note: "Swimming goggles" }
    ];
  });

  useEffect(() => {
    localStorage.setItem("pogo_accounts", JSON.stringify(accounts));
  }, [accounts]);

  useEffect(() => {
    localStorage.setItem("pogo_entries", JSON.stringify(entries));
  }, [entries]);

  // Таймер оновлення локального часу кожні 5 сек
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 5000);
    return () => clearInterval(timer);
  }, []);

  // Словник міст для автоматичного визначення GPS координат із тексту івенту
  const CITY_COORDS = {
    "seoul": { lat: 37.5665, lng: 126.9780, country: "South Korea 🇰🇷" },
    "incheon": { lat: 37.4563, lng: 126.7052, country: "South Korea 🇰🇷" },
    "tainan": { lat: 22.9997, lng: 120.2270, country: "Taiwan 🇹🇼" },
    "taipei": { lat: 25.0330, lng: 121.5654, country: "Taiwan 🇹🇼" },
    "tokyo": { lat: 35.6762, lng: 139.6503, country: "Japan 🇯🇵" },
    "fukuoka": { lat: 33.5902, lng: 130.4017, country: "Japan 🇯🇵" },
    "madrid": { lat: 40.4168, lng: -3.7038, country: "Spain 🇪🇸" },
    "sendai": { lat: 38.2682, lng: 140.8694, country: "Japan 🇯🇵" },
    "new york": { lat: 40.7829, lng: -73.9654, country: "USA 🇺🇸" },
    "jakarta": { lat: -6.2088, lng: 106.8456, country: "Indonesia 🇮🇩" },
    "barcelona": { lat: 41.3879, lng: 2.16992, country: "Spain 🇪🇸" },
    "london": { lat: 51.5074, lng: -0.1278, country: "UK 🇬🇧" }
  };

  const findCoordsByText = (text) => {
    const lower = (text || "").toLowerCase();
    for (const [city, data] of Object.entries(CITY_COORDS)) {
      if (lower.includes(city)) return data;
    }
    return { lat: 37.5665, lng: 126.9780, country: "Special Location 📍" };
  };

  // Автоматичне витягування новин з GitHub без ризику блокувань
  useEffect(() => {
    fetch("https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setNews(data);

          // Автоматичне виявлення саме локальних/офлайн подій
          const detected = data.filter(ev => {
            const type = (ev.eventType || ev.type || "").toLowerCase();
            const heading = (ev.heading || "").toLowerCase();
            const name = (ev.name || "").toLowerCase();

            return type.includes("safari") ||
                   type.includes("in-person") ||
                   type.includes("city") ||
                   heading.includes("safari") ||
                   heading.includes("in-person") ||
                   name.includes("safari") ||
                   name.includes("pikachu") ||
                   name.includes("city");
          }).map(ev => {
            const geo = findCoordsByText(`${ev.name} ${ev.heading || ""}`);
            return {
              id: ev.name,
              name: ev.name,
              locationName: ev.heading || "Special Location",
              country: geo.country,
              coords: { lat: geo.lat, lng: geo.lng },
              start: ev.start,
              end: ev.end,
              image: ev.image || ev.headerImage,
              details: ev.details || (ev.extraData && ev.extraData.communityday && ev.extraData.communityday.bonus) || "Локальні бонуси та спеціальні спавни."
            };
          });

          setLocalEvents(detected);
        } else {
          setNews(window.FALLBACK_EVENTS || []);
        }
      })
      .catch(() => {
        setNews(window.FALLBACK_EVENTS || []);
      })
      .finally(() => setLoadingNews(false));
  }, []);

  const handleGoToLocation = (lat, lng) => {
    const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    navigator.clipboard.writeText(text);
    setTab("map");
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Шапка */}
      <header className="bg-dark-800 border-b border-slate-700 px-6 py-2.5 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🌐</span>
          <div>
            <h1 className="text-base font-black tracking-wide text-amber-400">{t("appTitle")}</h1>
            <div className="text-[11px] text-slate-400">{t("appSub")}</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Мовний перемикач */}
          <div className="flex bg-dark-900 rounded-lg p-1 border border-slate-700 text-[11px] font-bold">
            {["ua", "en", "ru"].map(l => (
              <button
                key={l}
                onClick={() => changeLanguage(l)}
                className={`px-2 py-1 rounded transition uppercase ${
                  lang === l ? "bg-amber-500 text-slate-950 shadow-sm" : "text-slate-400 hover:text-white"
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Вкладки */}
          <div className="flex bg-dark-900 rounded-lg p-1 border border-slate-700 gap-1">
            <button
              onClick={() => setTab("map")}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition ${
                tab === "map" ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              {t("tabMap")}
            </button>
            <button
              onClick={() => setTab("news")}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition ${
                tab === "news" ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              {t("tabNews")}
            </button>
            <button
              onClick={() => setTab("dex")}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition ${
                tab === "dex" ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              {t("tabDex")}
            </button>
          </div>
        </div>
      </header>

      {/* Контент */}
      <main className="flex-1 overflow-hidden relative">
        {tab === "map" && (
          <MapTab 
            activeEventMode={activeEventMode} 
            setActiveEventMode={setActiveEventMode} 
            now={now} 
            t={t}
          />
        )}
        {tab === "news" && (
          <NewsTab 
            news={news} 
            localEvents={localEvents}
            loading={loadingNews} 
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

// ================= ВКЛАДКА КАРТИ =================
function MapTab({ activeEventMode, setActiveEventMode, now, t }) {
  const mapContainerRef = useRef(null);
  const mapInstance = useRef(null);
  const markersLayerRef = useRef(null);
  const [copiedText, setCopiedText] = useState(null);

  const eventModes = [
    { id: "spotlight", name: t("spotlightMode"), startHour: 18, endHour: 19 },
    { id: "comday", name: t("comdayMode"), startHour: 14, endHour: 17 },
    { id: "daytime", name: t("daytimeMode"), startHour: 10, endHour: 18 }
  ];

  const currentRule = eventModes.find(e => e.id === activeEventMode) || eventModes[0];

  const getHubStatus = (hub) => {
    try {
      const formatter = new Intl.DateTimeFormat([], {
        timeZone: hub.tz,
        hour: 'numeric',
        minute: 'numeric',
        hour12: false
      });
      const parts = formatter.formatToParts(now);
      const hour = parseInt(parts.find(p => p.type === 'hour').value, 10);
      const minute = parseInt(parts.find(p => p.type === 'minute').value, 10);
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      const isActive = hour >= currentRule.startHour && hour < currentRule.endHour;
      const minutesLeft = isActive ? (currentRule.endHour * 60) - (hour * 60 + minute) : 0;

      return { timeString, isActive, minutesLeft };
    } catch {
      return { timeString: "--:--", isActive: false, minutesLeft: 0 };
    }
  };

  const copyCoords = (lat, lng, label) => {
    const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    navigator.clipboard.writeText(text);
    setCopiedText(`${label}: ${text}`);
    if (mapInstance.current) {
      mapInstance.current.flyTo([lat, lng], 13);
    }
  };

  useEffect(() => {
    if (!mapInstance.current && mapContainerRef.current) {
      const southWest = L.latLng(-85, -180);
      const northEast = L.latLng(85, 180);
      const worldBounds = L.latLngBounds(southWest, northEast);

      const map = L.map(mapContainerRef.current, {
        minZoom: 2.2,
        maxBounds: worldBounds,
        maxBoundsViscosity: 1.0
      }).setView([22, 10], 2.5);

      mapInstance.current = map;

      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 16,
        attribution: 'Esri Canvas'
      }).addTo(map);

      markersLayerRef.current = L.layerGroup().addTo(map);

      map.on("click", (e) => {
        const { lat, lng } = e.latlng;
        const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        navigator.clipboard.writeText(text);
        setCopiedText(text);

        L.popup()
          .setLatLng(e.latlng)
          .setContent(`
            <div style="color: #111; font-size: 12px; font-family: sans-serif;">
              <b>${t("copiedAlert")}</b><br/>
              <code>${text}</code>
            </div>
          `)
          .openOn(map);
      });
    }
  }, []);

  useEffect(() => {
    if (!mapInstance.current || !markersLayerRef.current) return;
    const layer = markersLayerRef.current;
    layer.clearLayers();

    (window.GLOBAL_HUBS || []).forEach(hub => {
      const st = getHubStatus(hub);

      const iconHtml = st.isActive ? `
        <div class="relative w-8 h-8 flex items-center justify-center">
          <div class="active-ping"></div>
          <div class="relative w-6 h-6 rounded-full bg-gradient-to-tr from-amber-500 to-rose-600 border-2 border-white flex items-center justify-center text-xs shadow-lg font-bold text-white">
            🔥
          </div>
        </div>
      ` : `
        <div class="w-5 h-5 rounded-full bg-slate-800 border border-slate-500 flex items-center justify-center text-[10px] text-slate-300 opacity-80 hover:opacity-100 hover:scale-110 transition">
          📍
        </div>
      `;

      const marker = L.marker([hub.lat, hub.lng], {
        icon: L.divIcon({ html: iconHtml, className: 'hub-icon', iconSize: [32, 32], iconAnchor: [16, 16] })
      }).addTo(layer);

      marker.bindPopup(`
        <div style="font-family: sans-serif; color: #111; font-size: 12px; min-width: 170px;">
          <b>${hub.name}</b><br/>
          <small style="color: #666;">${hub.popularSpot}</small>
          <hr style="margin: 5px 0; border: none; border-top: 1px solid #ddd;"/>
          <div>${t("localTime")} <b>${st.timeString}</b></div>
          ${st.isActive 
            ? `<div style="color: #e11d48; font-weight: bold; margin-top: 3px;">⚡ ${t("liveBadge")} (${st.minutesLeft}${t("minLeft")})</div>` 
            : `<div style="color: #777;">${currentRule.startHour}:00 -${currentRule.endHour}:00</div>`}
          <div style="margin-top: 5px;"><code>${hub.lat.toFixed(6)}, ${hub.lng.toFixed(6)}</code></div>
        </div>
      `);
    });
  }, [activeEventMode, now, t]);

  const hubsWithStatus = (window.GLOBAL_HUBS || []).map(h => ({ ...h, status: getHubStatus(h) }));
  const activeHubs = hubsWithStatus.filter(h => h.status.isActive);
  const inactiveHubs = hubsWithStatus.filter(h => !h.status.isActive);

  return (
    <div className="flex h-full">
      <div className="w-88 bg-dark-800 border-r border-slate-700 p-4 flex flex-col gap-4 overflow-y-auto z-10 w-96">
        <div>
          <span className="text-[11px] font-bold uppercase text-slate-400 block mb-1.5">{t("checkWindow")}</span>
          <div className="grid grid-cols-3 gap-1">
            {eventModes.map(m => (
              <button
                key={m.id}
                onClick={() => setActiveEventMode(m.id)}
                className={`text-[11px] p-2 rounded-lg text-center transition border ${
                  activeEventMode === m.id 
                    ? "bg-amber-500/20 border-amber-500 text-amber-300 font-bold" 
                    : "bg-dark-700 border-slate-600 text-slate-300"
                }`}
              >
                <div>{m.name}</div>
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
              {activeHubs.map(hub => (
                <div 
                  key={hub.id}
                  onClick={() => copyCoords(hub.lat, hub.lng, hub.name)}
                  className="p-3 bg-gradient-to-r from-rose-950/40 to-dark-700 border border-rose-500/50 rounded-xl cursor-pointer hover:border-rose-400 transition"
                >
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-sm text-amber-300">{hub.name}</span>
                    <span className="bg-rose-500/30 text-rose-300 text-[10px] px-2 py-0.5 rounded-full font-bold">
                      {hub.status.minutesLeft} {t("minLeft")}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">{hub.popularSpot}</div>
                  <div className="mt-2 flex justify-between items-center text-[10px] text-slate-400">
                    <span>{t("localTime")} <b className="text-white">{hub.status.timeString}</b></span>
                    <span className="text-amber-400 font-semibold">{t("copyBtn")}</span>
                  </div>
                </div>
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
            {inactiveHubs.map(hub => (
              <div
                key={hub.id}
                onClick={() => copyCoords(hub.lat, hub.lng, hub.name)}
                className="p-2 bg-dark-700/60 hover:bg-dark-700 rounded-lg cursor-pointer transition flex justify-between items-center text-xs border border-slate-700/60"
              >
                <div>
                  <div className="font-medium text-slate-200">{hub.name}</div>
                  <div className="text-[10px] text-slate-500">{hub.popularSpot}</div>
                </div>
                <div className="text-right">
                  <div className="text-amber-400 font-mono">{hub.status.timeString}</div>
                  <div className="text-[10px] text-slate-500">{t("clickCopy")}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 relative">
        <div id="map" ref={mapContainerRef}></div>
      </div>
    </div>
  );
}

// ================= ВКЛАДКА НОВИН =================
function NewsTab({ news, localEvents, loading, onGoToLocation, t, lang }) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [hideFinished, setHideFinished] = useState(true);

  const localeMap = { ua: "uk-UA", en: "en-US", ru: "ru-RU" };

  const formatEventDate = (dateStr) => {
    if (!dateStr || dateStr.includes("Локальний") || dateStr.includes("Local")) return t("localTime");
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString(localeMap[lang] || "uk-UA", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return dateStr;
    }
  };

  const getEventStatus = (startStr, endStr) => {
    // Якщо дата порожня або текстова ("Local time", "Місцевий") — вважаємо подію завершеною
    if (!startStr || !endStr) return "finished";
    if (startStr.includes("Локальний") || startStr.includes("Local") || startStr.includes("Місцевий")) {
      return "finished";
    }

    const now = new Date();
    const start = new Date(startStr);
    const end = new Date(endStr);

    // Якщо це нормальна ISO-дата
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      if (now >= start && now <= end) return "active";
      if (now < start) return "upcoming";
      return "finished";
    }

    return "finished";
  };

  const renderBadge = (status) => {
    if (status === "active") {
      return <span className="bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[10px] px-2 py-0.5 rounded-md font-bold animate-pulse">{t("liveBadge")}</span>;
    }
    if (status === "upcoming") {
      return <span className="bg-sky-950/60 text-sky-400 border border-sky-500/30 text-[10px] px-2 py-0.5 rounded-md">{t("upcomingBadge")}</span>;
    }
    if (status === "finished") {
      return <span className="bg-slate-800 text-slate-500 text-[10px] px-2 py-0.5 rounded-md">{t("finishedBadge")}</span>;
    }
    return null;
  };

  const filterList = (list, isLocalList = false) => {
    return list.filter(item => {
      const status = getEventStatus(item.start, item.end);

      if (hideFinished && status === "finished") return false;
      if (statusFilter === "active" && status !== "active") return false;
      if (statusFilter === "upcoming" && status !== "upcoming") return false;

      // Логіка категорій
      if (typeFilter === "local") return isLocalList;
      if (typeFilter !== "all") {
        if (isLocalList) return false;
        const type = (item.eventType || item.type || "").toLowerCase();
        return type.includes(typeFilter.toLowerCase());
      }
      return true;
    });
  };

  const filteredLocal = filterList(localEvents || [], true);
  const filteredGlobal = filterList(news || [], false);

  return (
    <div className="h-full bg-dark-900 p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto flex flex-col gap-5">
        
        {/* Панель фільтрів */}
        <div className="flex flex-col gap-3 bg-dark-800 p-4 rounded-2xl border border-slate-700/80 shadow-md">
          <div className="flex flex-wrap justify-between items-center gap-3 border-b border-slate-700/60 pb-3">
            <div>
              <h2 className="text-lg font-black text-amber-400 tracking-wide">{t("newsTitle")}</h2>
              <div className="text-xs text-slate-400">{t("newsSub")}</div>
            </div>

            <div className="flex items-center gap-1.5 bg-dark-900 p-1 rounded-xl border border-slate-700 text-xs">
              <button
                onClick={() => setStatusFilter("all")}
                className={`px-3 py-1 rounded-lg font-medium transition ${
                  statusFilter === "all" ? "bg-slate-700 text-white font-bold" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {t("allStatuses")}
              </button>
              <button
                onClick={() => setStatusFilter("active")}
                className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1 transition ${
                  statusFilter === "active" ? "bg-rose-500 text-white shadow-md shadow-rose-500/30" : "text-rose-400 hover:bg-rose-950/40"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-ping"></span>
                {t("onlyActive")}
              </button>
              <button
                onClick={() => setStatusFilter("upcoming")}
                className={`px-3 py-1 rounded-lg font-medium transition ${
                  statusFilter === "upcoming" ? "bg-sky-600 text-white font-bold" : "text-sky-400 hover:bg-sky-950/40"
                }`}
              >
                {t("upcoming")}
              </button>
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
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setTypeFilter(f.id)}
                  className={`px-3 py-1 rounded-lg transition ${
                    typeFilter === f.id ? "bg-amber-500 text-slate-950 font-bold" : "bg-dark-700 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white select-none bg-dark-900/80 px-3 py-1.5 rounded-lg border border-slate-700">
              <input
                type="checkbox"
                checked={hideFinished}
                onChange={e => setHideFinished(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-amber-500 bg-dark-700 border-slate-600 focus:ring-0"
              />
              <span>{t("hideFinished")}</span>
            </label>
          </div>
        </div>

        {/* Локальні події */}
        {(typeFilter === "all" || typeFilter === "local") && filteredLocal.length > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-black tracking-wider uppercase text-rose-400 flex items-center gap-1.5">
              <span>📍</span> {t("localEventsTitle")} ({filteredLocal.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredLocal.map(locEv => {
                const status = getEventStatus(locEv.start, locEv.end);
                return (
                  <div
                    key={locEv.id}
                    className="bg-gradient-to-br from-dark-800 via-dark-800 to-rose-950/30 border border-rose-500/40 rounded-2xl p-4 flex flex-col justify-between shadow-xl"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          {locEv.country}
                        </span>
                        {renderBadge(status)}
                      </div>
                      <h4 className="text-base font-bold text-white mb-1">{locEv.name}</h4>
                      <div className="text-xs text-amber-300/90 font-medium mb-3">📍 {locEv.locationName}</div>

                      <div className="text-xs text-slate-300 mb-4 bg-dark-900/60 p-3 rounded-xl border border-slate-800 leading-relaxed">
                        {locEv.details}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-700/60 flex justify-between items-center text-[11px]">
                      <span className="text-slate-400">
                        {formatEventDate(locEv.start)} — {formatEventDate(locEv.end)}
                      </span>
                      <button
                        onClick={() => onGoToLocation(locEv.coords.lat, locEv.coords.lng)}
                        className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-3 py-1.5 rounded-lg font-bold text-xs transition shadow-md shadow-amber-500/10"
                      >
                        {t("goToMap")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Глобальні події */}
        {typeFilter !== "local" && (
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-black tracking-wider uppercase text-slate-400">
              {t("globalEventsTitle")} ({filteredGlobal.length})
            </h3>

            {loading ? (
              <div className="py-20 text-center text-slate-400 flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
                <span>{t("loadingSchedule")}</span>
              </div>
            ) : filteredGlobal.length === 0 ? (
              <div className="py-16 text-center text-slate-500 bg-dark-800/40 rounded-2xl border border-slate-800 text-sm">
                {t("noEventsFound")}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredGlobal.map((item, idx) => {
                  const status = getEventStatus(item.start, item.end);
                  const imgUrl = item.image || item.headerImage || (item.extraData && item.extraData.imageUrl);

                  return (
                    <div
                      key={idx}
                      className="bg-dark-800/90 border border-slate-700/80 rounded-2xl overflow-hidden flex flex-col justify-between hover:border-slate-500 transition shadow-lg group"
                    >
                      <div>
                        {imgUrl ? (
                          <div className="w-full h-36 bg-dark-950 overflow-hidden relative border-b border-slate-700/50">
                            <img
                              src={imgUrl}
                              alt={item.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                              referrerPolicy="no-referrer"
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                            <div className="absolute top-2.5 right-2.5">
                              {renderBadge(status)}
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 pb-0 flex justify-end">
                            {renderBadge(status)}
                          </div>
                        )}

                        <div className="p-4">
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                            {item.eventType || "Event"}
                          </span>
                          <h3 className="text-base font-bold text-white my-2 leading-snug group-hover:text-amber-400 transition">
                            {item.name}
                          </h3>
                          <div className="text-xs text-slate-300 line-clamp-3 leading-relaxed">
                            {item.details || (item.extraData && item.extraData.communityday && item.extraData.communityday.bonus) || "Special spawns & bonuses."}
                          </div>
                        </div>
                      </div>

                      <div className="p-3.5 bg-dark-900/60 border-t border-slate-700/60 flex flex-col gap-1 text-[11px]">
                        <div className="flex justify-between items-center text-slate-400">
                          <span>{t("start")}</span>
                          <span className="text-slate-200 font-medium">{formatEventDate(item.start)}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-400">
                          <span>{t("end")}</span>
                          <span className="text-slate-200 font-medium">{formatEventDate(item.end)}</span>
                        </div>
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

// ================= ВКЛАДКА ПОКЕДЕКСУ =================
// ================= ВКЛАДКА ПОКЕДЕКСУ З АВТО-КАРТИНКАМИ ТА КАСТОМНИМ ТЕГОМ ФОНУ =================
// ================= ВКЛАДКА ПОКЕДЕКСУ З ПОШУКОМ, ВАЛІДАЦІЄЮ ТА КОСТЮМАМИ =================
// ================= ВКЛАДКА ПОКЕДЕКСУ З ПОВНИМ АВТОПІДТЯГУВАННЯМ =================
// ================= ВКЛАДКА ПОКЕДЕКСУ З ГРУПУВАННЯМ ДУБЛІКАТІВ =================
function DexTab({ accounts, setAccounts, entries, setEntries, t }) {
  const [selectedAccount, setSelectedAccount] = useState("All");
  const [search, setSearch] = useState("");
  const [filterBgOnly, setFilterBgOnly] = useState(false);

  // Стан форми
  const [name, setName] = useState("");
  const [dexNo, setDexNo] = useState("");
  const [acc, setAcc] = useState(accounts[0] || "Main");
  const [isShiny, setIsShiny] = useState(true);
  const [activeModalItem, setActiveModalItem] = useState(null);
  // Теги фону та костюма
  const [hasBg, setHasBg] = useState(false);
  const [bgTag, setBgTag] = useState("");
  const [hasCostume, setHasCostume] = useState(false);
  const [costumeTag, setCostumeTag] = useState("");
  const [sizeTag, setSizeTag] = useState("None"); // "None", "XXL", "XXS"

  const [note, setNote] = useState("");
  const [newAccName, setNewAccName] = useState("");

  const POPULAR_MAP = {
    "bulbasaur": 1, "ivysaur": 2, "venusaur": 3,
    "charmander": 4, "charmeleon": 5, "charizard": 6,
    "squirtle": 7, "wartortle": 8, "blastoise": 9,
    "pikachu": 25, "raichu": 26,
    "eevee": 133, "vaporeon": 134, "jolteon": 135, "flareon": 136,
    "espeon": 196, "umbreon": 197,
    "mewtwo": 150, "mew": 151,
    "lugia": 249, "ho-oh": 250,
    "regice": 378, "regirock": 377, "registeel": 379,
    "kyogre": 382, "groudon": 383, "rayquaza": 384,
    "dialga": 483, "palkia": 484, "giratina": 487,
    "skiddo": 672, "gogoat": 673,
    "necrozma": 800, "zacian": 888, "zamazenta": 889
  };

  const handleNameChange = (val) => {
    setName(val);
    const clean = val.trim().toLowerCase();
    if (!clean) {
      setDexNo("");
      return;
    }
    if (POPULAR_MAP[clean]) {
      setDexNo(POPULAR_MAP[clean]);
      return;
    }
    if (clean.length >= 3) {
      fetch(`https://pokeapi.co/api/v2/pokemon/${clean}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.id) setDexNo(data.id);
        })
        .catch(() => {});
    }
  };

  const handleDexNoChange = (val) => {
    if (val === "") {
      setDexNo("");
      return;
    }
    const num = Math.max(1, parseInt(val, 10));
    setDexNo(num);

    fetch(`https://pokeapi.co/api/v2/pokemon/${num}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.name) {
          setName(data.name.charAt(0).toUpperCase() + data.name.slice(1));
        }
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
    if (trimmed && !accounts.includes(trimmed)) {
      setAccounts([...accounts, trimmed]);
      setNewAccName("");
    }
  };

  const renameAccount = (oldName) => {
    const newName = prompt(`Введи новий нік замість "${oldName}":`, oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;
    const cleanNew = newName.trim();
    if (accounts.includes(cleanNew)) {
      alert("Акаунт з таким ніком вже існує!");
      return;
    }
    setAccounts(accounts.map(a => a === oldName ? cleanNew : a));
    setEntries(entries.map(item => item.account === oldName ? { ...item, account: cleanNew } : item));
    if (acc === oldName) setAcc(cleanNew);
    if (selectedAccount === oldName) setSelectedAccount(cleanNew);
  };

  const deleteAccount = (nameToDelete) => {
    if (accounts.length <= 1) {
      alert("Має бути хоча б один акаунт!");
      return;
    }
    if (confirm(`Видалити акаунт "${nameToDelete}" та всіх його покемонів?`)) {
      setAccounts(accounts.filter(a => a !== nameToDelete));
      setEntries(entries.filter(item => item.account !== nameToDelete));
      if (acc === nameToDelete) setAcc(accounts.find(a => a !== nameToDelete) || "Main");
      if (selectedAccount === nameToDelete) setSelectedAccount("All");
    }
  };

  const addPokemon = (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newEntry = {
      id: Date.now(),
      account: acc,
      name: name.trim(),
      dexNo: dexNo ? parseInt(dexNo, 10) : "-",
      isShiny,
      bg: hasBg && bgTag.trim() ? bgTag.trim() : "None",
      costume: hasCostume && costumeTag.trim() ? costumeTag.trim() : "None",
      size: sizeTag !== "None" ? sizeTag : "None", // XXS або XXL
      note: note.trim()
    };

    setEntries([newEntry, ...entries]);
    setName("");
    setDexNo("");
    setHasBg(false);
    setBgTag("");
    setHasCostume(false);
    setCostumeTag("");
    setSizeTag("None");
    setNote("");
  };

  // Видалення одного конкретного екземпляра зі стопки
  const deleteSingleInstance = (id) => {
    setEntries(entries.filter(item => item.id !== id));
  };

  // ================= ЛОГІКА ГРУПУВАННЯ ОДНАКОВИХ ПОКЕМОНІВ =================
  const groupedList = React.useMemo(() => {
    const initialFiltered = entries.filter(item => {
      const matchesAcc = selectedAccount === "All" || item.account === selectedAccount;
      const query = search.trim().toLowerCase();
      const matchesSearch = query === "" ||
        (item.name && item.name.toLowerCase().includes(query)) ||
        (item.dexNo && item.dexNo.toString().includes(query)) ||
        (item.bg && item.bg !== "None" && item.bg.toLowerCase().includes(query)) ||
        (item.costume && item.costume !== "None" && item.costume.toLowerCase().includes(query)) ||
        (item.size && item.size !== "None" && item.size.toLowerCase().includes(query)) ||
        (item.note && item.note.toLowerCase().includes(query));

      const matchesBg = !filterBgOnly || (item.bg && item.bg !== "None");
      return matchesAcc && matchesSearch && matchesBg;
    });

    // Групуємо суворо по виду: Name + DexNo + Shiny
    const groups = {};
    initialFiltered.forEach(item => {
      const groupKey = `${item.name}_${item.dexNo}_${item.isShiny}`.toLowerCase();
      
      if (!groups[groupKey]) {
        groups[groupKey] = {
          name: item.name,
          dexNo: item.dexNo,
          isShiny: item.isShiny,
          totalCount: 0,
          variants: [] // зберігаємо всі копії разом із їхніми фонами, костюмами і ніками
        };
      }

      groups[groupKey].totalCount += 1;
      groups[groupKey].variants.push(item);
    });

    return Object.values(groups);
  }, [entries, selectedAccount, search, filterBgOnly]);

  return (
    <div className="h-full flex bg-dark-900">
      
      {/* Ліва панель форми */}
      <div className="w-96 bg-dark-800 border-r border-slate-700 p-5 overflow-y-auto flex flex-col gap-6">
        <div>
          <h2 className="text-base font-bold text-amber-400 mb-3">{t("addToDex")}</h2>
          <form onSubmit={addPokemon} className="flex flex-col gap-3 text-xs">
            
            <div>
              <label className="text-slate-400 mb-1 block">{t("account")}</label>
              <select
                value={acc}
                onChange={e => setAcc(e.target.value)}
                className="w-full bg-dark-700 border border-slate-600 rounded p-2 text-slate-100"
              >
                {accounts.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="text-slate-400 mb-1 block">{t("pokeName")}</label>
                <input
                  type="text"
                  placeholder="Pikachu, Rayquaza..."
                  value={name}
                  onChange={e => handleNameChange(e.target.value)}
                  className="w-full bg-dark-700 border border-slate-600 rounded p-2 text-slate-100"
                  required
                />
              </div>
              <div>
                <label className="text-slate-400 mb-1 block">{t("dexNo")}</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="25"
                  value={dexNo}
                  onChange={e => handleDexNoChange(e.target.value)}
                  onKeyDown={e => { if (e.key === "-" || e.key === "e") e.preventDefault(); }}
                  className="w-full bg-dark-700 border border-slate-600 rounded p-2 text-slate-100 font-mono"
                />
              </div>
            </div>

            {dexNo && parseInt(dexNo, 10) > 0 && (
              <div className="flex items-center gap-3 bg-dark-900/60 p-2 rounded-xl border border-slate-700/60">
                <img
                  src={getSpriteUrl(dexNo, isShiny)}
                  alt="preview"
                  className="w-12 h-12 object-contain"
                  onError={(e) => {
                    e.target.src = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png";
                  }}
                />
                <div className="text-[11px] text-slate-400">
                  <span className="text-slate-200 font-semibold">{name || `№${dexNo}`}</span>
                  <div>{isShiny ? "✨ Шайні версія" : "Звичайна версія"}</div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 py-1">
              <input
                type="checkbox"
                id="shinyCb"
                checked={isShiny}
                onChange={e => setIsShiny(e.target.checked)}
                className="w-4 h-4 rounded text-amber-500 bg-dark-700 border-slate-600 focus:ring-0 cursor-pointer"
              />
              <label htmlFor="shinyCb" className="font-semibold text-amber-300 cursor-pointer select-none">
                {t("isShinyLabel")}
              </label>
            </div>

            <div className="bg-dark-900/50 p-2.5 rounded-xl border border-slate-700/70 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="hasBgCb"
                  checked={hasBg}
                  onChange={e => setHasBg(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-500 bg-dark-700 border-slate-600 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="hasBgCb" className="text-slate-200 font-medium cursor-pointer select-none">
                  Має фон (Location / Special Card)
                </label>
              </div>

              {hasBg && (
                <div className="mt-1">
                  <input
                    type="text"
                    placeholder="Назва фону (напр. Seoul, Wormhole)..."
                    value={bgTag}
                    onChange={e => setBgTag(e.target.value)}
                    className="w-full bg-dark-700 border border-indigo-500/50 rounded p-2 text-indigo-200 placeholder-slate-500"
                    autoFocus
                  />
                </div>
              )}
            </div>

            <div className="bg-dark-900/50 p-2.5 rounded-xl border border-slate-700/70 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="hasCostumeCb"
                  checked={hasCostume}
                  onChange={e => setHasCostume(e.target.checked)}
                  className="w-4 h-4 rounded text-pink-500 bg-dark-700 border-slate-600 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="hasCostumeCb" className="text-slate-200 font-medium cursor-pointer select-none">
                  Має костюм / скін (Costume)
                </label>
              </div>

              {hasCostume && (
                <div className="mt-1">
                  <input
                    type="text"
                    placeholder="Назва скіна (напр. Hanbok, Goggles)..."
                    value={costumeTag}
                    onChange={e => setCostumeTag(e.target.value)}
                    className="w-full bg-dark-700 border border-pink-500/50 rounded p-2 text-pink-200 placeholder-slate-500"
                    autoFocus
                  />
                </div>
              )}
            </div>

            <div>
              <label className="text-slate-400 mb-1 block">{t("noteLabel")}</label>
              <input
                type="text"
                placeholder="Lucky / IV 100% / Trade"
                value={note}
                onChange={e => setNote(e.target.value)}
                className="w-full bg-dark-700 border border-slate-600 rounded p-2 text-slate-100"
              />
            </div>

            <button
              type="submit"
              className="mt-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold py-2 rounded transition shadow-md shadow-amber-500/20"
            >
              {t("saveBtn")}
            </button>
          </form>
        </div>

        {/* Менеджер акаунтів */}
        <div className="border-t border-slate-700 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{t("accountManager")}</h3>
          
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              placeholder="Додати нік..."
              value={newAccName}
              onChange={e => setNewAccName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addAccount(); } }}
              className="flex-1 bg-dark-700 border border-slate-600 rounded p-1.5 text-xs text-slate-100 placeholder-slate-500"
            />
            <button
              type="button"
              onClick={addAccount}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-3 py-1.5 rounded text-xs font-bold transition"
            >
              +
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            {accounts.map(a => (
              <div 
                key={a} 
                className="flex items-center justify-between bg-dark-700/80 px-2.5 py-1.5 rounded-lg border border-slate-600/80 text-xs"
              >
                <span className="font-semibold text-slate-200 truncate mr-2">{a}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => renameAccount(a)}
                    className="p-1 text-slate-400 hover:text-amber-400 transition"
                    title="Перейменувати"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteAccount(a)}
                    className="p-1 text-slate-400 hover:text-rose-400 font-bold transition text-sm leading-none"
                    title="Видалити"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Права частина: сітка карток */}
      <div className="flex-1 p-6 flex flex-col gap-4 overflow-hidden">
        
        <div className="flex flex-wrap items-center justify-between gap-4 bg-dark-800 p-3 rounded-lg border border-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{t("account")}:</span>
            <button
              onClick={() => setSelectedAccount("All")}
              className={`text-xs px-2.5 py-1 rounded ${selectedAccount === "All" ? "bg-amber-500 text-slate-900 font-bold" : "bg-dark-700 text-slate-300"}`}
            >
              {t("allFilter")}
            </button>
            {accounts.map(a => (
              <button
                key={a}
                onClick={() => setSelectedAccount(a)}
                className={`text-xs px-2.5 py-1 rounded ${selectedAccount === a ? "bg-amber-500 text-slate-900 font-bold" : "bg-dark-700 text-slate-300"}`}
              >
                {a}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filterBgOnly}
                onChange={e => setFilterBgOnly(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-amber-500 bg-dark-700 border-slate-600"
              />
              {t("bgOnlyFilter")}
            </label>
            <input
              type="text"
              placeholder="Пошук (ім'я, №, фон, скін)..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-dark-700 border border-slate-600 rounded px-3 py-1 text-xs text-slate-100 w-56"
            />
          </div>
        </div>

        {/* Компактна сітка (по 5-6 карток у ряд замість 3-4 велетнів) */}
        {/* Сітка карток (клік відкриває попап) */}
        <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 pr-2 content-start select-none">
          {groupedList.map(item => (
            <div
              key={`${item.name}_${item.dexNo}_${item.isShiny}`}
              onClick={() => setActiveModalItem(item)}
              className={`rounded-2xl p-2.5 flex flex-col justify-between relative cursor-pointer border transition-all duration-150 group hover:-translate-y-0.5 ${
                item.isShiny
                  ? "bg-gradient-to-b from-slate-800/90 via-dark-800 to-dark-950 border-amber-500/40 hover:border-amber-400 hover:shadow-[0_0_15px_rgba(245,158,11,0.25)]"
                  : "bg-dark-800/90 border-slate-700/80 hover:border-slate-500 hover:shadow-md"
              }`}
            >
              {/* Шапка: Кількість і № Дексу */}
              <div className="flex justify-between items-center text-[10px]">
                <span className="bg-amber-500 text-slate-950 font-black px-1.5 py-0.2 rounded-md shadow-xs">
                  ×{item.totalCount}
                </span>
                {item.dexNo !== "-" && (
                  <span className="text-slate-400 font-mono font-semibold">
                    #{String(item.dexNo).padStart(3, "0")}
                  </span>
                )}
              </div>

              {/* Великий спрайт */}
              <div className="w-full h-24 flex items-center justify-center relative my-1">
                <img
                  src={getSpriteUrl(item.dexNo, item.isShiny)}
                  alt={item.name}
                  className="max-h-full max-w-full object-contain filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)] group-hover:scale-110 transition duration-150"
                  loading="lazy"
                  onError={(e) => {
                    e.target.src = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png";
                  }}
                />
                {item.isShiny && (
                  <span className="absolute bottom-0 right-1 text-xs">✨</span>
                )}
              </div>

              {/* Назва покемона */}
              <div className="text-center pt-1 border-t border-slate-700/50">
                <div className="text-xs font-black text-white truncate capitalize tracking-wide">
                  {item.name}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Надійне модальне віконце деталей (з'являється по кліку на картку) */}
        {/* Модальне вікно деталей з повною назвою та персональними нотатками */}
        {activeModalItem && (
          <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4"
            onClick={() => setActiveModalItem(null)}
          >
            <div 
              className="bg-dark-900 border border-slate-700 rounded-2xl p-4 w-full max-w-md shadow-2xl flex flex-col gap-3 relative"
              onClick={e => e.stopPropagation()}
            >
              {/* Шапка вікна */}
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-white capitalize">{activeModalItem.name}</h3>
                  {activeModalItem.isShiny && <span className="text-amber-400 text-sm">✨</span>}
                  <span className="text-slate-500 text-xs font-mono">#{activeModalItem.dexNo}</span>
                </div>
                <button
                  onClick={() => setActiveModalItem(null)}
                  className="text-slate-400 hover:text-white font-bold text-lg leading-none p-1 transition"
                >
                  ✕
                </button>
              </div>

              {/* Список екземплярів */}
              <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
                {entries
                  .filter(e => 
                    e.name.toLowerCase() === activeModalItem.name.toLowerCase() && 
                    e.dexNo === activeModalItem.dexNo && 
                    e.isShiny === activeModalItem.isShiny
                  )
                  .map(v => (
                    <div
                      key={v.id}
                      className="bg-dark-800 border border-slate-700/80 rounded-xl p-2.5 flex flex-col gap-1.5 shadow-sm"
                    >
                      {/* Верхній рядок: нік, бейджі та кнопка видалення */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-amber-400 font-bold text-xs tracking-wide shrink-0">
                          {v.account}
                        </span>

                        <div className="flex flex-wrap items-center justify-end gap-1.5 flex-1">
                          {v.bg && v.bg !== "None" && (
                            <span className="bg-indigo-950 text-indigo-300 border border-indigo-500/40 px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 whitespace-nowrap">
                              🌄 {v.bg}
                            </span>
                          )}
                          {v.costume && v.costume !== "None" && (
                            <span className="bg-pink-950 text-pink-300 border border-pink-500/40 px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 whitespace-nowrap">
                              🎀 {v.costume}
                            </span>
                          )}

                          <button
                            onClick={() => {
                              deleteSingleInstance(v.id);
                              // Якщо видалили останній екземпляр з бази
                              const remaining = entries.filter(e => 
                                e.name.toLowerCase() === activeModalItem.name.toLowerCase() && 
                                e.dexNo === activeModalItem.dexNo && 
                                e.isShiny === activeModalItem.isShiny &&
                                e.id !== v.id
                              );
                              if (remaining.length === 0) {
                                setActiveModalItem(null);
                              }
                            }}
                            className="bg-slate-700/60 hover:bg-rose-600/80 text-slate-300 hover:text-white rounded-md p-1 font-bold text-xs transition leading-none ml-1 shrink-0"
                            title="Видалити саме цей екземпляр"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {/* Нотатка прив'язана чітко до цього екземпляра */}
                      {v.note && (
                        <div className="bg-dark-900/80 text-slate-300 text-[11px] px-2 py-1 rounded border border-slate-700/50 flex items-center gap-1.5">
                          <span className="text-slate-400 shrink-0">💬</span>
                          <span className="font-medium text-amber-200/90">{v.note}</span>
                        </div>
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

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);