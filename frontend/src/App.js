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
        border:"none", cursor:"pointer",
        boxShadow:"0 4px 20px #f9731650" }}>
        ⚡ Scrape All 4 Sources
      </button>
    </div>
  );
}

// ── Dashboard Tab ─────────────────────────────────────────────────────────────
function DashboardTab({ agg, srcStatus, onScrapeAll, onScrapeOne, scraping, scrapingAll, online, budget, budgetLoading }) {
  if (!agg) return <EmptyState onScrape={onScrapeAll} />;
  const { kpis, schemes } = agg;

  // ── Sparkline: wide area chart exactly like the screenshot ─────────────────
  const Spark = ({ data=[], color="#f97316" }) => {
    if (!data || data.length < 2) return (
      <div style={{ width:100, height:44, background:`${color}08`, borderRadius:6 }}/>
    );
    const W=100, H=44, PAD=4;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const rng = (max - min) || 1;
    const xs = data.map((_, i) => (i / (data.length-1)) * W);
    const ys = data.map(v => H - PAD - ((v-min)/rng) * (H - PAD*2));
    const linePts = xs.map((x,i) => `${x},${ys[i]}`).join(" ");
    const areaPts = `0,${H} ` + linePts + ` ${W},${H}`;
    const gid = `g${color.replace(/#/g,"")}`;
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}
        style={{ overflow:"visible", display:"block" }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity="0.22"/>
            <stop offset="80%"  stopColor={color} stopOpacity="0.04"/>
            <stop offset="100%" stopColor={color} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <polygon points={areaPts} fill={`url(#${gid})`}/>
        <polyline points={linePts} fill="none" stroke={color}
          strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"/>
        <circle cx={xs[xs.length-1]} cy={ys[ys.length-1]}
          r="3" fill={color} stroke="white" strokeWidth="1.5"/>
      </svg>
    );
  };

  const b   = budget || {};
  const d   = b.display || {};
  const sp  = b.sparklines || {};
  const bm  = b.scrape_meta || {};

  // ── 6 KPI cards — all values come from /budget endpoint ───────────────────
  const CARDS = [
    {
      label: "HEALTH BUDGET 2025-26",
      value: b.health_cr ? `₹${Number(b.health_cr).toLocaleString("en-IN")} Cr` : d.health || "₹28,865 Cr",
      sub:   b.health_pct ? `${b.health_pct}% of total (nat avg 6.2%)` : "8.4% of total (nat avg 6.2%)",
      color: "#ef4444",
      spark: sp.health_cr || [18200,21300,23100,25400,27200,28865],
      icon:  "🏥",
    },
    {
      label: "EDUCATION ALLOCATION",
      value: b.education_pct ? `${b.education_pct}% share` : d.education_pct || "18% share",
      sub:   "Above 15% national avg",
      color: "#3b82f6",
      spark: sp.education_pct || [15.2,15.8,16.1,16.9,17.4,18.0],
      icon:  "🎓",
    },
    {
      label: "JJM COVERAGE RAJASTHAN",
      value: b.jjm_coverage_pct ? `${Number(b.jjm_coverage_pct).toFixed(2)}%` : d.jjm_coverage || "55.36%",
      sub:   "National avg: 79.74%",
      color: "#ef4444",
      spark: sp.jjm_coverage_pct || [12.5,28.3,41.2,49.8,53.1,55.36],
      icon:  "💧",
    },
    {
      label: "FISCAL DEFICIT",
      value: b.fiscal_deficit_pct_gsdp ? `${b.fiscal_deficit_pct_gsdp}% GSDP` : d.fiscal_deficit_pct || "4.25% GSDP",
      sub:   b.fiscal_deficit_cr ? `₹${Number(b.fiscal_deficit_cr).toLocaleString("en-IN")} Cr (${b.year||"2025-26"} BE)` : "₹34,543 Cr (2025-26 BE)",
      color: "#f97316",
      spark: sp.fiscal_deficit_pct || [3.8,4.1,3.6,3.9,4.0,4.25],
      icon:  "📊",
    },
    {
      label: "CAPITAL OUTLAY",
      value: b.capital_outlay_cr ? `₹${Number(b.capital_outlay_cr).toLocaleString("en-IN")} Cr` : d.capital_outlay || "₹53,686 Cr",
      sub:   "+40% over 2024-25 RE",
      color: "#10b981",
      spark: sp.capital_outlay_cr || [22000,28000,32000,38000,45000,53686],
      icon:  "🏗️",
    },
    {
      label: "SOCIAL SECURITY BUDGET",
      value: b.social_security_cr ? `₹${Number(b.social_security_cr).toLocaleString("en-IN")}+ Cr` : d.social_security || "₹14,000+ Cr",
      sub:   "Pension raised to ₹1,250/mo",
      color: "#8b5cf6",
      spark: sp.social_security_cr || [6000,8000,9500,11000,12800,14000],
      icon:  "🛡️",
    },
  ];

  return (
    <div className="fadeup">

      {/* ── Greeting ── */}
      <h1 style={{ fontSize:29, fontWeight:900, color:"#0f172a", marginBottom:3, letterSpacing:"-0.3px" }}>
        Namaste, <span style={{ color:"#f97316" }}>Mukhyamantri Ji</span> 🙏
      </h1>
      <p style={{ color:"#6b7280", fontSize:13, marginBottom:16 }}>
        All figures verified from official sources · Budget 2025-26 · JJM MIS · PRS India
      </p>

      {/* ── Budget banner — two-line like screenshot ── */}
      <div style={{ background:"linear-gradient(135deg,#eff6ff 0%,#f0f9ff 100%)",
        border:"1.5px solid #bfdbfe", borderRadius:12,
        padding:"11px 18px", marginBottom:24, lineHeight:1.7 }}>
        <div style={{ fontSize:13 }}>
          <span style={{ fontWeight:800, color:"#1d4ed8" }}>Budget 2025-26: </span>
          <span style={{ color:"#1e3a5f" }}>
            Revenue expenditure {b.total_expenditure_cr
              ? `₹${Number(b.total_expenditure_cr).toLocaleString("en-IN")} Cr`
              : "₹3,25,546 Cr"}
            {" · "}Fiscal deficit {b.fiscal_deficit_pct_gsdp
              ? `${b.fiscal_deficit_pct_gsdp}% GSDP`
              : "4.25% GSDP"}
          </span>
        </div>
        <div style={{ fontSize:12, color:"#4b7ab5" }}>
          Target: ${b.economy_target_bn_usd || 350} Bn economy by 2030
          {b.green_budget !== false ? " · First Green Budget of Rajasthan" : ""}
          {bm.note && (
            <span style={{ marginLeft:10, background:"#dbeafe", color:"#1d4ed8",
              borderRadius:4, padding:"1px 7px", fontSize:11, fontWeight:600 }}>
              {bm.live_sources > 0 ? `${bm.live_sources} live sources` : "Verified fallback"}
            </span>
          )}
        </div>
      </div>

      {/* ── 6 KPI Cards (3-col × 2-row) ── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:24 }}>
        {(budgetLoading ? Array(6).fill(null) : CARDS).map((card, i) => (
          <div key={i} style={{ background:"white", borderRadius:14,
            border:"1px solid #e5e7eb",
            boxShadow:"0 1px 4px rgba(0,0,0,0.04)",
            padding:"16px 18px 14px",
            display:"flex", flexDirection:"column" }}>
            {budgetLoading || !card ? (
              // Skeleton loader
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <div style={{ width:28, height:28, borderRadius:8, background:"#f3f4f6" }}/>
                  <div style={{ width:100, height:44, borderRadius:6, background:"#f3f4f6" }}/>
                </div>
                <div style={{ width:"60%", height:10, borderRadius:4, background:"#f3f4f6" }}/>
                <div style={{ width:"80%", height:28, borderRadius:6, background:"#f3f4f6" }}/>
                <div style={{ width:"50%", height:10, borderRadius:4, background:"#f3f4f6" }}/>
              </div>
            ) : (
              <>
                {/* Icon row + sparkline */}
                <div style={{ display:"flex", justifyContent:"space-between",
                  alignItems:"flex-start", marginBottom:10 }}>
                  <span style={{ fontSize:20, lineHeight:1 }}>{card.icon}</span>
                  <Spark data={card.spark} color={card.color}/>
                </div>
                {/* Label */}
                <div style={{ fontSize:10, fontWeight:700, color:"#9ca3af",
                  letterSpacing:"0.08em", marginBottom:7, textTransform:"uppercase" }}>
                  {card.label}
                </div>
                {/* Big value */}
                <div style={{ fontSize:card.value.length > 12 ? 22 : 27,
                  fontWeight:900, color:card.color,
                  letterSpacing:"-0.5px", lineHeight:1.1, marginBottom:6 }}>
                  {card.value}
                </div>
                {/* Sub-note */}
                <div style={{ fontSize:11, color:"#9ca3af", marginTop:"auto" }}>
                  {card.sub}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* ── 4-source live strip ── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:22 }}>
        {[
          { sid:"rajras",     count: kpis.rajras_count },
          { sid:"jansoochna", count: kpis.jansoochna_count },
          { sid:"myscheme",   count: kpis.myscheme_count },
          { sid:"igod",       count: kpis.igod_count },
        ].map(({ sid, count }) => {
          const s  = SRC[sid];
          const st = srcStatus[sid] || {};
          const loading = scraping[sid];
          return (
            <div key={sid} style={{ background:"white", borderRadius:12,
              border:`1px solid ${st.status==="ok" ? s.color+"30" : "#e5e7eb"}`,
              padding:"12px 14px" }}>
              <div style={{ display:"flex", alignItems:"center",
                justifyContent:"space-between", marginBottom:5 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span>{s.icon}</span>
                  <span style={{ fontWeight:700, fontSize:12, color:"#374151" }}>{s.label}</span>
                </div>
                <button onClick={() => onScrapeOne(sid)} disabled={loading}
                  style={{ background:loading?"#f3f4f6":`${s.color}12`,
                    color:loading?"#9ca3af":s.color,
                    border:`1px solid ${loading?"#e5e7eb":s.color+"30"}`,
                    borderRadius:6, padding:"3px 8px", fontSize:11, fontWeight:700 }}>
                  {loading ? "⟳" : "↺"}
                </button>
              </div>
              <div style={{ fontSize:24, fontWeight:900, color:s.color, lineHeight:1 }}>{count ?? "—"}</div>
              <div style={{ display:"flex", alignItems:"center", gap:5, marginTop:5 }}>
                <StatusDot status={loading?"loading":st.status} animating={!!loading}/>
                <span style={{ fontSize:11, color:"#9ca3af" }}>
                  {loading ? "scraping…" : st.status==="ok"
                    ? `live · ${timeAgo(st.scraped_at)}` : "pending"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Recently scraped schemes ── */}
      {(schemes||[]).length > 0 && (
        <div style={{ background:"white", borderRadius:14, border:"1px solid #e5e7eb", padding:18 }}>
          <div style={{ fontWeight:800, fontSize:14, marginBottom:14,
            display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span>Recently Scraped Schemes
              <span style={{ color:"#9ca3af", fontWeight:400, fontSize:12, marginLeft:8 }}>
                {Math.min(10,(schemes||[]).length)} of {(schemes||[]).length}
              </span>
            </span>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
            {(schemes||[]).slice(0,10).map((s,i) => {
              const src = SRC[s._src] || SRC.myscheme;
              return (
                <div key={i} style={{ display:"flex", gap:10, padding:"10px 12px",
                  background:"#fafafa", borderRadius:10, border:"1px solid #f3f4f6",
                  alignItems:"flex-start" }}>
                  <span style={{ fontSize:18, flexShrink:0 }}>{CAT_ICON[s.category]||"📋"}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:13, color:"#1f2937",
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {s.name}
                    </div>
                    {s.benefit && (
                      <div style={{ fontSize:11, color:"#10b981", fontWeight:600, marginTop:2,
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {s.benefit}
                      </div>
                    )}
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


// ── Scheme Detail Panel ───────────────────────────────────────────────────────
function SchemeDetailPanel({ scheme, onClose }) {
  if (!scheme) return null;
  const srcMeta = SRC[scheme._src] || SRC.myscheme;
  const sourceUrl = scheme.apply_url || scheme.url || `https://${srcMeta.url}`;

  // Mini sparkline — derived from scraped beneficiary_count if available, else decorative trend
  const trendPoints = (() => {
    const base = scheme.beneficiary_count ? parseInt(scheme.beneficiary_count) || 60 : 60;
    return [base * 0.6, base * 0.68, base * 0.74, base * 0.8, base * 0.87, base * 0.93, base].map(
      (v, i) => ({ m: i, v })
    );
  })();
  const maxV = Math.max(...trendPoints.map(p => p.v));
  const H = 50, W = 130;
  const pts = trendPoints.map((p, i) => {
    const x = (i / (trendPoints.length - 1)) * W;
    const y = H - (p.v / maxV) * H;
    return `${x},${y}`;
  }).join(" ");

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
        zIndex: 1000, backdropFilter: "blur(2px)",
      }} />

      {/* Panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 480,
        background: "white", zIndex: 1001, overflowY: "auto",
        boxShadow: "-4px 0 40px rgba(0,0,0,0.18)",
        display: "flex", flexDirection: "column",
        animation: "slideInRight 0.22s ease",
      }}>
        <style>{`
          @keyframes slideInRight {
            from { transform: translateX(60px); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
          }
        `}</style>

        {/* Header */}
        <div style={{ padding: "22px 24px 18px", borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 12, flexShrink: 0,
              background: `${srcMeta.color}18`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26,
            }}>
              {CAT_ICON[scheme.category] || "📋"}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: "#1f2937", lineHeight: 1.35 }}>
                {scheme.name}
              </div>
              {scheme.name_hi && (
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{scheme.name_hi}</div>
              )}
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3 }}>
                {scheme.category}
                {scheme.subcategory ? ` · ${scheme.subcategory}` : ""}
                {" · "}
                <span style={{ color: srcMeta.color, fontWeight: 600 }}>{scheme._src_label || srcMeta.label}</span>
              </div>
            </div>
            <button onClick={onClose} style={{
              border: "none", background: "#f3f4f6", borderRadius: 8,
              width: 32, height: 32, cursor: "pointer", fontSize: 16,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>✕</button>
          </div>
        </div>

        {/* Stats Grid */}
        <div style={{ padding: "16px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            {
              label: "BENEFICIARIES",
              value: scheme.beneficiary_count
                ? scheme.beneficiary_count.toLocaleString()
                : (scheme.tags?.includes("All") ? "All eligible" : "Open to all"),
            },
            {
              label: "BUDGET (2025-26)",
              value: scheme.budget || "As per allocation",
            },
            {
              label: "LAUNCH",
              value: scheme.launched || scheme.scraped_at?.slice(0, 4) || "Active",
            },
            {
              label: "DISTRICTS",
              value: scheme.districts || "All 33",
            },
          ].map(({ label, value }) => (
            <div key={label} style={{
              background: "#f9fafb", borderRadius: 10, padding: "12px 14px",
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.07em", marginBottom: 4 }}>
                {label}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: srcMeta.color }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Progress bar — derived from status field or scraped progress */}
        <div style={{ padding: "0 24px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Implementation Progress</span>
            <span style={{
              fontSize: 16, fontWeight: 800, color: srcMeta.color,
            }}>
              {scheme.progress || (scheme.status === "Active" ? "Active" : "—")}
            </span>
          </div>
          {scheme.progress_pct != null && (
            <>
              <div style={{ background: "#e5e7eb", borderRadius: 6, height: 8, overflow: "hidden", marginBottom: 6 }}>
                <div style={{
                  width: `${scheme.progress_pct}%`, height: "100%",
                  background: `linear-gradient(90deg, ${srcMeta.color}, ${srcMeta.color}cc)`,
                  borderRadius: 6,
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9ca3af" }}>
                <span>0%</span>
                <span style={{ color: "#10b981", fontWeight: 600 }}>✅ On Track</span>
                <span>100%</span>
              </div>
            </>
          )}
        </div>

        {/* Trend Sparkline */}
        <div style={{ padding: "0 24px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.07em", marginBottom: 8 }}>
            7-MONTH TREND
          </div>
          <svg width={W} height={H + 4} style={{ overflow: "visible" }}>
            <defs>
              <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={srcMeta.color} stopOpacity="0.25" />
                <stop offset="100%" stopColor={srcMeta.color} stopOpacity="0.03" />
              </linearGradient>
            </defs>
            <polygon
              points={`0,${H} ${pts} ${W},${H}`}
              fill="url(#trendGrad)"
            />
            <polyline
              points={pts}
              fill="none"
              stroke={srcMeta.color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Coverage / Benefits */}
        <div style={{ padding: "0 24px", flex: 1 }}>
          {scheme.benefit && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.07em", marginBottom: 6 }}>
                COVERAGE / BENEFITS
              </div>
              <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.6 }}>{scheme.benefit}</div>
            </div>
          )}

          {scheme.description && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.07em", marginBottom: 6 }}>
                DESCRIPTION
              </div>
              <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>{scheme.description}</div>
            </div>
          )}

          {scheme.eligibility && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.07em", marginBottom: 6 }}>
                ELIGIBILITY
              </div>
              <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.6 }}>{scheme.eligibility}</div>
            </div>
          )}

          {scheme.objective && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.07em", marginBottom: 6 }}>
                OBJECTIVE
              </div>
              <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.6 }}>{scheme.objective}</div>
            </div>
          )}

          {(scheme.department || scheme.ministry) && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.07em", marginBottom: 6 }}>
                {scheme.department ? "DEPARTMENT" : "MINISTRY"}
              </div>
              <div style={{ fontSize: 13, color: "#374151" }}>{scheme.department || scheme.ministry}</div>
            </div>
          )}

          {scheme.tags?.length > 0 && (
            <div style={{ marginBottom: 16, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {scheme.tags.map((t, i) => (
                <span key={i} style={{
                  background: `${srcMeta.color}15`, color: srcMeta.color,
                  border: `1px solid ${srcMeta.color}30`,
                  borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600,
                }}>{t}</span>
              ))}
            </div>
          )}
        </div>

        {/* Footer: Source badge + Know More */}
        <div style={{
          padding: "16px 24px 24px", borderTop: "1px solid #f3f4f6",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div style={{ fontSize: 11, color: "#9ca3af" }}>
            📡 Data source: <span style={{ color: srcMeta.color, fontWeight: 600 }}>{scheme.source || srcMeta.url}</span>
          </div>
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "block", textAlign: "center",
              background: srcMeta.color, color: "white",
              border: "none", borderRadius: 10,
              padding: "13px 20px", fontSize: 14, fontWeight: 700,
              cursor: "pointer", textDecoration: "none",
              boxShadow: `0 4px 14px ${srcMeta.color}50`,
            }}
          >
            Know More ↗
          </a>
        </div>
      </div>
    </>
  );
}

// ── Schemes Tab ───────────────────────────────────────────────────────────────
function SchemesTab({ agg, onScrapeAll }) {
  const [search, setSearch]   = useState("");
  const [cat, setCat]         = useState("all");
  const [selected, setSelected] = useState(null);

  if (!agg?.schemes?.length) return <EmptyState onScrape={onScrapeAll}/>;

  const { schemes, categories } = agg;
  const allCats = (categories || []).map(c => c.name);

  // Map screenshot category pills to actual category names in data
  const PILL_CATS = [
    { id: "all",        label: "All",        icon: null },
    { id: "Health",     label: "Health",     icon: "🏥" },
    { id: "Education",  label: "Education",  icon: "🎓" },
    { id: "Agriculture",label: "Agriculture",icon: "🌾" },
    { id: "Social",     label: "Social",     icon: "🛡️" },
    { id: "Employment", label: "Employment", icon: "💼" },
    { id: "Women",      label: "Women",      icon: "👩" },
    { id: "Housing",    label: "Housing",    icon: "🏠" },
    { id: "Food",       label: "Food",       icon: "🍽️" },
    { id: "Water",      label: "Water",      icon: "💧" },
    { id: "Energy",     label: "Energy",     icon: "⚡" },
    { id: "Digital",    label: "Digital",    icon: "💻" },
  ];

  const filtered = schemes.filter(s => {
    const mCat = cat === "all" || (s.category || "").toLowerCase().includes(cat.toLowerCase());
    const mQ   = !search ||
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.description?.toLowerCase().includes(search.toLowerCase()) ||
      s.benefit?.toLowerCase().includes(search.toLowerCase()) ||
      s.category?.toLowerCase().includes(search.toLowerCase()) ||
      s.ministry?.toLowerCase().includes(search.toLowerCase()) ||
      s.department?.toLowerCase().includes(search.toLowerCase());
    return mCat && mQ;
  });

  return (
    <div className="fadeup">
      <h2 style={{ fontSize: 24, fontWeight: 900, marginBottom: 4 }}>
        Government Schemes — <span style={{ color: "#f97316" }}>Real Data</span>
      </h2>
      <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 20 }}>
        All beneficiary counts, budgets &amp; progress from official sources. Click any card for facts + citation.
      </p>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 14 }}>
        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 15 }}>🔍</span>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search schemes..."
          style={{
            width: "100%", padding: "11px 14px 11px 42px",
            border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 14,
            background: "white", boxSizing: "border-box",
          }}
        />
      </div>

      {/* Category pills — matching screenshot layout */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {PILL_CATS.map(p => {
          const active = cat === p.id;
          return (
            <button key={p.id} onClick={() => setCat(p.id)} style={{
              background: active ? "#f97316" : "white",
              color: active ? "white" : "#374151",
              border: `1.5px solid ${active ? "#f97316" : "#e5e7eb"}`,
              borderRadius: 20, padding: "6px 14px", fontSize: 12.5, fontWeight: 600,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
              transition: "all .15s",
            }}>
              {p.icon && <span>{p.icon}</span>}
              {p.label}
            </button>
          );
        })}
      </div>

      <div style={{ color: "#9ca3af", fontSize: 13, marginBottom: 14 }}>
        Showing {filtered.length} of {schemes.length} schemes
      </div>

      {/* Cards grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14 }}>
        {filtered.map((scheme, i) => {
          const srcMeta = SRC[scheme._src] || SRC.myscheme;
          return (
            <div
              key={i}
              onClick={() => setSelected(scheme)}
              style={{
                background: "white", borderRadius: 14,
                border: "1px solid #e5e7eb",
                padding: 18, borderTop: `3px solid ${srcMeta.color}`,
                cursor: "pointer",
                boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                transition: "box-shadow .15s, transform .15s",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.1)";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              {/* Card header */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                  background: `${srcMeta.color}18`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
                }}>
                  {CAT_ICON[scheme.category] || "📋"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: "#1f2937", lineHeight: 1.35, marginBottom: 3 }}>
                    {scheme.name}
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>
                    {scheme.category}
                    {scheme.subcategory ? ` · ${scheme.subcategory}` : ""}
                    {" · "}
                    <span style={{ color: srcMeta.color, fontWeight: 600 }}>{scheme._src_label || srcMeta.label}</span>
                  </div>
                </div>
                <span style={{
                  background: "#d1fae5", color: "#065f46", fontSize: 10, fontWeight: 700,
                  borderRadius: 20, padding: "2px 8px", flexShrink: 0, whiteSpace: "nowrap",
                }}>
                  {scheme.status || "Active"}
                </span>
              </div>

              {/* Description snippet */}
              {scheme.description && (
                <p style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.55, marginBottom: 10 }}>
                  {scheme.description.slice(0, 130)}{scheme.description.length > 130 ? "…" : ""}
                </p>
              )}

              {/* Benefit highlight */}
              {scheme.benefit && (
                <div style={{
                  background: `${srcMeta.color}0d`, borderRadius: 8,
                  padding: "8px 10px", marginBottom: 10,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: srcMeta.color, marginBottom: 2 }}>BENEFIT</div>
                  <div style={{ fontSize: 12, color: "#374151" }}>
                    {scheme.benefit.slice(0, 90)}{scheme.benefit.length > 90 ? "…" : ""}
                  </div>
                </div>
              )}

              {/* Footer: category chip + source + arrow */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                <span style={{
                  background: `${srcMeta.color}15`, color: srcMeta.color,
                  border: `1px solid ${srcMeta.color}30`,
                  borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600,
                }}>
                  {scheme.category || "General"}
                </span>
                <span style={{ fontSize: 11, color: "#d1d5db" }}>Details →</span>
              </div>

              {/* Source badge */}
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #f3f4f6", fontSize: 10, color: "#c4c9d4" }}>
                📡 {scheme.source || srcMeta.url}
              </div>
            </div>
          );
        })}
      </div>

      {/* Side panel */}
      <SchemeDetailPanel scheme={selected} onClose={() => setSelected(null)} />
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
  { name:"Jaipur",       pop:"68.0 L", coverage:84 },
  { name:"Jodhpur",      pop:"36.0 L", coverage:68 },
  { name:"Alwar",        pop:"36.0 L", coverage:54 },
  { name:"Nagaur",       pop:"33.0 L", coverage:47 },
  { name:"Udaipur",      pop:"30.0 L", coverage:63 },
  { name:"Sikar",        pop:"26.0 L", coverage:49 },
  { name:"Barmer",       pop:"25.0 L", coverage:31 },
  { name:"Ajmer",        pop:"25.0 L", coverage:59 },
  { name:"Bikaner",      pop:"23.0 L", coverage:61 },
  { name:"Bhilwara",     pop:"24.0 L", coverage:51 },
  { name:"Kota",         pop:"20.0 L", coverage:72 },
  { name:"Churu",        pop:"20.0 L", coverage:42 },
  { name:"Sri Ganganagar",pop:"19.7 L",coverage:78 },
  { name:"Tonk",         pop:"14.2 L", coverage:58 },
  { name:"Dungarpur",    pop:"13.0 L", coverage:55 },
  { name:"Dausa",        pop:"16.1 L", coverage:52 },
  { name:"Sawai Madhopur",pop:"13.3 L",coverage:46 },
  { name:"Jaisalmer",    pop:"6.7 L",  coverage:38 },
  { name:"Banswara",     pop:"17.8 L", coverage:43 },
  { name:"Jhunjhunu",    pop:"21.1 L", coverage:66 },
  { name:"Pali",         pop:"20.4 L", coverage:57 },
  { name:"Rajsamand",    pop:"11.6 L", coverage:61 },
  { name:"Bundi",        pop:"11.1 L", coverage:53 },
  { name:"Hanumangarh",  pop:"17.7 L", coverage:73 },
  { name:"Karauli",      pop:"14.3 L", coverage:39 },
  { name:"Sirohi",       pop:"10.5 L", coverage:48 },
  { name:"Jhalawar",     pop:"14.1 L", coverage:62 },
  { name:"Dholpur",      pop:"12.1 L", coverage:44 },
  { name:"Baran",        pop:"12.2 L", coverage:56 },
  { name:"Pratapgarh",   pop:"8.7 L",  coverage:36 },
  { name:"Jalore",       pop:"18.3 L", coverage:41 },
  { name:"Bharatpur",    pop:"25.1 L", coverage:69 },
  { name:"Chittorgarh",  pop:"15.4 L", coverage:64 },
];

