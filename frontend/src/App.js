import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";

const API = "http://localhost:8000";

const SOURCES = [
  { id: "igod",       name: "IGOD Portal",          icon: "🏛️", color: "#f97316", url: "https://igod.gov.in/sg/RJ/SPMA/organizations",         desc: "Govt Online Directory" },
  { id: "rajras",     name: "RajRAS Schemes",        icon: "📋", color: "#3b82f6", url: "https://rajras.in/ras/pre/rajasthan/adm/schemes/",       desc: "Rajasthan Scheme Index" },
  { id: "jansoochna", name: "Jan Soochna Portal",    icon: "👁️", color: "#10b981", url: "https://jansoochna.rajasthan.gov.in/Scheme",             desc: "Transparency & RTI" },
  { id: "myscheme",   name: "MyScheme Rajasthan",    icon: "🔍", color: "#8b5cf6", url: "https://www.myscheme.gov.in/search/state/Rajasthan",     desc: "National Scheme Finder" },
];

const CATEGORY_COLORS = [
  "#f97316","#3b82f6","#10b981","#8b5cf6","#ef4444",
  "#f59e0b","#06b6d4","#84cc16","#ec4899","#14b8a6",
  "#6366f1","#a855f7","#f43f5e","#0ea5e9","#22c55e",
];

// ── Utilities ─────────────────────────────────────────────────────────────────

function timeAgo(isoStr) {
  if (!isoStr) return "—";
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diff < 10) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  return `${Math.floor(diff/3600)}h ago`;
}

function formatNum(n) {
  if (!n && n !== 0) return "—";
  if (n >= 1e7) return (n/1e7).toFixed(1) + " Cr";
  if (n >= 1e5) return (n/1e5).toFixed(1) + " L";
  if (n >= 1000) return (n/1000).toFixed(1) + "K";
  return String(n);
}

// ── Components ────────────────────────────────────────────────────────────────

function StatusDot({ status, animated }) {
  const colors = { ok:"#10b981", error:"#ef4444", loading:"#f59e0b", idle:"#94a3b8", not_scraped:"#94a3b8" };
  return (
    <span style={{
      display:"inline-block", width:8, height:8, borderRadius:"50%",
      background: colors[status] || "#94a3b8", flexShrink:0,
      boxShadow: status==="ok" ? "0 0 0 2px #d1fae5" : "none",
      animation: animated ? "pulse 1s infinite" : "none",
    }} />
  );
}

function Badge({ label, color="#6366f1" }) {
  return (
    <span style={{
      background: color+"18", color, border:`1px solid ${color}30`,
      borderRadius:5, padding:"2px 8px", fontSize:11, fontWeight:600, whiteSpace:"nowrap",
    }}>{label}</span>
  );
}

function SkeletonCard() {
  return (
    <div style={{ background:"white", borderRadius:12, padding:16, border:"1px solid #e2e8f0" }}>
      <div className="skeleton" style={{ height:14, width:"60%", marginBottom:8 }} />
      <div className="skeleton" style={{ height:11, width:"90%", marginBottom:5 }} />
      <div className="skeleton" style={{ height:11, width:"70%" }} />
    </div>
  );
}

