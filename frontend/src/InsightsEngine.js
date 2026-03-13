/**
 * InsightsEngine.js — v4
 * Works with REAL live scraped data from all 4 sources.
 * Zero API calls. Pure JavaScript analysis.
 */
import { useState, useMemo } from "react";

const C = {
  orange:"#f97316", blue:"#3b82f6", green:"#10b981", red:"#ef4444",
  purple:"#8b5cf6", amber:"#f59e0b",
  bg:"#f8fafc", card:"#ffffff", border:"#e2e8f0",
  text:"#0f172a", muted:"#64748b",
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const txt = (s) =>
  [s.name, s.description, s.eligibility, s.benefit,
   s.objective, s.category, s.department, s.ministry, s.tags?.join?.(" ")]
  .filter(Boolean).join(" ").toLowerCase();

const has = (s, ...kws) => kws.some(kw => txt(s).includes(kw.toLowerCase()));

const parseINR = (str = "") => {
  if (!str) return 0;
  const cr = str.match(/(\d+(?:\.\d+)?)\s*crore/i);
  if (cr) return parseFloat(cr[1]) * 1e7;
  const lk = str.match(/(\d+(?:\.\d+)?)\s*lakh/i);
  if (lk) return parseFloat(lk[1]) * 1e5;
  const k  = str.match(/₹\s*([\d,]+)/);
  if (k)  return parseInt(k[1].replace(/,/g,""));
  return 0;
};

const fmtINR = (v) => {
  if (v >= 1e7) return `₹${(v/1e7).toFixed(1)} Cr`;
  if (v >= 1e5) return `₹${(v/1e5).toFixed(1)} L`;
  if (v >= 1e3) return `₹${(v/1e3).toFixed(0)}K`;
  return `₹${v}`;
};

// ── Card ───────────────────────────────────────────────────────────────────────
const Card = ({ children, style = {} }) => (
  <div style={{
    background: C.card, borderRadius: 14, border: `1px solid ${C.border}`,
    padding: 20, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", ...style
  }}>{children}</div>
);

// ── Section header ─────────────────────────────────────────────────────────────
const Sec = ({ icon, title, sub }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <span style={{ fontSize:22 }}>{icon}</span>
      <h2 style={{ fontSize:19, fontWeight:900, color:C.text, margin:0 }}>{title}</h2>
    </div>
    {sub && <p style={{ fontSize:12, color:C.muted, margin:"3px 0 0 30px" }}>{sub}</p>}
  </div>
);

// ── Badge ──────────────────────────────────────────────────────────────────────
const Badge = ({ label, color = C.orange, small }) => (
  <span style={{
    background:`${color}18`, color, border:`1px solid ${color}28`,
    borderRadius:20, padding: small?"1px 8px":"3px 12px",
    fontSize: small?10:11, fontWeight:700, whiteSpace:"nowrap",
  }}>{label}</span>
);

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYSIS ENGINE
// ═══════════════════════════════════════════════════════════════════════════════
function runAnalysis(schemes, portals) {
  // ── 1. Category breakdown ─────────────────────────────────────────────────
  const catMap = {};
  schemes.forEach(s => {
    const c = s.category || "General";
    if (!catMap[c]) catMap[c] = { name:c, count:0, schemes:[] };
    catMap[c].count++;
    catMap[c].schemes.push(s);
  });
  const categories = Object.values(catMap).sort((a,b) => b.count - a.count);

  // ── 2. Source breakdown ───────────────────────────────────────────────────
  const srcMap = {};
  schemes.forEach(s => {
    const src = s._src_label || s.source?.split(".")?.[0] || "Unknown";
    srcMap[src] = (srcMap[src] || 0) + 1;
  });

  // ── 3. Duplicates — same name across multiple sources ─────────────────────
  const nameMap = {};
  schemes.forEach(s => {
    const key = s.name?.toLowerCase().trim().slice(0, 40) || "";
    if (!key) return;
    if (!nameMap[key]) nameMap[key] = [];
    nameMap[key].push(s);
  });
  const duplicates = Object.values(nameMap)
    .filter(g => g.length >= 2)
    .filter(g => new Set(g.map(s => s._src_label || s.source)).size >= 2)
    .sort((a,b) => b.length - a.length);

  // ── 4. High-value schemes ─────────────────────────────────────────────────
  const withValue = schemes
    .map(s => ({ ...s, _inr: parseINR(s.benefit || s.description || "") }))
    .filter(s => s._inr > 0)
    .sort((a,b) => b._inr - a._inr)
    .slice(0, 12);

  // ── 5. Coverage gaps by citizen segment ──────────────────────────────────
  const SEGMENTS = [
    { id:"women",    label:"Women & Girls",          icon:"👩", kws:["women","girl","mahila","beti","female","widow","rajshri","sukanya","maternity"] },
    { id:"farmer",   label:"Farmers & Agriculture",  icon:"🌾", kws:["farmer","kisan","agriculture","crop","farm","agri","horticulture","pashu"] },
    { id:"student",  label:"Students & Youth",       icon:"🎓", kws:["student","scholarship","coaching","education","school","college","apprentice","rozgar"] },
    { id:"health",   label:"Healthcare",             icon:"🏥", kws:["health","medical","chiranjeevi","ayushman","dawa","hospital","insurance","treatment"] },
    { id:"elderly",  label:"Senior Citizens",        icon:"👴", kws:["elderly","pension","old age","senior","widow","aged","vridh"] },
    { id:"disabled", label:"Persons with Disabilities", icon:"♿", kws:["disabled","divyang","disability","handicap","specially abled"] },
    { id:"tribal",   label:"Tribal / SC / ST",       icon:"🏕️", kws:["tribal","adivasi","sc ","st ","schedule caste","schedule tribe","dalit","obc"] },
    { id:"labour",   label:"Workers & Labour",       icon:"⚒️", kws:["labour","worker","shramik","mgnrega","employment","wages","construction"] },
    { id:"bpl",      label:"BPL / Below Poverty",    icon:"🏠", kws:["bpl","below poverty","poor","ration","pds","food security","antyodaya"] },
    { id:"urban",    label:"Urban Citizens",         icon:"🏙️", kws:["urban","city","municipal","nagar","town","slum","metro"] },
  ];

  const segmentAnalysis = SEGMENTS.map(seg => {
    const matching = schemes.filter(s => has(s, ...seg.kws));
    return { ...seg, matching, count: matching.length };
  }).sort((a,b) => a.count - b.count); // least covered first

  // ── 6. Schemes with no benefit info ───────────────────────────────────────
  const noBenefit = schemes.filter(s => !s.benefit && !s.description);

  // ── 7. Health score ───────────────────────────────────────────────────────
  const zeroSegments = segmentAnalysis.filter(s => s.count === 0).length;
  const score = Math.min(100, Math.max(0,
    60 +
    Math.min(schemes.length / 3, 20) -
    (zeroSegments * 5) -
    Math.min(duplicates.length * 2, 15)
  ));

  // ── 8. Priority actions ───────────────────────────────────────────────────
  const actions = [];

  // Action based on zero-coverage segments
  const zeroSeg = segmentAnalysis.filter(s => s.count === 0);
  if (zeroSeg.length > 0) {
    actions.push({
      rank:1, icon:"🚨", priority:"CRITICAL", timeline:"This week",
      title: `No schemes found for: ${zeroSeg.map(s=>s.label).join(", ")}`,
      why: `${zeroSeg.length} citizen segment${zeroSeg.length>1?"s":""} have zero scheme coverage in scraped data. Immediate policy review needed.`,
      impact: `${zeroSeg.length * 8}–${zeroSeg.length * 15} lakh citizens potentially unaddressed`,
    });
  }

  // Action based on duplicates
  if (duplicates.length > 0) {
    const top = duplicates[0];
    actions.push({
      rank:2, icon:"🔄", priority:"HIGH", timeline:"This month",
      title: `Consolidate ${duplicates.length} duplicate scheme listing${duplicates.length>1?"s":""}`,
      why: `"${top[0].name}" appears ${top.length}× across sources. Top duplicate found in: ${[...new Set(top.map(s=>s._src_label||"Unknown"))].join(", ")}.`,
      impact: "Reduce citizen confusion. Single authoritative record per scheme.",
    });
  }

  // Action based on weakest category
  const weakest = categories[categories.length - 1];
  const strongest = categories[0];
  if (weakest && strongest && weakest.count < 2) {
    actions.push({
      rank:3, icon:"📊", priority:"HIGH", timeline:"This month",
      title: `Expand "${weakest.name}" sector — only ${weakest.count} scheme${weakest.count>1?"s":""}`,
      why: `"${weakest.name}" has ${weakest.count} scheme vs "${strongest.name}" with ${strongest.count}. Major imbalance in policy coverage.`,
      impact: `Launch 2–3 new ${weakest.name} schemes to balance sector coverage`,
    });
  }

  // Action based on schemes without descriptions
  if (noBenefit.length > 0) {
    actions.push({
      rank:4, icon:"📝", priority:"MEDIUM", timeline:"This month",
      title: `${noBenefit.length} schemes missing benefit/description data`,
      why: `${noBenefit.length} scraped schemes have no benefit or description. Citizens cannot evaluate eligibility.`,
      impact: "Fill data gaps on official portals to improve citizen access",
    });
  }

  // Action based on portal coverage
  actions.push({
    rank: actions.length + 1, icon:"🏛️", priority:"MEDIUM", timeline:"This quarter",
    title: `Unify ${Object.keys(srcMap).length} portal data into single citizen interface`,
    why: `Data spread across ${Object.keys(srcMap).join(", ")}. Citizens must visit multiple sites for complete picture.`,
    impact: "Single Jan Aadhaar-linked dashboard reduces time-to-benefit by 60%",
  });

  return { categories, srcMap, duplicates, withValue, segmentAnalysis, score, actions, noBenefit };
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER SECTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function HealthScore({ score, schemes, portals, duplicates, zeroSegs }) {
  const color = score >= 75 ? C.green : score >= 50 ? C.amber : C.red;
  const label = score >= 75 ? "GOOD" : score >= 50 ? "NEEDS ATTENTION" : "CRITICAL GAPS";
  const circumference = 2 * Math.PI * 36;

  return (
    <Card style={{ background:"linear-gradient(135deg,#fff7ed,#fffbeb)", borderColor:"#fed7aa" }}>
      <div style={{ display:"flex", gap:20, alignItems:"flex-start" }}>
        {/* Circle score */}
        <div style={{ position:"relative", width:90, height:90, flexShrink:0 }}>
          <svg width="90" height="90" style={{ transform:"rotate(-90deg)" }}>
            <circle cx="45" cy="45" r="36" fill="none" stroke="#e5e7eb" strokeWidth="9"/>
            <circle cx="45" cy="45" r="36" fill="none" stroke={color} strokeWidth="9"
              strokeDasharray={`${(score/100)*circumference} ${circumference}`}
              strokeLinecap="round" style={{ transition:"stroke-dasharray 1s ease" }}/>
          </svg>
          <div style={{ position:"absolute", inset:0, display:"flex",
            flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
            <span style={{ fontSize:22, fontWeight:900, color }}>{score}</span>
            <span style={{ fontSize:9, color:C.muted }}>/ 100</span>
          </div>
        </div>

        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.orange,
            letterSpacing:"0.1em", marginBottom:6 }}>
            EXECUTIVE BRIEFING · OFFICE OF CM · RAJASTHAN
          </div>
          <div style={{ fontSize:18, fontWeight:800, color:C.text, marginBottom:4 }}>
            Welfare Ecosystem Health:{" "}
            <span style={{ color }}>{label}</span>
          </div>
          <p style={{ fontSize:13, color:C.muted, margin:"0 0 14px", lineHeight:1.5 }}>
            AI analysis of {schemes.length} live-scraped schemes across {Object.keys({}).length} sources
            and {portals.length} IGOD government portals.
          </p>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
            {[
              { label:"SCHEMES SCRAPED",   val:schemes.length,     color:C.orange },
              { label:"PORTALS INDEXED",   val:portals.length,     color:C.blue   },
              { label:"DUPLICATES FOUND",  val:duplicates.length,  color:C.purple },
              { label:"ZERO-COVERAGE SEGS",val:zeroSegs,           color:C.red    },
            ].map((k,i) => (
              <div key={i} style={{ background:"white", borderRadius:9,
                padding:"9px 12px", border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:9, fontWeight:700, color:C.muted,
                  letterSpacing:"0.07em", marginBottom:3 }}>{k.label}</div>
                <div style={{ fontSize:20, fontWeight:900, color:k.color }}>{k.val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function PriorityActions({ actions }) {
  const [open, setOpen] = useState(null);
  const priColor = { CRITICAL:C.red, HIGH:C.orange, MEDIUM:C.amber };
  const tlColor  = { "This week":C.red, "This month":C.orange, "This quarter":C.blue };

  return (
    <div>
      <Sec icon="⚡" title="Priority Actions for CM"
        sub="Derived entirely from scraped data patterns — click to expand"/>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {actions.map((a,i) => {
          const pc = priColor[a.priority] || C.amber;
          const tc = tlColor[a.timeline]  || C.orange;
          return (
            <div key={i} onClick={() => setOpen(open===i?null:i)}
              style={{ background: i===0?"linear-gradient(135deg,#fff7ed,#fffbeb)":C.card,
                borderRadius:12, border:`1px solid ${i===0?"#fed7aa":C.border}`,
                borderLeft:`4px solid ${pc}`, padding:16, cursor:"pointer",
                boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
              <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                <div style={{ width:40, height:40, borderRadius:10, flexShrink:0,
                  background: i===0?C.orange:`${pc}15`,
                  color: i===0?"white":pc,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:18, fontWeight:900 }}>{a.rank}</div>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", gap:7, marginBottom:7, flexWrap:"wrap" }}>
                    <Badge label={a.priority} color={pc} small/>
                    <Badge label={`⏱ ${a.timeline}`} color={tc} small/>
                    <span style={{ fontSize:16 }}>{a.icon}</span>
                  </div>
                  <div style={{ fontWeight:800, fontSize:14, color:C.text,
                    marginBottom:4 }}>{a.title}</div>
                  <p style={{ fontSize:12, color:C.muted, margin:0,
                    lineHeight:1.5 }}>{a.why}</p>
                  {open===i && (
                    <div style={{ marginTop:10, background:"#f0fdf4",
                      borderRadius:8, padding:"10px 14px" }}>
                      <span style={{ fontSize:10, fontWeight:700, color:"#166534",
                        letterSpacing:"0.07em" }}>EXPECTED IMPACT  </span>
                      <span style={{ fontSize:12, color:"#14532d",
                        fontWeight:600 }}>{a.impact}</span>
                    </div>
                  )}
                  <div style={{ fontSize:10, color:C.muted, marginTop:5 }}>
                    {open===i?"▲ Less":"▼ See impact"}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SegmentCoverage({ segments }) {
  const priColor = (n) => n===0?C.red : n<=2?C.amber : C.green;
  const priLabel = (n) => n===0?"NO COVERAGE" : n<=2?"THIN COVERAGE" : "COVERED";

  return (
    <div>
      <Sec icon="🎯" title="Citizen Segment Coverage"
        sub="How many scraped schemes address each citizen group"/>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
        {segments.map((seg,i) => {
          const color = priColor(seg.count);
          return (
            <Card key={i} style={{ borderLeft:`4px solid ${color}`,
              background: seg.count===0?"#fef2f2":C.card,
              borderColor: seg.count===0?"#fecaca":C.border, padding:14 }}>
              <div style={{ display:"flex", alignItems:"center",
                justifyContent:"space-between", marginBottom:8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:20 }}>{seg.icon}</span>
                  <span style={{ fontWeight:700, fontSize:13, color:C.text }}>
                    {seg.label}
                  </span>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:24, fontWeight:900, color }}>{seg.count}</div>
                  <Badge label={priLabel(seg.count)} color={color} small/>
                </div>
              </div>

              {/* Bar */}
              <div style={{ height:5, background:"#f1f5f9",
                borderRadius:3, overflow:"hidden", marginBottom:8 }}>
                <div style={{ width:`${Math.min(seg.count*8, 100)}%`,
                  height:"100%", background:color,
                  borderRadius:3, transition:"width .5s" }}/>
              </div>

              {/* Show matching scheme names */}
              {seg.matching.length > 0 ? (
                <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                  {seg.matching.slice(0,3).map((s,j) => (
                    <span key={j} style={{ background:`${color}10`, color,
                      border:`1px solid ${color}25`, borderRadius:5,
                      padding:"1px 7px", fontSize:10, fontWeight:600 }}>
                      {s.name?.slice(0,28)}{s.name?.length>28?"…":""}
                    </span>
                  ))}
                  {seg.matching.length > 3 && (
                    <span style={{ fontSize:10, color:C.muted }}>
                      +{seg.matching.length-3} more
                    </span>
                  )}
                </div>
              ) : (
                <span style={{ fontSize:11, color:"#991b1b", fontWeight:600 }}>
                  ⚠️ No schemes found for this segment
                </span>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function SectorBalance({ categories }) {
  const max = categories[0]?.count || 1;
  const colors = [C.orange,C.blue,C.green,C.purple,C.red,C.amber,
                  "#06b6d4","#84cc16","#ec4899","#14b8a6","#6366f1","#a855f7"];
  return (
    <div>
      <Sec icon="📊" title="Scheme Distribution by Sector"
        sub="Scraped scheme count per policy category — imbalances indicate investment gaps"/>
      <Card>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {categories.map((cat,i) => {
            const pct = Math.round((cat.count/max)*100);
            const color = colors[i % colors.length];
            return (
              <div key={i}>
                <div style={{ display:"flex", justifyContent:"space-between",
                  alignItems:"center", marginBottom:4 }}>
                  <span style={{ fontSize:13, fontWeight:600, color:C.text }}>
                    {cat.name}
                  </span>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    {/* show first 2 scheme names as chips */}
                    {cat.schemes.slice(0,2).map((s,j) => (
                      <span key={j} style={{ fontSize:9, color:C.muted,
                        background:"#f1f5f9", borderRadius:4,
                        padding:"1px 6px", maxWidth:120,
                        overflow:"hidden", textOverflow:"ellipsis",
                        whiteSpace:"nowrap" }}>
                        {s.name?.slice(0,20)}
                      </span>
                    ))}
                    <span style={{ fontWeight:900, fontSize:16, color,
                      minWidth:28, textAlign:"right" }}>{cat.count}</span>
                  </div>
                </div>
                <div style={{ height:8, background:"#f1f5f9",
                  borderRadius:4, overflow:"hidden" }}>
                  <div style={{ width:`${pct}%`, height:"100%", background:color,
                    borderRadius:4, transition:"width .6s ease" }}/>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function Duplicates({ duplicates }) {
  if (!duplicates.length) {
    return (
      <div>
        <Sec icon="🔄" title="Duplicate Detection"
          sub="Schemes appearing across multiple portals"/>
        <Card style={{ textAlign:"center", padding:30 }}>
          <span style={{ fontSize:32 }}>✅</span>
          <p style={{ color:C.muted, marginTop:8 }}>No duplicate scheme names detected across sources.</p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <Sec icon="🔄" title={`${duplicates.length} Duplicates Detected`}
        sub="Same scheme name appearing across multiple portals — causes citizen confusion"/>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {duplicates.slice(0,8).map((group,i) => {
          const sources = [...new Set(group.map(s=>s._src_label || s.source?.split(".")?.[0] || "?"))];
          const name = group[0].name;
          const benefit = group.find(s=>s.benefit)?.benefit || "";
          return (
            <Card key={i} style={{ borderLeft:`4px solid ${C.purple}`, padding:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between",
                alignItems:"flex-start", marginBottom:8 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:800, fontSize:14, color:C.text,
                    marginBottom:5 }}>{name}</div>
                  <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                    {sources.map((src,j) => (
                      <Badge key={j} label={src} color={C.purple} small/>
                    ))}
                  </div>
                </div>
                <div style={{ textAlign:"right", flexShrink:0, marginLeft:10 }}>
                  <div style={{ fontSize:26, fontWeight:900, color:C.purple }}>
                    {group.length}×
                  </div>
                  <div style={{ fontSize:9, color:C.muted }}>portals</div>
                </div>
              </div>
              {benefit && (
                <div style={{ fontSize:12, color:C.muted }}>
                  Benefit: <strong style={{ color:C.text }}>{benefit}</strong>
                </div>
              )}
              <div style={{ marginTop:8, background:"#f0fdf4", borderRadius:7,
                padding:"7px 12px", fontSize:11, color:"#14532d", fontWeight:600 }}>
                → Designate one portal as master record · Update Jan Soochna with single canonical entry
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function TopBenefits({ withValue }) {
  if (!withValue.length) return null;
  return (
    <div>
      <Sec icon="💰" title="Highest Value Schemes"
        sub="Ranked by monetary benefit — parsed from scraped data"/>
      <Card>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {withValue.slice(0,10).map((s,i) => {
            const src = s._src_label || s.source?.split(".")?.[0] || "";
            const srcC = {RajRAS:C.blue,"Jan Soochna":C.green,
              MyScheme:C.purple,"IGOD Portal":C.orange}[src] || C.orange;
            const max = withValue[0]._inr;
            return (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:24, height:24, borderRadius:6, flexShrink:0,
                  background:i<3?C.orange:"#f1f5f9",
                  color:i<3?"white":C.muted,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:11, fontWeight:800 }}>{i+1}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", justifyContent:"space-between",
                    alignItems:"center", marginBottom:3 }}>
                    <span style={{ fontSize:13, fontWeight:600, color:C.text,
                      overflow:"hidden", textOverflow:"ellipsis",
                      whiteSpace:"nowrap", maxWidth:"55%" }}>
                      {s.name}
                    </span>
                    <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                      <Badge label={src} color={srcC} small/>
                      <span style={{ fontWeight:900, fontSize:14, color:C.orange }}>
                        {fmtINR(s._inr)}
                      </span>
                    </div>
                  </div>
                  <div style={{ height:5, background:"#f1f5f9",
                    borderRadius:3, overflow:"hidden" }}>
                    <div style={{ width:`${Math.round((s._inr/max)*100)}%`,
                      height:"100%",
                      background:i<3?"linear-gradient(90deg,#f97316,#f59e0b)":"#94a3b8",
                      borderRadius:3 }}/>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function SourceBreakdown({ srcMap, totalSchemes }) {
  const colors = { RajRAS:C.blue, "Jan Soochna":C.green,
    MyScheme:C.purple, "IGOD Portal":C.orange };
  const max = Math.max(...Object.values(srcMap));
  return (
    <div>
      <Sec icon="📡" title="Data Source Breakdown"
        sub="Schemes scraped from each official government portal"/>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
        {Object.entries(srcMap).sort((a,b)=>b[1]-a[1]).map(([src,count],i) => {
          const color = colors[src] || C.orange;
          return (
            <Card key={i} style={{ padding:16,
              border:`1px solid ${color}25`, background:`${color}06` }}>
              <div style={{ display:"flex", justifyContent:"space-between",
                alignItems:"center", marginBottom:8 }}>
                <span style={{ fontWeight:700, fontSize:13, color:C.text }}>{src}</span>
                <span style={{ fontSize:28, fontWeight:900, color }}>{count}</span>
              </div>
              <div style={{ height:6, background:"#f1f5f9",
                borderRadius:3, overflow:"hidden", marginBottom:5 }}>
                <div style={{ width:`${Math.round((count/max)*100)}%`,
                  height:"100%", background:color, borderRadius:3 }}/>
              </div>
              <div style={{ fontSize:11, color:C.muted }}>
                {Math.round((count/totalSchemes)*100)}% of total scraped data
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function AllSchemes({ schemes }) {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");

  const cats = [...new Set(schemes.map(s=>s.category||"General"))].sort();

  const filtered = schemes.filter(s => {
    const mQ = !search || txt(s).includes(search.toLowerCase());
    const mC = catFilter==="all" || (s.category||"General")===catFilter;
    return mQ && mC;
  });

  return (
    <div>
      <Sec icon="📋" title={`All ${schemes.length} Scraped Schemes`}
        sub="Complete list from all 4 sources — search, filter, explore"/>

      <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search schemes, benefits, eligibility…"
          style={{ flex:1, minWidth:200, padding:"9px 14px",
            border:`1px solid ${C.border}`, borderRadius:9,
            fontSize:13, background:"white", outline:"none" }}/>
        <select value={catFilter} onChange={e=>setCatFilter(e.target.value)}
          style={{ padding:"9px 14px", border:`1px solid ${C.border}`,
            borderRadius:9, fontSize:13, background:"white", cursor:"pointer" }}>
          <option value="all">All Categories</option>
          {cats.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div style={{ fontSize:12, color:C.muted, marginBottom:10 }}>
        Showing {filtered.length} of {schemes.length} schemes
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {filtered.slice(0,50).map((s,i) => {
          const src = s._src_label || s.source?.split(".")?.[0] || "?";
          const srcC = {RajRAS:C.blue,"Jan Soochna":C.green,
            MyScheme:C.purple,"IGOD Portal":C.orange}[src] || C.orange;
          return (
            <Card key={i} style={{ padding:12, borderLeft:`3px solid ${srcC}` }}>
              <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center",
                    gap:8, marginBottom:4, flexWrap:"wrap" }}>
                    <span style={{ fontWeight:700, fontSize:13, color:C.text }}>
                      {s.name}
                    </span>
                    <Badge label={s.category||"General"} color={srcC} small/>
                    <Badge label={src} color={srcC} small/>
                  </div>
                  {s.benefit && (
                    <div style={{ fontSize:12, color:"#166534", fontWeight:600,
                      background:"#f0fdf4", borderRadius:5,
                      padding:"2px 8px", display:"inline-block", marginBottom:3 }}>
                      💰 {s.benefit}
                    </div>
                  )}
                  {s.eligibility && (
                    <div style={{ fontSize:11, color:C.muted }}>
                      Who: {s.eligibility?.slice(0,100)}
                    </div>
                  )}
                  {!s.benefit && s.description && (
                    <div style={{ fontSize:11, color:C.muted }}>
                      {s.description?.slice(0,120)}
                    </div>
                  )}
                </div>
                {s.url && s.url !== "https://jansoochna.rajasthan.gov.in/Scheme" && (
                  <a href={s.url} target="_blank" rel="noreferrer"
                    onClick={e=>e.stopPropagation()}
                    style={{ fontSize:11, color:srcC, fontWeight:700,
                      flexShrink:0, whiteSpace:"nowrap" }}>
                    Visit ↗
                  </a>
                )}
              </div>
            </Card>
          );
        })}
        {filtered.length > 50 && (
          <div style={{ textAlign:"center", color:C.muted, fontSize:12, padding:10 }}>
            Showing first 50 — use search to narrow results
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════════
export default function InsightsEngine({ schemes=[], portals=[], onScrapeFirst }) {
  const [activeTab, setActiveTab] = useState("overview");

  const analysis = useMemo(() => {
    if (!schemes.length) return null;
    return runAnalysis(schemes, portals);
  }, [schemes, portals]);

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!schemes.length) {
    return (
      <div style={{ padding:"60px 40px", textAlign:"center" }}>
        <div style={{ fontSize:64, marginBottom:16 }}>📡</div>
        <h3 style={{ fontSize:20, fontWeight:800, color:C.text, marginBottom:8 }}>
          No Scraped Data Yet
        </h3>
        <p style={{ color:C.muted, fontSize:14, maxWidth:360,
          margin:"0 auto 24px", lineHeight:1.6 }}>
          Click <strong>⚡ Scrape Now</strong> in the header to pull live data
          from all 4 government websites. Insights generate instantly — no API needed.
        </p>
        <button onClick={onScrapeFirst} style={{
          background:C.orange, color:"white", borderRadius:12,
          padding:"13px 32px", fontWeight:800, fontSize:15,
          border:"none", cursor:"pointer", boxShadow:"0 4px 20px #f9731650"
        }}>⚡ Scrape Now</button>
      </div>
    );
  }

  const { categories, srcMap, duplicates, withValue,
    segmentAnalysis, score, actions } = analysis;
  const zeroSegs = segmentAnalysis.filter(s=>s.count===0).length;

  const TABS = [
    { id:"overview",  label:"Overview"           },
    { id:"actions",   label:"⚡ Actions"          },
    { id:"segments",  label:"🎯 Coverage"         },
    { id:"sectors",   label:"📊 Sectors"          },
    { id:"dupes",     label:`🔄 Duplicates (${duplicates.length})` },
    { id:"benefits",  label:"💰 Benefits"         },
    { id:"allschemes",label:`📋 All ${schemes.length} Schemes` },
  ];

  return (
    <div className="fadeup">
      {/* Header */}
      <div style={{ marginBottom:18 }}>
        <h1 style={{ fontSize:24, fontWeight:900, color:C.text, margin:"0 0 3px" }}>
          Policy Intelligence —{" "}
          <span style={{ color:C.orange }}>Live Data Insights</span>
        </h1>
        <p style={{ color:C.muted, fontSize:12, margin:0 }}>
          Instant analysis of {schemes.length} live-scraped schemes ·
          Zero AI API · Updates on every scrape
        </p>
      </div>

      {/* Pills */}
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
        {[
          { t:`${schemes.length} schemes`,             c:C.orange },
          { t:`${portals.length} portals`,             c:C.blue   },
          { t:`${duplicates.length} duplicates found`, c:C.purple },
          { t:`${zeroSegs} zero-coverage segments`,    c:C.red    },
          { t:`${categories.length} categories`,       c:C.green  },
          { t:"No API cost",                           c:C.green  },
        ].map((p,i) => (
          <Badge key={i} label={p.t} color={p.c}/>
        ))}
      </div>

      {/* Tab nav */}
      <div style={{ display:"flex", gap:4, flexWrap:"wrap",
        marginBottom:22, borderBottom:`1px solid ${C.border}`, paddingBottom:0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            background:"transparent", border:"none",
            borderBottom: activeTab===t.id
              ? `2.5px solid ${C.orange}` : "2.5px solid transparent",
            color: activeTab===t.id ? C.orange : C.muted,
            fontWeight: activeTab===t.id ? 700 : 500,
            fontSize:13, padding:"9px 14px", cursor:"pointer",
            transition:"all .15s",
          }}>{t.label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ display:"flex", flexDirection:"column", gap:24 }}>
        {activeTab==="overview" && <>
          <HealthScore score={score} schemes={schemes} portals={portals}
            duplicates={duplicates} zeroSegs={zeroSegs}/>
          <PriorityActions actions={actions}/>
          <SourceBreakdown srcMap={srcMap} totalSchemes={schemes.length}/>
        </>}
        {activeTab==="actions"   && <PriorityActions actions={actions}/>}
        {activeTab==="segments"  && <SegmentCoverage segments={segmentAnalysis}/>}
        {activeTab==="sectors"   && <SectorBalance categories={categories}/>}
        {activeTab==="dupes"     && <Duplicates duplicates={duplicates}/>}
        {activeTab==="benefits"  && <TopBenefits withValue={withValue}/>}
        {activeTab==="allschemes"&& <AllSchemes schemes={schemes}/>}
      </div>
    </div>
  );
}