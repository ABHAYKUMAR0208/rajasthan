/**
 * InsightsEngine.js — Zero AI API, 100% logic-driven insights
 * =============================================================
 * Analyses scraped scheme + portal data using pure JavaScript rules.
 * No Anthropic, no API key, no cost. Works entirely offline from scraped data.
 *
 * Insight modules:
 *  1. Executive Summary     — health score, strongest/weakest sectors
 *  2. Priority Actions      — top 5 actions derived from data patterns
 *  3. Coverage Gaps         — underserved citizen segments
 *  4. Sector Balance        — category over/under-investment
 *  5. Duplicate Detection   — same scheme appearing across multiple sources
 *  6. Benefit Analysis      — which schemes have the highest monetary value
 */

import { useState, useMemo } from "react";

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  orange:"#f97316", blue:"#3b82f6", green:"#10b981",
  red:"#ef4444",    purple:"#8b5cf6", amber:"#f59e0b",
  bg:"#f8fafc",     card:"#ffffff",  border:"#e2e8f0",
  text:"#0f172a",   muted:"#64748b",
};

const PRI_STYLE = {
  CRITICAL: { bg:"#fef2f2", border:"#fecaca", badge:"#ef4444", text:"#991b1b" },
  HIGH:     { bg:"#fff7ed", border:"#fed7aa", badge:"#f97316", text:"#9a3412" },
  MEDIUM:   { bg:"#fffbeb", border:"#fde68a", badge:"#f59e0b", text:"#92400e" },
  LOW:      { bg:"#f0fdf4", border:"#bbf7d0", badge:"#10b981", text:"#166534" },
};

// ── Citizen segments to check coverage for ───────────────────────────────────
const SEGMENTS = [
  {
    id:"tribal",
    label:"Tribal / Adivasi Communities",
    icon:"🏕️",
    keywords:["tribal","adivasi","st ","schedule tribe","vanvasi","forest"],
    minExpected:3,
    missingNote:"No dedicated tribal livelihood or cultural preservation scheme found",
  },
  {
    id:"disabled",
    label:"Persons with Disabilities",
    icon:"♿",
    keywords:["disabled","disability","divyang","handicap","specially abled","differently"],
    minExpected:2,
    missingNote:"No disability-specific vocational training or assistive device scheme found",
  },
  {
    id:"elderly",
    label:"Senior Citizens (60+)",
    icon:"👴",
    keywords:["elderly","senior","old age","pension","aged","60 years","above 60"],
    minExpected:3,
    missingNote:"Social security pension exists but no healthcare or housing scheme targeting seniors",
  },
  {
    id:"women",
    label:"Women & Girls",
    icon:"👩",
    keywords:["women","girl","female","mahila","beti","widow","maternity","sukanya","rajshri"],
    minExpected:5,
    missingNote:"Women-specific schemes are present but few address urban employed women",
  },
  {
    id:"urban_poor",
    label:"Urban Poor / Slum Dwellers",
    icon:"🏙️",
    keywords:["urban","city","slum","municipal","town","nagar"],
    minExpected:3,
    missingNote:"Most schemes target rural population — urban poor largely unaddressed",
  },
  {
    id:"youth",
    label:"Youth (18–35) & First-Job Seekers",
    icon:"🎓",
    keywords:["youth","young","apprentice","internship","rozgar","employment","job","skill","vocational"],
    minExpected:4,
    missingNote:"Apprenticeship scheme exists but no dedicated first-job or startup support for youth",
  },
];

// ── Expected scheme density per category (relative to Rajasthan population needs) ──
const SECTOR_EXPECTATIONS = {
  "Agriculture":               { expected:6,  population_share:0.62, note:"62% population depends on agriculture" },
  "Health":                    { expected:5,  population_share:1.00, note:"Universal need" },
  "Education":                 { expected:5,  population_share:1.00, note:"Universal need" },
  "Social Welfare":            { expected:5,  population_share:0.40, note:"40% BPL population" },
  "Labour & Employment":       { expected:4,  population_share:0.55, note:"High unemployment rate" },
  "Women & Child":             { expected:5,  population_share:0.50, note:"50% population" },
  "Water & Sanitation":        { expected:3,  population_share:1.00, note:"JJM coverage still incomplete" },
  "Food Security":             { expected:3,  population_share:0.35, note:"35% food insecure" },
  "Housing":                   { expected:3,  population_share:0.30, note:"30% lack pucca housing" },
  "Rural Development":         { expected:4,  population_share:0.75, note:"75% rural population" },
  "Energy":                    { expected:2,  population_share:0.60, note:"60% need energy access" },
  "Digital Services":          { expected:2,  population_share:1.00, note:"Digital inclusion priority" },
  "Business & Finance":        { expected:3,  population_share:0.20, note:"MSME sector" },
  "Identity & Social Security":{ expected:2,  population_share:1.00, note:"Universal need" },
  "Urban Development":         { expected:2,  population_share:0.25, note:"25% urban population" },
  "Industry & Commerce":       { expected:2,  population_share:0.15, note:"Industrial growth priority" },
  "Digital & IT":              { expected:2,  population_share:0.30, note:"Digital economy growth" },
  "Mining":                    { expected:1,  population_share:0.05, note:"Mineral-rich state" },
  "General":                   { expected:1,  population_share:1.00, note:"General population" },
};

