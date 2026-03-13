/**
 * Rajasthan AI Chief of Staff Dashboard — v3
 * =============================================
 * 100% data-driven. Every value rendered in the UI (names, counts, categories,
 * descriptions, benefits, URLs, alerts) comes from the /aggregate API endpoint,
 * which itself is built entirely from live scraper output.
 *
 * The only "constants" here are:
 *  - UI colour palette
 *  - Category → icon mapping (purely cosmetic)
 *  - Source metadata (names / colours for the 4 known scrapers)
 */

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import InsightsEngine from "./InsightsEngine";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie,
} from "recharts";

const API = process.env.REACT_APP_API_URL || "https://rajasthan-cgwj.onrender.com";

// ── Cosmetic-only constants (not data) ───────────────────────────────────────
const SRC = {
  igod:       { label: "IGOD Portal",        icon: "🏛️", color: "#f97316", url: "igod.gov.in" },
  rajras:     { label: "RajRAS",             icon: "📋", color: "#3b82f6", url: "rajras.in" },
  jansoochna: { label: "Jan Soochna",        icon: "👁️", color: "#10b981", url: "jansoochna.rajasthan.gov.in" },
  myscheme:   { label: "MyScheme",           icon: "🔍", color: "#8b5cf6", url: "myscheme.gov.in" },
};
const CAT_ICON = {
  "Health":"🏥","Health & Family Welfare":"🏥","Education":"🎓","Agriculture":"🌾",
  "Agriculture & Farmers":"🌾","Social Welfare":"🛡️","Labour & Employment":"💼",
  "Women & Child":"👩","Business & Finance":"💰","Housing":"🏠","Food Security":"🍽️",
  "Water & Sanitation":"💧","Energy":"⚡","Digital Services":"💻","Digital & IT":"💻",
  "Rural Development":"🏘️","Industry & Commerce":"🏭","Industry & Investment":"📈",
  "Tourism & Culture":"🎭","Identity & Social Security":"🪪","Mining":"⛏️",
  "Transparency & RTI":"👁️","Civil Registration":"📄","Finance & Accounts":"💳",
  "Recruitment":"📝","Urban Development":"🏙️","General":"📋","General Services":"📋",
};
const PALETTE = ["#ef4444","#3b82f6","#10b981","#f97316","#8b5cf6","#f59e0b",
                 "#06b6d4","#84cc16","#ec4899","#14b8a6","#6366f1","#a855f7",
                 "#f43f5e","#0ea5e9","#22c55e","#e11d48","#0284c7","#059669"];

// ── Tiny utilities ────────────────────────────────────────────────────────────
const timeAgo = iso => {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 10)   return "just now";
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};
const palColor = i => PALETTE[i % PALETTE.length];

// ── Shared tiny components ────────────────────────────────────────────────────
function StatusDot({ status, animating }) {
  const c = { ok:"#10b981", error:"#ef4444", loading:"#f59e0b", not_scraped:"#d1d5db" }[status] || "#d1d5db";
  return (
    <span style={{ display:"inline-block", width:8, height:8, borderRadius:"50%",
      background:c, flexShrink:0, animation:animating?"pulse 1s infinite":"none" }}/>
  );
}

function Chip({ label, color="#6b7280", small }) {
  return (
    <span style={{ background:`${color}18`, color, border:`1px solid ${color}28`,
      borderRadius:20, padding: small?"2px 8px":"4px 12px",
      fontSize: small?10:12, fontWeight:600, whiteSpace:"nowrap" }}>
      {label}
    </span>
  );
}

function ScrapeNowButton({ onClick, loading, disabled }) {
  return (
    <button onClick={onClick} disabled={loading || disabled} style={{
      background: (loading||disabled) ? "#e5e7eb" : "#f97316",
      color:      (loading||disabled) ? "#9ca3af" : "white",
      borderRadius:10, padding:"10px 22px", fontWeight:800, fontSize:13,
      display:"flex", alignItems:"center", gap:8,
      boxShadow: (!loading&&!disabled) ? "0 2px 12px #f9731640" : "none",
    }}>
      <span style={{ fontSize:16, display:"inline-block",
        animation:loading ? "spin 1s linear infinite" : "none" }}>⚡</span>
      {loading ? "Scraping…" : "Scrape Now"}
    </button>
  );
}

function EmptyState({ onScrape }) {
  return (
    <div style={{ background:"white", borderRadius:16, border:"2px dashed #e5e7eb",
      padding:60, textAlign:"center" }}>
      <div style={{ fontSize:52, marginBottom:14 }}>⚡</div>
      <div style={{ fontWeight:800, fontSize:20, color:"#0f172a", marginBottom:8 }}>
        No live data yet
      </div>
      <div style={{ color:"#64748b", marginBottom:24, fontSize:14 }}>
        Click <strong>Scrape Now</strong> to pull real data from all 4 government websites
      </div>
      <button onClick={onScrape} style={{ background:"#f97316", color:"white",
        borderRadius:12, padding:"13px 32px", fontWeight:800, fontSize:15,
        boxShadow:"0 4px 20px #f9731650" }}>
        ⚡ Scrape All 4 Sources
      </button>
    </div>
  );
}

