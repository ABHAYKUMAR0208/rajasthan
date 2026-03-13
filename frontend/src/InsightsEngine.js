/**
 * InsightsEngine.js
 * Calls the backend /insights endpoint (which calls Claude server-side).
 * Renders structured executive intelligence for the CM's office.
 */
import { useState, useCallback } from "react";
import axios from "axios";

const API = process.env.REACT_APP_API_URL || "https://rajasthan-cgwj.onrender.com";

const C = {
  orange:"#f97316", blue:"#3b82f6", green:"#10b981", red:"#ef4444",
  purple:"#8b5cf6", amber:"#f59e0b",
  bg:"#f8fafc", card:"#ffffff", border:"#e2e8f0", text:"#0f172a", muted:"#64748b",
};
const PRI = {
  CRITICAL:{ bg:"#fef2f2", border:"#fecaca", badge:"#ef4444" },
  HIGH:    { bg:"#fff7ed", border:"#fed7aa", badge:"#f97316" },
  MEDIUM:  { bg:"#fffbeb", border:"#fde68a", badge:"#f59e0b" },
  LOW:     { bg:"#f0fdf4", border:"#bbf7d0", badge:"#10b981" },
};
const ASSESS_COLOR = {
  OVER_SERVED:"#3b82f6", WELL_SERVED:"#10b981",
  UNDER_SERVED:"#f59e0b", CRITICALLY_UNDER_SERVED:"#ef4444",
};
const ASSESS_LABEL = {
  OVER_SERVED:"Over-served", WELL_SERVED:"Well-served",
  UNDER_SERVED:"Under-served", CRITICALLY_UNDER_SERVED:"Critical Gap",
};
const TL_COLOR = { "This week":"#ef4444","This month":"#f97316","This quarter":"#3b82f6" };

// ── tiny shared components ────────────────────────────────────────────────────
function Card({ children, style={} }) {
  return (
    <div style={{ background:C.card, borderRadius:16, border:`1px solid ${C.border}`,
      padding:24, boxShadow:"0 1px 8px rgba(0,0,0,0.05)", ...style }}>
      {children}
    </div>
  );
}
function Badge({ label, bg, color="white", small }) {
  return (
    <span style={{ background:bg, color, borderRadius:20,
      padding: small?"2px 8px":"3px 12px",
      fontSize: small?10:11, fontWeight:800, letterSpacing:"0.06em",
      whiteSpace:"nowrap" }}>{label}</span>
  );
}
function SectionHead({ icon, title, sub }) {
  return (
    <div style={{ marginBottom:18 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:3 }}>
        <span style={{ fontSize:22 }}>{icon}</span>
        <h2 style={{ fontSize:20, fontWeight:900, color:C.text, margin:0 }}>{title}</h2>
      </div>
      {sub && <p style={{ fontSize:13, color:C.muted, margin:"0 0 0 32px" }}>{sub}</p>}
    </div>
  );
}