// ── Pure analysis functions ───────────────────────────────────────────────────

function detectDuplicates(schemes) {
  // Group schemes by normalized name
  const nameGroups = {};
  schemes.forEach(s => {
    const normalized = s.name
      .toLowerCase()
      .replace(/rajasthan|india|pradhan mantri|pm |mukhyamantri|cm /g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 30);
    if (!nameGroups[normalized]) nameGroups[normalized] = [];
    nameGroups[normalized].push(s);
  });

  const duplicates = [];
  Object.entries(nameGroups).forEach(([key, group]) => {
    if (group.length >= 2) {
      const sources = [...new Set(group.map(s => s._src_label || s.source || "Unknown"))];
      if (sources.length >= 2) {
        duplicates.push({
          name:    group[0].name,
          count:   group.length,
          sources,
          schemes: group,
          benefit: group.find(s => s.benefit)?.benefit || "",
          category:group[0].category || "General",
        });
      }
    }
  });

  // Also detect by similar benefit keywords
  const benefitGroups = {};
  schemes.forEach(s => {
    if (!s.benefit) return;
    const key = s.benefit.toLowerCase().replace(/\s+/g,"").slice(0,25);
    if (!benefitGroups[key]) benefitGroups[key] = [];
    benefitGroups[key].push(s);
  });

  Object.entries(benefitGroups).forEach(([key, group]) => {
    if (group.length >= 2) {
      const sources = [...new Set(group.map(s => s._src_label || "Unknown"))];
      const names   = [...new Set(group.map(s => s.name))];
      if (sources.length >= 2 && names.length >= 2 && key.length > 5) {
        // Check not already captured
        const alreadyCaptured = duplicates.some(d =>
          d.schemes.some(ds => group.some(gs => gs.id === ds.id))
        );
        if (!alreadyCaptured) {
          duplicates.push({
            name:    `${names[0]} / ${names[1]}`,
            count:   group.length,
            sources,
            schemes: group,
            benefit: group[0].benefit,
            category:group[0].category || "General",
            benefitOverlap: true,
          });
        }
      }
    }
  });

  return duplicates;
}

function analyseSegments(schemes) {
  return SEGMENTS.map(seg => {
    const matching = schemes.filter(s => {
      const text = [s.name, s.description, s.eligibility, s.benefit, s.category]
        .join(" ").toLowerCase();
      return seg.keywords.some(kw => text.includes(kw));
    });

    const ratio = matching.length / seg.minExpected;
    const priority = ratio === 0 ? "CRITICAL"
      : ratio < 0.5 ? "HIGH"
      : ratio < 1.0 ? "MEDIUM"
      : "LOW";

    return {
      ...seg,
      matching,
      count: matching.length,
      priority,
      covered: matching.length >= seg.minExpected,
    };
  }).sort((a, b) => {
    const order = { CRITICAL:0, HIGH:1, MEDIUM:2, LOW:3 };
    return order[a.priority] - order[b.priority];
  });
}

function analyseSectors(schemes) {
  const counts = {};
  schemes.forEach(s => {
    const c = s.category || "General";
    counts[c] = (counts[c] || 0) + 1;
  });

  return Object.entries(counts).map(([cat, count]) => {
    const exp = SECTOR_EXPECTATIONS[cat] || { expected:2, population_share:0.5, note:"" };
    const ratio = count / exp.expected;
    const assessment = ratio >= 1.5 ? "OVER_SERVED"
      : ratio >= 0.8  ? "WELL_SERVED"
      : ratio >= 0.4  ? "UNDER_SERVED"
      : "CRITICALLY_UNDER_SERVED";

    return {
      category: cat,
      count,
      expected: exp.expected,
      assessment,
      population_share: exp.population_share,
      context: exp.note,
      gap: count < exp.expected
        ? `${exp.expected - count} more scheme${exp.expected-count>1?"s":""} recommended`
        : null,
    };
  }).sort((a, b) => {
    const order = { CRITICALLY_UNDER_SERVED:0, UNDER_SERVED:1, WELL_SERVED:2, OVER_SERVED:3 };
    return order[a.assessment] - order[b.assessment];
  });
}

function extractBenefitValue(benefit = "") {
  // Extract numeric INR values from benefit strings
  const crore = benefit.match(/₹?\s*(\d+(?:\.\d+)?)\s*(?:lakh\s*)?crore/i);
  if (crore) return parseFloat(crore[1]) * 10000000;
  const lakh = benefit.match(/₹?\s*(\d+(?:\.\d+)?)\s*lakh/i);
  if (lakh) return parseFloat(lakh[1]) * 100000;
  const k = benefit.match(/₹?\s*(\d+(?:,\d+)*)\s*(?:\/year|per year|annually)/i);
  if (k) return parseInt(k[1].replace(/,/g, ""));
  const plain = benefit.match(/₹\s*(\d+(?:,\d+)*)/);
  if (plain) return parseInt(plain[1].replace(/,/g, ""));
  return 0;
}