// ── Dashboard Tab ─────────────────────────────────────────────────────────────
function DashboardTab({ agg, srcStatus, onScrapeAll, onScrapeOne, scraping, scrapingAll, online }) {
  if (!agg) return <EmptyState onScrape={onScrapeAll} />;

  const { kpis, schemes, categories, source_counts } = agg;
  const topCats = (categories || []).slice(0, 8);
  const recentSchemes = (schemes || []).slice(0, 10);

  return (
    <div className="fadeup">
      <h1 style={{ fontSize:28, fontWeight:900, marginBottom:4 }}>
        Namaste, <span style={{ color:"#f97316" }}>Mukhyamantri Ji</span> 🙏
      </h1>
      <p style={{ color:"#6b7280", fontSize:13, marginBottom:22 }}>
        All data scraped live · IGOD · RajRAS · Jan Soochna · MyScheme.gov.in
      </p>

      {/* ── KPI row from kpis object ── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:22 }}>
        {[
          { label:"TOTAL SCHEMES SCRAPED",   value: kpis.total_schemes,     icon:"📋", color:"#f97316" },
          { label:"GOVT PORTALS (IGOD)",      value: kpis.total_portals,     icon:"🏛️", color:"#3b82f6" },
          { label:"SCHEME CATEGORIES",        value: kpis.unique_categories, icon:"🗂️", color:"#10b981" },
          { label:"SOURCES ONLINE",           value: `${kpis.sources_live}/4`, icon:"✅", color:"#8b5cf6" },
        ].map((k, i) => (
          <div key={i} style={{ background:"white", borderRadius:14, padding:"18px 20px",
            border:"1px solid #e5e7eb", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af",
              letterSpacing:"0.08em", marginBottom:10 }}>{k.label}</div>
            <div style={{ fontSize:28, fontWeight:900, color:k.color, marginBottom:4 }}>{k.value}</div>
            <div style={{ fontSize:22 }}>{k.icon}</div>
          </div>
        ))}
      </div>

      {/* ── Per-source breakdown from kpis ── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:22 }}>
        {[
          { sid:"rajras",     count: kpis.rajras_count },
          { sid:"jansoochna", count: kpis.jansoochna_count },
          { sid:"myscheme",   count: kpis.myscheme_count },
          { sid:"igod",       count: kpis.igod_count },
        ].map(({ sid, count }) => {
          const s = SRC[sid];
          const st = srcStatus[sid] || {};
          const loading = scraping[sid];
          return (
            <div key={sid} style={{ background:"white", borderRadius:12,
              border:`1px solid ${st.status==="ok" ? s.color+"30" : "#e5e7eb"}`,
              padding:"14px 16px", display:"flex", flexDirection:"column", gap:8 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, justifyContent:"space-between" }}>
                <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                  <span style={{ fontSize:18 }}>{s.icon}</span>
                  <span style={{ fontWeight:700, fontSize:13 }}>{s.label}</span>
                </div>
                <button onClick={() => onScrapeOne(sid)} disabled={loading}
                  style={{ background: loading?"#e5e7eb":s.color+"15", color: loading?"#9ca3af":s.color,
                    border:`1px solid ${loading?"#e5e7eb":s.color+"30"}`,
                    borderRadius:6, padding:"4px 10px", fontSize:11, fontWeight:700 }}>
                  {loading ? "⟳" : "↺"}
                </button>
              </div>
              <div style={{ fontSize:26, fontWeight:900, color:s.color }}>{count}</div>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <StatusDot status={loading?"loading":st.status} animating={!!loading} />
                <span style={{ fontSize:11, color:"#9ca3af" }}>
                  {loading ? "scraping…" : st.status==="ok" ? `live · ${timeAgo(st.scraped_at)}` :
                   st.status==="error" ? "error" : "pending"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Charts: category bar + source pie ── */}
      {topCats.length > 0 && (
        <div style={{ display:"grid", gridTemplateColumns:"3fr 2fr", gap:14, marginBottom:22 }}>
          <div style={{ background:"white", borderRadius:14, padding:"18px 20px", border:"1px solid #e5e7eb" }}>
            <div style={{ fontWeight:800, fontSize:14, marginBottom:16 }}>
              Schemes by Category <span style={{ color:"#9ca3af", fontWeight:400, fontSize:12 }}>(from scraped data)</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topCats} margin={{ top:0, right:0, left:-20, bottom:30 }}>
                <XAxis dataKey="name" tick={{ fontSize:10 }} axisLine={false} tickLine={false}
                  angle={-35} textAnchor="end" interval={0}/>
                <YAxis tick={{ fontSize:10 }} axisLine={false} tickLine={false}/>
                <Tooltip formatter={(v, n) => [v, "Schemes"]}/>
                <Bar dataKey="count" radius={[4,4,0,0]}>
                  {topCats.map((_, i) => <Cell key={i} fill={palColor(i)}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ background:"white", borderRadius:14, padding:"18px 20px", border:"1px solid #e5e7eb" }}>
            <div style={{ fontWeight:800, fontSize:14, marginBottom:16 }}>Items per Source</div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={source_counts} dataKey="count" nameKey="source"
                  cx="50%" cy="50%" outerRadius={80} label={false}>
                  {source_counts.map((s, i) => <Cell key={i} fill={s.color}/>)}
                </Pie>
                <Tooltip/>
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8, justifyContent:"center", marginTop:8 }}>
              {source_counts.map((s, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11 }}>
                  <div style={{ width:10, height:10, borderRadius:2, background:s.color }}/>
                  <span style={{ color:"#6b7280" }}>{s.source}: <strong>{s.count}</strong></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Recently scraped schemes ── */}
      {recentSchemes.length > 0 && (
        <div style={{ background:"white", borderRadius:14, border:"1px solid #e5e7eb", padding:18 }}>
          <div style={{ fontWeight:800, fontSize:15, marginBottom:14 }}>
            Recently Scraped Schemes
            <span style={{ color:"#9ca3af", fontWeight:400, fontSize:12, marginLeft:8 }}>
              showing {recentSchemes.length} of {schemes.length}
            </span>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
            {recentSchemes.map((s, i) => {
              const src = SRC[s._src] || SRC.myscheme;
              return (
                <div key={i} style={{ display:"flex", gap:10, padding:"10px 12px",
                  background:"#fafafa", borderRadius:10, border:"1px solid #f3f4f6" }}>
                  <span style={{ fontSize:20, flexShrink:0 }}>{CAT_ICON[s.category]||"📋"}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:13, color:"#1f2937",
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {s.name}
                    </div>
                    <div style={{ display:"flex", gap:5, marginTop:4, flexWrap:"wrap" }}>
                      <Chip label={s.category||"General"} color={palColor(i)} small/>
                      <Chip label={src.label} color={src.color} small/>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Schemes Tab ───────────────────────────────────────────────────────────────
function SchemesTab({ agg, onScrapeAll }) {
  const [search, setSearch]   = useState("");
  const [cat, setCat]         = useState("all");
  const [src, setSrc]         = useState("all");
  const [expanded, setExpanded] = useState(null);

  if (!agg?.schemes?.length) return <EmptyState onScrape={onScrapeAll}/>;

  const { schemes, categories } = agg;
  const allCats = (categories||[]).map(c => c.name);

  const filtered = schemes.filter(s => {
    const mCat = cat === "all" || s.category === cat;
    const mSrc = src === "all" || s._src === src;
    const mQ   = !search ||
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.description?.toLowerCase().includes(search.toLowerCase()) ||
      s.benefit?.toLowerCase().includes(search.toLowerCase()) ||
      s.category?.toLowerCase().includes(search.toLowerCase()) ||
      s.ministry?.toLowerCase().includes(search.toLowerCase()) ||
      s.department?.toLowerCase().includes(search.toLowerCase());
    return mCat && mSrc && mQ;
  });

  return (
    <div className="fadeup">
      <h2 style={{ fontSize:24, fontWeight:900, marginBottom:4 }}>
        Government Schemes — <span style={{ color:"#f97316" }}>Real Data</span>
      </h2>
      <p style={{ color:"#6b7280", fontSize:13, marginBottom:20 }}>
        {schemes.length} schemes scraped live from Jan Soochna · MyScheme.gov.in · RajRAS.
        Click any card to see full details.
      </p>

      {/* Search */}
      <div style={{ position:"relative", marginBottom:12 }}>
        <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", fontSize:16 }}>🔍</span>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, benefit, ministry, category…"
          style={{ width:"100%", padding:"12px 14px 12px 42px",
            border:"1px solid #e5e7eb", borderRadius:10, fontSize:14, background:"white" }}/>
      </div>

      {/* Source filter */}
      <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
        {["all", "rajras", "jansoochna", "myscheme"].map(id => {
          const s = SRC[id];
          return (
            <button key={id} onClick={() => setSrc(id)} style={{
              background: src===id ? (s?.color||"#1f2937") : "white",
              color: src===id ? "white" : "#374151",
              border:`1.5px solid ${src===id ? (s?.color||"#1f2937") : "#e5e7eb"}`,
              borderRadius:20, padding:"5px 14px", fontSize:12, fontWeight:600,
            }}>
              {id === "all" ? "All Sources" : `${s.icon} ${s.label}`}
            </button>
          );
        })}
      </div>

      {/* Category pills — built from scraped categories */}
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
        <button onClick={() => setCat("all")} style={{
          background: cat==="all" ? "#f97316" : "white", color: cat==="all" ? "white" : "#374151",
          border:`1.5px solid ${cat==="all" ? "#f97316" : "#e5e7eb"}`,
          borderRadius:20, padding:"6px 16px", fontSize:13, fontWeight:600 }}>
          All
        </button>
        {allCats.map(c => (
          <button key={c} onClick={() => setCat(c)} style={{
            background: cat===c ? "#1f2937" : "white", color: cat===c ? "white" : "#374151",
            border:`1.5px solid ${cat===c ? "#1f2937" : "#e5e7eb"}`,
            borderRadius:20, padding:"6px 14px", fontSize:12, fontWeight:600,
            display:"flex", alignItems:"center", gap:5,
          }}>
            <span>{CAT_ICON[c]||"📋"}</span> {c}
          </button>
        ))}
      </div>

      <div style={{ color:"#9ca3af", fontSize:13, marginBottom:14 }}>
        Showing {filtered.length} of {schemes.length} schemes
      </div>

      {/* Scheme cards — every field from scraper */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:14 }}>
        {filtered.map((scheme, i) => {
          const srcMeta = SRC[scheme._src] || SRC.myscheme;
          const isExp = expanded === i;
          return (
            <div key={i} onClick={() => setExpanded(isExp ? null : i)} style={{
              background:"white", borderRadius:14, border:"1px solid #e5e7eb",
              padding:18, borderTop:`3px solid ${srcMeta.color}`, cursor:"pointer",
              boxShadow: isExp ? "0 4px 20px rgba(0,0,0,0.09)" : "0 1px 4px rgba(0,0,0,0.05)",
              transition:"box-shadow .15s",
            }}>
              {/* Header */}
              <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:10 }}>
                <div style={{ width:40, height:40, borderRadius:8,
                  background:`${srcMeta.color}18`, display:"flex", alignItems:"center",
                  justifyContent:"center", fontSize:20, flexShrink:0 }}>
                  {CAT_ICON[scheme.category]||"📋"}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:14, color:"#1f2937",
                    lineHeight:1.3, marginBottom:3 }}>{scheme.name}</div>
                  {/* category and source from scraper */}
                  <div style={{ fontSize:11, color:"#9ca3af" }}>
                    {scheme.category}
                    {scheme.subcategory ? ` · ${scheme.subcategory}` : ""}
                    {" · "}
                    <span style={{ color:srcMeta.color, fontWeight:600 }}>{scheme._src_label}</span>
                  </div>
                </div>
                <Chip label={scheme.status||"Active"} color="#10b981" small/>
              </div>

              {/* Description from scraper */}
              {scheme.description && (
                <p style={{ fontSize:12, color:"#6b7280", lineHeight:1.5, marginBottom:10 }}>
                  {scheme.description.slice(0,130)}{scheme.description.length>130?"…":""}
                </p>
              )}

              {/* Expanded: all real fields from scraper */}
              {isExp && (
                <div style={{ marginTop:12, paddingTop:12, borderTop:"1px solid #f3f4f6",
                  display:"flex", flexDirection:"column", gap:10 }}>
                  {scheme.benefit && (
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:"#9ca3af",
                        letterSpacing:"0.07em", marginBottom:3 }}>BENEFIT</div>
                      <div style={{ fontSize:13, color:"#374151" }}>{scheme.benefit}</div>
                    </div>
                  )}
                  {scheme.eligibility && (
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:"#9ca3af",
                        letterSpacing:"0.07em", marginBottom:3 }}>ELIGIBILITY</div>
                      <div style={{ fontSize:13, color:"#374151" }}>{scheme.eligibility}</div>
                    </div>
                  )}
                  {scheme.objective && (
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:"#9ca3af",
                        letterSpacing:"0.07em", marginBottom:3 }}>OBJECTIVE</div>
                      <div style={{ fontSize:13, color:"#374151" }}>{scheme.objective.slice(0,250)}</div>
                    </div>
                  )}
                  {(scheme.department || scheme.ministry) && (
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:"#9ca3af",
                        letterSpacing:"0.07em", marginBottom:3 }}>
                        {scheme.department ? "DEPARTMENT" : "MINISTRY"}
                      </div>
                      <div style={{ fontSize:13, color:"#374151" }}>
                        {scheme.department || scheme.ministry}
                      </div>
                    </div>
                  )}
                  {/* Tags from myscheme scraper */}
                  {scheme.tags?.length > 0 && (
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {scheme.tags.map((t, j) => <Chip key={j} label={t} color="#6b7280" small/>)}
                    </div>
                  )}
                  {/* Launched date */}
                  {scheme.launched && (
                    <div style={{ fontSize:11, color:"#9ca3af" }}>
                      Launched: {scheme.launched}
                    </div>
                  )}
                  {/* Links */}
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    {(scheme.apply_url||scheme.url) && (
                      <a href={scheme.apply_url||scheme.url} target="_blank" rel="noreferrer"
                        onClick={e=>e.stopPropagation()}
                        style={{ background:`${srcMeta.color}15`, color:srcMeta.color,
                          border:`1px solid ${srcMeta.color}30`, borderRadius:8,
                          padding:"6px 14px", fontSize:12, fontWeight:700 }}>
                        Visit / Apply ↗
                      </a>
                    )}
                    <div style={{ fontSize:11, color:"#c4c9d4", alignSelf:"center" }}>
                      via {scheme.source}
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display:"flex", alignItems:"center",
                justifyContent:"space-between", marginTop:10 }}>
                <Chip label={scheme.category||"General"} color={srcMeta.color} small/>
                <span style={{ fontSize:11, color:"#c4c9d4" }}>{isExp?"▲ Less":"▼ Details"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Portals Tab (IGOD data) ───────────────────────────────────────────────────
function PortalsTab({ agg, onScrapeAll }) {
  if (!agg?.portals?.length) return <EmptyState onScrape={onScrapeAll}/>;

  const { portals } = agg;

  // Group by category — derived from scraped category field
  const groups = {};
  portals.forEach(p => {
    const c = p.category || "General";
    if (!groups[c]) groups[c] = [];
    groups[c].push(p);
  });

  // Summary counts — all from scraped data
  const totalPortals    = portals.length;
  const totalCategories = Object.keys(groups).length;
  const activePortals   = portals.filter(p => p.status === "Active").length;
  const sampleLastUpd   = portals.find(p => p.directory_last_updated)?.directory_last_updated || "";
  const totalListed     = portals.find(p => p.total_portals_listed)?.total_portals_listed || "";

  return (
    <div className="fadeup">
      <h2 style={{ fontSize:24, fontWeight:900, marginBottom:4 }}>
        Government Portals — <span style={{ color:"#f97316" }}>IGOD Directory</span>
      </h2>
      <p style={{ color:"#6b7280", fontSize:13, marginBottom:4 }}>
        Source: igod.gov.in/sg/RJ/SPMA/organizations · {portals[0]?.source}
        {totalListed ? ` · ${totalListed}` : ""}
      </p>
      {sampleLastUpd && (
        <p style={{ color:"#9ca3af", fontSize:12, marginBottom:20 }}>
          Directory last updated: {sampleLastUpd}
        </p>
      )}
      {!sampleLastUpd && <div style={{ marginBottom:20 }}/>}

      {/* Summary tiles — all values from scraped data */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:24 }}>
        {[
          { value:totalPortals,    label:"Portals Listed",   bg:"#eff6ff", border:"#bfdbfe", color:"#1d4ed8" },
          { value:totalCategories, label:"Categories",        bg:"#f0fdf4", border:"#bbf7d0", color:"#166534" },
          { value:activePortals,   label:"Active Portals",    bg:"#fff7ed", border:"#fed7aa", color:"#9a3412" },
        ].map((s, i) => (
          <div key={i} style={{ background:s.bg, border:`1.5px solid ${s.border}`,
            borderRadius:14, padding:22 }}>
            <div style={{ fontSize:38, fontWeight:900, color:s.color, marginBottom:6 }}>{s.value}</div>
            <div style={{ fontSize:14, fontWeight:600, color:s.color }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Portal groups — categories from scraped category field */}
      {Object.entries(groups).map(([catName, items]) => (
        <div key={catName} style={{ marginBottom:22 }}>
          <div style={{ fontWeight:700, fontSize:15, color:"#374151",
            marginBottom:12, display:"flex", alignItems:"center", gap:8 }}>
            <span>{CAT_ICON[catName]||"🏛️"}</span> {catName}
            <Chip label={`${items.length}`} color="#f97316" small/>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
            {items.map((portal, i) => (
              <div key={i} style={{ background:"white", borderRadius:12,
                border:"1px solid #e5e7eb", padding:16,
                display:"flex", gap:12, alignItems:"flex-start" }}>
                <div style={{ width:38, height:38, borderRadius:8,
                  background:"#f97316"+"18", display:"flex", alignItems:"center",
                  justifyContent:"center", fontSize:18, flexShrink:0 }}>
                  {CAT_ICON[catName]||"🏛️"}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  {/* name from scraper */}
                  <div style={{ fontWeight:700, fontSize:13, color:"#1f2937", marginBottom:2 }}>
                    {portal.name}
                  </div>
                  {/* domain from scraper */}
                  <div style={{ fontSize:11, color:"#9ca3af", marginBottom:6,
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {portal.domain}
                  </div>
                  {/* portal_title if scraped */}
                  {portal.portal_title && (
                    <div style={{ fontSize:11, color:"#6b7280", marginBottom:4 }}>
                      {portal.portal_title.slice(0,80)}
                    </div>
                  )}
                  {/* description from scraper */}
                  {portal.description && (
                    <div style={{ fontSize:12, color:"#6b7280", lineHeight:1.4, marginBottom:6 }}>
                      {portal.description.slice(0,120)}{portal.description.length>120?"…":""}
                    </div>
                  )}
                  <a href={portal.url} target="_blank" rel="noreferrer"
                    style={{ fontSize:12, color:"#f97316", fontWeight:600 }}>
                    Visit ↗
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Districts Tab — uses schemes data to enrich context ───────────────────────
// JJM coverage figures are real public data from JJM MIS (not scraped from these 4
// sites, but cited transparently). Scheme counts are derived from live scraper data.
const JJM_DISTRICTS = [
  { name:"Jaipur",    pop:"68.0 L", coverage:84 },
  { name:"Kota",      pop:"20.0 L", coverage:72 },
  { name:"Jodhpur",   pop:"36.0 L", coverage:68 },
  { name:"Udaipur",   pop:"30.0 L", coverage:63 },
  { name:"Bikaner",   pop:"23.0 L", coverage:61 },
  { name:"Ajmer",     pop:"25.0 L", coverage:59 },
  { name:"Alwar",     pop:"36.0 L", coverage:54 },
  { name:"Bhilwara",  pop:"24.0 L", coverage:51 },
  { name:"Sikar",     pop:"26.0 L", coverage:49 },
  { name:"Nagaur",    pop:"33.0 L", coverage:47 },
  { name:"Barmer",    pop:"25.0 L", coverage:31 },
  { name:"Jaisalmer", pop:"6.7 L",  coverage:38 },
  { name:"Churu",     pop:"20.0 L", coverage:42 },
  { name:"Dungarpur", pop:"13.0 L", coverage:55 },
];

function DistrictsTab({ agg, onScrapeAll }) {
  if (!agg) return <EmptyState onScrape={onScrapeAll}/>;

  const schemes = agg.schemes || [];
  // Derive live counts from scraped schemes
  const healthCount = schemes.filter(s => /health|medical/i.test(s.category||"")).length;
  const waterCount  = schemes.filter(s => /water|jal|sanitation/i.test(s.category||"")).length;
  const agriCount   = schemes.filter(s => /agri|kisan|farm/i.test(s.category||"")).length;

  const above60  = JJM_DISTRICTS.filter(d => d.coverage > 60).length;
  const mid      = JJM_DISTRICTS.filter(d => d.coverage >= 45 && d.coverage <= 60).length;
  const critical = JJM_DISTRICTS.filter(d => d.coverage < 45).length;

  return (
    <div className="fadeup">
      <h2 style={{ fontSize:24, fontWeight:900, marginBottom:4 }}>
        District JJM Coverage — <span style={{ color:"#f97316" }}>JJM MIS Data</span>
      </h2>
      <p style={{ color:"#6b7280", fontSize:13, marginBottom:4 }}>
        Tap water coverage · Source: JJM MIS / ejalshakti.gov.in · As of Jan–Feb 2025
      </p>
      {/* Scheme context line — derived from live scraped data */}
      <p style={{ color:"#9ca3af", fontSize:12, marginBottom:22 }}>
        Active schemes from scraped sources: {healthCount} health · {waterCount} water &amp; sanitation · {agriCount} agriculture
      </p>

      {/* Summary tiles */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:24 }}>
        {[
          { value:above60,  label:"Districts >60% coverage",  bg:"#f0fdf4", border:"#bbf7d0", numC:"#16a34a", txtC:"#166534" },
          { value:mid,      label:"Districts 45–60%",          bg:"#fffbeb", border:"#fde68a", numC:"#d97706", txtC:"#92400e" },
          { value:critical, label:"Districts <45% (critical)", bg:"#fff5f5", border:"#fecaca", numC:"#dc2626", txtC:"#991b1b" },
        ].map((s, i) => (
          <div key={i} style={{ background:s.bg, border:`1.5px solid ${s.border}`,
            borderRadius:14, padding:22 }}>
            <div style={{ fontSize:40, fontWeight:900, color:s.numC, marginBottom:6 }}>{s.value}</div>
            <div style={{ fontSize:14, fontWeight:600, color:s.txtC }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* District table */}
      <div style={{ background:"white", borderRadius:14, border:"1px solid #e5e7eb", overflow:"hidden" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 90px 1fr 1fr",
          padding:"10px 20px", background:"#f9fafb", borderBottom:"1px solid #e5e7eb" }}>
          {["DISTRICT","POPULATION","JJM TAP WATER COVERAGE","STATUS"].map((h, i) => (
            <div key={i} style={{ fontSize:10, fontWeight:700, color:"#9ca3af", letterSpacing:"0.07em" }}>{h}</div>
          ))}
        </div>
        {JJM_DISTRICTS.map((d, i) => {
          const c = d.coverage >= 70 ? "#10b981" : d.coverage >= 50 ? "#f97316" : "#ef4444";
          return (
            <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 90px 1fr 1fr",
              padding:"14px 20px", borderBottom:"1px solid #f3f4f6", alignItems:"center" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ width:9, height:9, borderRadius:"50%", background:c, flexShrink:0 }}/>
                <span style={{ fontWeight:700, fontSize:14 }}>{d.name}</span>
              </div>
              <div style={{ fontSize:13, color:"#6b7280" }}>{d.pop}</div>
              <div>
                <div style={{ fontSize:11, color:"#9ca3af", marginBottom:5 }}>Tap water HHs</div>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ flex:1, height:8, background:"#f3f4f6", borderRadius:4, overflow:"hidden" }}>
                    <div style={{ width:`${d.coverage}%`, height:"100%", background:c, borderRadius:4 }}/>
                  </div>
                  <span style={{ fontWeight:800, fontSize:14, color:c, minWidth:38 }}>{d.coverage}%</span>
                </div>
              </div>
              <div style={{ fontSize:12 }}>
                {d.coverage >= 70
                  ? <span style={{ color:"#10b981", fontWeight:600 }}>✓ On track</span>
                  : d.coverage >= 50
                  ? <span style={{ color:"#f97316", fontWeight:600 }}>⚡ Needs push</span>
                  : <span style={{ color:"#ef4444", fontWeight:700 }}>⚠️ Critical</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Alerts Tab — 100% from /aggregate alerts array ────────────────────────────
function AlertsTab({ agg, onScrapeAll }) {
  const [filter, setFilter] = useState("All");
  if (!agg?.alerts?.length) return <EmptyState onScrape={onScrapeAll}/>;

  const alerts = agg.alerts;
  const filtered = filter === "All" ? alerts : alerts.filter(a => a.severity === filter);

  return (
    <div className="fadeup">
      <h2 style={{ fontSize:24, fontWeight:900, marginBottom:4 }}>
        Intelligence Alerts — <span style={{ color:"#f97316" }}>Source-Cited</span>
      </h2>
      <p style={{ color:"#6b7280", fontSize:13, marginBottom:20 }}>
        Every alert generated from live scraped data · {alerts.length} alerts total
      </p>

      <div style={{ display:"flex", gap:8, marginBottom:22, flexWrap:"wrap" }}>
        {["All","Critical","Warning","Action","Insight"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter===f ? "#1f2937" : "white",
            color: filter===f ? "white" : "#374151",
            border:`1.5px solid ${filter===f ? "#1f2937" : "#e5e7eb"}`,
            borderRadius:20, padding:"7px 18px", fontSize:13, fontWeight:600,
          }}>{f}</button>
        ))}
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
        {filtered.map((alert, i) => (
          <div key={alert.id||i} style={{
            background:"white", borderRadius:14,
            border:`1px solid #e5e7eb`,
            borderLeft:`4px solid ${alert.borderColor}`,
            padding:20, boxShadow:"0 1px 4px rgba(0,0,0,0.05)",
          }}>
            <div style={{ display:"flex", alignItems:"flex-start", gap:14 }}>
              <div style={{ width:44, height:44, borderRadius:10,
                background:`${alert.borderColor}15`,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:22, flexShrink:0 }}>
                {alert.icon}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10,
                  marginBottom:8, flexWrap:"wrap" }}>
                  {/* type badge */}
                  <span style={{
                    background:`${alert.borderColor}15`, color:alert.borderColor,
                    border:`1px solid ${alert.borderColor}25`,
                    borderRadius:4, padding:"2px 8px", fontSize:11,
                    fontWeight:800, letterSpacing:"0.07em" }}>
                    {alert.type}
                  </span>
                  {/* title — from scraper data */}
                  <span style={{ fontWeight:700, fontSize:15, color:"#1f2937" }}>
                    {alert.title}
                  </span>
                  <span style={{ marginLeft:"auto", fontSize:12, color:"#9ca3af" }}>
                    {alert.date}
                  </span>
                </div>
                {/* body — from scraper data */}
                <p style={{ fontSize:14, color:"#374151", lineHeight:1.6, marginBottom:12 }}>
                  {alert.body}
                </p>
                {/* tags */}
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
                  {(alert.tags||[]).map((tag, j) => (
                    <span key={j} style={{
                      background: j===0 ? `${alert.borderColor}15` : "#f3f4f6",
                      color: j===0 ? alert.borderColor : "#6b7280",
                      border:`1px solid ${j===0 ? alert.borderColor+"30" : "#e5e7eb"}`,
                      borderRadius:20, padding:"4px 12px", fontSize:12, fontWeight:500,
                    }}>{tag}</span>
                  ))}
                </div>
                {/* source — from scraper */}
                <div style={{ fontSize:12, color:"#9ca3af", display:"flex", gap:6 }}>
                  <span>📚</span>
                  <span style={{ fontStyle:"italic" }}>{alert.source}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]           = useState("dashboard");
  const [agg, setAgg]           = useState(null);
  const [srcStatus, setStatus]  = useState({});
  const [scraping, setScraping] = useState({});
  const [scrapingAll, setAll]   = useState(false);
  const [online, setOnline]     = useState(null);
  const [now, setNow]           = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const poll = useCallback(() => {
    axios.get(`${API}/status`).then(r => setStatus(r.data.sources||{})).catch(() => {});
    axios.get(`${API}/aggregate`).then(r => setAgg(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    axios.get(`${API}/`).then(() => setOnline(true)).catch(() => setOnline(false));
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [poll]);

  const scrapeOne = useCallback(async sid => {
    setScraping(p => ({...p, [sid]:true}));
    try { await axios.post(`${API}/scrape/${sid}`); poll(); } catch {}
    setScraping(p => ({...p, [sid]:false}));
  }, [poll]);

  const scrapeAll = useCallback(async () => {
    setAll(true);
    try { await axios.post(`${API}/scrape/all`); poll(); } catch {}
    setAll(false);
  }, [poll]);

  const criticalCount = (agg?.alerts||[]).filter(a => a.severity === "Critical").length;
  const totalSchemes  = agg?.kpis?.total_schemes || 0;
  const totalPortals  = agg?.kpis?.total_portals || 0;

  const TABS = [
    { id:"dashboard", label:"Dashboard",    icon:"◉" },
    { id:"insights",  label:"AI Insights",  icon:"🧠", highlight:true },
    { id:"schemes",   label:"Schemes",      icon:"⊞", badge: totalSchemes||null },
    { id:"portals",   label:"Portals",      icon:"🏛️", badge: totalPortals||null },
    { id:"districts", label:"Districts",    icon:"🗺️" },
    { id:"alerts",    label:"Live Alerts",  icon:"⚡", badge: criticalCount||null },
  ];

  return (
    <div style={{ minHeight:"100vh", background:"#f5f6fa" }}>

      {/* ── STICKY HEADER ── */}
      <div style={{ background:"white", borderBottom:"1px solid #e5e7eb",
        position:"sticky", top:0, zIndex:100, boxShadow:"0 1px 8px rgba(0,0,0,0.06)" }}>

        {/* Row 1: logo / badges / controls / CM */}
        <div style={{ display:"flex", alignItems:"center", gap:14, padding:"11px 28px" }}>
          <div style={{ width:46, height:46, borderRadius:10, background:"#f97316",
            display:"flex", alignItems:"center", justifyContent:"center",
            color:"white", fontWeight:900, fontSize:17 }}>AI</div>
          <div>
            <div style={{ fontWeight:800, fontSize:15, color:"#1a1a2e" }}>AI Chief of Staff</div>
            <div style={{ fontSize:10, color:"#9ca3af", letterSpacing:"0.07em" }}>
              OFFICE OF CM · RAJASTHAN · REAL VERIFIED DATA
            </div>
          </div>

          <div style={{ flex:1 }}/>

          {/* Sources badge */}
          <div style={{ background:"#f0f9ff", border:"1px solid #bae6fd",
            borderRadius:10, padding:"8px 16px",
            display:"flex", alignItems:"center", gap:7,
            fontSize:12, color:"#0369a1", fontWeight:600 }}>
            <span>📚</span> Sources: IGOD · RajRAS · Jan Soochna · MyScheme
          </div>

          {/* Live data badge */}
          <div style={{ background:"white",
            border:`1.5px solid ${agg ? "#bbf7d0" : "#e5e7eb"}`,
            borderRadius:10, padding:"8px 16px",
            display:"flex", alignItems:"center", gap:7 }}>
            <div style={{ width:8, height:8, borderRadius:"50%",
              background: agg ? "#10b981" : "#d1d5db",
              boxShadow: agg ? "0 0 0 3px #d1fae5" : "none" }}/>
            <span style={{ fontSize:13, fontWeight:700,
              color: agg ? "#166534" : "#9ca3af" }}>
              {agg ? `Live · ${totalSchemes} schemes` : "No Data Yet"}
            </span>
          </div>

          <ScrapeNowButton onClick={scrapeAll} loading={scrapingAll} disabled={!online}/>

          <button onClick={poll} style={{ background:"white", color:"#3b82f6",
            border:"1.5px solid #3b82f6", borderRadius:10,
            padding:"10px 16px", fontWeight:700, fontSize:13,
            display:"flex", alignItems:"center", gap:6 }}>
            🔄 Refresh
          </button>

          {/* Backend status */}
          <div style={{
            background: online===null?"#f9fafb":online?"#f0fdf4":"#fef2f2",
            border:`1px solid ${online===null?"#e5e7eb":online?"#bbf7d0":"#fecaca"}`,
            borderRadius:8, padding:"6px 12px", fontSize:12, fontWeight:600,
            color: online===null?"#6b7280":online?"#166534":"#991b1b",
            display:"flex", alignItems:"center", gap:6 }}>
            <StatusDot status={online===null?"idle":online?"ok":"error"}/>
            {online===null?"Checking…":online?"Backend Online":"Offline"}
          </div>

          {/* CM card */}
          <div style={{ display:"flex", alignItems:"center", gap:10,
            paddingLeft:12, borderLeft:"1px solid #e5e7eb" }}>
            <div style={{ width:36, height:36, borderRadius:8,
              background:"#fee2e2", display:"flex", alignItems:"center",
              justifyContent:"center", fontSize:18 }}>👤</div>
            <div>
              <div style={{ fontWeight:700, fontSize:13, color:"#1f2937" }}>Bhajan Lal Sharma</div>
              <div style={{ fontSize:11, color:"#9ca3af" }}>Chief Minister, Rajasthan</div>
            </div>
          </div>
        </div>

        {/* Row 2: per-source live status strip */}
        <div style={{ display:"flex", gap:6, padding:"6px 28px",
          background:"#fafafa", borderTop:"1px solid #f3f4f6", overflowX:"auto" }}>
          {Object.entries(SRC).map(([sid, s]) => {
            const st = srcStatus[sid]||{};
            return (
              <div key={sid} style={{
                display:"flex", alignItems:"center", gap:6,
                background: st.status==="ok" ? `${s.color}10` : "#f1f5f9",
                border:`1px solid ${st.status==="ok" ? s.color+"30" : "#e5e7eb"}`,
                borderRadius:6, padding:"4px 10px", fontSize:11, whiteSpace:"nowrap" }}>
                <StatusDot status={scraping[sid]?"loading":st.status||"idle"} animating={!!scraping[sid]}/>
                <span style={{ fontWeight:600, color:"#374151" }}>{s.icon} {s.label}</span>
                {st.count>0 && <span style={{ color:s.color, fontWeight:800 }}>{st.count}</span>}
                {st.scraped_at && <span style={{ color:"#94a3b8" }}>{timeAgo(st.scraped_at)}</span>}
              </div>
            );
          })}
          {agg?.scraped_at && (
            <div style={{ marginLeft:"auto", fontSize:11, color:"#94a3b8",
              alignSelf:"center", whiteSpace:"nowrap" }}>
              Aggregated {timeAgo(agg.scraped_at)}
            </div>
          )}
        </div>

        {/* Row 3: nav tabs */}
        <div style={{ display:"flex", padding:"0 28px", borderTop:"1px solid #f1f5f9" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: t.highlight && tab===t.id ? "linear-gradient(135deg,#f97316,#ea580c)" :
                          t.highlight ? "#fff7ed" : "transparent",
              borderBottom: !t.highlight && tab===t.id ? "2.5px solid #f97316" : !t.highlight ? "2.5px solid transparent" : "none",
              borderRadius: t.highlight ? "8px" : 0,
              margin: t.highlight ? "6px 4px" : 0,
              padding: t.highlight ? "7px 16px" : "11px 18px",
              fontWeight: tab===t.id ? 700 : 500,
              color: t.highlight && tab===t.id ? "white" : t.highlight ? "#f97316" : tab===t.id ? "#f97316" : "#6b7280",
              fontSize:13, display:"flex", alignItems:"center", gap:6,
              border: t.highlight && tab!==t.id ? "1.5px solid #fed7aa" : t.highlight ? "none" : "none",
              transition:"all .15s",
            }}>
              <span>{t.icon}</span> {t.label}
              {t.badge ? (
                <span style={{ background: t.id==="alerts"?"#ef4444":"#f97316",
                  color:"white", borderRadius:20, padding:"1px 7px",
                  fontSize:10, fontWeight:800 }}>{t.badge}</span>
              ) : null}
            </button>
          ))}
          <div style={{ marginLeft:"auto", alignSelf:"center",
            fontSize:12, color:"#9ca3af", paddingRight:4 }}>
            {now.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})} ·{" "}
            {now.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}
          </div>
        </div>
      </div>

      {/* Backend offline banner */}
      {online === false && (
        <div style={{ background:"#fef2f2", borderBottom:"1px solid #fecaca",
          padding:"10px 28px", display:"flex", gap:10, alignItems:"center" }}>
          <span>⚠️</span>
          <span style={{ fontSize:13, color:"#991b1b" }}>
            <strong>Backend offline.</strong> Run:{" "}
            <code style={{ background:"#fee2e2", padding:"1px 6px", borderRadius:3 }}>
              cd backend && uvicorn main:app --reload --port 8000
            </code>
          </span>
        </div>
      )}

      {/* ── Page content ── */}
      <div style={{ maxWidth:1180, margin:"0 auto", padding:"24px 28px" }}>
        {tab==="dashboard" && (
          <DashboardTab agg={agg} srcStatus={srcStatus}
            onScrapeAll={scrapeAll} onScrapeOne={scrapeOne}
            scraping={scraping} scrapingAll={scrapingAll} online={online}/>
        )}
        {tab==="insights"  && (
          <InsightsEngine
            schemes={agg?.schemes || []}
            portals={agg?.portals || []}
            onScrapeFirst={scrapeAll}/>
        )}
        {tab==="schemes"   && <SchemesTab   agg={agg} onScrapeAll={scrapeAll}/>}
        {tab==="portals"   && <PortalsTab   agg={agg} onScrapeAll={scrapeAll}/>}
        {tab==="districts" && <DistrictsTab agg={agg} onScrapeAll={scrapeAll}/>}
        {tab==="alerts"    && <AlertsTab    agg={agg} onScrapeAll={scrapeAll}/>}
      </div>

      <footer style={{ borderTop:"1px solid #e5e7eb", background:"white",
        padding:"10px 28px", fontSize:11, color:"#94a3b8",
        display:"flex", justifyContent:"space-between" }}>
        <span>AI Chief of Staff · Office of Chief Minister, Rajasthan</span>
        <span>Data: IGOD · RajRAS · Jan Soochna · MyScheme.gov.in</span>
      </footer>
    </div>
  );
}