// ── 1. Executive Summary ──────────────────────────────────────────────────────
function ExecSummary({ d, schemeCount, portalCount }) {
  const hc = { GOOD:C.green, FAIR:C.amber, NEEDS_ATTENTION:C.red }[d.overall_health] || C.amber;
  return (
    <Card style={{ background:"linear-gradient(135deg,#fff7ed,#fffbeb)", borderColor:"#fed7aa" }}>
      <div style={{ display:"flex", gap:20 }}>
        <div style={{ width:56, height:56, borderRadius:14, background:C.orange, flexShrink:0,
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:26 }}>🏛️</div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.orange,
            letterSpacing:"0.1em", marginBottom:6 }}>EXECUTIVE BRIEFING — OFFICE OF CM</div>
          <p style={{ fontSize:18, fontWeight:700, color:C.text,
            lineHeight:1.4, margin:"0 0 18px" }}>{d.headline}</p>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:14 }}>
            {[
              { l:"SCHEMES ANALYSED",  v:schemeCount,                               c:C.orange },
              { l:"PORTALS INDEXED",   v:portalCount,                               c:C.blue   },
              { l:"TOP SECTOR",        v:d.strongest_sector?.split(" ")[0]||"—",    c:C.green  },
              { l:"HEALTH STATUS",     v:d.overall_health?.replace("_"," ")||"—",   c:hc       },
            ].map((k,i)=>(
              <div key={i} style={{ background:"white", borderRadius:10,
                padding:"10px 14px", border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:10, fontWeight:700, color:C.muted,
                  letterSpacing:"0.07em", marginBottom:3 }}>{k.l}</div>
                <div style={{ fontSize:15, fontWeight:900, color:k.c }}>{k.v}</div>
              </div>
            ))}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div style={{ background:"white", borderRadius:10,
              padding:"12px 16px", border:`1px solid ${C.border}` }}>
              <div style={{ fontSize:10, fontWeight:700, color:C.muted,
                letterSpacing:"0.07em", marginBottom:4 }}>KEY INSIGHT</div>
              <div style={{ fontSize:13, color:C.text, fontWeight:600 }}>{d.key_stat}</div>
            </div>
            <div style={{ background:"#fef2f2", borderRadius:10,
              padding:"12px 16px", border:"1px solid #fecaca" }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#991b1b",
                letterSpacing:"0.07em", marginBottom:4 }}>⚡ CM ATTENTION</div>
              <div style={{ fontSize:13, color:"#7f1d1d", fontWeight:600 }}>{d.cm_note}</div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── 2. Priority Actions ───────────────────────────────────────────────────────