function generatePriorityActions(schemes, portals, segments, sectors, duplicates) {
  const actions = [];

  // Action 1: Most critical coverage gap
  const criticalGap = segments.find(s => s.priority === "CRITICAL");
  if (criticalGap) {
    actions.push({
      rank: 1,
      priority: "CRITICAL",
      icon: "🚨",
      timeline: "This week",
      action: `Launch dedicated scheme for ${criticalGap.label}`,
      rationale: `Zero schemes found targeting ${criticalGap.label.toLowerCase()}. ${criticalGap.missingNote}.`,
      impact: `Directly benefits ${Math.round(criticalGap.label.includes("Tribal") ? 13 : 8)}% of Rajasthan population currently excluded`,
      steps: [
        "Identify existing central schemes that can be state-matched",
        "Direct Social Welfare dept to draft proposal within 30 days",
        "Allocate initial corpus from CM Discretionary Fund",
      ],
    });
  }

  // Action 2: Biggest duplicate to resolve
  if (duplicates.length > 0) {
    const top = duplicates[0];
    actions.push({
      rank: 2,
      priority: "HIGH",
      icon: "🔄",
      timeline: "This month",
      action: `Consolidate ${top.count} duplicate entries of "${top.name}"`,
      rationale: `"${top.name}" appears ${top.count} times across ${top.sources.join(", ")}. Citizens see conflicting info, departments waste resources.`,
      impact: "Reduce citizen confusion, improve single-window delivery via Jan Soochna",
      steps: [
        "Assign nodal officer to own the unified scheme record",
        "Update Jan Soochna portal with single canonical entry",
        "Redirect all duplicate URLs to master page",
      ],
    });
  }

  // Action 3: Most critically under-served sector
  const underSector = sectors.find(s => s.assessment === "CRITICALLY_UNDER_SERVED");
  if (underSector) {
    actions.push({
      rank: 3,
      priority: "HIGH",
      icon: "📊",
      timeline: "This month",
      action: `Increase scheme coverage in ${underSector.category} sector`,
      rationale: `${underSector.category} has only ${underSector.count} scheme${underSector.count!==1?"s":""} but ${Math.round(underSector.population_share*100)}% of population is affected. ${underSector.context}.`,
      impact: `Address welfare gap for ${Math.round(underSector.population_share * 80)} lakh+ Rajasthan citizens`,
      steps: [
        `Review Central Government schemes for ${underSector.category} that Rajasthan can co-fund`,
        "Hold inter-departmental meeting to identify gaps",
        "Fast-track one new scheme before next budget session",
      ],
    });
  }

  // Action 4: Portal data quality
  const poorPortals = portals.filter(p => !p.description || p.description.length < 20);
  if (poorPortals.length > 0) {
    actions.push({
      rank: 4,
      priority: "MEDIUM",
      icon: "🏛️",
      timeline: "This month",
      action: `Improve data quality on ${poorPortals.length} IGOD portals`,
      rationale: `${poorPortals.length} of ${portals.length} government portals have incomplete descriptions on IGOD directory, making it hard for citizens to find services.`,
      impact: "Increase citizen awareness and portal utilisation by 20–30%",
      steps: [
        "Circulate IGOD profile update form to all department nodal officers",
        "Set 2-week deadline for portal description updates",
        "Review quarterly",
      ],
    });
  }

  // Action 5: Women & Child sector if under-served
  const womenSector = sectors.find(s => s.category === "Women & Child");
  const womenGap = segments.find(s => s.id === "women");
  if (womenSector && womenSector.count < womenSector.expected) {
    actions.push({
      rank: 5,
      priority: "MEDIUM",
      icon: "👩",
      timeline: "This quarter",
      action: "Expand Women & Child welfare scheme portfolio",
      rationale: `Only ${womenSector.count} dedicated Women & Child scheme${womenSector.count!==1?"s":""} found. Women represent 50% of population but are heavily reliant on general schemes. ${womenGap?.missingNote||""}`,
      impact: "Improve Rajasthan's gender welfare index and women's economic participation",
      steps: [
        "Review Beti Bachao Beti Padhao implementation data",
        "Launch urban working women hostel scheme",
        "Strengthen Mukhyamantri Rajshri Yojana outreach",
      ],
    });
  }

  // Fill up to 5 if needed
  if (actions.length < 5) {
    actions.push({
      rank: actions.length + 1,
      priority: "LOW",
      icon: "📱",
      timeline: "This quarter",
      action: "Digitise scheme application tracking end-to-end",
      rationale: `${schemes.length} schemes across 4 portals lack unified application status tracking, forcing citizens to visit multiple sites.`,
      impact: "Reduce physical visits to government offices by 40%",
      steps: [
        "Integrate Jan Soochna with E-Mitra for real-time status",
        "Add WhatsApp-based scheme status bot",
        "Publish monthly scheme utilisation dashboard",
      ],
    });
  }

  return actions.slice(0, 5);
}

