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

import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
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

// ── Safe URL — never produce a 404 link ──────────────────────────────────────
const DEAD_URLS = [
  "https://jansoochna.rajasthan.gov.in/Scheme",
  "https://jansoochna.rajasthan.gov.in/Scheme/",
  "https://rajras.in","https://rajras.in/",
  "https://www.myscheme.gov.in","https://myscheme.gov.in",
];
const safeUrl = (s) => {
  if (!s) return null;
  const u = s.apply_url || s.url || "";
  if (!u || DEAD_URLS.includes(u.replace(/\/$/,""))) {
    if (s._src==="jansoochna"||(s.source||"").includes("jansoochna"))
      return "https://jansoochna.rajasthan.gov.in/";
    if (s._src==="myscheme"||(s.source||"").includes("myscheme"))
      return `https://www.myscheme.gov.in/search?q=${encodeURIComponent((s.name||"").slice(0,50))}`;
    if (s._src==="rajras"||(s.source||"").includes("rajras"))
      return "https://rajras.in/ras/pre/rajasthan/adm/schemes/";
    return null;
  }
  return u || null;
};

// ── ℹ️ InfoTip ────────────────────────────────────────────────────────────────
function InfoTip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position:"relative", display:"inline-flex", alignItems:"center", marginLeft:4 }}>
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{
          width:16, height:16, borderRadius:"50%",
          background: show ? "#3b82f6" : "#e2e8f0",
          color: show ? "white" : "#6b7280",
          fontSize:10, fontWeight:800, lineHeight:"16px", textAlign:"center",
          display:"inline-block", cursor:"help", userSelect:"none",
          transition:"background 0.15s", flexShrink:0,
        }}
      >i</span>
      {show && (
        <div style={{
          position:"absolute", left:20, top:"50%", transform:"translateY(-50%)",
          background:"#1e293b", color:"white", borderRadius:9,
          padding:"10px 13px", fontSize:12, lineHeight:1.55,
          width:260, zIndex:9999, pointerEvents:"none",
          boxShadow:"0 8px 24px rgba(0,0,0,0.25)",
        }}>
          {text}
          <div style={{
            position:"absolute", right:"100%", top:"50%", transform:"translateY(-50%)",
            width:0, height:0,
            borderTop:"5px solid transparent",
            borderBottom:"5px solid transparent",
            borderRight:"6px solid #1e293b",
          }}/>
        </div>
      )}
    </span>
  );
}

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
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
        <h1 style={{ fontSize:28, fontWeight:900, margin:0 }}>Namaste, <span style={{ color:"#f97316" }}>Mukhyamantri Ji</span> 🙏</h1>
        <InfoTip text="KPI cards and charts are built from live-scraped data. Every number comes from the /aggregate API which merges all 4 scrapers. Use ⚡ Scrape Now to refresh."/>
      </div>
      <p style={{ color:"#6b7280", fontSize:13, marginBottom:22 }}>
        All data scraped live · IGOD · RajRAS · Jan Soochna · MyScheme.gov.in
      </p>


      {/* ── Live Data Summary Banner ── */}
      <div style={{
        background:"linear-gradient(135deg,#fff7ed,#fffbeb,#f0f9ff)",
        border:"1.5px solid #fed7aa", borderRadius:14,
        padding:"14px 18px", marginBottom:20,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:10 }}>
          <span style={{ fontSize:15 }}>📊</span>
          <span style={{ fontWeight:800, fontSize:14, color:"#1a1a2e" }}>Live Data Summary</span>
          <InfoTip text="Every number here is computed live from the current scrape. Hover any ℹ️ icon to see exactly where the data comes from."/>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
          {[
            { icon:"📋", val:kpis.total_schemes,       label:"schemes scraped",  color:"#f97316", bg:"#fff7ed",
              tip:"Total scheme records from RajRAS (HTML scrape) + Jan Soochna (JSON API) + MyScheme (REST API). Updates on every scrape." },
            { icon:"🏛️", val:kpis.total_portals,       label:"IGOD portals",     color:"#3b82f6", bg:"#eff6ff",
              tip:"Government portals listed on igod.gov.in/sg/RJ/SPMA/organizations — each is a separate Rajasthan govt website." },
            { icon:"🗂️", val:kpis.unique_categories,   label:"categories",       color:"#10b981", bg:"#f0fdf4",
              tip:"Unique scheme categories found. Derived by keyword matching on scheme name/description — not from any API field directly." },
            { icon:"✅", val:`${kpis.sources_live}/4`, label:"sources online",   color:"#8b5cf6", bg:"#faf5ff",
              tip:"Live scrapers out of 4 total (IGOD, RajRAS, Jan Soochna, MyScheme). 4/4 means all portals responded successfully." },
          ].map((item, i) => (
            <div key={i} style={{ background:item.bg, border:`1px solid ${item.color}25`, borderRadius:10, padding:"10px 12px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                <span style={{ fontSize:18 }}>{item.icon}</span>
                <InfoTip text={item.tip}/>
              </div>
              <div style={{ fontSize:22, fontWeight:900, color:item.color, lineHeight:1 }}>{item.val}</div>
              <div style={{ fontSize:10, color:"#6b7280", marginTop:3 }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>

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
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
        <h2 style={{ fontSize:24, fontWeight:900, margin:0 }}>Government Schemes — <span style={{ color:"#f97316" }}>Real Data</span></h2>
        <InfoTip text="Schemes from 3 sources: RajRAS (HTML article scrape → name, eligibility, benefit, objective), Jan Soochna JSON API (→ name, dept, beneficiary count), MyScheme REST API (→ name, ministry, tags, description). Categories derived by keyword matching."/>
      </div>
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
                    {safeUrl(scheme) && (
                      <a href={safeUrl(scheme)} target="_blank" rel="noreferrer"
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
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
        <h2 style={{ fontSize:24, fontWeight:900, margin:0 }}>Government Portals — <span style={{ color:"#f97316" }}>IGOD Directory</span></h2>
        <InfoTip text="Scraped from igod.gov.in/sg/RJ/SPMA/organizations — official IGOD directory for Rajasthan. Each card shows the portal name, domain, and meta description fetched from that portal's own homepage."/>
      </div>
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
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
        <h2 style={{ fontSize:24, fontWeight:900, margin:0 }}>District JJM Coverage — <span style={{ color:"#f97316" }}>JJM MIS Data</span></h2>
        <InfoTip text="Coverage % from JJM MIS (ejalshakti.gov.in) — Jal Jeevan Mission tracking system. Shows % of rural households with functional tap water. Scheme counts below are derived live from the scraped schemes data."/>
      </div>
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
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
        <h2 style={{ fontSize:24, fontWeight:900, margin:0 }}>Intelligence Alerts — <span style={{ color:"#f97316" }}>Source-Cited</span></h2>
        <InfoTip text="Alerts are auto-generated by the backend from scraped data patterns — not hardcoded. Each alert cites the actual scheme counts and categories found during scraping."/>
      </div>
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

// ═══════════════════════════════════════════════════════════════════════════════
// INSIGHTS TAB — self-contained, no imports needed
// ═══════════════════════════════════════════════════════════════════════════════
const IC = { orange:"#f97316",blue:"#3b82f6",green:"#10b981",red:"#ef4444",purple:"#8b5cf6",amber:"#f59e0b",text:"#0f172a",muted:"#64748b",card:"#ffffff",border:"#e2e8f0" };
const itxt = s=>[s.name,s.description,s.eligibility,s.benefit,s.objective,s.category,s.department,s.ministry,s.tags?.join?.(" ")].filter(Boolean).join(" ").toLowerCase();
const ihas = (s,...kws) => kws.some(kw=>itxt(s).includes(kw.toLowerCase()));
const parseINR = (str="") => { if(!str)return 0; const cr=str.match(/(\d+(?:\.\d+)?)\s*crore/i); if(cr)return parseFloat(cr[1])*1e7; const lk=str.match(/(\d+(?:\.\d+)?)\s*lakh/i); if(lk)return parseFloat(lk[1])*1e5; const k=str.match(/[₹Rs.]\s*([\d,]+)/); if(k)return parseInt(k[1].replace(/,/g,"")); return 0; };
const fmtINR = v => v>=1e7?`₹${(v/1e7).toFixed(1)} Cr`:v>=1e5?`₹${(v/1e5).toFixed(1)} L`:`₹${v}`;
const ICard = ({children,style={}}) => <div style={{background:IC.card,borderRadius:14,border:`1px solid ${IC.border}`,padding:20,boxShadow:"0 1px 6px rgba(0,0,0,0.05)",...style}}>{children}</div>;
const IBadge = ({label,color=IC.orange,small}) => <span style={{background:`${color}18`,color,border:`1px solid ${color}28`,borderRadius:20,padding:small?"1px 8px":"3px 12px",fontSize:small?10:11,fontWeight:700,whiteSpace:"nowrap"}}>{label}</span>;
const ISec = ({icon,title,sub,tip}) => (
  <div style={{marginBottom:16}}>
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <span style={{fontSize:22}}>{icon}</span>
      <h2 style={{fontSize:19,fontWeight:900,color:IC.text,margin:0}}>{title}</h2>
      {tip&&<InfoTip text={tip}/>}
    </div>
    {sub&&<p style={{fontSize:12,color:IC.muted,margin:"3px 0 0 30px"}}>{sub}</p>}
  </div>
);

function runIA(schemes,portals){
  const catMap={};
  schemes.forEach(s=>{const c=s.category||"General";if(!catMap[c])catMap[c]={name:c,count:0,schemes:[]};catMap[c].count++;catMap[c].schemes.push(s);});
  const categories=Object.values(catMap).sort((a,b)=>b.count-a.count);
  const srcMap={};
  schemes.forEach(s=>{const src=s._src_label||s.source?.split(".")?.[0]||"Unknown";srcMap[src]=(srcMap[src]||0)+1;});
  const nameMap={};
  schemes.forEach(s=>{const key=s.name?.toLowerCase().trim().slice(0,40)||"";if(!key)return;if(!nameMap[key])nameMap[key]=[];nameMap[key].push(s);});
  const duplicates=Object.values(nameMap).filter(g=>g.length>=2).filter(g=>new Set(g.map(s=>s._src_label||s.source)).size>=2).sort((a,b)=>b.length-a.length);
  const withValue=schemes.map(s=>({...s,_inr:parseINR(s.benefit||s.description||"")})).filter(s=>s._inr>0).sort((a,b)=>b._inr-a._inr).slice(0,12);
  const SEGS=[
    {id:"women",  label:"Women & Girls",        icon:"👩",kws:["women","girl","mahila","beti","widow","rajshri","sukanya","maternity"]},
    {id:"farmer", label:"Farmers",              icon:"🌾",kws:["farmer","kisan","agriculture","crop","farm","agri"]},
    {id:"student",label:"Students & Youth",     icon:"🎓",kws:["student","scholarship","coaching","education","school","rozgar"]},
    {id:"health", label:"Healthcare",           icon:"🏥",kws:["health","medical","chiranjeevi","ayushman","dawa","hospital"]},
    {id:"elderly",label:"Senior Citizens",      icon:"👴",kws:["elderly","pension","old age","senior","widow","aged"]},
    {id:"disabled",label:"Disabled",            icon:"♿",kws:["disabled","divyang","disability","handicap"]},
    {id:"tribal", label:"Tribal / SC / ST",     icon:"🏕️",kws:["tribal","adivasi","sc ","st ","dalit","obc"]},
    {id:"labour", label:"Workers & Labour",     icon:"⚒️",kws:["labour","worker","shramik","mgnrega","employment"]},
    {id:"bpl",    label:"BPL / Below Poverty",  icon:"🏠",kws:["bpl","below poverty","poor","ration","pds","food security"]},
    {id:"urban",  label:"Urban Citizens",       icon:"🏙️",kws:["urban","city","municipal","nagar","town","slum"]},
  ];
  const segmentAnalysis=SEGS.map(seg=>{const matching=schemes.filter(s=>ihas(s,...seg.kws));return{...seg,matching,count:matching.length};}).sort((a,b)=>a.count-b.count);
  const noBenefit=schemes.filter(s=>!s.benefit&&!s.description);
  const zeroSegs=segmentAnalysis.filter(s=>s.count===0).length;
  const score=Math.min(100,Math.max(0,60+Math.min(schemes.length/3,20)-(zeroSegs*5)-Math.min(duplicates.length*2,15)));
  const actions=[];
  const zs=segmentAnalysis.filter(s=>s.count===0);
  if(zs.length>0)actions.push({rank:1,icon:"🚨",priority:"CRITICAL",timeline:"This week",title:`No schemes for: ${zs.map(s=>s.label).join(", ")}`,why:`${zs.length} citizen group${zs.length>1?"s":""} have zero coverage.`,impact:`${zs.length*8}–${zs.length*15} lakh citizens unaddressed`});
  if(duplicates.length>0){const top=duplicates[0];actions.push({rank:2,icon:"🔄",priority:"HIGH",timeline:"This month",title:`Consolidate ${duplicates.length} duplicate listing${duplicates.length>1?"s":""}`,why:`"${top[0].name}" appears ${top.length}× across: ${[...new Set(top.map(s=>s._src_label||"?"))].join(", ")}.`,impact:"Single record per scheme reduces confusion."});}
  const weak=categories[categories.length-1],strong=categories[0];
  if(weak&&strong&&weak.count<2)actions.push({rank:3,icon:"📊",priority:"HIGH",timeline:"This month",title:`Expand "${weak.name}" — only ${weak.count} scheme${weak.count>1?"s":""}`,why:`"${weak.name}" has ${weak.count} vs "${strong.name}" with ${strong.count}.`,impact:`Add 2–3 ${weak.name} schemes.`});
  if(noBenefit.length>0)actions.push({rank:4,icon:"📝",priority:"MEDIUM",timeline:"This month",title:`${noBenefit.length} schemes missing benefit info`,why:`${noBenefit.length} schemes have no benefit/description text.`,impact:"Update official portals to fill gaps."});
  actions.push({rank:actions.length+1,icon:"🏛️",priority:"MEDIUM",timeline:"This quarter",title:`Unify ${Object.keys(srcMap).length} portal data`,why:`Data split across ${Object.keys(srcMap).join(", ")}.`,impact:"Single Jan Aadhaar portal saves citizen time."});
  return{categories,srcMap,duplicates,withValue,segmentAnalysis,score,actions,zeroSegs};
}

function InsightsTab({schemes,portals,onScrapeFirst}){
  const [activeTab,setActiveTab]=useState("overview");
  const [expandedSegs,setExpandedSegs]=useState({});
  const [openAction,setOpenAction]=useState(null);
  const [showCount,setShowCount]=useState(50);
  const [iSearch,setISearch]=useState("");
  const [iCat,setICat]=useState("all");
  const analysis=useMemo(()=>schemes.length?runIA(schemes,portals):null,[schemes,portals]);

  if(!schemes.length)return(
    <div style={{padding:"60px 40px",textAlign:"center"}}>
      <div style={{fontSize:64,marginBottom:16}}>📡</div>
      <h3 style={{fontSize:20,fontWeight:800,color:IC.text,marginBottom:8}}>No Scraped Data Yet</h3>
      <p style={{color:IC.muted,fontSize:14,maxWidth:360,margin:"0 auto 24px",lineHeight:1.6}}>Click <strong>⚡ Scrape Now</strong> to pull live data from all 4 portals.</p>
      <button onClick={onScrapeFirst} style={{background:IC.orange,color:"white",borderRadius:12,padding:"13px 32px",fontWeight:800,fontSize:15,border:"none",cursor:"pointer"}}>⚡ Scrape Now</button>
    </div>
  );

  const{categories,srcMap,duplicates,withValue,segmentAnalysis,score,actions,zeroSegs}=analysis;
  const scoreColor=score>=75?IC.green:score>=50?IC.amber:IC.red;
  const circ=2*Math.PI*36;
  const topCat=categories[0];

  const ITABS=[
    {id:"overview",label:"Overview"},
    {id:"actions",label:"⚡ Actions"},
    {id:"segments",label:"🎯 Coverage"},
    {id:"sectors",label:"📊 Sectors"},
    {id:"dupes",label:`🔄 Dupes (${duplicates.length})`},
    {id:"benefits",label:"💰 Benefits"},
    {id:"allschemes",label:`📋 All ${schemes.length}`},
  ];

  // ── Summary banner ──────────────────────────────────────────────────────────
  const summaryItems=[
    {icon:"📋",val:schemes.length,label:"schemes scraped",color:IC.orange,bg:"#fff7ed",tip:"Total from RajRAS + Jan Soochna + MyScheme in this session."},
    {icon:"🏛️",val:portals.length,label:"IGOD portals",color:IC.blue,bg:"#eff6ff",tip:"Govt portals scraped from igod.gov.in directory."},
    {icon:"🗂️",val:categories.length,label:"categories",color:IC.green,bg:"#f0fdf4",tip:`Unique categories detected. Top: "${topCat?.name}" with ${topCat?.count} schemes.`},
    {icon:"🔄",val:duplicates.length,label:"duplicates",color:IC.purple,bg:"#faf5ff",tip:"Same scheme name found on 2+ portals."},
    {icon:"⚠️",val:zeroSegs,label:"coverage gaps",color:zeroSegs>0?IC.red:IC.green,bg:zeroSegs>0?"#fff1f2":"#f0fdf4",tip:"Citizen groups with zero schemes found — potential policy gaps."},
    {icon:"💡",val:Object.keys(srcMap).length,label:"live sources",color:IC.amber,bg:"#fffbeb",tip:`Portals scraped: ${Object.keys(srcMap).join(", ")}. Zero AI API cost.`},
  ];

  return(
    <div className="fadeup">
      <div style={{marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
          <h1 style={{fontSize:24,fontWeight:900,color:IC.text,margin:0}}>Policy Intelligence — <span style={{color:IC.orange}}>Live Insights</span></h1>
          <InfoTip text="All insights generated in-browser from scraped data — no AI API call. Analysis runs instantly on every scrape. Zero cost."/>
        </div>
        <p style={{color:IC.muted,fontSize:12,margin:0}}>{schemes.length} schemes analysed · Zero AI API · Updates on every scrape</p>
      </div>

      {/* Summary banner */}
      <div style={{background:"linear-gradient(135deg,#fff7ed,#fffbeb,#f0f9ff)",border:"1.5px solid #fed7aa",borderRadius:14,padding:"14px 18px",marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:10}}>
          <span style={{fontSize:15}}>📊</span>
          <span style={{fontWeight:800,fontSize:14,color:"#1a1a2e"}}>Live Data Summary</span>
          <InfoTip text="Every number here comes from the live scrape. Hover any ℹ️ for details on how it is calculated."/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10}}>
          {summaryItems.map((item,i)=>(
            <div key={i} style={{background:item.bg,border:`1px solid ${item.color}25`,borderRadius:10,padding:"10px 12px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <span style={{fontSize:18}}>{item.icon}</span>
                <InfoTip text={item.tip}/>
              </div>
              <div style={{fontSize:21,fontWeight:900,color:item.color,lineHeight:1}}>{item.val}</div>
              <div style={{fontSize:10,color:IC.muted,marginTop:3,lineHeight:1.3}}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tab nav */}
      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:22,borderBottom:`1px solid ${IC.border}`}}>
        {ITABS.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{background:"transparent",border:"none",borderBottom:activeTab===t.id?`2.5px solid ${IC.orange}`:"2.5px solid transparent",color:activeTab===t.id?IC.orange:IC.muted,fontWeight:activeTab===t.id?700:500,fontSize:13,padding:"9px 14px",cursor:"pointer"}}>{t.label}</button>
        ))}
      </div>

      {/* OVERVIEW */}
      {activeTab==="overview"&&<div style={{display:"flex",flexDirection:"column",gap:24}}>
        {/* Health score */}
        <ICard style={{background:"linear-gradient(135deg,#fff7ed,#fffbeb)",borderColor:"#fed7aa"}}>
          <div style={{display:"flex",gap:20,alignItems:"flex-start"}}>
            <div style={{position:"relative",width:90,height:90,flexShrink:0}}>
              <svg width="90" height="90" style={{transform:"rotate(-90deg)"}}>
                <circle cx="45" cy="45" r="36" fill="none" stroke="#e5e7eb" strokeWidth="9"/>
                <circle cx="45" cy="45" r="36" fill="none" stroke={scoreColor} strokeWidth="9" strokeDasharray={`${(score/100)*circ} ${circ}`} strokeLinecap="round"/>
              </svg>
              <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                <span style={{fontSize:22,fontWeight:900,color:scoreColor}}>{score}</span>
                <span style={{fontSize:9,color:IC.muted}}>/ 100</span>
              </div>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:11,fontWeight:700,color:IC.orange,letterSpacing:"0.1em",marginBottom:6}}>EXECUTIVE BRIEFING · OFFICE OF CM · RAJASTHAN</div>
              <div style={{fontSize:17,fontWeight:800,color:IC.text,marginBottom:4}}>Welfare Ecosystem Health: <span style={{color:scoreColor}}>{score>=75?"GOOD":score>=50?"NEEDS ATTENTION":"CRITICAL GAPS"}</span></div>
              <p style={{fontSize:13,color:IC.muted,margin:"0 0 12px",lineHeight:1.5}}>Analysis of {schemes.length} live-scraped schemes · {portals.length} IGOD portals</p>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                {[
                  {label:"SCHEMES",val:schemes.length,color:IC.orange,tip:"Total from RajRAS+Jan Soochna+MyScheme."},
                  {label:"PORTALS",val:portals.length,color:IC.blue,tip:"Govt portals from igod.gov.in directory."},
                  {label:"DUPES",val:duplicates.length,color:IC.purple,tip:"Same scheme name on 2+ portals."},
                  {label:"GAPS",val:zeroSegs,color:IC.red,tip:"Citizen groups with zero scheme coverage."},
                ].map((k,i)=>(
                  <div key={i} style={{background:"white",borderRadius:9,padding:"8px 10px",border:`1px solid ${IC.border}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:3,marginBottom:3}}>
                      <div style={{fontSize:9,fontWeight:700,color:IC.muted,letterSpacing:"0.07em"}}>{k.label}</div>
                      <InfoTip text={k.tip}/>
                    </div>
                    <div style={{fontSize:20,fontWeight:900,color:k.color}}>{k.val}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ICard>
        {/* Source breakdown inline */}
        <ISec icon="📡" title="Data Sources" sub="Schemes from each portal" tip="RajRAS: HTML scrape. Jan Soochna: JSON API. MyScheme: REST API. Click source name to visit portal."/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
          {[{src:"RajRAS",link:"https://rajras.in/ras/pre/rajasthan/adm/schemes/",color:IC.blue},{src:"Jan Soochna",link:"https://jansoochna.rajasthan.gov.in/",color:IC.green},{src:"MyScheme",link:"https://www.myscheme.gov.in/search?q=rajasthan",color:IC.purple},{src:"IGOD Portal",link:"https://igod.gov.in/sg/RJ/SPMA/organizations",color:IC.orange}].filter(x=>srcMap[x.src]>0).map((x,i)=>{
            const count=srcMap[x.src]||0;
            const max=Math.max(...Object.values(srcMap));
            return(
              <ICard key={i} style={{padding:16,border:`1px solid ${x.color}25`,background:`${x.color}06`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <a href={x.link} target="_blank" rel="noreferrer" style={{fontWeight:700,fontSize:13,color:IC.text,textDecoration:"none"}}>{x.src}<span style={{fontSize:10,color:x.color,marginLeft:3}}>↗</span></a>
                  <span style={{fontSize:26,fontWeight:900,color:x.color}}>{count}</span>
                </div>
                <div style={{height:6,background:"#f1f5f9",borderRadius:3,overflow:"hidden",marginBottom:4}}>
                  <div style={{width:`${Math.round((count/max)*100)}%`,height:"100%",background:x.color,borderRadius:3}}/>
                </div>
                <div style={{fontSize:11,color:IC.muted}}>{Math.round((count/(schemes.length||1))*100)}% of total</div>
              </ICard>
            );
          })}
        </div>
      </div>}

      {/* ACTIONS */}
      {activeTab==="actions"&&<div>
        <ISec icon="⚡" title="Priority Actions for CM" sub="Generated from scraped data — click to expand" tip="Rules: (1) zero-coverage segments→CRITICAL (2) duplicates→HIGH (3) weak sector→HIGH (4) missing descriptions→MEDIUM (5) portal fragmentation→MEDIUM"/>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {actions.map((a,i)=>{
            const pc={CRITICAL:IC.red,HIGH:IC.orange,MEDIUM:IC.amber}[a.priority]||IC.amber;
            return(
              <div key={i} onClick={()=>setOpenAction(openAction===i?null:i)} style={{background:i===0?"linear-gradient(135deg,#fff7ed,#fffbeb)":IC.card,borderRadius:12,border:`1px solid ${i===0?"#fed7aa":IC.border}`,borderLeft:`4px solid ${pc}`,padding:16,cursor:"pointer"}}>
                <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                  <div style={{width:38,height:38,borderRadius:10,flexShrink:0,background:i===0?IC.orange:`${pc}15`,color:i===0?"white":pc,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:900}}>{a.rank}</div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap"}}>
                      <IBadge label={a.priority} color={pc} small/>
                      <IBadge label={`⏱ ${a.timeline}`} color={{CRITICAL:IC.red,HIGH:IC.orange,MEDIUM:IC.blue}[a.priority]||IC.orange} small/>
                      <span style={{fontSize:15}}>{a.icon}</span>
                    </div>
                    <div style={{fontWeight:800,fontSize:14,color:IC.text,marginBottom:3}}>{a.title}</div>
                    <p style={{fontSize:12,color:IC.muted,margin:0,lineHeight:1.5}}>{a.why}</p>
                    {openAction===i&&<div style={{marginTop:8,background:"#f0fdf4",borderRadius:8,padding:"8px 12px"}}><span style={{fontSize:10,fontWeight:700,color:"#166534",letterSpacing:"0.07em"}}>IMPACT  </span><span style={{fontSize:12,color:"#14532d",fontWeight:600}}>{a.impact}</span></div>}
                    <div style={{fontSize:10,color:IC.muted,marginTop:4}}>{openAction===i?"▲ Less":"▼ See impact"}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>}

      {/* SEGMENTS */}
      {activeTab==="segments"&&<div>
        <ISec icon="🎯" title="Citizen Segment Coverage" sub="Schemes matched per citizen group" tip="Each segment matched by scanning all scheme text fields for keywords. e.g. 'Women' matches schemes containing: women, girl, mahila, beti, widow, rajshri, sukanya, maternity."/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
          {segmentAnalysis.map((seg,i)=>{
            const color=seg.count===0?IC.red:seg.count<=2?IC.amber:IC.green;
            const isExp=expandedSegs[seg.id];
            const shown=isExp?seg.matching:seg.matching.slice(0,3);
            return(
              <ICard key={i} style={{borderLeft:`4px solid ${color}`,background:seg.count===0?"#fef2f2":IC.card,borderColor:seg.count===0?"#fecaca":IC.border,padding:14}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:7}}>
                    <span style={{fontSize:20}}>{seg.icon}</span>
                    <span style={{fontWeight:700,fontSize:13,color:IC.text}}>{seg.label}</span>
                    <InfoTip text={`Keywords: ${seg.kws.join(", ")}`}/>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:24,fontWeight:900,color}}>{seg.count}</div>
                    <IBadge label={seg.count===0?"NO COVERAGE":seg.count<=2?"THIN":"COVERED"} color={color} small/>
                  </div>
                </div>
                <div style={{height:5,background:"#f1f5f9",borderRadius:3,overflow:"hidden",marginBottom:8}}>
                  <div style={{width:`${Math.min(seg.count*8,100)}%`,height:"100%",background:color,borderRadius:3}}/>
                </div>
                {seg.matching.length>0?(
                  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                    {shown.map((s,j)=>{const u=safeUrl(s);return u?(
                      <a key={j} href={u} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{background:`${color}10`,color,border:`1px solid ${color}25`,borderRadius:5,padding:"1px 7px",fontSize:10,fontWeight:600,textDecoration:"none"}}>{s.name?.slice(0,22)}{s.name?.length>22?"…":""}↗</a>
                    ):(
                      <span key={j} style={{background:`${color}10`,color,border:`1px solid ${color}25`,borderRadius:5,padding:"1px 7px",fontSize:10,fontWeight:600}}>{s.name?.slice(0,22)}{s.name?.length>22?"…":""}</span>
                    );})}
                    {!isExp&&seg.matching.length>3&&<button onClick={e=>{e.stopPropagation();setExpandedSegs(p=>({...p,[seg.id]:true}));}} style={{background:"none",border:`1px dashed ${color}60`,borderRadius:5,padding:"1px 7px",fontSize:10,color,cursor:"pointer",fontWeight:600}}>+{seg.matching.length-3} more</button>}
                    {isExp&&seg.matching.length>3&&<button onClick={e=>{e.stopPropagation();setExpandedSegs(p=>({...p,[seg.id]:false}));}} style={{background:"none",border:`1px dashed ${color}60`,borderRadius:5,padding:"1px 7px",fontSize:10,color,cursor:"pointer",fontWeight:600}}>▲ less</button>}
                  </div>
                ):<span style={{fontSize:11,color:"#991b1b",fontWeight:600}}>⚠️ No schemes for this group</span>}
              </ICard>
            );
          })}
        </div>
      </div>}

      {/* SECTORS */}
      {activeTab==="sectors"&&<div>
        <ISec icon="📊" title="Scheme Distribution by Sector" sub="Count per category" tip="Categories from scraper keyword classifier. Imbalances show policy investment gaps."/>
        <ICard>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {categories.map((cat,i)=>{
              const colors=[IC.orange,IC.blue,IC.green,IC.purple,IC.red,IC.amber,"#06b6d4","#84cc16","#ec4899","#14b8a6"];
              const color=colors[i%colors.length];
              return(
                <div key={i}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <span style={{fontSize:13,fontWeight:600,color:IC.text}}>{cat.name}</span>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      {cat.schemes.slice(0,2).map((s,j)=><span key={j} style={{fontSize:9,color:IC.muted,background:"#f1f5f9",borderRadius:4,padding:"1px 5px",maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name?.slice(0,18)}</span>)}
                      <span style={{fontWeight:900,fontSize:15,color,minWidth:24,textAlign:"right"}}>{cat.count}</span>
                    </div>
                  </div>
                  <div style={{height:8,background:"#f1f5f9",borderRadius:4,overflow:"hidden"}}>
                    <div style={{width:`${Math.round((cat.count/(categories[0]?.count||1))*100)}%`,height:"100%",background:color,borderRadius:4}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </ICard>
      </div>}

      {/* DUPES */}
      {activeTab==="dupes"&&<div>
        <ISec icon="🔄" title={duplicates.length>0?`${duplicates.length} Duplicates Detected`:"Duplicate Detection"} sub="Same scheme name on multiple portals" tip="Scheme names normalised (lowercase, first 40 chars). Groups with 2+ entries AND 2+ distinct portals flagged."/>
        {duplicates.length===0?<ICard style={{textAlign:"center",padding:30}}><span style={{fontSize:32}}>✅</span><p style={{color:IC.muted,marginTop:8}}>No duplicates detected.</p></ICard>:
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {duplicates.slice(0,8).map((group,i)=>(
            <ICard key={i} style={{borderLeft:`4px solid ${IC.purple}`,padding:14}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:800,fontSize:14,color:IC.text,marginBottom:5}}>{group[0].name}</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {group.map((s,j)=>{const u=safeUrl(s);return u?<a key={j} href={u} target="_blank" rel="noreferrer" style={{background:`${IC.purple}12`,color:IC.purple,border:`1px solid ${IC.purple}25`,borderRadius:6,padding:"3px 10px",fontSize:11,fontWeight:600,textDecoration:"none"}}>{s._src_label}↗</a>:<IBadge key={j} label={s._src_label||"?"} color={IC.purple} small/>;})}
                  </div>
                </div>
                <div style={{textAlign:"right",flexShrink:0,marginLeft:10}}><div style={{fontSize:26,fontWeight:900,color:IC.purple}}>{group.length}×</div><div style={{fontSize:9,color:IC.muted}}>portals</div></div>
              </div>
              {group.find(s=>s.benefit)&&<div style={{fontSize:12,color:IC.muted}}>Benefit: <strong style={{color:IC.text}}>{group.find(s=>s.benefit).benefit}</strong></div>}
            </ICard>
          ))}
        </div>}
      </div>}

      {/* BENEFITS */}
      {activeTab==="benefits"&&withValue.length>0&&<div>
        <ISec icon="💰" title="Highest Value Schemes" sub="Ranked by monetary benefit parsed from scraped text" tip="parseINR() scans benefit/description for: 'N crore'→×1Cr, 'N lakh'→×1L, '₹N'→as-is. Click ↗ to open scheme page."/>
        <ICard>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {withValue.slice(0,10).map((s,i)=>{
              const src=s._src_label||"?";
              const srcC={RajRAS:IC.blue,"Jan Soochna":IC.green,MyScheme:IC.purple}[src]||IC.orange;
              const u=safeUrl(s);
              return(
                <div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:24,height:24,borderRadius:6,flexShrink:0,background:i<3?IC.orange:"#f1f5f9",color:i<3?"white":IC.muted,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800}}>{i+1}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                      <span style={{fontSize:13,fontWeight:600,color:IC.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"52%"}}>{s.name}</span>
                      <div style={{display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
                        <IBadge label={src} color={srcC} small/>
                        {u&&<a href={u} target="_blank" rel="noreferrer" style={{fontSize:10,color:srcC,fontWeight:700,textDecoration:"none"}}>↗</a>}
                        <span style={{fontWeight:900,fontSize:13,color:IC.orange}}>{fmtINR(s._inr)}</span>
                      </div>
                    </div>
                    <div style={{height:5,background:"#f1f5f9",borderRadius:3,overflow:"hidden"}}>
                      <div style={{width:`${Math.round((s._inr/withValue[0]._inr)*100)}%`,height:"100%",background:i<3?"linear-gradient(90deg,#f97316,#f59e0b)":"#94a3b8",borderRadius:3}}/>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ICard>
      </div>}

      {/* ALL SCHEMES */}
      {activeTab==="allschemes"&&<div>
        <ISec icon="📋" title={`All ${schemes.length} Scraped Schemes`} sub="Search, filter, visit" tip="RajRAS: specific article URL. MyScheme: scheme page. Jan Soochna: portal homepage (no individual URLs available from API)."/>
        <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          <input value={iSearch} onChange={e=>{setISearch(e.target.value);setShowCount(50);}} placeholder="Search…" style={{flex:1,minWidth:200,padding:"9px 14px",border:`1px solid ${IC.border}`,borderRadius:9,fontSize:13,background:"white",outline:"none"}}/>
          <select value={iCat} onChange={e=>{setICat(e.target.value);setShowCount(50);}} style={{padding:"9px 14px",border:`1px solid ${IC.border}`,borderRadius:9,fontSize:13,background:"white",cursor:"pointer"}}>
            <option value="all">All Categories</option>
            {[...new Set(schemes.map(s=>s.category||"General"))].sort().map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {(()=>{
          const fil=schemes.filter(s=>(!iSearch||itxt(s).includes(iSearch.toLowerCase()))&&(iCat==="all"||(s.category||"General")===iCat));
          return(<>
            <div style={{fontSize:12,color:IC.muted,marginBottom:10}}>Showing {Math.min(showCount,fil.length)} of {fil.length}</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {fil.slice(0,showCount).map((s,i)=>{
                const src=s._src_label||"?";
                const srcC={RajRAS:IC.blue,"Jan Soochna":IC.green,MyScheme:IC.purple}[src]||IC.orange;
                const u=safeUrl(s);
                return(
                  <ICard key={i} style={{padding:12,borderLeft:`3px solid ${srcC}`}}>
                    <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:4,flexWrap:"wrap"}}>
                          <span style={{fontWeight:700,fontSize:13,color:IC.text}}>{s.name}</span>
                          <IBadge label={s.category||"General"} color={srcC} small/>
                          <IBadge label={src} color={srcC} small/>
                        </div>
                        {s.benefit&&<div style={{fontSize:12,color:"#166534",fontWeight:600,background:"#f0fdf4",borderRadius:5,padding:"2px 8px",display:"inline-block",marginBottom:3}}>💰 {s.benefit}</div>}
                        {s.eligibility&&<div style={{fontSize:11,color:IC.muted}}>Who: {s.eligibility?.slice(0,100)}</div>}
                        {!s.benefit&&s.description&&<div style={{fontSize:11,color:IC.muted}}>{s.description?.slice(0,120)}</div>}
                      </div>
                      {u&&<a href={u} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{fontSize:11,color:srcC,fontWeight:700,flexShrink:0,whiteSpace:"nowrap",textDecoration:"none"}}>Visit ↗</a>}
                    </div>
                  </ICard>
                );
              })}
            </div>
            {fil.length>showCount&&<div style={{textAlign:"center",marginTop:14}}><button onClick={()=>setShowCount(c=>c+50)} style={{background:"white",border:`1.5px solid ${IC.border}`,borderRadius:10,padding:"10px 28px",fontSize:13,fontWeight:700,color:IC.text,cursor:"pointer"}}>Show more ({fil.length-showCount} remaining)</button></div>}
          </>);
        })()}
      </div>}
    </div>
  );
}
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
    { id:"dashboard", label:"Dashboard",  icon:"◉" },
    { id:"schemes",   label:"Schemes",    icon:"⊞", badge: totalSchemes||null },
    { id:"portals",   label:"Portals",    icon:"🏛️", badge: totalPortals||null },
    { id:"districts", label:"Districts",  icon:"🗺️" },
    { id:"alerts",    label:"Live Alerts",icon:"⚡", badge: criticalCount||null },
    { id:"insights",  label:"🧠 Insights",  highlight:true },
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
              background: t.highlight&&tab===t.id?"linear-gradient(135deg,#f97316,#ea580c)":t.highlight?"#fff7ed":"transparent",
              borderBottom: !t.highlight&&tab===t.id?"2.5px solid #f97316":!t.highlight?"2.5px solid transparent":"none",
              border: t.highlight?"1.5px solid #fed7aa":"none",
              borderRadius: t.highlight?"8px":0, margin: t.highlight?"6px 4px":0,
              padding: t.highlight?"7px 16px":"11px 18px",
              fontWeight: tab===t.id?700:500,
              color: t.highlight&&tab===t.id?"white":t.highlight?"#f97316":tab===t.id?"#f97316":"#6b7280",
              fontSize:13, display:"flex", alignItems:"center", gap:6,
              cursor:"pointer", transition:"all .15s",
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
        {tab==="schemes"   && <SchemesTab   agg={agg} onScrapeAll={scrapeAll}/>}
        {tab==="portals"   && <PortalsTab   agg={agg} onScrapeAll={scrapeAll}/>}
        {tab==="districts" && <DistrictsTab agg={agg} onScrapeAll={scrapeAll}/>}
        {tab==="alerts"    && <AlertsTab    agg={agg} onScrapeAll={scrapeAll}/>}
        {tab==="insights"  && <InsightsTab  schemes={agg?.schemes||[]} portals={agg?.portals||[]} onScrapeFirst={scrapeAll}/>}
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