function PriorityActions({ actions }) {
  return (
    <div>
      <SectionHead icon="⚡" title="Priority Actions for CM"
        sub="Ranked recommendations generated by AI from analysis of all scraped scheme data"/>
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {[...actions].sort((a,b)=>a.rank-b.rank).map((a,i)=>{
          const p  = PRI[a.priority]  || PRI.HIGH;
          const tc = TL_COLOR[a.timeline] || C.orange;
          return (
            <Card key={i} style={{
              background: i===0 ? "linear-gradient(135deg,#fff7ed,#fffbeb)" : C.card,
              borderColor: i===0 ? "#fed7aa" : C.border,
            }}>
              <div style={{ display:"flex", gap:16 }}>
                <div style={{ width:46, height:46, borderRadius:12, flexShrink:0,
                  background: i===0 ? C.orange : `${p.badge}18`,
                  color: i===0 ? "white" : p.badge,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:20, fontWeight:900 }}>{a.rank}</div>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", gap:8, marginBottom:8, flexWrap:"wrap",
                    alignItems:"center" }}>
                    <Badge label={a.priority} bg={p.badge}/>
                    <Badge label={`⏱ ${a.timeline}`}
                      bg={`${tc}18`} color={tc}/>
                  </div>
                  <div style={{ fontWeight:800, fontSize:15, color:C.text,
                    marginBottom:6, lineHeight:1.3 }}>{a.action}</div>
                  <p style={{ fontSize:13, color:C.muted,
                    margin:"0 0 12px", lineHeight:1.6 }}>{a.rationale}</p>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    <div style={{ background:"#f0fdf4", borderRadius:8, padding:"10px 12px" }}>
                      <div style={{ fontSize:10, fontWeight:700, color:"#166534",
                        letterSpacing:"0.07em", marginBottom:3 }}>EXPECTED IMPACT</div>
                      <div style={{ fontSize:12, color:"#14532d",
                        fontWeight:600 }}>{a.expected_impact}</div>
                    </div>
                    {a.schemes_involved?.length > 0 && (
                      <div style={{ background:"#eff6ff", borderRadius:8, padding:"10px 12px" }}>
                        <div style={{ fontSize:10, fontWeight:700, color:"#1d4ed8",
                          letterSpacing:"0.07em", marginBottom:5 }}>SCHEMES</div>
                        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                          {a.schemes_involved.slice(0,3).map((s,j)=>(
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

// ── 3. Coverage Gaps ──────────────────────────────────────────────────────────
function CoverageGaps({ gaps }) {
  return (
    <div>
      <SectionHead icon="🎯" title="Coverage Gaps"
        sub="Citizen segments currently underserved — derived from eligibility analysis of scraped schemes"/>
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {gaps.map((g,i)=>{
          const p = PRI[g.priority] || PRI.MEDIUM;
          return (
            <Card key={i} style={{ borderLeft:`4px solid ${p.badge}`,
              background:p.bg, borderColor:p.border }}>
              <div style={{ display:"flex", gap:14 }}>
                <div style={{ width:40, height:40, borderRadius:10, flexShrink:0,
                  background:`${p.badge}20`, display:"flex", alignItems:"center",
                  justifyContent:"center", fontSize:20 }}>👥</div>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", gap:8, marginBottom:8,
                    alignItems:"center", flexWrap:"wrap" }}>
                    <Badge label={g.priority} bg={p.badge}/>
                    <span style={{ fontWeight:800, fontSize:15,
                      color:C.text }}>{g.segment}</span>
                  </div>
                  <p style={{ fontSize:13, color:"#374151",
                    margin:"0 0 12px", lineHeight:1.6 }}>{g.gap_description}</p>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr",
                    gap:10, marginBottom:12 }}>
                    {g.schemes_addressing?.length > 0 && (
                      <div>
                        <div style={{ fontSize:10, fontWeight:700, color:C.muted,
                          letterSpacing:"0.07em", marginBottom:4 }}>PARTIALLY HELPED BY</div>
                        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                          {g.schemes_addressing.slice(0,3).map((s,j)=>(
                            <span key={j} style={{ background:"#f0fdf4", color:"#166534",
                              border:"1px solid #bbf7d0", borderRadius:6,
                              padding:"2px 8px", fontSize:11, fontWeight:600 }}>{s}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {g.schemes_missing && (
                      <div>
                        <div style={{ fontSize:10, fontWeight:700, color:C.muted,
                          letterSpacing:"0.07em", marginBottom:4 }}>MISSING</div>
                        <span style={{ background:"#fef2f2", color:"#991b1b",
                          border:"1px solid #fecaca", borderRadius:6,
                          padding:"2px 8px", fontSize:11, fontWeight:600 }}>
                          {g.schemes_missing}
                        </span>
                      </div>
                    )}
                  </div>
                  <div style={{ background:"white", borderRadius:8,
                    padding:"10px 14px", border:`1px solid ${p.border}`,
                    display:"flex", gap:8 }}>
                    <span style={{ color:p.badge, fontWeight:800 }}>→</span>
                    <span style={{ fontSize:13, color:C.text,
                      fontWeight:600 }}>{g.recommendation}</span>
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

// ── 4. Category Analysis ──────────────────────────────────────────────────────
function CategoryAnalysis({ categories }) {
  return (
    <div>
      <SectionHead icon="📊" title="Sector Analysis"
        sub="Which policy sectors are over/under-invested relative to citizen need"/>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:14 }}>
        {categories.map((cat,i)=>{
          const ac = ASSESS_COLOR[cat.assessment] || C.amber;
          const al = ASSESS_LABEL[cat.assessment] || cat.assessment;
          return (
            <Card key={i}>
              <div style={{ display:"flex", alignItems:"center",
                justifyContent:"space-between", marginBottom:10 }}>
                <span style={{ fontWeight:800, fontSize:14,
                  color:C.text }}>{cat.category}</span>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:22, fontWeight:900,
                    color:ac }}>{cat.scheme_count}</span>
                  <Badge label={al} bg={`${ac}18`} color={ac}/>
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
                  padding:"8px 12px", fontSize:12,
                  color:"#166534", fontWeight:600 }}>
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

// ── 5. Overlaps ───────────────────────────────────────────────────────────────
function Overlaps({ overlaps }) {
  const OC = { BENEFIT_OVERLAP:C.orange, ELIGIBILITY_OVERLAP:C.purple, OBJECTIVE_OVERLAP:C.blue };
  return (
    <div>
      <SectionHead icon="🔄" title="Scheme Overlaps"
        sub="Duplicate or conflicting schemes that cause citizen confusion or waste public money"/>
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {overlaps.map((ov,i)=>{
          const color = OC[ov.overlap_type] || C.purple;
          return (
            <Card key={i} style={{ borderLeft:`4px solid ${color}` }}>
              <div style={{ display:"flex", justifyContent:"space-between",
                marginBottom:10, flexWrap:"wrap", gap:8 }}>
                <span style={{ fontWeight:800, fontSize:15,
                  color:C.text }}>{ov.title}</span>
                <Badge label={ov.overlap_type?.replace(/_/g," ")||""}
                  bg={`${color}18`} color={color}/>
              </div>
              <div style={{ display:"flex", gap:6,
                flexWrap:"wrap", marginBottom:12 }}>
                {ov.schemes?.map((s,j)=>(
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

// ── Main export ───────────────────────────────────────────────────────────────
export default function InsightsEngine({ schemes=[], portals=[], onScrapeFirst }) {
  const [insights, setInsights] = useState(null);
  const [meta,     setMeta]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [lastGen,  setLastGen]  = useState(null);
  const [step,     setStep]     = useState(0);

  const STEPS = [
    "Sending scraped data to Claude…",
    "Analysing scheme coverage…",
    "Identifying citizen gaps…",
    "Detecting overlaps…",
    "Building priority actions…",
    "Generating executive briefing…",
  ];

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStep(0);
    const t = setInterval(() => setStep(s => Math.min(s+1, STEPS.length-1)), 2000);
    try {
      const res = await axios.post(`${API}/insights`);
      setInsights(res.data.insights);
      setMeta(res.data.meta);
      setLastGen(new Date());
    } catch(e) {
      const msg = e.response?.data?.detail || e.message;
      setError(msg);
    }
    clearInterval(t);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // no data yet
  if (!schemes.length && !portals.length) {
    return (
      <div style={{ textAlign:"center", padding:"60px 40px" }}>
        <div style={{ fontSize:60, marginBottom:16 }}>📊</div>
        <h3 style={{ fontSize:20, fontWeight:800, color:C.text, marginBottom:8 }}>
          No Scraped Data Yet
        </h3>
        <p style={{ color:C.muted, maxWidth:380, margin:"0 auto 28px", fontSize:14 }}>
          Scrape the 4 government sources first, then generate AI insights.
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

      {/* header */}
      <div style={{ display:"flex", alignItems:"flex-start",
        justifyContent:"space-between", marginBottom:22,
        flexWrap:"wrap", gap:14 }}>
        <div>
          <h1 style={{ fontSize:26, fontWeight:900, color:C.text, margin:"0 0 4px" }}>
            AI Policy Intelligence —{" "}
            <span style={{ color:C.orange }}>Executive Briefing</span>
          </h1>
          <p style={{ color:C.muted, fontSize:13, margin:0 }}>
            Claude analyses all {schemes.length} scraped schemes + {portals.length} portals
            and generates actionable intelligence for the CM's office
          </p>
        </div>
        <div style={{ display:"flex", flexDirection:"column",
          alignItems:"flex-end", gap:6 }}>
          <button onClick={generate} disabled={loading} style={{
            background: loading ? "#e5e7eb"
              : "linear-gradient(135deg,#f97316,#ea580c)",
            color: loading ? "#9ca3af" : "white", border:"none",
            borderRadius:12, padding:"12px 28px", fontWeight:800,
            fontSize:14, cursor: loading ? "not-allowed" : "pointer",
            display:"flex", alignItems:"center", gap:8,
            boxShadow: loading ? "none" : "0 4px 20px #f9731650",
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
              Last generated: {lastGen.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}
              {meta && ` · ${meta.schemes_analysed} schemes analysed`}
            </span>
          )}
        </div>
      </div>

      {/* pills */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:22 }}>
        {[
          { l:`${schemes.length} schemes scraped`, c:C.orange },
          { l:`${portals.length} portals indexed`,  c:C.blue   },
          { l:`${[...new Set(schemes.map(s=>s.category||""))].filter(Boolean).length} categories`, c:C.green },
          { l:"Claude AI analysis",                  c:C.purple },
        ].map((p,i)=>(
          <span key={i} style={{ background:`${p.c}12`, color:p.c,
            border:`1px solid ${p.c}25`, borderRadius:20,
            padding:"4px 14px", fontSize:12, fontWeight:700 }}>{p.l}</span>
        ))}
      </div>

      {/* error */}
      {error && (
        <div style={{ background:"#fef2f2", border:"1px solid #fecaca",
          borderRadius:12, padding:"14px 18px", marginBottom:20,
          color:"#991b1b", fontSize:13, lineHeight:1.6 }}>
          <strong>⚠️ Error:</strong> {error}
          {error.includes("ANTHROPIC_API_KEY") && (
            <div style={{ marginTop:10, padding:"10px 14px",
              background:"white", borderRadius:8, fontFamily:"monospace",
              fontSize:12, color:"#374151" }}>
              Fix: Go to <strong>Render dashboard → Environment → Add variable</strong><br/>
              Key: <code>ANTHROPIC_API_KEY</code><br/>
              Value: your key from <a href="https://console.anthropic.com"
                target="_blank" rel="noreferrer"
                style={{ color:C.orange }}>console.anthropic.com</a>
            </div>
          )}
        </div>
      )}

      {/* loading */}
      {loading && (
        <div style={{ background:C.card, borderRadius:16,
          border:`1px solid ${C.border}`, padding:"48px 40px",
          textAlign:"center" }}>
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
            Claude is reading all scraped data and building your executive briefing
          </p>
          <div style={{ maxWidth:360, margin:"0 auto", textAlign:"left" }}>
            {STEPS.map((s,i)=>(
              <div key={i} style={{ display:"flex", alignItems:"center", gap:12,
                padding:"9px 0", borderBottom:`1px solid ${C.border}`,
                opacity: i<=step ? 1 : 0.25, transition:"opacity .5s" }}>
                <div style={{ width:22, height:22, borderRadius:"50%", flexShrink:0,
                  background: i<step?C.green:i===step?C.orange:"#e5e7eb",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  color:"white", fontSize:11, fontWeight:800 }}>
                  {i<step?"✓":i===step?"…":""}
                </div>
                <span style={{ fontSize:13,
                  color: i<=step?C.text:C.muted,
                  fontWeight: i===step?700:400 }}>{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* results */}
      {!loading && insights && (
        <div style={{ display:"flex", flexDirection:"column", gap:28 }}>
          {insights.executive_summary && (
            <ExecSummary d={insights.executive_summary}
              schemeCount={meta?.schemes_analysed || schemes.length}
              portalCount={meta?.portals_analysed || portals.length}/>
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
            <Overlaps overlaps={insights.overlaps}/>
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

      {/* pre-generate prompt */}
      {!loading && !insights && !error && (
        <div style={{ background:C.card, borderRadius:16,
          border:`1px solid ${C.border}`, padding:"52px 40px",
          textAlign:"center" }}>
          <div style={{ fontSize:56, marginBottom:16 }}>🧠</div>
          <h3 style={{ fontSize:20, fontWeight:800, color:C.text, marginBottom:8 }}>
            Ready to Analyse {schemes.length} Scraped Schemes
          </h3>
          <p style={{ color:C.muted, fontSize:14, maxWidth:500,
            margin:"0 auto 28px", lineHeight:1.6 }}>
            Click <strong>Generate AI Insights</strong> — Claude will analyse all scraped
            data and produce a structured executive briefing with real findings and
            specific recommendations for the CM.
          </p>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)",
            gap:10, maxWidth:480, margin:"0 auto 28px", textAlign:"left" }}>
            {[
              { i:"⚡", t:"Priority Actions",  d:"What should CM do this week?" },
              { i:"🎯", t:"Coverage Gaps",     d:"Which citizens are being left out?" },
              { i:"📊", t:"Sector Balance",    d:"What's over/under-served?" },
              { i:"🔄", t:"Overlap Detection", d:"Which schemes can be consolidated?" },
            ].map((f,i)=>(
              <div key={i} style={{ background:C.bg, borderRadius:10,
                padding:"12px 14px", border:`1px solid ${C.border}` }}>
                <div style={{ display:"flex", alignItems:"center",
                  gap:8, marginBottom:3 }}>
                  <span style={{ fontSize:18 }}>{f.i}</span>
                  <span style={{ fontWeight:800, fontSize:13,
                    color:C.text }}>{f.t}</span>
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
            display:"inline-flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:20 }}>🧠</span>
            Generate AI Insights Now
          </button>
        </div>
      )}
    </div>
  );
}