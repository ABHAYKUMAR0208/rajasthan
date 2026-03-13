/**
 * InsightsEngine.js
 * =================
 * Sends scraped scheme + portal data to Claude API.
 * Renders structured executive intelligence for the CM's office.
 *
 * Five insight modules:
 *  1. Executive Summary     — overall state of schemes
 *  2. Priority Actions      — top 5 immediate recommendations
 *  3. Coverage Gaps         — which citizens are underserved
 *  4. Category Analysis     — sector over/under-investment
 *  5. Scheme Overlaps       — duplicates / merge candidates
 */

import { useState, useCallback } from "react";

const CLAUDE_MODEL = "claude-sonnet-4-20250514";

const C = {
  orange:"#f97316", blue:"#3b82f6", green:"#10b981", red:"#ef4444",
  purple:"#8b5cf6", amber:"#f59e0b", slate:"#64748b",
  bg:"#f8fafc", card:"#ffffff", border:"#e2e8f0", text:"#0f172a", muted:"#64748b",
};

const PRI = {
  CRITICAL: { bg:"#fef2f2", border:"#fecaca", text:"#991b1b", badge:"#ef4444" },
  HIGH:     { bg:"#fff7ed", border:"#fed7aa", text:"#9a3412", badge:"#f97316" },
  MEDIUM:   { bg:"#fffbeb", border:"#fde68a", text:"#92400e", badge:"#f59e0b" },
  LOW:      { bg:"#f0fdf4", border:"#bbf7d0", text:"#166534", badge:"#10b981" },
};

// ── Build prompt from real scraped data ───────────────────────────────────────
function buildPrompt(schemes, portals) {
  const schemeList = schemes.slice(0, 60).map(s => ({
    name:        s.name,
    category:    s.category || "General",
    benefit:     s.benefit  || s.description || "",
    eligibility: s.eligibility || "",
    dept:        s.department  || s.ministry  || "",
    source:      s._src_label  || s.source    || "",
  }));

  const catCounts = {};
  schemes.forEach(s => {
    const c = s.category || "General";
    catCounts[c] = (catCounts[c] || 0) + 1;
  });

  const catSummary = Object.entries(catCounts)
    .sort((a,b) => b[1]-a[1])
    .map(([c,n]) => `  ${c}: ${n} schemes`)
    .join("\n");

  return `You are a senior policy analyst briefing the Chief Minister of Rajasthan, India.

REAL DATA scraped from 4 official Rajasthan government websites:
- Jan Soochna Portal (jansoochna.rajasthan.gov.in)
- MyScheme.gov.in
- RajRAS (rajras.in)
- IGOD Portal Directory (igod.gov.in)

SCHEMES DATA — ${schemes.length} total schemes:
${JSON.stringify(schemeList, null, 1)}

GOVERNMENT PORTALS — ${portals.length} portals:
${portals.map(p => `  ${p.name} (${p.category}) — ${p.domain}`).join("\n")}

CATEGORY DISTRIBUTION:
${catSummary}

Analyse this data and respond ONLY with a valid JSON object matching this exact structure. No markdown, no text outside JSON:

{
  "executive_summary": {
    "headline": "one powerful sentence summarizing the welfare ecosystem state",
    "strongest_sector": "category with most schemes",
    "weakest_sector": "category most critically under-served relative to need",
    "overall_health": "GOOD|FAIR|NEEDS_ATTENTION",
    "key_stat": "one striking statistic from the data",
    "cm_note": "one urgent personal note to CM about what needs immediate attention"
  },
  "coverage_gaps": [
    {
      "segment": "specific underserved citizen group",
      "gap_description": "what gap exists in current scheme coverage",
      "schemes_addressing": ["actual scheme names from data that partially help"],
      "schemes_missing": "what type of scheme is absent",
      "priority": "CRITICAL|HIGH|MEDIUM|LOW",
      "recommendation": "specific actionable recommendation referencing real data"
    }
  ],
  "category_analysis": [
    {
      "category": "category name from the data",
      "scheme_count": 0,
      "assessment": "OVER_SERVED|WELL_SERVED|UNDER_SERVED|CRITICALLY_UNDER_SERVED",
      "rationale": "why — name actual schemes",
      "gap": "what is missing (null if none)",
      "opportunity": "specific opportunity for the CM"
    }
  ],
  "overlaps": [
    {
      "title": "short cluster name",
      "schemes": ["Actual Scheme Name A", "Actual Scheme Name B"],
      "overlap_type": "BENEFIT_OVERLAP|ELIGIBILITY_OVERLAP|OBJECTIVE_OVERLAP",
      "overlap_description": "exactly how these schemes overlap",
      "impact": "waste or citizen confusion this causes",
      "recommendation": "merge/consolidate/differentiate with specific steps"
    }
  ],
  "priority_actions": [
    {
      "rank": 1,
      "action": "specific action for CM",
      "rationale": "why — reference actual data and scheme names",
      "timeline": "This week|This month|This quarter",
      "expected_impact": "measurable concrete outcome",
      "schemes_involved": ["actual scheme names"],
      "priority": "CRITICAL|HIGH|MEDIUM"
    }
  ],
  "data_quality_note": "brief note on data completeness"
}

Rules:
- Only reference actual scheme names from the data provided
- Provide exactly 4-5 coverage_gaps, 6-8 category_analysis items, 3-4 overlaps, exactly 5 priority_actions
- Be specific and actionable — this briefing goes directly to the Chief Minister`;
}