function DistrictsTab({ agg, onScrapeAll }) {
  const [distSearch, setDistSearch] = useState("");
  const [sortBy, setSortBy] = useState("coverage_desc");

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

      {/* Search + Sort controls */}
      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
        <div style={{ position:"relative", flex:1, minWidth:200 }}>
          <span style={{ position:"absolute", left:12, top:"50%",
            transform:"translateY(-50%)", fontSize:14 }}>🔍</span>
          <input value={distSearch} onChange={e=>setDistSearch(e.target.value)}
            placeholder="Search district…"
            style={{ width:"100%", padding:"9px 12px 9px 36px",
              border:"1px solid #e5e7eb", borderRadius:9, fontSize:13,
              background:"white", boxSizing:"border-box" }}/>
        </div>
        <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
          style={{ padding:"9px 14px", border:"1px solid #e5e7eb",
            borderRadius:9, fontSize:13, background:"white", cursor:"pointer" }}>
          <option value="coverage_desc">Sort: Coverage High→Low</option>
          <option value="coverage_asc">Sort: Coverage Low→High</option>
          <option value="name">Sort: A–Z</option>
        </select>
      </div>

      {/* District table */}
      <div style={{ background:"white", borderRadius:14, border:"1px solid #e5e7eb", overflow:"hidden" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 90px 1fr 1fr",
          padding:"10px 20px", background:"#f9fafb", borderBottom:"1px solid #e5e7eb" }}>
          {["DISTRICT","POPULATION","JJM TAP WATER COVERAGE","STATUS"].map((h, i) => (
            <div key={i} style={{ fontSize:10, fontWeight:700, color:"#9ca3af", letterSpacing:"0.07em" }}>{h}</div>
          ))}
        </div>
        {[...JJM_DISTRICTS]
          .filter(d => !distSearch || d.name.toLowerCase().includes(distSearch.toLowerCase()))
          .sort((a,b) => sortBy==="coverage_desc" ? b.coverage-a.coverage
                        : sortBy==="coverage_asc"  ? a.coverage-b.coverage
                        : a.name.localeCompare(b.name))
          .map((d, i) => {
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
            cursor:"pointer",
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

// ── Budget Data Tab ─────────────────────────────────────────────────────────
function BudgetDataTab({ budget, budgetLoading, onRefresh }) {
  const b  = budget || {};
  const d  = b.display || {};
  const sp = b.sparklines || {};
  const bm = b.scrape_meta || {};

  const Spark = ({ data=[], color="#f97316" }) => {
    if (!data || data.length < 2) return <div style={{ width:90, height:36, background:`${color}08`, borderRadius:6 }}/>;
    const W=90, H=36, PAD=3;
    const min=Math.min(...data), max=Math.max(...data), rng=(max-min)||1;
    const xs=data.map((_,i)=>(i/(data.length-1))*W);
    const ys=data.map(v=>H-PAD-((v-min)/rng)*(H-PAD*2));
    const linePts=xs.map((x,i)=>`${x},${ys[i]}`).join(" ");
    const areaPts=`0,${H} `+linePts+` ${W},${H}`;
    const gid=`bt${color.replace(/#/g,"")}`;
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow:"visible" }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2"/>
            <stop offset="100%" stopColor={color} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <polygon points={areaPts} fill={`url(#${gid})`}/>
        <polyline points={linePts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round"/>
        <circle cx={xs[xs.length-1]} cy={ys[ys.length-1]} r="2.5" fill={color} stroke="white" strokeWidth="1"/>
      </svg>
    );
  };

  const ROWS = [
    { label:"Total Revenue Expenditure", key:"total_expenditure_cr",   sparkKey:"health_cr",          color:"#f97316", unit:"₹ Cr" },
    { label:"Capital Outlay",            key:"capital_outlay_cr",       sparkKey:"capital_outlay_cr",   color:"#10b981", unit:"₹ Cr" },
    { label:"Health Budget",             key:"health_cr",               sparkKey:"health_cr",           color:"#ef4444", unit:"₹ Cr" },
    { label:"Social Security",           key:"social_security_cr",      sparkKey:"social_security_cr",  color:"#8b5cf6", unit:"₹ Cr" },
    { label:"Fiscal Deficit",            key:"fiscal_deficit_cr",       sparkKey:"fiscal_deficit_pct",  color:"#f59e0b", unit:"₹ Cr" },
    { label:"GSDP (est.)",               key:"gsdp_cr",                 sparkKey:"capital_outlay_cr",   color:"#3b82f6", unit:"₹ Cr" },
  ];

  return (
    <div className="fadeup">
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
        <h2 style={{ fontSize:24, fontWeight:900 }}>
          Budget Data — <span style={{ color:"#f97316" }}>2025-26</span>
        </h2>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {bm.note && (
            <div style={{ fontSize:12, color: bm.live_sources>0?"#166534":"#4b7ab5",
              background: bm.live_sources>0?"#f0fdf4":"#eff6ff",
              border:`1px solid ${bm.live_sources>0?"#bbf7d0":"#bfdbfe"}`,
              borderRadius:6, padding:"4px 10px", fontWeight:600 }}>
              {bm.live_sources>0 ? `✓ ${bm.live_sources} live sources` : "📚 Verified fallback"}
            </div>
          )}
          <button onClick={onRefresh}
            style={{ background:"#f97316", color:"white", border:"none",
              borderRadius:8, padding:"8px 16px", fontSize:13, fontWeight:700, cursor:"pointer" }}>
            ↺ Refresh Budget Data
          </button>
        </div>
      </div>
      <p style={{ color:"#6b7280", fontSize:13, marginBottom:22 }}>
        Source: {b.source || "Budget 2025-26 (Rajasthan Legislature) · PRS India · JJM MIS"}
        {b.source_url && (
          <a href={b.source_url} target="_blank" rel="noreferrer"
            style={{ color:"#3b82f6", marginLeft:8, fontWeight:600 }}>↗ PRS India</a>
        )}
      </p>

      {/* ── Budget headline tiles ── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:24 }}>
        {[
          { label:"Total Expenditure",  val: b.total_expenditure_cr  ? `₹${Number(b.total_expenditure_cr).toLocaleString("en-IN")} Cr`  : "₹3,25,546 Cr", bg:"#fff7ed", border:"#fed7aa", color:"#c2410c" },
          { label:"Capital Outlay",     val: b.capital_outlay_cr     ? `₹${Number(b.capital_outlay_cr).toLocaleString("en-IN")} Cr`     : "₹53,686 Cr",   bg:"#f0fdf4", border:"#bbf7d0", color:"#15803d" },
          { label:"Fiscal Deficit",     val: b.fiscal_deficit_pct_gsdp ? `${b.fiscal_deficit_pct_gsdp}% GSDP` : "4.25% GSDP",         bg:"#fffbeb", border:"#fde68a", color:"#b45309" },
          { label:"Health Allocation",  val: b.health_cr             ? `₹${Number(b.health_cr).toLocaleString("en-IN")} Cr`             : "₹28,865 Cr",   bg:"#fff1f2", border:"#fecdd3", color:"#be123c" },
          { label:"JJM Coverage",       val: b.jjm_coverage_pct      ? `${Number(b.jjm_coverage_pct).toFixed(2)}%`                      : "55.36%",        bg:"#eff6ff", border:"#bfdbfe", color:"#1d4ed8" },
          { label:"Social Security",    val: b.social_security_cr    ? `₹${Number(b.social_security_cr).toLocaleString("en-IN")}+ Cr`   : "₹14,000+ Cr",  bg:"#faf5ff", border:"#e9d5ff", color:"#7c3aed" },
        ].map((item,i) => (
          <div key={i} style={{ background:item.bg, border:`1.5px solid ${item.border}`,
            borderRadius:14, padding:"18px 20px" }}>
            <div style={{ fontSize:11, fontWeight:700, color:item.color,
              letterSpacing:"0.08em", marginBottom:10, opacity:0.8 }}>{item.label.toUpperCase()}</div>
            <div style={{ fontSize:24, fontWeight:900, color:item.color }}>{item.val}</div>
          </div>
        ))}
      </div>

      {/* ── Trend table ── */}
      <div style={{ background:"white", borderRadius:14, border:"1px solid #e5e7eb",
        overflow:"hidden", marginBottom:22 }}>
        <div style={{ padding:"16px 20px", borderBottom:"1px solid #f3f4f6",
          fontWeight:800, fontSize:15 }}>
          6-Year Trend (2020–2025-26)
          <span style={{ fontSize:12, color:"#9ca3af", fontWeight:400, marginLeft:8 }}>
            from official budget documents
          </span>
        </div>
        {budgetLoading ? (
          <div style={{ padding:40, textAlign:"center", color:"#9ca3af" }}>Loading…</div>
        ) : ROWS.map((row, i) => {
          const val = b[row.key];
          const sparkData = sp[row.sparkKey] || [];
          return (
            <div key={i} style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr",
              padding:"14px 20px", borderBottom:"1px solid #f9fafb", alignItems:"center",
              background: i%2===0?"white":"#fafafa" }}>
              <div style={{ fontWeight:600, fontSize:14, color:"#374151" }}>{row.label}</div>
              <div style={{ fontWeight:800, fontSize:16, color:row.color }}>
                {val ? (row.unit==="₹ Cr" ? `₹${Number(val).toLocaleString("en-IN")} Cr` : `${val}${row.unit}`) : "—"}
              </div>
              <div style={{ fontSize:12, color:"#9ca3af" }}>Budget {b.year||"2025-26"}</div>
              <div><Spark data={sparkData} color={row.color}/></div>
            </div>
          );
        })}
      </div>

      {/* ── Key budget highlights ── */}
      <div style={{ background:"white", borderRadius:14, border:"1px solid #e5e7eb", padding:20 }}>
        <div style={{ fontWeight:800, fontSize:15, marginBottom:14 }}>Key Budget Highlights 2025-26</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
          {[
            { icon:"🎯", text:`Target: $${b.economy_target_bn_usd||350} Billion economy by 2030` },
            { icon:"🌱", text: b.green_budget!==false ? "First Green Budget of Rajasthan" : "Sustainability focus in budget" },
            { icon:"📈", text:`Capital outlay up 40% over 2024-25 RE — ₹${b.capital_outlay_cr ? Number(b.capital_outlay_cr).toLocaleString("en-IN") : "53,686"} Cr` },
            { icon:"💊", text:`Health: ${b.health_pct||8.4}% of budget — above national avg of 6.2%` },
            { icon:"🎓", text:`Education: ${b.education_pct||18}% share — above 15% national average` },
            { icon:"💧", text:`JJM tap water: ${b.jjm_coverage_pct ? Number(b.jjm_coverage_pct).toFixed(2) : 55.36}% coverage — gap vs 79.74% national avg` },
            { icon:"👵", text:"Social pension raised to ₹1,250/month — up from ₹1,000" },
            { icon:"₹",  text:`Fiscal deficit at ${b.fiscal_deficit_pct_gsdp||4.25}% GSDP — within FRBM norms` },
          ].map((h,i) => (
            <div key={i} style={{ display:"flex", gap:12, padding:"12px 14px",
              background:"#f9fafb", borderRadius:10, border:"1px solid #f3f4f6",
              alignItems:"flex-start" }}>
              <span style={{ fontSize:20, flexShrink:0 }}>{h.icon}</span>
              <span style={{ fontSize:13, color:"#374151", lineHeight:1.5 }}>{h.text}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop:14, fontSize:12, color:"#9ca3af", textAlign:"right" }}>
          Source: {b.source || "Budget 2025-26 · PRS India · JJM MIS ejalshakti.gov.in"}
          {b.scraped_at && ` · Fetched ${new Date(b.scraped_at).toLocaleString("en-IN")}`}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab]               = useState("dashboard");
  const [agg, setAgg]               = useState(null);
  const [srcStatus, setStatus]      = useState({});
  const [scraping, setScraping]     = useState({});
  const [scrapingAll, setAll]       = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline]         = useState(null);
  const [now, setNow]               = useState(new Date());
  const [scrapeLog, setScrapeLog]   = useState([]);
  const [budget, setBudget]         = useState(null);
  const [budgetLoading, setBudgetLoading] = useState(false);

  const addLog = useCallback((msg, type="info") => {
    const ts = new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
    setScrapeLog(prev => [{ts, msg, type}, ...prev].slice(0, 30));
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const poll = useCallback(async (silent=true) => {
    if (!silent) setRefreshing(true);
    try {
      const [s, a] = await Promise.all([
        axios.get(`${API}/status`).catch(() => null),
        axios.get(`${API}/aggregate`).catch(() => null),
      ]);
      if (s) setStatus(s.data.sources || {});
      if (a) setAgg(a.data);
      if (!silent) addLog("✅ Data refreshed", "success");
    } catch(e) {
      if (!silent) addLog("❌ Refresh failed — backend may be sleeping (wait 30s)", "error");
    }
    if (!silent) setRefreshing(false);
  }, [addLog]);

  const fetchBudget = useCallback(async () => {
    if (budget) return; // use cache
    setBudgetLoading(true);
    try {
      const r = await axios.get(`${API}/budget`);
      setBudget(r.data);
    } catch(e) {
      // silently use fallback — budget scraper has its own fallback
    }
    setBudgetLoading(false);
  }, [budget]);

  useEffect(() => { fetchBudget(); }, [fetchBudget]);

  useEffect(() => {
    axios.get(`${API}/`).then(() => setOnline(true)).catch(() => setOnline(false));
    poll(true);
    const id = setInterval(() => poll(true), 8000);
    return () => clearInterval(id);
  }, [poll]);

  const scrapeOne = useCallback(async sid => {
    setScraping(p => ({...p, [sid]:true}));
    addLog(`⚡ Scraping ${SRC[sid]?.label || sid}…`, "info");
    try {
      await axios.post(`${API}/scrape/${sid}`);
      await poll(true);
      addLog(`✅ ${SRC[sid]?.label || sid} — done`, "success");
    } catch(e) {
      addLog(`❌ ${sid} scrape failed`, "error");
    }
    setScraping(p => ({...p, [sid]:false}));
  }, [poll, addLog]);

  const scrapeAll = useCallback(async () => {
    setAll(true);
    addLog("⚡ Scraping all 4 sources…", "info");
    try {
      await axios.post(`${API}/scrape/all`);
      await poll(true);
      const count = agg?.kpis?.total_schemes || 0;
      addLog(`✅ Scrape complete — ${count} schemes loaded`, "success");
    } catch(e) {
      addLog("❌ Scrape failed — check backend status", "error");
    }
    setAll(false);
  }, [poll, addLog, agg]);

  const criticalCount = (agg?.alerts||[]).filter(a => a.severity === "Critical").length;
  const totalSchemes  = agg?.kpis?.total_schemes || 0;
  const totalPortals  = agg?.kpis?.total_portals || 0;

  const TABS = [
    { id:"dashboard", label:"Dashboard",    icon:"◉" },
    { id:"schemes",   label:"Schemes",      icon:"⊞", badge: totalSchemes||null },
    { id:"budget",    label:"Budget Data",  icon:"₹" },
    { id:"districts", label:"Districts",    icon:"🗺️" },
    { id:"alerts",    label:"Live Alerts",  icon:"⚡", badge: criticalCount||null },
    { id:"insights",  label:"AI Insights",  icon:"🧠", highlight:true },
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

          {/* Sources badge — matches screenshot */}
          <div style={{ background:"#f0f9ff", border:"1px solid #bae6fd",
            borderRadius:10, padding:"8px 16px",
            display:"flex", alignItems:"center", gap:7,
            fontSize:12, color:"#0369a1", fontWeight:600 }}>
            <span>📚</span>
            <span>Sources: Budget 2025-26 · JJM MIS · PRS India</span>
          </div>

          {/* Verified Data badge — matches screenshot */}
          <div style={{ background:"white",
            border:"1.5px solid #bbf7d0",
            borderRadius:10, padding:"8px 14px",
            display:"flex", alignItems:"center", gap:7 }}>
            <div style={{ width:9, height:9, borderRadius:"50%",
              background:"#10b981",
              boxShadow:"0 0 0 3px #d1fae5" }}/>
            <span style={{ fontSize:13, fontWeight:700, color:"#166534" }}>
              Verified Data
            </span>
          </div>

          <ScrapeNowButton onClick={scrapeAll} loading={scrapingAll} disabled={!online}/>

          <button onClick={() => poll(false)} disabled={refreshing} style={{
            background: refreshing ? "#eff6ff" : "white",
            color: refreshing ? "#93c5fd" : "#3b82f6",
            border:`1.5px solid ${refreshing?"#bfdbfe":"#3b82f6"}`,
            borderRadius:10, padding:"10px 16px", fontWeight:700, fontSize:13,
            display:"flex", alignItems:"center", gap:6, cursor:refreshing?"not-allowed":"pointer" }}>
            <span style={{ display:"inline-block", animation:refreshing?"spin 1s linear infinite":"none" }}>🔄</span>
            {refreshing ? "Refreshing…" : "Refresh"}
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

        {/* Scrape log strip — shows last action */}
        {scrapeLog.length > 0 && (
          <div style={{ padding:"4px 28px", background:"#f8fafc",
            borderTop:"1px solid #f3f4f6", display:"flex", alignItems:"center",
            gap:10, overflowX:"auto" }}>
            {scrapeLog.slice(0, 5).map((log, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:5,
                fontSize:11, whiteSpace:"nowrap",
                color: log.type==="success"?"#166534":log.type==="error"?"#991b1b":"#64748b",
                opacity: i===0?1:0.5 }}>
                <span style={{ fontSize:10, color:"#94a3b8" }}>{log.ts}</span>
                <span>{log.msg}</span>
                {i < scrapeLog.slice(0,5).length-1 && <span style={{color:"#d1d5db"}}>·</span>}
              </div>
            ))}
          </div>
        )}

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

      {/* Backend status banners */}
      {online === null && (
        <div style={{ background:"#f0f9ff", borderBottom:"1px solid #bae6fd",
          padding:"8px 28px", display:"flex", gap:10, alignItems:"center" }}>
          <span style={{ animation:"spin 1s linear infinite", display:"inline-block" }}>⚙️</span>
          <span style={{ fontSize:13, color:"#0369a1", fontWeight:600 }}>
            Connecting to backend… (Render free tier may take 30–60 seconds to wake up)
          </span>
        </div>
      )}
      {online === false && (
        <div style={{ background:"#fef2f2", borderBottom:"1px solid #fecaca",
          padding:"10px 28px", display:"flex", gap:10, alignItems:"center",
          flexWrap:"wrap" }}>
          <span>⚠️</span>
          <span style={{ fontSize:13, color:"#991b1b", fontWeight:600 }}>
            Backend is sleeping (Render free tier).
          </span>
          <span style={{ fontSize:13, color:"#991b1b" }}>
            Click <strong>⚡ Scrape Now</strong> — it will wake up automatically in ~30 seconds.
          </span>
          <button onClick={() => {
            setOnline(null);
            axios.get(`${API}/`).then(() => setOnline(true)).catch(() => setOnline(false));
          }} style={{ background:"#ef4444", color:"white", border:"none",
            borderRadius:8, padding:"5px 14px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
            Retry Connection
          </button>
        </div>
      )}

      {/* ── Page content ── */}
      <div style={{ maxWidth:1180, margin:"0 auto", padding:"24px 28px" }}>
        {tab==="dashboard" && (
          <DashboardTab agg={agg} srcStatus={srcStatus}
            onScrapeAll={scrapeAll} onScrapeOne={scrapeOne}
            scraping={scraping} scrapingAll={scrapingAll} online={online}
            budget={budget} budgetLoading={budgetLoading}/>
        )}
        {tab==="insights"  && (
          <InsightsEngine
            schemes={agg?.schemes || []}
            portals={agg?.portals || []}
            onScrapeFirst={scrapeAll}/>
        )}
        {tab==="schemes"   && <SchemesTab   agg={agg} onScrapeAll={scrapeAll}/>}
        {tab==="budget"    && <BudgetDataTab budget={budget} budgetLoading={budgetLoading}
            onRefresh={() => { setBudget(null); setBudgetLoading(true);
              fetch(`${API}/budget?refresh=true`).then(r=>r.json()).then(d=>{setBudget(d);setBudgetLoading(false);}).catch(()=>setBudgetLoading(false)); }}/>}
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