function SourceCard({ source, status, data, onScrape, isLoading }) {
  const count = data?.length || 0;
  return (
    <div style={{
      background:"white", borderRadius:14, padding:18, border:"1.5px solid #e2e8f0",
      borderLeft:`4px solid ${source.color}`, transition:"box-shadow 0.2s",
      boxShadow: isLoading ? `0 0 20px ${source.color}25` : "0 1px 4px rgba(0,0,0,0.06)",
    }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
        <div style={{
          width:44, height:44, borderRadius:10,
          background:`${source.color}15`, display:"flex",
          alignItems:"center", justifyContent:"center", fontSize:22,
        }}>{source.icon}</div>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:800, fontSize:14, color:"#0f172a" }}>{source.name}</div>
          <div style={{ fontSize:11, color:"#64748b" }}>{source.desc}</div>
        </div>
        <StatusDot status={isLoading ? "loading" : status} animated={isLoading} />
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
        {[
          { label:"Items Scraped", value: count ? formatNum(count) : "—" },
          { label:"Status", value: isLoading ? "Scraping…" : status === "ok" ? "Live" : status === "error" ? "Error" : "Pending" },
        ].map((s,i) => (
          <div key={i} style={{ background:"#f8fafc", borderRadius:8, padding:"8px 10px" }}>
            <div style={{ fontSize:18, fontWeight:900, color: source.color }}>{s.value}</div>
            <div style={{ fontSize:10, color:"#94a3b8", marginTop:2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
        <button onClick={() => onScrape(source.id)} disabled={isLoading} style={{
          background: isLoading ? "#e2e8f0" : source.color, color: isLoading ? "#94a3b8" : "white",
          border:"none", borderRadius:8, padding:"7px 14px",
          fontWeight:700, fontSize:12, flex:1,
          display:"flex", alignItems:"center", justifyContent:"center", gap:6,
        }}>
          <span className={isLoading ? "spin" : ""} style={{ fontSize:13 }}>
            {isLoading ? "⟳" : "⚡"}
          </span>
          {isLoading ? "Scraping…" : "Scrape Now"}
        </button>
        <a href={source.url} target="_blank" rel="noreferrer" style={{
          background:"#f1f5f9", border:"1px solid #e2e8f0",
          borderRadius:8, padding:"7px 11px", fontSize:12, color:"#64748b", fontWeight:600,
        }}>↗ Visit</a>
      </div>
    </div>
  );
}

function SchemeRow({ item, color }) {
  return (
    <div style={{
      display:"flex", alignItems:"flex-start", gap:10,
      padding:"10px 0", borderBottom:"1px solid #f1f5f9",
    }}>
      <div style={{ width:7, height:7, borderRadius:"50%", background:color, marginTop:5, flexShrink:0 }} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:600, fontSize:13, color:"#0f172a", marginBottom:2 }}>
          {item.name || item.portal_name || "—"}
        </div>
        <div style={{ fontSize:11, color:"#64748b", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {item.description || item.url || ""}
        </div>
      </div>
      <Badge label={item.category || "General"} color={color} />
    </div>
  );
}

function LogPanel({ logs }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = 0; }, [logs]);
  return (
    <div ref={ref} style={{
      background:"#0f172a", borderRadius:12, padding:16, fontFamily:"monospace",
      fontSize:12, minHeight:260, maxHeight:400, overflowY:"auto", lineHeight:1.7,
    }}>
      {logs.length === 0
        ? <span style={{ color:"#475569" }}>No activity yet. Click "Scrape All" to begin.</span>
        : logs.map((l,i) => (
          <div key={i} style={{ color: l.type==="ok"?"#86efac": l.type==="error"?"#fca5a5": l.type==="info"?"#fde68a":"#94a3b8" }}>
            {l.text}
          </div>
        ))
      }
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [statuses, setStatuses] = useState({});   // source_id → {status, scraped_at, count}
  const [allData, setAllData] = useState({});      // source_id → array of items
  const [scraping, setScraping] = useState({});    // source_id → bool
  const [scrapingAll, setScrapingAll] = useState(false);
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [backendOnline, setBackendOnline] = useState(null);

  const addLog = useCallback((text, type="info") => {
    setLogs(prev => [{ text: `${new Date().toLocaleTimeString()} — ${text}`, type }, ...prev].slice(0,50));
  }, []);

  // Check backend health on mount
  useEffect(() => {
    axios.get(`${API}/`)
      .then(() => { setBackendOnline(true); addLog("✅ Backend connected at localhost:8000", "ok"); })
      .catch(() => { setBackendOnline(false); addLog("❌ Backend not running! Start it with: uvicorn main:app --reload", "error"); });
  }, [addLog]);

  // Poll status every 5s
  useEffect(() => {
    const poll = () => {
      axios.get(`${API}/status`).then(r => setStatuses(r.data.sources || {})).catch(() => {});
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  const fetchData = useCallback(async (sourceId) => {
    try {
      const r = await axios.get(`${API}/data/${sourceId}`);
      setAllData(prev => ({ ...prev, [sourceId]: r.data.data || [] }));
    } catch {}
  }, []);

  const scrapeOne = useCallback(async (sourceId) => {
    setScraping(s => ({ ...s, [sourceId]: true }));
    const src = SOURCES.find(s => s.id === sourceId);
    addLog(`⚡ Scraping ${src?.name}…`);
    try {
      const r = await axios.post(`${API}/scrape/${sourceId}`);
      const count = r.data.data?.length || 0;
      addLog(`✅ ${src?.name} — ${count} items scraped`, "ok");
      await fetchData(sourceId);
      setStatuses(prev => ({ ...prev, [sourceId]: { status:"ok", count, scraped_at: new Date().toISOString() } }));
    } catch (e) {
      addLog(`❌ ${src?.name} — ${e.response?.data?.detail || e.message}`, "error");
      setStatuses(prev => ({ ...prev, [sourceId]: { ...prev[sourceId], status:"error" } }));
    }
    setScraping(s => ({ ...s, [sourceId]: false }));
  }, [addLog, fetchData]);

  const scrapeAll = useCallback(async () => {
    setScrapingAll(true);
    addLog("🚀 Starting full scrape of all 4 sources in parallel…");
    try {
      const r = await axios.post(`${API}/scrape/all`);
      const results = r.data.results || {};
      Object.entries(results).forEach(([id, res]) => {
        const src = SOURCES.find(s => s.id === id);
        if (res.status === "ok") addLog(`✅ ${src?.name} — ${res.count} items`, "ok");
        else addLog(`❌ ${src?.name} — failed`, "error");
      });
      // Fetch all data
      await Promise.all(SOURCES.map(s => fetchData(s.id)));
      addLog("🎉 All sources scraped!", "ok");
    } catch (e) {
      addLog(`❌ Scrape all failed: ${e.message}`, "error");
    }
    setScrapingAll(false);
  }, [addLog, fetchData]);

  const refresh = useCallback(async () => {
    addLog("🔄 Refreshing all data…");
    await Promise.all(SOURCES.map(s => fetchData(s.id)));
    addLog("✅ Data refreshed", "ok");
  }, [addLog, fetchData]);

  // Aggregate data
  const totalItems = Object.values(allData).reduce((sum, arr) => sum + (arr?.length || 0), 0);
  const doneCount = Object.values(statuses).filter(s => s.status === "ok").length;
  const allItems = SOURCES.flatMap(src =>
    (allData[src.id] || []).map(item => ({ ...item, _source: src }))
  );

  // Category distribution for chart
  const categoryMap = {};
  allItems.forEach(item => {
    const cat = item.category || "General";
    categoryMap[cat] = (categoryMap[cat] || 0) + 1;
  });
  const categoryData = Object.entries(categoryMap)
    .sort((a,b) => b[1]-a[1]).slice(0,10)
    .map(([name, count]) => ({ name, count }));

  // Source distribution
  const sourceData = SOURCES.map(src => ({
    name: src.name.split(" ")[0],
    count: allData[src.id]?.length || 0,
    color: src.color,
  }));

  // Filtered items
  const filteredItems = allItems.filter(item => {
    const matchFilter = filter === "all" || item._source.id === filter;
    const matchSearch = !search || (item.name || "").toLowerCase().includes(search.toLowerCase())
      || (item.category || "").toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const allCategories = [...new Set(allItems.map(i => i.category).filter(Boolean))].sort();
  const lastScrapeTime = Object.values(statuses)
    .map(s => s.scraped_at).filter(Boolean).sort().reverse()[0];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display:"flex", flexDirection:"column", minHeight:"100vh" }}>

      {/* ── Header ── */}
      <header style={{
        background:"white", borderBottom:"1px solid #e2e8f0",
        position:"sticky", top:0, zIndex:100,
        boxShadow:"0 1px 8px rgba(0,0,0,0.06)",
      }}>
        {/* Top bar */}
        <div style={{ display:"flex", alignItems:"center", gap:14, padding:"10px 24px" }}>
          <div style={{
            width:44, height:44, borderRadius:10, background:"#f97316",
            display:"flex", alignItems:"center", justifyContent:"center",
            color:"white", fontWeight:900, fontSize:17, letterSpacing:-0.5,
          }}>AI</div>
          <div>
            <div style={{ fontWeight:800, fontSize:15, color:"#0f172a" }}>AI Chief of Staff</div>
            <div style={{ fontSize:10, color:"#94a3b8", letterSpacing:"0.06em" }}>
              OFFICE OF CM · RAJASTHAN · LIVE DATA
            </div>
          </div>

          <div style={{ flex:1 }} />

          {/* Backend status */}
          <div style={{
            display:"flex", alignItems:"center", gap:6,
            background: backendOnline===null?"#f8fafc": backendOnline?"#f0fdf4":"#fef2f2",
            border:`1px solid ${backendOnline===null?"#e2e8f0": backendOnline?"#bbf7d0":"#fecaca"}`,
            borderRadius:8, padding:"6px 12px", fontSize:12,
          }}>
            <StatusDot status={backendOnline===null?"idle": backendOnline?"ok":"error"} />
            <span style={{ fontWeight:600, color: backendOnline?"#166534":"#991b1b" }}>
              {backendOnline===null?"Checking…": backendOnline?"Backend Online":"Backend Offline"}
            </span>
          </div>

          {/* Scrape All */}
          <button onClick={scrapeAll} disabled={scrapingAll || !backendOnline} style={{
            background: scrapingAll||!backendOnline ? "#e2e8f0" : "#f97316",
            color: scrapingAll||!backendOnline ? "#94a3b8" : "white",
            border:"none", borderRadius:10, padding:"10px 22px",
            fontWeight:800, fontSize:13, display:"flex", alignItems:"center", gap:8,
            boxShadow: backendOnline&&!scrapingAll ? "0 3px 12px #f9731640" : "none",
            transition:"all 0.2s",
          }}>
            <span className={scrapingAll?"spin":""} style={{ fontSize:15 }}>⚡</span>
            {scrapingAll ? "Scraping…" : "Scrape All"}
          </button>

          {/* Refresh */}
          <button onClick={refresh} disabled={scrapingAll||!backendOnline} style={{
            background:"white", color:"#3b82f6",
            border:"1.5px solid #3b82f6", borderRadius:10,
            padding:"10px 18px", fontWeight:700, fontSize:13,
            display:"flex", alignItems:"center", gap:6, transition:"all 0.2s",
          }}>
            <span className={scrapingAll?"spin":""}>🔄</span> Refresh
          </button>

          {/* CM card */}
          <div style={{ textAlign:"right", paddingLeft:8, borderLeft:"1px solid #e2e8f0" }}>
            <div style={{ fontWeight:700, fontSize:13 }}>Bhajan Lal Sharma</div>
            <div style={{ fontSize:11, color:"#64748b" }}>Chief Minister, Rajasthan</div>
          </div>
        </div>

        {/* Source status strip */}
        <div style={{ display:"flex", gap:6, padding:"6px 24px", background:"#fafafa", overflowX:"auto" }}>
          {SOURCES.map(src => {
            const st = statuses[src.id] || {};
            return (
              <div key={src.id} style={{
                display:"flex", alignItems:"center", gap:6,
                background: st.status==="ok" ? src.color+"10" : "#f1f5f9",
                border:`1px solid ${st.status==="ok" ? src.color+"30" : "#e2e8f0"}`,
                borderRadius:6, padding:"4px 10px", fontSize:11, whiteSpace:"nowrap",
              }}>
                <StatusDot status={scraping[src.id]?"loading":st.status||"idle"} animated={!!scraping[src.id]} />
                <span style={{ fontWeight:600, color:"#374151" }}>{src.icon} {src.name}</span>
                {st.count > 0 && <span style={{ color:src.color, fontWeight:700 }}>{st.count}</span>}
                {st.scraped_at && <span style={{ color:"#94a3b8" }}>{timeAgo(st.scraped_at)}</span>}
              </div>
            );
          })}
          {lastScrapeTime && (
            <div style={{ marginLeft:"auto", fontSize:11, color:"#94a3b8", alignSelf:"center" }}>
              Last scrape: {new Date(lastScrapeTime).toLocaleTimeString()}
            </div>
          )}
        </div>

        {/* Nav tabs */}
        <div style={{ display:"flex", padding:"0 24px", borderTop:"1px solid #f1f5f9" }}>
          {[
            { id:"dashboard", label:"Dashboard",  icon:"◉" },
            { id:"schemes",   label:`Schemes ${totalItems>0?`(${totalItems})`:""}`, icon:"⊞" },
            { id:"sources",   label:"Sources",    icon:"⚡" },
            { id:"charts",    label:"Analytics",  icon:"📊" },
            { id:"log",       label:`Live Log${logs.length>0?` (${logs.length})`:""}`, icon:"📡" },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background:"transparent", border:"none",
              borderBottom: tab===t.id ? "2.5px solid #f97316" : "2.5px solid transparent",
              padding:"10px 16px", fontWeight: tab===t.id ? 700 : 500,
              color: tab===t.id ? "#f97316" : "#64748b",
              fontSize:13, display:"flex", alignItems:"center", gap:5,
              transition:"all 0.15s",
            }}>
              <span style={{ fontSize:11 }}>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── Main Content ── */}
      <main style={{ flex:1, padding:"22px 24px", maxWidth:1200, margin:"0 auto", width:"100%" }}>

        {/* Backend offline warning */}
        {backendOnline === false && (
          <div style={{
            background:"#fef2f2", border:"1px solid #fecaca", borderRadius:12,
            padding:"14px 18px", marginBottom:18, display:"flex", gap:12, alignItems:"flex-start",
          }}>
            <span style={{ fontSize:22 }}>⚠️</span>
            <div>
              <div style={{ fontWeight:700, color:"#991b1b", fontSize:14, marginBottom:4 }}>
                Backend Not Running
              </div>
              <div style={{ color:"#7f1d1d", fontSize:13, lineHeight:1.6 }}>
                Start the Python backend first:
                <br /><code style={{ background:"#fee2e2", padding:"2px 6px", borderRadius:4, marginTop:4, display:"inline-block" }}>
                  cd backend &nbsp;→&nbsp; pip install -r requirements.txt &nbsp;→&nbsp; uvicorn main:app --reload
                </code>
              </div>
            </div>
          </div>
        )}

        {/* ── DASHBOARD TAB ── */}
        {tab === "dashboard" && (
          <div className="fade-up">
            <div style={{ marginBottom:20 }}>
              <h1 style={{ fontSize:30, fontWeight:900, marginBottom:4 }}>
                Namaste, <span style={{ color:"#f97316" }}>Mukhyamantri Ji</span> 🙏
              </h1>
              <p style={{ color:"#64748b", fontSize:13 }}>
                Live data from 4 official sources · IGOD · RajRAS · Jan Soochna · MyScheme.gov.in
              </p>
            </div>

            {/* Budget banner */}
            <div style={{
              background:"linear-gradient(135deg,#eff6ff,#f0fdf4)",
              border:"1px solid #bfdbfe", borderRadius:12,
              padding:"12px 18px", marginBottom:20, display:"flex", alignItems:"center", gap:12,
            }}>
              <span style={{ fontSize:22 }}>💰</span>
              <div>
                <span style={{ fontWeight:800, color:"#1d4ed8", fontSize:13 }}>Budget 2025-26: </span>
                <span style={{ color:"#374151", fontSize:13 }}>Revenue expenditure ₹3,25,546 Cr · Fiscal deficit 4.25% GSDP</span>
              </div>
              <div style={{ marginLeft:"auto", fontSize:12, color:"#64748b" }}>
                Target: $350 Bn economy by 2030 · First Green Budget of Rajasthan
              </div>
            </div>

            {/* KPI cards */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:22 }}>
              {[
                { label:"Total Schemes", value: totalItems || "—", icon:"📋", color:"#f97316" },
                { label:"Live Sources", value:`${doneCount}/4`, icon:"✅", color:"#10b981" },
                { label:"Categories", value: allCategories.length || "—", icon:"🗂️", color:"#3b82f6" },
                { label:"Last Refresh", value: lastScrapeTime ? timeAgo(lastScrapeTime) : "—", icon:"🕐", color:"#8b5cf6" },
              ].map((k,i) => (
                <div key={i} style={{
                  background:"white", borderRadius:14, padding:"16px 18px",
                  border:"1px solid #e2e8f0", boxShadow:"0 1px 4px rgba(0,0,0,0.05)",
                }}>
                  <div style={{ fontSize:24, marginBottom:8 }}>{k.icon}</div>
                  <div style={{ fontWeight:900, fontSize:26, color:k.color }}>{k.value}</div>
                  <div style={{ fontSize:12, color:"#64748b", marginTop:3 }}>{k.label}</div>
                </div>
              ))}
            </div>

            {/* Source cards grid */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:14, marginBottom:22 }}>
              {SOURCES.map(src => (
                <SourceCard
                  key={src.id} source={src}
                  status={statuses[src.id]?.status || "idle"}
                  data={allData[src.id]}
                  onScrape={scrapeOne}
                  isLoading={!!scraping[src.id]}
                />
              ))}
            </div>

            {/* Preview items from each source */}
            {SOURCES.filter(s => (allData[s.id]||[]).length > 0).map(src => (
              <div key={src.id} style={{
                background:"white", borderRadius:14, border:"1px solid #e2e8f0",
                padding:18, marginBottom:14, borderLeft:`4px solid ${src.color}`,
              }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                  <span style={{ fontSize:18 }}>{src.icon}</span>
                  <div style={{ fontWeight:800, fontSize:14, color:"#0f172a" }}>{src.name}</div>
                  <Badge label={`${(allData[src.id]||[]).length} items`} color={src.color} />
                  <Badge label={`Scraped ${timeAgo(statuses[src.id]?.scraped_at)}`} color="#64748b" />
                  <a href={src.url} target="_blank" rel="noreferrer"
                    style={{ marginLeft:"auto", fontSize:12, color:src.color, fontWeight:600 }}>
                    View Source ↗
                  </a>
                </div>
                {(allData[src.id] || []).slice(0,5).map((item,i) => (
                  <SchemeRow key={i} item={item} color={src.color} />
                ))}
                {(allData[src.id]||[]).length > 5 && (
                  <button onClick={() => setTab("schemes")} style={{
                    marginTop:10, background:"transparent", border:"none",
                    color:src.color, fontWeight:700, fontSize:12,
                  }}>
                    +{(allData[src.id]||[]).length - 5} more → View All Schemes
                  </button>
                )}
              </div>
            ))}

            {totalItems === 0 && backendOnline && (
              <div style={{
                background:"white", borderRadius:16, border:"2px dashed #e2e8f0",
                padding:56, textAlign:"center",
              }}>
                <div style={{ fontSize:52, marginBottom:14 }}>⚡</div>
                <div style={{ fontWeight:800, fontSize:20, color:"#0f172a", marginBottom:8 }}>
                  No data yet
                </div>
                <div style={{ color:"#64748b", marginBottom:22 }}>
                  Click <strong>Scrape All</strong> to fetch live data from all 4 official Rajasthan sources
                </div>
                <button onClick={scrapeAll} disabled={scrapingAll} style={{
                  background:"#f97316", color:"white", border:"none",
                  borderRadius:12, padding:"14px 32px", fontWeight:800, fontSize:15,
                  boxShadow:"0 4px 20px #f9731650",
                }}>
                  ⚡ Scrape All 4 Sources Now
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── SCHEMES TAB ── */}
        {tab === "schemes" && (
          <div className="fade-up">
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16, flexWrap:"wrap" }}>
              <h2 style={{ fontWeight:800, fontSize:20 }}>All Schemes</h2>

              {/* Search */}
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="🔍 Search schemes…"
                style={{
                  border:"1px solid #e2e8f0", borderRadius:8, padding:"7px 12px",
                  fontSize:13, width:220, outline:"none",
                }}
              />

              {/* Source filter */}
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {["all", ...SOURCES.map(s => s.id)].map(id => {
                  const src = SOURCES.find(s => s.id === id);
                  return (
                    <button key={id} onClick={() => setFilter(id)} style={{
                      background: filter===id ? (src?.color||"#0f172a") : "white",
                      color: filter===id ? "white" : "#374151",
                      border:`1px solid ${filter===id?(src?.color||"#0f172a"):"#e2e8f0"}`,
                      borderRadius:7, padding:"5px 12px", fontSize:12, fontWeight:600,
                    }}>{id==="all" ? "All Sources" : `${src.icon} ${src.name.split(" ")[0]}`}</button>
                  );
                })}
              </div>

              <div style={{ marginLeft:"auto", color:"#64748b", fontSize:13 }}>
                {filteredItems.length} of {totalItems} items
              </div>
            </div>

            {filteredItems.length === 0 && (
              <div style={{ textAlign:"center", padding:40, color:"#64748b" }}>
                {totalItems === 0 ? "No data yet — click Scrape All first" : "No results match your filter"}
              </div>
            )}

            {SOURCES.filter(s => filter==="all" || filter===s.id).map(src => {
              const items = filteredItems.filter(i => i._source.id === src.id);
              if (items.length === 0) return null;
              return (
                <div key={src.id} style={{
                  background:"white", borderRadius:14, border:"1px solid #e2e8f0",
                  padding:18, marginBottom:14, borderLeft:`4px solid ${src.color}`,
                }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                    <span>{src.icon}</span>
                    <span style={{ fontWeight:800, fontSize:14, color:src.color }}>{src.name}</span>
                    <Badge label={`${items.length} items`} color={src.color} />
                  </div>
                  {items.map((item,i) => <SchemeRow key={i} item={item} color={src.color} />)}
                </div>
              );
            })}
          </div>
        )}

        {/* ── SOURCES TAB ── */}
        {tab === "sources" && (
          <div className="fade-up">
            <h2 style={{ fontWeight:800, fontSize:20, marginBottom:16 }}>Scrape Sources</h2>
            <div style={{ display:"grid", gap:14 }}>
              {SOURCES.map(src => {
                const st = statuses[src.id] || {};
                const count = allData[src.id]?.length || 0;
                return (
                  <div key={src.id} style={{
                    background:"white", borderRadius:14, border:"1px solid #e2e8f0",
                    padding:20, display:"flex", gap:16, alignItems:"center",
                  }}>
                    <div style={{
                      width:56, height:56, borderRadius:12, fontSize:28,
                      background:`${src.color}15`, display:"flex", alignItems:"center", justifyContent:"center",
                    }}>{src.icon}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:800, fontSize:15, marginBottom:3 }}>{src.name}</div>
                      <div style={{ fontSize:12, color:"#64748b", marginBottom:5 }}>{src.desc}</div>
                      <div style={{ fontSize:11, color:"#94a3b8", fontFamily:"monospace", wordBreak:"break-all" }}>{src.url}</div>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:8 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <StatusDot status={scraping[src.id]?"loading":st.status||"idle"} animated={!!scraping[src.id]} />
                        <span style={{ fontSize:12, fontWeight:600, color:"#374151" }}>
                          {scraping[src.id] ? "Scraping…" : st.status==="ok" ? `${count} items` : st.status||"Not scraped"}
                        </span>
                      </div>
                      {st.scraped_at && <span style={{ fontSize:11, color:"#94a3b8" }}>{timeAgo(st.scraped_at)}</span>}
                      <div style={{ display:"flex", gap:8 }}>
                        <button onClick={() => scrapeOne(src.id)} disabled={!!scraping[src.id]||!backendOnline} style={{
                          background: scraping[src.id]||!backendOnline ? "#e2e8f0" : src.color,
                          color: scraping[src.id]||!backendOnline ? "#94a3b8" : "white",
                          border:"none", borderRadius:8, padding:"8px 18px", fontWeight:700, fontSize:13,
                        }}>
                          {scraping[src.id] ? "⟳ Scraping…" : "⚡ Scrape"}
                        </button>
                        <a href={src.url} target="_blank" rel="noreferrer" style={{
                          background:"#f1f5f9", border:"1px solid #e2e8f0",
                          borderRadius:8, padding:"8px 14px", fontSize:13, color:"#374151", fontWeight:600,
                        }}>↗ Open</a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── CHARTS TAB ── */}
        {tab === "charts" && (
          <div className="fade-up">
            <h2 style={{ fontWeight:800, fontSize:20, marginBottom:16 }}>Analytics</h2>

            {totalItems === 0 ? (
              <div style={{ textAlign:"center", padding:40, color:"#64748b" }}>
                No data yet — scrape sources first
              </div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18 }}>
                {/* Items per source */}
                <div style={{ background:"white", borderRadius:14, padding:20, border:"1px solid #e2e8f0" }}>
                  <div style={{ fontWeight:700, marginBottom:14 }}>Items per Source</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={sourceData} margin={{ top:0,right:10,left:-20,bottom:0 }}>
                      <XAxis dataKey="name" tick={{ fontSize:11 }} />
                      <YAxis tick={{ fontSize:11 }} />
                      <Tooltip />
                      <Bar dataKey="count" radius={[4,4,0,0]}>
                        {sourceData.map((s,i) => <Cell key={i} fill={s.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Category breakdown */}
                <div style={{ background:"white", borderRadius:14, padding:20, border:"1px solid #e2e8f0" }}>
                  <div style={{ fontWeight:700, marginBottom:14 }}>Top Categories</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={categoryData} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={9}>
                        {categoryData.map((_,i) => <Cell key={i} fill={CATEGORY_COLORS[i%CATEGORY_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Category list */}
                <div style={{ background:"white", borderRadius:14, padding:20, border:"1px solid #e2e8f0", gridColumn:"1/-1" }}>
                  <div style={{ fontWeight:700, marginBottom:14 }}>Category Breakdown</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                    {categoryData.map((cat,i) => (
                      <div key={i} style={{
                        display:"flex", alignItems:"center", gap:8,
                        background:"#f8fafc", borderRadius:8, padding:"8px 12px",
                      }}>
                        <div style={{ width:10,height:10,borderRadius:"50%", background:CATEGORY_COLORS[i%CATEGORY_COLORS.length], flexShrink:0 }} />
                        <span style={{ fontSize:12, flex:1, fontWeight:500 }}>{cat.name}</span>
                        <Badge label={String(cat.count)} color={CATEGORY_COLORS[i%CATEGORY_COLORS.length]} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── LOG TAB ── */}
        {tab === "log" && (
          <div className="fade-up">
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
              <h2 style={{ fontWeight:800, fontSize:20 }}>📡 Live Scrape Log</h2>
              <button onClick={() => setLogs([])} style={{
                background:"white", border:"1px solid #e2e8f0", borderRadius:7,
                padding:"5px 12px", fontSize:12, color:"#64748b",
              }}>Clear</button>
            </div>
            <LogPanel logs={logs} />
          </div>
        )}

      </main>

      {/* Footer */}
      <footer style={{
        borderTop:"1px solid #e2e8f0", background:"white",
        padding:"10px 24px", fontSize:11, color:"#94a3b8",
        display:"flex", justifyContent:"space-between",
      }}>
        <span>AI Chief of Staff · Office of Chief Minister, Rajasthan</span>
        <span>Sources: IGOD · RajRAS · Jan Soochna · MyScheme.gov.in</span>
      </footer>
    </div>
  );
}