// ── Shared UI components ──────────────────────────────────────────────────────
function Card({ children, style={} }) {
  return (
    <div style={{ background:C.card, borderRadius:16, border:`1px solid ${C.border}`,
      padding:24, boxShadow:"0 1px 8px rgba(0,0,0,0.05)", ...style }}>
      {children}
    </div>
  );
}

function SectionTitle({ icon, title, accent, subtitle }) {
  return (
    <div style={{ marginBottom:18 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
        <span style={{ fontSize:22 }}>{icon}</span>
        <h2 style={{ fontSize:20, fontWeight:900, color:C.text, margin:0 }}>
          {title}{" "}
          {accent && <span style={{ color:C.orange }}>— {accent}</span>}
        </h2>
      </div>
      {subtitle && (
        <p style={{ fontSize:13, color:C.muted, margin:"0 0 0 32px" }}>{subtitle}</p>
      )}
    </div>
  );
}

function PriorityBadge({ level }) {
  const p = PRI[level] || PRI.MEDIUM;
  return (
    <span style={{ background:p.badge, color:"white", borderRadius:20,
      padding:"2px 10px", fontSize:10, fontWeight:800, letterSpacing:"0.07em" }}>
      {level}
    </span>
  );
}

// ── Executive Summary ─────────────────────────────────────────────────────────
function ExecutiveSummary({ d, schemeCount, portalCount }) {
  const healthColor = { GOOD:C.green, FAIR:C.amber, NEEDS_ATTENTION:C.red }[d.overall_health] || C.amber;
  return (
    <Card style={{ background:"linear-gradient(135deg,#fff7ed 0%,#fffbeb 100%)", borderColor:"#fed7aa" }}>
      <div style={{ display:"flex", gap:20, alignItems:"flex-start" }}>
        <div style={{ width:56, height:56, borderRadius:14, background:C.orange, flexShrink:0,
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:26 }}>🏛️</div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.orange,
            letterSpacing:"0.1em", marginBottom:6 }}>EXECUTIVE BRIEFING — OFFICE OF CM</div>
          <p style={{ fontSize:18, fontWeight:700, color:C.text,
            lineHeight:1.4, margin:"0 0 18px" }}>{d.headline}</p>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:16 }}>
            {[
              { label:"SCHEMES ANALYSED",  value:schemeCount,                color:C.orange },
              { label:"PORTALS INDEXED",   value:portalCount,                color:C.blue   },
              { label:"STRONGEST SECTOR",  value:d.strongest_sector?.split(" ")[0]||"—", color:C.green  },
              { label:"OVERALL HEALTH",    value:d.overall_health?.replace("_"," ")||"—", color:healthColor },
            ].map((k,i) => (
              <div key={i} style={{ background:"white", borderRadius:10,
                padding:"10px 14px", border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:10, fontWeight:700, color:C.muted,
                  letterSpacing:"0.07em", marginBottom:4 }}>{k.label}</div>
                <div style={{ fontSize:15, fontWeight:900, color:k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div style={{ background:"white", borderRadius:10, padding:"12px 16px",
              border:`1px solid ${C.border}` }}>
              <div style={{ fontSize:10, fontWeight:700, color:C.muted,
                letterSpacing:"0.07em", marginBottom:4 }}>KEY INSIGHT</div>
              <div style={{ fontSize:13, color:C.text, fontWeight:600 }}>{d.key_stat}</div>
            </div>
            <div style={{ background:"#fef2f2", borderRadius:10, padding:"12px 16px",
              border:"1px solid #fecaca" }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#991b1b",
                letterSpacing:"0.07em", marginBottom:4 }}>⚡ ATTENTION REQUIRED</div>
              <div style={{ fontSize:13, color:"#7f1d1d", fontWeight:600 }}>{d.cm_note}</div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Priority Actions ──────────────────────────────────────────────────────────
function PriorityActions({ actions }) {
  const tlColor = { "This week":C.red, "This month":C.orange, "This quarter":C.blue };
  return (
    <div>
      <SectionTitle icon="⚡" title="Priority Actions"
        subtitle="Top 5 actions recommended for the Chief Minister based on AI analysis of scraped data"/>
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {[...actions].sort((a,b)=>a.rank-b.rank).map((action, i) => {
          const p = PRI[action.priority] || PRI.HIGH;
          const tc = tlColor[action.timeline] || C.orange;
          return (
            <Card key={i} style={{
              background: i===0 ? "linear-gradient(135deg,#fff7ed,#fffbeb)" : C.card,
              borderColor: i===0 ? "#fed7aa" : C.border,
            }}>
              <div style={{ display:"flex", gap:16, alignItems:"flex-start" }}>
                <div style={{ width:46, height:46, borderRadius:12, flexShrink:0,
                  background: i===0 ? C.orange : `${p.badge}15`,
                  color: i===0 ? "white" : p.badge,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:20, fontWeight:900 }}>{action.rank}</div>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center",
                    gap:8, marginBottom:8, flexWrap:"wrap" }}>
                    <PriorityBadge level={action.priority}/>
                    <span style={{ background:`${tc}15`, color:tc,
                      border:`1px solid ${tc}30`, borderRadius:20,
                      padding:"2px 10px", fontSize:11, fontWeight:700 }}>
                      ⏱ {action.timeline}
                    </span>
                  </div>
                  <div style={{ fontWeight:800, fontSize:15, color:C.text,
                    marginBottom:8, lineHeight:1.3 }}>{action.action}</div>
                  <p style={{ fontSize:13, color:C.muted,
                    margin:"0 0 12px", lineHeight:1.6 }}>{action.rationale}</p>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    <div style={{ background:"#f0fdf4", borderRadius:8, padding:"10px 12px" }}>
                      <div style={{ fontSize:10, fontWeight:700, color:"#166534",
                        letterSpacing:"0.07em", marginBottom:3 }}>EXPECTED IMPACT</div>
                      <div style={{ fontSize:12, color:"#14532d",
                        fontWeight:600 }}>{action.expected_impact}</div>
                    </div>
                    {action.schemes_involved?.length > 0 && (
                      <div style={{ background:"#eff6ff", borderRadius:8, padding:"10px 12px" }}>
                        <div style={{ fontSize:10, fontWeight:700, color:"#1d4ed8",
                          letterSpacing:"0.07em", marginBottom:5 }}>SCHEMES INVOLVED</div>
                        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                          {action.schemes_involved.slice(0,3).map((s,j) => (
                            <span key={j} style={{ background:"white", color:"#1d4ed8",
                              border:"1px solid #bfdbfe", borderRadius:5,
                              padding:"1px 7px", fontSize:10, fontWeight:600 }}>{s}</span>
                          ))}
                        </div>
                      </div>
                    )}
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

// ── Coverage Gaps ─────────────────────────────────────────────────────────────
function CoverageGaps({ gaps }) {
  return (
    <div>
      <SectionTitle icon="🎯" title="Coverage Gaps"
        subtitle="Citizen segments currently underserved by the scheme portfolio"/>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        {gaps.map((gap, i) => {
          const p = PRI[gap.priority] || PRI.MEDIUM;
          return (
            <Card key={i} style={{ borderLeft:`4px solid ${p.badge}`,
              background:p.bg, borderColor:p.border }}>
              <div style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
                <div style={{ width:42, height:42, borderRadius:10, flexShrink:0,
                  background:`${p.badge}20`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:20 }}>👥</div>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center",
                    gap:10, marginBottom:8, flexWrap:"wrap" }}>
                    <PriorityBadge level={gap.priority}/>
                    <span style={{ fontWeight:800, fontSize:15, color:C.text }}>
                      {gap.segment}
                    </span>
                  </div>
                  <p style={{ fontSize:13, color:"#374151",
                    margin:"0 0 12px", lineHeight:1.6 }}>{gap.gap_description}</p>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr",
                    gap:10, marginBottom:12 }}>
                    {gap.schemes_addressing?.length > 0 && (
                      <div>
                        <div style={{ fontSize:10, fontWeight:700, color:C.muted,
                          letterSpacing:"0.07em", marginBottom:5 }}>PARTIALLY ADDRESSED BY</div>
                        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                          {gap.schemes_addressing.slice(0,3).map((s,j) => (
                            <span key={j} style={{ background:"#f0fdf4", color:"#166534",
                              border:"1px solid #bbf7d0", borderRadius:6,
                              padding:"2px 8px", fontSize:11, fontWeight:600 }}>{s}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {gap.schemes_missing && (
                      <div>
                        <div style={{ fontSize:10, fontWeight:700, color:C.muted,
                          letterSpacing:"0.07em", marginBottom:5 }}>MISSING</div>
                        <span style={{ background:"#fef2f2", color:"#991b1b",
                          border:"1px solid #fecaca", borderRadius:6,
                          padding:"2px 8px", fontSize:11, fontWeight:600 }}>
                          {gap.schemes_missing}
                        </span>
                      </div>
                    )}
                  </div>
                  <div style={{ background:"white", borderRadius:8,
                    padding:"10px 14px", border:`1px solid ${p.border}`,
                    display:"flex", gap:8, alignItems:"flex-start" }}>
                    <span style={{ color:p.badge, fontWeight:800, flexShrink:0 }}>→</span>
                    <span style={{ fontSize:13, color:C.text,
                      fontWeight:600 }}>{gap.recommendation}</span>
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

// ── Category Analysis ─────────────────────────────────────────────────────────
function CategoryAnalysis({ categories }) {
  const assessColor = {
    OVER_SERVED:             C.blue,
    WELL_SERVED:             C.green,
    UNDER_SERVED:            C.amber,
    CRITICALLY_UNDER_SERVED: C.red,
  };
  const assessLabel = {
    OVER_SERVED:"Over-served", WELL_SERVED:"Well-served",
    UNDER_SERVED:"Under-served", CRITICALLY_UNDER_SERVED:"Critical Gap",
  };
  return (
    <div>
      <SectionTitle icon="📊" title="Sector Analysis"
        subtitle="Investment balance across policy areas — based on scheme count and coverage assessment"/>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:14 }}>
        {categories.map((cat, i) => {
          const ac = assessColor[cat.assessment] || C.amber;
          const al = assessLabel[cat.assessment] || cat.assessment;
          return (
            <Card key={i}>
              <div style={{ display:"flex", alignItems:"center",
                justifyContent:"space-between", marginBottom:10 }}>
                <span style={{ fontWeight:800, fontSize:14, color:C.text }}>
                  {cat.category}
                </span>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:22, fontWeight:900, color:ac }}>
                    {cat.scheme_count}
                  </span>
                  <span style={{ background:`${ac}15`, color:ac,
                    border:`1px solid ${ac}30`, borderRadius:20,
                    padding:"3px 12px", fontSize:11, fontWeight:700 }}>
                    {al}
                  </span>
                </div>
              </div>
              <p style={{ fontSize:12, color:C.muted,
                margin:"0 0 10px", lineHeight:1.5 }}>{cat.rationale}</p>
              {cat.gap && (
                <div style={{ background:"#fef2f2", borderRadius:8,
                  padding:"8px 12px", marginBottom:8,
                  fontSize:12, color:"#991b1b", fontWeight:600 }}>
                  ⚠️ {cat.gap}
                </div>
              )}
              {cat.opportunity && (
                <div style={{ background:"#f0fdf4", borderRadius:8,
                  padding:"8px 12px", fontSize:12, color:"#166534", fontWeight:600 }}>
                  💡 {cat.opportunity}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── Overlaps ──────────────────────────────────────────────────────────────────
function OverlapAnalysis({ overlaps }) {
  const typeColor = {
    BENEFIT_OVERLAP:     C.orange,
    ELIGIBILITY_OVERLAP: C.purple,
    OBJECTIVE_OVERLAP:   C.blue,
  };
  return (
    <div>
      <SectionTitle icon="🔄" title="Scheme Overlaps"
        subtitle="Potential duplicates and consolidation opportunities detected by AI"/>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        {overlaps.map((ov, i) => {
          const color = typeColor[ov.overlap_type] || C.purple;
          return (
            <Card key={i} style={{ borderLeft:`4px solid ${color}` }}>
              <div style={{ display:"flex", alignItems:"center",
                justifyContent:"space-between", marginBottom:10, flexWrap:"wrap", gap:8 }}>
                <span style={{ fontWeight:800, fontSize:15, color:C.text }}>
                  {ov.title}
                </span>
                <span style={{ background:`${color}15`, color,
                  border:`1px solid ${color}30`, borderRadius:20,
                  padding:"3px 12px", fontSize:11, fontWeight:700 }}>
                  {ov.overlap_type?.replace(/_/g," ")}
                </span>
              </div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
                {ov.schemes?.map((s,j) => (
                  <span key={j} style={{ background:`${color}10`, color,
                    border:`1px solid ${color}25`, borderRadius:6,
                    padding:"3px 10px", fontSize:12, fontWeight:600 }}>{s}</span>
                ))}
              </div>
              <p style={{ fontSize:13, color:"#374151",
                margin:"0 0 12px", lineHeight:1.6 }}>{ov.overlap_description}</p>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div style={{ background:"#fef2f2", borderRadius:8, padding:"10px 12px" }}>
                  <div style={{ fontSize:10, fontWeight:700, color:"#991b1b",
                    letterSpacing:"0.07em", marginBottom:3 }}>IMPACT</div>
                  <div style={{ fontSize:12, color:"#7f1d1d" }}>{ov.impact}</div>
                </div>
                <div style={{ background:"#f0fdf4", borderRadius:8, padding:"10px 12px" }}>
                  <div style={{ fontSize:10, fontWeight:700, color:"#166534",
                    letterSpacing:"0.07em", marginBottom:3 }}>RECOMMENDATION</div>
                  <div style={{ fontSize:12, color:"#14532d",
                    fontWeight:600 }}>{ov.recommendation}</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────
export default function InsightsEngine({ schemes=[], portals=[], onScrapeFirst }) {
  const [insights, setInsights]     = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [lastGen, setLastGen]       = useState(null);
  const [loadStep, setLoadStep]     = useState(0);

  const STEPS = [
    "Reading scraped scheme data…",
    `Analysing ${schemes.length} schemes across categories…`,
    "Identifying coverage gaps for citizen segments…",
    "Detecting scheme overlaps and duplicates…",
    "Generating priority actions for CM…",
    "Preparing executive briefing…",
  ];

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLoadStep(0);
    const stepTimer = setInterval(() =>
      setLoadStep(s => Math.min(s+1, STEPS.length-1)), 1800);
    try {
      const prompt = buildPrompt(schemes, portals);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 4000,
          messages: [{ role:"user", content:prompt }],
        }),
      });
      const data = await res.json();
      const raw = data.content?.find(b => b.type==="text")?.text || "";
      const clean = raw.replace(/```json\n?/g,"").replace(/```\n?/g,"").trim();
      setInsights(JSON.parse(clean));
      setLastGen(new Date());
    } catch(e) {
      setError(`Analysis failed: ${e.message}`);
    }
    clearInterval(stepTimer);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemes, portals]);

  // ── No data state ──────────────────────────────────────────────────────────
  if (!schemes.length && !portals.length) {
    return (
      <div style={{ padding:"60px 40px", textAlign:"center" }}>
        <div style={{ fontSize:64, marginBottom:20 }}>📊</div>
        <h3 style={{ fontSize:20, fontWeight:800, color:C.text, marginBottom:8 }}>
          No Scraped Data Available
        </h3>
        <p style={{ color:C.muted, fontSize:14, maxWidth:380,
          margin:"0 auto 28px" }}>
          Scrape data from the 4 government sources first,
          then AI can analyse it for insights.
        </p>
        <button onClick={onScrapeFirst} style={{ background:C.orange, color:"white",
          borderRadius:12, padding:"13px 32px", fontWeight:800,
          fontSize:15, border:"none", cursor:"pointer",
          boxShadow:"0 4px 20px #f9731650" }}>
          ⚡ Scrape Data First
        </button>
      </div>
    );
  }

  return (
    <div className="fadeup">

      {/* ── Page header ── */}
      <div style={{ display:"flex", alignItems:"flex-start",
        justifyContent:"space-between", marginBottom:22,
        flexWrap:"wrap", gap:14 }}>
        <div>
          <h1 style={{ fontSize:26, fontWeight:900, color:C.text, margin:"0 0 4px" }}>
            AI Policy Intelligence —{" "}
            <span style={{ color:C.orange }}>Executive Briefing</span>
          </h1>
          <p style={{ color:C.muted, fontSize:13, margin:0 }}>
            Claude analyses {schemes.length} scraped schemes + {portals.length} portals
            to generate actionable intelligence for the CM
          </p>
        </div>
        <div style={{ display:"flex", flexDirection:"column",
          alignItems:"flex-end", gap:6 }}>
          <button onClick={generate} disabled={loading} style={{
            background: loading ? "#e5e7eb"
              : "linear-gradient(135deg,#f97316,#ea580c)",
            color: loading ? "#9ca3af" : "white",
            border:"none", borderRadius:12, padding:"12px 28px",
            fontWeight:800, fontSize:14, cursor: loading?"not-allowed":"pointer",
            display:"flex", alignItems:"center", gap:8,
            boxShadow: loading?"none":"0 4px 20px #f9731650",
          }}>
            <span style={{ fontSize:18, display:"inline-block",
              animation:loading?"spin 1.2s linear infinite":"none" }}>
              {loading ? "⚙️" : "🧠"}
            </span>
            {loading ? "Generating…"
              : insights ? "Regenerate Insights"
              : "Generate AI Insights"}
          </button>
          {lastGen && (
            <span style={{ fontSize:11, color:C.muted }}>
              Last generated:{" "}
              {lastGen.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}
            </span>
          )}
        </div>
      </div>

      {/* Data summary pills */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:22 }}>
        {[
          { label:`${schemes.length} schemes scraped`,                           color:C.orange },
          { label:`${portals.length} portals indexed`,                           color:C.blue   },
          { label:`${[...new Set(schemes.map(s=>s.category||""))].filter(Boolean).length} categories`, color:C.green  },
          { label:"4 live sources",                                               color:C.purple },
        ].map((p,i)=>(
          <span key={i} style={{ background:`${p.color}12`, color:p.color,
            border:`1px solid ${p.color}25`, borderRadius:20,
            padding:"4px 14px", fontSize:12, fontWeight:700 }}>{p.label}</span>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background:"#fef2f2", border:"1px solid #fecaca",
          borderRadius:12, padding:"14px 18px", marginBottom:20,
          color:"#991b1b", fontSize:13 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <Card style={{ padding:"48px 40px", textAlign:"center" }}>
          <div style={{ width:68, height:68, borderRadius:"50%",
            background:"linear-gradient(135deg,#fff7ed,#fed7aa)",
            border:`2px solid ${C.orange}`,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:30, margin:"0 auto 20px",
            animation:"spin 3s linear infinite" }}>🧠</div>
          <h3 style={{ fontSize:18, fontWeight:800, color:C.text, marginBottom:6 }}>
            AI Analysis in Progress
          </h3>
          <p style={{ color:C.muted, fontSize:13, marginBottom:28 }}>
            Claude is reading your scraped data and generating executive insights
          </p>
          <div style={{ maxWidth:380, margin:"0 auto", textAlign:"left" }}>
            {STEPS.map((s, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:12,
                padding:"9px 0", borderBottom:`1px solid ${C.border}`,
                opacity: i <= loadStep ? 1 : 0.25, transition:"opacity .4s" }}>
                <div style={{ width:22, height:22, borderRadius:"50%", flexShrink:0,
                  background: i < loadStep ? C.green
                    : i===loadStep ? C.orange : C.border,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  color:"white", fontSize:11, fontWeight:800, transition:"background .4s" }}>
                  {i < loadStep ? "✓" : i===loadStep ? "…" : ""}
                </div>
                <span style={{ fontSize:13,
                  color: i<=loadStep ? C.text : C.muted,
                  fontWeight: i===loadStep ? 700 : 400,
                  transition:"all .4s" }}>{s}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Results ── */}
      {!loading && insights && (
        <div style={{ display:"flex", flexDirection:"column", gap:28 }}>

          {insights.executive_summary && (
            <ExecutiveSummary
              d={insights.executive_summary}
              schemeCount={schemes.length}
              portalCount={portals.length}/>
          )}

          {insights.priority_actions?.length > 0 && (
            <PriorityActions actions={insights.priority_actions}/>
          )}

          {insights.coverage_gaps?.length > 0 && (
            <CoverageGaps gaps={insights.coverage_gaps}/>
          )}

          {insights.category_analysis?.length > 0 && (
            <CategoryAnalysis categories={insights.category_analysis}/>
          )}

          {insights.overlaps?.length > 0 && (
            <OverlapAnalysis overlaps={insights.overlaps}/>
          )}

          {insights.data_quality_note && (
            <div style={{ background:C.bg, borderRadius:12,
              padding:"14px 18px", border:`1px solid ${C.border}`,
              fontSize:12, color:C.muted, display:"flex", gap:8 }}>
              <span>📝</span>
              <span><strong>Data quality note:</strong> {insights.data_quality_note}</span>
            </div>
          )}
        </div>
      )}

      {/* Pre-generate prompt */}
      {!loading && !insights && !error && (
        <Card style={{ textAlign:"center", padding:"52px 40px" }}>
          <div style={{ fontSize:56, marginBottom:16 }}>🧠</div>
          <h3 style={{ fontSize:20, fontWeight:800, color:C.text, marginBottom:8 }}>
            Ready to Analyse {schemes.length} Scraped Schemes
          </h3>
          <p style={{ color:C.muted, fontSize:14, maxWidth:500,
            margin:"0 auto 28px", lineHeight:1.6 }}>
            Claude will read all scraped scheme and portal data to generate
            a structured executive briefing — coverage gaps, sector analysis,
            duplicate detection, and priority actions for the CM.
          </p>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)",
            gap:10, maxWidth:480, margin:"0 auto 28px", textAlign:"left" }}>
            {[
              { icon:"🎯", t:"Coverage Gaps",    d:"Who is left out of current schemes?" },
              { icon:"⚡", t:"Priority Actions", d:"What should CM do this week?" },
              { icon:"📊", t:"Sector Balance",   d:"Which sectors are over/under-served?" },
              { icon:"🔄", t:"Overlap Detection",d:"Which schemes can be consolidated?" },
            ].map((f,i) => (
              <div key={i} style={{ background:C.bg, borderRadius:10,
                padding:"12px 14px", border:`1px solid ${C.border}` }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                  <span style={{ fontSize:18 }}>{f.icon}</span>
                  <span style={{ fontWeight:800, fontSize:13, color:C.text }}>{f.t}</span>
                </div>
                <span style={{ fontSize:11, color:C.muted }}>{f.d}</span>
              </div>
            ))}
          </div>
          <button onClick={generate} style={{
            background:"linear-gradient(135deg,#f97316,#ea580c)",
            color:"white", border:"none", borderRadius:12,
            padding:"14px 40px", fontWeight:800, fontSize:15,
            cursor:"pointer", boxShadow:"0 4px 20px #f9731650",
            display:"inline-flex", alignItems:"center", gap:10
          }}>
            <span style={{ fontSize:20 }}>🧠</span>
            Generate AI Insights Now
          </button>
        </Card>
      )}
    </div>
  );
}