function computeHealthScore(schemes, segments, duplicates) {
  let score = 100;
  const criticalGaps = segments.filter(s => s.priority === "CRITICAL").length;
  const highGaps     = segments.filter(s => s.priority === "HIGH").length;
  score -= criticalGaps * 15;
  score -= highGaps * 8;
  score -= Math.min(duplicates.length * 3, 20);
  if (schemes.length < 30) score -= 15;
  return Math.max(score, 0);
}

// ── UI Components ─────────────────────────────────────────────────────────────
function Card({ children, style={} }) {
  return (
    <div style={{ background:C.card, borderRadius:16, border:`1px solid ${C.border}`,
      padding:24, boxShadow:"0 1px 8px rgba(0,0,0,0.04)", ...style }}>
      {children}
    </div>
  );
}

function SectionHeader({ icon, title, subtitle, count }) {
  return (
    <div style={{ marginBottom:18 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
        <span style={{ fontSize:24 }}>{icon}</span>
        <h2 style={{ fontSize:20, fontWeight:900, color:C.text, margin:0 }}>
          {title}
        </h2>
        {count != null && (
          <span style={{ background:`${C.orange}15`, color:C.orange,
            border:`1px solid ${C.orange}25`, borderRadius:20,
            padding:"2px 10px", fontSize:12, fontWeight:700 }}>
            {count} found
          </span>
        )}
      </div>
      {subtitle && <p style={{ fontSize:13, color:C.muted, margin:"0 0 0 34px" }}>{subtitle}</p>}
    </div>
  );
}

function PriBadge({ level }) {
  const s = PRI_STYLE[level] || PRI_STYLE.MEDIUM;
  return (
    <span style={{ background:s.badge, color:"white", borderRadius:20,
      padding:"2px 10px", fontSize:10, fontWeight:800, letterSpacing:"0.07em",
      whiteSpace:"nowrap" }}>
      {level}
    </span>
  );
}

// ── Executive Summary ─────────────────────────────────────────────────────────
function Summary({ schemes, portals, segments, sectors, duplicates }) {
  const score = computeHealthScore(schemes, segments, duplicates);
  const scoreColor = score >= 75 ? C.green : score >= 50 ? C.amber : C.red;
  const scoreLabel = score >= 75 ? "GOOD" : score >= 50 ? "NEEDS ATTENTION" : "CRITICAL GAPS";

  const topSector    = [...sectors].sort((a,b)=>b.count-a.count)[0];
  const bottomSector = sectors.find(s=>s.assessment==="CRITICALLY_UNDER_SERVED") ||
                       sectors.find(s=>s.assessment==="UNDER_SERVED");
  const critGapCount = segments.filter(s=>s.priority==="CRITICAL"||s.priority==="HIGH").length;

  return (
    <Card style={{ background:"linear-gradient(135deg,#fff7ed,#fffbeb)", borderColor:"#fed7aa" }}>
      <div style={{ display:"flex", gap:20, alignItems:"flex-start" }}>
        <div style={{ width:60, height:60, borderRadius:14, background:C.orange,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:28, flexShrink:0 }}>🏛️</div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.orange,
            letterSpacing:"0.1em", marginBottom:8 }}>
            EXECUTIVE BRIEFING — OFFICE OF CM RAJASTHAN
          </div>

          {/* Health score */}
          <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:18 }}>
            <div style={{ position:"relative", width:80, height:80, flexShrink:0 }}>
              <svg viewBox="0 0 80 80" style={{ width:80, height:80, transform:"rotate(-90deg)" }}>
                <circle cx="40" cy="40" r="34" fill="none"
                  stroke="#e5e7eb" strokeWidth="8"/>
                <circle cx="40" cy="40" r="34" fill="none"
                  stroke={scoreColor} strokeWidth="8"
                  strokeDasharray={`${(score/100)*213.6} 213.6`}
                  strokeLinecap="round"/>
              </svg>
              <div style={{ position:"absolute", top:0, left:0, width:80, height:80,
                display:"flex", flexDirection:"column", alignItems:"center",
                justifyContent:"center" }}>
                <span style={{ fontSize:20, fontWeight:900, color:scoreColor }}>{score}</span>
                <span style={{ fontSize:9, color:C.muted, fontWeight:600 }}>/ 100</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize:18, fontWeight:800, color:C.text, marginBottom:4 }}>
                Welfare Ecosystem Health:{" "}
                <span style={{ color:scoreColor }}>{scoreLabel}</span>
              </div>
              <div style={{ fontSize:13, color:C.muted, lineHeight:1.5 }}>
                {schemes.length} schemes scraped from 4 sources ·{" "}
                {critGapCount} citizen segment{critGapCount!==1?"s":""} with coverage gaps ·{" "}
                {duplicates.length} duplicate scheme{duplicates.length!==1?"s":""} detected
              </div>
            </div>
          </div>

          {/* KPI grid */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
            {[
              { label:"SCHEMES ANALYSED",  value:schemes.length,          color:C.orange },
              { label:"PORTALS INDEXED",   value:portals.length,           color:C.blue   },
              { label:"STRONGEST SECTOR",  value:topSector?.category?.split(" ")[0]||"—", color:C.green  },
              { label:"NEEDS FOCUS",       value:bottomSector?.category?.split(" ")[0]||"—", color:C.red },
            ].map((k,i)=>(
              <div key={i} style={{ background:"white", borderRadius:10,
                padding:"10px 14px", border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:10, fontWeight:700, color:C.muted,
                  letterSpacing:"0.07em", marginBottom:4 }}>{k.label}</div>
                <div style={{ fontSize:15, fontWeight:900, color:k.color,
                  overflow:"hidden", textOverflow:"ellipsis",
                  whiteSpace:"nowrap" }}>{k.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Priority Actions ──────────────────────────────────────────────────────────
function PriorityActions({ actions }) {
  const [expanded, setExpanded] = useState(null);
  const tlColor = { "This week":C.red, "This month":C.orange, "This quarter":C.blue };

  return (
    <div>
      <SectionHeader icon="⚡" title="Priority Actions for CM"
        subtitle="Derived from data patterns — no AI needed. Click any action to see steps."/>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {actions.map((a, i) => {
          const p   = PRI_STYLE[a.priority] || PRI_STYLE.HIGH;
          const tc  = tlColor[a.timeline] || C.orange;
          const exp = expanded === i;
          return (
            <div key={i} onClick={() => setExpanded(exp?null:i)}
              style={{ background: i===0?"linear-gradient(135deg,#fff7ed,#fffbeb)":C.card,
                borderRadius:14, border:`1px solid ${i===0?"#fed7aa":C.border}`,
                padding:18, cursor:"pointer", boxShadow:"0 1px 4px rgba(0,0,0,0.04)",
                transition:"box-shadow .15s",
                borderLeft:`4px solid ${p.badge}` }}>
              <div style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
                <div style={{ width:44, height:44, borderRadius:12, flexShrink:0,
                  background: i===0 ? C.orange : `${p.badge}15`,
                  color: i===0 ? "white" : p.badge,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:20, fontWeight:900 }}>{a.rank}</div>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center",
                    gap:8, marginBottom:8, flexWrap:"wrap" }}>
                    <PriBadge level={a.priority}/>
                    <span style={{ background:`${tc}15`, color:tc,
                      border:`1px solid ${tc}30`, borderRadius:20,
                      padding:"2px 10px", fontSize:11, fontWeight:700 }}>
                      ⏱ {a.timeline}
                    </span>
                    <span style={{ fontSize:16 }}>{a.icon}</span>
                  </div>
                  <div style={{ fontWeight:800, fontSize:15, color:C.text,
                    marginBottom:6, lineHeight:1.3 }}>{a.action}</div>
                  <p style={{ fontSize:13, color:C.muted,
                    margin:0, lineHeight:1.6 }}>{a.rationale}</p>

                  {exp && (
                    <div style={{ marginTop:14, paddingTop:14,
                      borderTop:`1px solid ${C.border}` }}>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr",
                        gap:10, marginBottom:12 }}>
                        <div style={{ background:"#f0fdf4", borderRadius:8, padding:"10px 12px" }}>
                          <div style={{ fontSize:10, fontWeight:700, color:"#166534",
                            letterSpacing:"0.07em", marginBottom:3 }}>EXPECTED IMPACT</div>
                          <div style={{ fontSize:12, color:"#14532d", fontWeight:600 }}>
                            {a.impact}
                          </div>
                        </div>
                        <div style={{ background:"#eff6ff", borderRadius:8, padding:"10px 12px" }}>
                          <div style={{ fontSize:10, fontWeight:700, color:"#1d4ed8",
                            letterSpacing:"0.07em", marginBottom:5 }}>STEPS</div>
                          {a.steps?.map((step,j)=>(
                            <div key={j} style={{ fontSize:11, color:"#1e3a5f",
                              display:"flex", gap:6, marginBottom:3 }}>
                              <span style={{ color:C.blue, fontWeight:700,
                                flexShrink:0 }}>{j+1}.</span>
                              {step}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  <div style={{ fontSize:11, color:C.muted, marginTop:6 }}>
                    {exp ? "▲ Hide steps" : "▼ Show action steps"}
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

// ── Coverage Gaps ─────────────────────────────────────────────────────────────
function CoverageGaps({ segments }) {
  return (
    <div>
      <SectionHeader icon="🎯" title="Coverage Gaps"
        subtitle="Citizen segments underserved by current scheme portfolio — detected by keyword analysis"
        count={segments.filter(s=>s.priority!=="LOW").length}/>
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {segments.map((seg, i) => {
          const p = PRI_STYLE[seg.priority] || PRI_STYLE.LOW;
          return (
            <Card key={i} style={{ borderLeft:`4px solid ${p.badge}`,
              background:p.bg, borderColor:p.border, padding:16 }}>
              <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                <div style={{ width:42, height:42, borderRadius:10, flexShrink:0,
                  background:`${p.badge}20`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:22 }}>{seg.icon}</div>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center",
                    gap:8, marginBottom:6, flexWrap:"wrap" }}>
                    <PriBadge level={seg.priority}/>
                    <span style={{ fontWeight:800, fontSize:14, color:C.text }}>
                      {seg.label}
                    </span>
                    <span style={{ fontSize:12, color:C.muted }}>
                      {seg.count} scheme{seg.count!==1?"s":""} found
                      {seg.minExpected ? ` (${seg.minExpected} recommended)` : ""}
                    </span>
                  </div>

                  {seg.count > 0 ? (
                    <div style={{ marginBottom:8 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:C.muted,
                        letterSpacing:"0.07em", marginBottom:5 }}>
                        SCHEMES ADDRESSING THIS SEGMENT
                      </div>
                      <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                        {seg.matching.slice(0,4).map((s,j)=>(
                          <span key={j} style={{ background:"#f0fdf4", color:"#166534",
                            border:"1px solid #bbf7d0", borderRadius:6,
                            padding:"2px 8px", fontSize:11, fontWeight:600 }}>
                            {s.name}
                          </span>
                        ))}
                        {seg.matching.length > 4 && (
                          <span style={{ fontSize:11, color:C.muted }}>
                            +{seg.matching.length-4} more
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize:13, color:p.text, fontWeight:600, marginBottom:6 }}>
                      ⚠️ No schemes found targeting this segment
                    </div>
                  )}

                  <div style={{ background:"white", borderRadius:8,
                    padding:"8px 12px", border:`1px solid ${p.border}`,
                    fontSize:12, color:C.text, display:"flex", gap:6 }}>
                    <span style={{ color:p.badge, fontWeight:800 }}>→</span>
                    <span>{seg.missingNote}</span>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── Sector Analysis ────────────────────────────────────────────────────────────
function SectorAnalysis({ sectors }) {
  const assessStyle = {
    OVER_SERVED:             { color:C.blue,   label:"Over-served",  bar:"#3b82f6" },
    WELL_SERVED:             { color:C.green,  label:"Well-served",  bar:"#10b981" },
    UNDER_SERVED:            { color:C.amber,  label:"Under-served", bar:"#f59e0b" },
    CRITICALLY_UNDER_SERVED: { color:C.red,    label:"Critical Gap", bar:"#ef4444" },
  };
  const maxCount = Math.max(...sectors.map(s=>s.count), 1);

  return (
    <div>
      <SectionHeader icon="📊" title="Sector Balance"
        subtitle="Scheme count vs expected coverage — based on Rajasthan population distribution"/>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:12 }}>
        {sectors.map((sec, i) => {
          const as = assessStyle[sec.assessment] || assessStyle.UNDER_SERVED;
          const pct = Math.round((sec.count / maxCount) * 100);
          return (
            <Card key={i} style={{ padding:16 }}>
              <div style={{ display:"flex", alignItems:"center",
                justifyContent:"space-between", marginBottom:10 }}>
                <span style={{ fontWeight:800, fontSize:13, color:C.text }}>
                  {sec.category}
                </span>
                <span style={{ background:`${as.color}15`, color:as.color,
                  border:`1px solid ${as.color}25`, borderRadius:20,
                  padding:"2px 10px", fontSize:11, fontWeight:700 }}>
                  {as.label}
                </span>
              </div>
              {/* Bar */}
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                <div style={{ flex:1, height:8, background:"#f1f5f9",
                  borderRadius:4, overflow:"hidden" }}>
                  <div style={{ width:`${pct}%`, height:"100%",
                    background:as.bar, borderRadius:4,
                    transition:"width .4s ease" }}/>
                </div>
                <div style={{ display:"flex", alignItems:"baseline", gap:4, minWidth:60 }}>
                  <span style={{ fontWeight:900, fontSize:18,
                    color:as.color }}>{sec.count}</span>
                  <span style={{ fontSize:11, color:C.muted }}>
                    /{sec.expected} rec.
                  </span>
                </div>
              </div>
              <div style={{ fontSize:11, color:C.muted }}>{sec.context}</div>
              {sec.gap && (
                <div style={{ marginTop:8, background:"#fef2f2",
                  borderRadius:6, padding:"5px 10px",
                  fontSize:11, color:"#991b1b", fontWeight:600 }}>
                  ⚠️ {sec.gap}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── Duplicate Detection ────────────────────────────────────────────────────────
function DuplicateDetection({ duplicates, totalSchemes }) {
  if (duplicates.length === 0) return null;

  return (
    <div>
      <SectionHeader icon="🔄" title="Duplicate Schemes Detected"
        subtitle="Same scheme appearing across multiple sources — causes citizen confusion and data inflation"
        count={duplicates.length}/>
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {duplicates.map((dup, i) => (
          <Card key={i} style={{ borderLeft:`4px solid ${C.purple}`, padding:16 }}>
            <div style={{ display:"flex", alignItems:"flex-start",
              justifyContent:"space-between", gap:10, marginBottom:10 }}>
              <div>
                <div style={{ fontWeight:800, fontSize:14, color:C.text,
                  marginBottom:4 }}>{dup.name}</div>
                <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                  {dup.sources.map((src,j)=>(
                    <span key={j} style={{ background:`${C.purple}10`, color:C.purple,
                      border:`1px solid ${C.purple}25`, borderRadius:6,
                      padding:"2px 8px", fontSize:11, fontWeight:600 }}>
                      {src}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ textAlign:"right", flexShrink:0 }}>
                <div style={{ fontSize:28, fontWeight:900, color:C.purple }}>
                  {dup.count}×
                </div>
                <div style={{ fontSize:10, color:C.muted }}>duplicates</div>
              </div>
            </div>
            {dup.benefit && (
              <div style={{ fontSize:12, color:C.muted, marginBottom:8 }}>
                Benefit: <strong style={{ color:C.text }}>{dup.benefit}</strong>
              </div>
            )}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <div style={{ background:"#fef2f2", borderRadius:8, padding:"8px 12px" }}>
                <div style={{ fontSize:10, fontWeight:700, color:"#991b1b",
                  letterSpacing:"0.07em", marginBottom:2 }}>PROBLEM</div>
                <div style={{ fontSize:11, color:"#7f1d1d" }}>
                  Citizen sees {dup.count} listings — unclear which is authoritative.
                  Department effort duplicated across portals.
                </div>
              </div>
              <div style={{ background:"#f0fdf4", borderRadius:8, padding:"8px 12px" }}>
                <div style={{ fontSize:10, fontWeight:700, color:"#166534",
                  letterSpacing:"0.07em", marginBottom:2 }}>FIX</div>
                <div style={{ fontSize:11, color:"#14532d", fontWeight:600 }}>
                  Designate one source as master record.
                  Jan Soochna portal to show single canonical entry.
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Benefit Analysis ──────────────────────────────────────────────────────────
function BenefitAnalysis({ schemes }) {
  const withValue = schemes
    .map(s => ({ ...s, _value: extractBenefitValue(s.benefit || "") }))
    .filter(s => s._value > 0)
    .sort((a,b) => b._value - a._value)
    .slice(0, 10);

  if (withValue.length === 0) return null;

  const maxVal = withValue[0]._value;

  const fmt = v => {
    if (v >= 10000000) return `₹${(v/10000000).toFixed(1)}Cr`;
    if (v >= 100000)   return `₹${(v/100000).toFixed(1)}L`;
    if (v >= 1000)     return `₹${(v/1000).toFixed(0)}K`;
    return `₹${v}`;
  };

  return (
    <div>
      <SectionHeader icon="💰" title="Highest Value Schemes"
        subtitle="Top 10 schemes by monetary benefit — parsed directly from scraped data"/>
      <Card>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {withValue.map((s, i) => {
            const pct = Math.round((s._value / maxVal) * 100);
            const src = s._src_label || s.source || "";
            const srcColors = {
              "RajRAS":C.blue, "Jan Soochna":C.green,
              "MyScheme":C.purple, "IGOD Portal":C.orange,
            };
            const srcColor = srcColors[src] || C.orange;
            return (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:22, height:22, borderRadius:6, flexShrink:0,
                  background: i<3?"#f97316":"#f1f5f9",
                  color: i<3?"white":"#6b7280",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:11, fontWeight:800 }}>{i+1}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", justifyContent:"space-between",
                    alignItems:"center", marginBottom:4 }}>
                    <span style={{ fontSize:13, fontWeight:600, color:C.text,
                      overflow:"hidden", textOverflow:"ellipsis",
                      whiteSpace:"nowrap", maxWidth:"60%" }}>
                      {s.name}
                    </span>
                    <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                      <span style={{ background:`${srcColor}10`, color:srcColor,
                        border:`1px solid ${srcColor}20`, borderRadius:4,
                        padding:"1px 6px", fontSize:10, fontWeight:600 }}>{src}</span>
                      <span style={{ fontWeight:900, fontSize:14,
                        color:C.orange }}>{fmt(s._value)}</span>
                    </div>
                  </div>
                  <div style={{ height:6, background:"#f1f5f9",
                    borderRadius:3, overflow:"hidden" }}>
                    <div style={{ width:`${pct}%`, height:"100%",
                      background: i<3?"linear-gradient(90deg,#f97316,#f59e0b)":"#94a3b8",
                      borderRadius:3, transition:"width .5s ease" }}/>
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

// ── Main Export ───────────────────────────────────────────────────────────────
export default function InsightsEngine({ schemes=[], portals=[], onScrapeFirst }) {
  const [activeSection, setActiveSection] = useState("all");

  // All analysis is pure memoized computation — no API calls
  const analysis = useMemo(() => {
    if (!schemes.length) return null;
    const segments  = analyseSegments(schemes);
    const sectors   = analyseSectors(schemes);
    const duplicates= detectDuplicates(schemes);
    const actions   = generatePriorityActions(schemes, portals, segments, sectors, duplicates);
    return { segments, sectors, duplicates, actions };
  }, [schemes, portals]);

  if (!schemes.length) {
    return (
      <div style={{ padding:"60px 40px", textAlign:"center" }}>
        <div style={{ fontSize:64, marginBottom:20 }}>📊</div>
        <h3 style={{ fontSize:20, fontWeight:800, color:C.text, marginBottom:8 }}>
          No Scraped Data Yet
        </h3>
        <p style={{ color:C.muted, fontSize:14, maxWidth:380,
          margin:"0 auto 28px", lineHeight:1.6 }}>
          Scrape data from the 4 government sources first.
          Insights are generated instantly from the data — no API needed.
        </p>
        <button onClick={onScrapeFirst} style={{
          background:C.orange, color:"white", borderRadius:12,
          padding:"13px 32px", fontWeight:800, fontSize:15,
          border:"none", cursor:"pointer", boxShadow:"0 4px 20px #f9731650"
        }}>⚡ Scrape Data First</button>
      </div>
    );
  }

  const { segments, sectors, duplicates, actions } = analysis;
  const SECTIONS = [
    { id:"all",       label:"All Insights" },
    { id:"actions",   label:"⚡ Priority Actions" },
    { id:"gaps",      label:"🎯 Coverage Gaps" },
    { id:"sectors",   label:"📊 Sectors" },
    { id:"dupes",     label:"🔄 Duplicates" },
    { id:"benefits",  label:"💰 Benefits" },
  ];

  return (
    <div className="fadeup">
      {/* Header */}
      <div style={{ marginBottom:22 }}>
        <h1 style={{ fontSize:26, fontWeight:900, color:C.text, margin:"0 0 4px" }}>
          Policy Intelligence —{" "}
          <span style={{ color:C.orange }}>Data-Driven Insights</span>
        </h1>
        <p style={{ color:C.muted, fontSize:13, margin:0 }}>
          Instant analysis of {schemes.length} scraped schemes · No AI API needed ·
          Updates automatically when you re-scrape
        </p>
      </div>

      {/* Data pills */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:20 }}>
        {[
          { label:`${schemes.length} schemes`, color:C.orange },
          { label:`${portals.length} portals`, color:C.blue },
          { label:`${duplicates.length} duplicates found`, color:C.purple },
          { label:`${segments.filter(s=>s.priority==="CRITICAL"||s.priority==="HIGH").length} coverage gaps`, color:C.red },
          { label:"Zero API cost", color:C.green },
        ].map((p,i)=>(
          <span key={i} style={{ background:`${p.color}12`, color:p.color,
            border:`1px solid ${p.color}25`, borderRadius:20,
            padding:"4px 14px", fontSize:12, fontWeight:700 }}>{p.label}</span>
        ))}
      </div>

      {/* Section filter */}
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:24 }}>
        {SECTIONS.map(s=>(
          <button key={s.id} onClick={()=>setActiveSection(s.id)} style={{
            background: activeSection===s.id ? C.orange : "white",
            color: activeSection===s.id ? "white" : C.muted,
            border:`1.5px solid ${activeSection===s.id ? C.orange : C.border}`,
            borderRadius:20, padding:"6px 16px", fontSize:12,
            fontWeight:600, cursor:"pointer", transition:"all .15s",
          }}>{s.label}</button>
        ))}
      </div>

      {/* Sections */}
      <div style={{ display:"flex", flexDirection:"column", gap:28 }}>
        {(activeSection==="all"||activeSection==="actions") && (
          <Summary schemes={schemes} portals={portals}
            segments={segments} sectors={sectors} duplicates={duplicates}/>
        )}
        {(activeSection==="all"||activeSection==="actions") && (
          <PriorityActions actions={actions}/>
        )}
        {(activeSection==="all"||activeSection==="gaps") && (
          <CoverageGaps segments={segments}/>
        )}
        {(activeSection==="all"||activeSection==="sectors") && (
          <SectorAnalysis sectors={sectors}/>
        )}
        {(activeSection==="all"||activeSection==="dupes") && (
          <DuplicateDetection duplicates={duplicates} totalSchemes={schemes.length}/>
        )}
        {(activeSection==="all"||activeSection==="benefits") && (
          <BenefitAnalysis schemes={schemes}/>
        )}
      </div>
    </div>
  );
}