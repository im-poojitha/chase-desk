import { Fragment, useEffect, useMemo, useRef, useState } from "react";

type View = "Queue" | "Cases" | "AI Chase Workflow" | "Chase Composer" | "Ops Oversight" | "Settings";
type Status = "Overdue" | "Waiting on client" | "Needs review" | "Approval required";
type AgentStatus = "pending" | "running" | "complete";
type WorkflowAgent = { id: string; name: string; label: string; status: AgentStatus; output?: string };

type ChaseCase = {
  id: string;
  company: string;
  segment: string;
  city: string;
  country: string;
  owner: string;
  status: Status;
  days: number;
  missing: string[];
  lastChased: string;
  nextDue: string;
  risk: string;
};

const initialCases: ChaseCase[] = [
  { id: "KYC-2026-0388", company: "Corvane Logistics GmbH", segment: "EU Freight Services", city: "Frankfurt", country: "DE", owner: "Tomas Reyes", status: "Overdue", days: 24, missing: ["UBO declaration", "Board resolution"], lastChased: "4 days ago", nextDue: "Today, 14:00", risk: "Tier 2 — Medium" },
  { id: "KYC-2026-0412", company: "Halden Marine Ltd", segment: "Commercial Shipping", city: "Oslo", country: "NO", owner: "Tomas Reyes", status: "Waiting on client", days: 17, missing: ["Register of directors", "UBO declaration"], lastChased: "3 days ago", nextDue: "Tomorrow, 10:00", risk: "Tier 2 — Medium" },
  { id: "KYC-2026-0445", company: "Osprey Ridge Holdings", segment: "Private Equity Asset Vehicle", city: "London", country: "UK", owner: "Priya Nair", status: "Waiting on client", days: 8, missing: ["Audited accounts 2025"], lastChased: "Yesterday", nextDue: "19 Nov 2026", risk: "Tier 1 — Low" },
  { id: "KYC-2026-0419", company: "Valen Star Shipping AS", segment: "Maritime Operations", city: "Bergen", country: "NO", owner: "Tomas Reyes", status: "Needs review", days: 12, missing: [], lastChased: "5 days ago", nextDue: "Today, 17:30", risk: "Tier 2 — Medium" },
  { id: "KYC-2026-0450", company: "Meridia BioSciences Ltd", segment: "Life Sciences", city: "Cambridge", country: "UK", owner: "Priya Nair", status: "Approval required", days: 5, missing: ["Proof of registered office"], lastChased: "Not chased yet", nextDue: "Immediate action", risk: "Tier 3 — High" },
  { id: "KYC-2026-0462", company: "Nordic Frontier Capital", segment: "Alternative Investments", city: "Stockholm", country: "SE", owner: "Tomas Reyes", status: "Waiting on client", days: 5, missing: ["Articles of association", "Ownership chart", "Proof of address", "Annual accounts"], lastChased: "2 days ago", nextDue: "22 Nov 2026", risk: "Tier 2 — Medium" },
];

const navItems: { label: View; icon: string }[] = [
  { label: "Queue", icon: "inbox" },
  { label: "Cases", icon: "folder_open" },
  { label: "AI Chase Workflow", icon: "neurology" },
  { label: "Chase Composer", icon: "edit_note" },
  { label: "Ops Oversight", icon: "monitoring" },
  { label: "Settings", icon: "tune" },
];

const workflowAgentTemplate: WorkflowAgent[] = [
  { id: "intake", name: "Intake Analyst", label: "Case facts & missing items", status: "pending" },
  { id: "policy", name: "Policy Cross-check", label: "Request & communication safety", status: "pending" },
  { id: "draft", name: "Chase Draft Agent", label: "Human-reviewable message", status: "pending" },
  { id: "review", name: "Independent Maker-Checker", label: "Independent safety review", status: "pending" },
];

function Icon({ name, className = "" }: { name: string; className?: string }) {
  return <span aria-hidden="true" className={`material-symbols-outlined ${className}`}>{name}</span>;
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "blue" | "red" | "amber" | "green" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function statusTone(status: Status): "neutral" | "blue" | "red" | "amber" {
  if (status === "Overdue") return "red";
  if (status === "Needs review") return "blue";
  if (status === "Approval required") return "amber";
  return "neutral";
}

function App() {
  const [view, setView] = useState<View>("Queue");
  const [cases, setCases] = useState(initialCases);
  const [selectedId, setSelectedId] = useState(initialCases[1].id);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [ownerFilter, setOwnerFilter] = useState("All managers");
  const [segmentFilter, setSegmentFilter] = useState("All segments");
  const [sortBy, setSortBy] = useState("Urgency");
  const [toast, setToast] = useState("");
  const [draft, setDraft] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [attested, setAttested] = useState(false);
  const [checkedDocs, setCheckedDocs] = useState<string[]>([]);
  const [workflowAgents, setWorkflowAgents] = useState<WorkflowAgent[]>(workflowAgentTemplate);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [workflowError, setWorkflowError] = useState("");
  const [workflowModel, setWorkflowModel] = useState("");
  const [geminiConfigured, setGeminiConfigured] = useState<boolean | null>(null);
  const [demoDataConsent, setDemoDataConsent] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/cases")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load cases from the database.");
        return response.json() as Promise<{ cases: ChaseCase[] }>;
      })
      .then((result) => {
        if (active) setCases(result.cases);
      })
      .catch((error: unknown) => {
        if (active) notify(error instanceof Error ? error.message : "Could not load cases from the database.");
      });
    fetch("/api/health")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not check the Gemini service.");
        return response.json() as Promise<{ configured: boolean; model: string; agents: WorkflowAgent[] }>;
      })
      .then((health) => {
        setGeminiConfigured(health.configured);
        setWorkflowModel(health.model);
        setWorkflowAgents(health.agents.map((agent) => ({ ...agent, status: "pending" })));
      })
      .catch(() => setGeminiConfigured(false));
    return () => {
      active = false;
    };
  }, []);

  const selectedCase = cases.find((item) => item.id === selectedId) ?? cases[0];
  const filteredCases = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return cases.filter((item) => {
      const matchesQuery = !normalized || `${item.company} ${item.id} ${item.city} ${item.owner}`.toLowerCase().includes(normalized);
      const matchesStatus = statusFilter === "All statuses" || item.status === statusFilter;
      const matchesOwner = ownerFilter === "All managers" || item.owner === ownerFilter;
      const matchesSegment = segmentFilter === "All segments" || item.segment === segmentFilter;
      return matchesQuery && matchesStatus && matchesOwner && matchesSegment;
    }).sort((a, b) => sortBy === "Days waiting" ? b.days - a.days : sortBy === "Recent activity" ? a.lastChased.localeCompare(b.lastChased) : b.days - a.days);
  }, [cases, ownerFilter, query, segmentFilter, sortBy, statusFilter]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  function openCase(item: ChaseCase, nextView: View = "Cases") {
    setSelectedId(item.id);
    setCheckedDocs([]);
    setView(nextView);
  }

  function openComposer(item = selectedCase) {
    setSelectedId(item.id);
    setDraft(makeDraft(item));
    setDraftSubject(makeDraftSubject(item));
    setAttested(false);
    setView("Chase Composer");
  }

  function toggleDoc(name: string) {
    setCheckedDocs((current) => current.includes(name) ? current.filter((doc) => doc !== name) : [...current, name]);
  }

  function sendDraft() {
    if (!attested) {
      notify("Complete the analyst attestation before recording demo approval.");
      return;
    }
    if (!draft.trim()) {
      notify("Add a message to the draft before recording demo approval.");
      return;
    }
    notify(`Analyst approval recorded for ${selectedCase.company}. Demo only—no email was sent.`);
    setView("Cases");
  }

  async function runWorkflow() {
    if (!demoDataConsent) {
      setWorkflowError("Confirm that you are using synthetic demo data before starting the Gemini workflow.");
      return;
    }
    setWorkflowBusy(true);
    setWorkflowError("");
    setWorkflowAgents(workflowAgentTemplate.map((agent) => ({ ...agent })));
    try {
      const response = await fetch("/api/workflow/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case: {
            id: selectedCase.id,
            company: selectedCase.company,
            segment: selectedCase.segment,
            country: selectedCase.country,
            owner: selectedCase.owner,
            status: selectedCase.status,
            missing: selectedCase.missing,
          },
        }),
      });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error ?? `Workflow failed (${response.status}).`);
      }
      if (!response.body) throw new Error("The Gemini workflow did not return a readable response.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as { type: string; id?: string; status?: AgentStatus; output?: string; model?: string; error?: string };
          if (event.type === "agent" && event.id) {
            setWorkflowAgents((current) => current.map((agent) => agent.id === event.id
              ? { ...agent, status: event.status ?? agent.status, output: event.output ?? agent.output }
              : agent));
          } else if (event.type === "complete") {
            setWorkflowModel(event.model ?? workflowModel);
            completed = true;
          } else if (event.type === "error") {
            throw new Error(event.error ?? "The Gemini workflow could not be completed.");
          }
        }
        if (done) break;
      }
      if (!completed) throw new Error("The Gemini workflow ended before all agents completed.");
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : "The Gemini workflow could not be completed.");
    } finally {
      setWorkflowBusy(false);
    }
  }

  async function saveCaseDetails(updatedCase: ChaseCase) {
    const response = await fetch(`/api/cases/${encodeURIComponent(updatedCase.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company: updatedCase.company, missing: updatedCase.missing }),
    });
    const result = await response.json() as { case?: ChaseCase; error?: string };
    if (!response.ok || !result.case) {
      throw new Error(result.error ?? `Could not save case details (${response.status}).`);
    }
    setCases((current) => current.map((item) => item.id === result.case?.id ? result.case : item));
    notify("Client and missing-document details saved to SQLite.");
  }

  function useWorkflowDraft() {
    const result = workflowAgents.find((agent) => agent.id === "draft")?.output;
    if (!result) return;
    const parsedDraft = parseGeneratedDraft(result, selectedCase);
    setDraft(parsedDraft.body);
    setDraftSubject(parsedDraft.subject);
    setAttested(false);
    setView("Chase Composer");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand">
            <div className="brand-mark"><Icon name="verified_user" /></div>
            <div><strong>Chase Desk</strong><span>KYC OPERATIONS</span></div>
            <span className="version">v2.6</span>
          </div>
          <div className="nav-caption">Operations</div>
          <nav className="side-nav" aria-label="Main navigation">
            {navItems.map((item) => (
              <button key={item.label} className={`nav-item ${view === item.label ? "active" : ""}`} onClick={() => setView(item.label)}>
                <Icon name={item.icon} /><span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
        <button className="user-card" onClick={() => notify("Signed in as S. Sterling — Lead KYC Analyst.")}>
          <span className="avatar">SS</span>
          <span className="user-meta"><strong>S. Sterling</strong><small>Lead KYC Analyst</small></span>
          <span className="online-dot" />
        </button>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="compliance-note"><span className="compliance-dot" />Prototype mode <span className="note-divider">·</span> Synthetic data only. No messages are sent externally.</div>
          <div className="topbar-actions"><span className="session-label">Session Lock: Tier-1 Ops</span><button className="icon-button" aria-label="Notifications" onClick={() => notify("You’re all caught up.")}><Icon name="notifications" /></button><button className="avatar avatar-small" aria-label="Profile">SS</button></div>
        </header>

        <main className="main-content">
          {view === "Queue" && (
            <QueueView
              cases={filteredCases}
              allCases={cases}
              query={query}
              setQuery={setQuery}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              ownerFilter={ownerFilter}
              setOwnerFilter={setOwnerFilter}
              segmentFilter={segmentFilter}
              setSegmentFilter={setSegmentFilter}
              sortBy={sortBy}
              setSortBy={setSortBy}
              onOpen={openCase}
              onWorkflow={(item) => {
                setSelectedId(item.id);
                setWorkflowError("");
                setWorkflowAgents(workflowAgentTemplate.map((agent) => ({ ...agent })));
                setView("AI Chase Workflow");
              }}
              onNotify={notify}
              onSetView={setView}
            />
          )}
          {view === "Cases" && (
            <CaseView
              item={selectedCase}
              docs={[
                { name: "Certificate of incorporation", state: "Received", reason: "Corporate client · jurisdiction verification" },
                ...selectedCase.missing.map((name) => ({
                  name,
                  state: /passport|expired/i.test(name) ? "Expired" : "Missing",
                  reason: "Required for corporate KYC verification",
                })),
                { name: "Proof of address", state: selectedCase.missing.some((name) => /address|office/i.test(name)) ? "Missing" : "Received", reason: "Registered entity address verification" },
                { name: "Latest annual accounts", state: selectedCase.status === "Needs review" ? "Needs review" : selectedCase.missing.some((name) => /accounts/i.test(name)) ? "Missing" : "Received", reason: "Financial assessment for corporate credit" },
                { name: "Source of funds declaration", state: "Not required", reason: "Low risk threshold exemption" },
                { name: "Authorized Signatory Mandate", state: "Received", reason: "Operational signatory mandate" },
              ]}
              checkedDocs={checkedDocs}
              onToggleDoc={toggleDoc}
              onBack={() => setView("Queue")}
              onCompose={() => openComposer()}
              onUpdate={saveCaseDetails}
              onNotify={notify}
            />
          )}
          {view === "Chase Composer" && (
            <ComposerView
              item={selectedCase}
              draft={draft}
              setDraft={setDraft}
              subject={draftSubject}
              setSubject={setDraftSubject}
              attested={attested}
              setAttested={setAttested}
              onSend={sendDraft}
              onSave={() => { notify("Demo draft saved for this session. No email was sent."); setView("Cases"); }}
              onBack={() => setView("Cases")}
            />
          )}
          {view === "AI Chase Workflow" && (
            <AIWorkflowView
              cases={cases}
              item={selectedCase}
              onSelect={(id) => {
                setSelectedId(id);
                setWorkflowAgents(workflowAgentTemplate.map((agent) => ({ ...agent })));
                setWorkflowError("");
              }}
              agents={workflowAgents}
              busy={workflowBusy}
              error={workflowError}
              configured={geminiConfigured}
              model={workflowModel}
              consent={demoDataConsent}
              setConsent={setDemoDataConsent}
              onRun={runWorkflow}
              onUseDraft={useWorkflowDraft}
              onBack={() => setView("Queue")}
            />
          )}
          {view === "Ops Oversight" && <OversightView onBack={() => setView("Queue")} />}
          {view === "Settings" && <SettingsView onNotify={notify} />}
        </main>
        <footer className="page-footer"><span>Synthetic demo only. AI drafts require analyst review; no messages are sent.</span><span>Chase Desk · Northgate Bank workflow prototype.</span></footer>
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {[navItems[0], navItems[1], navItems[2], navItems[4]].map((item) => (
          <button key={item.label} className={view === item.label ? "mobile-active" : ""} onClick={() => setView(item.label)}>
            <Icon name={item.icon} /><span>{item.label === "Ops Oversight" ? "Activity" : item.label === "Chase Composer" ? "Compose" : item.label}</span>
          </button>
        ))}
      </nav>
      {toast && <div className="toast" role="status"><Icon name="check_circle" />{toast}</div>}
    </div>
  );
}

function AIWorkflowView({ cases, item, onSelect, agents, busy, error, configured, model, consent, setConsent, onRun, onUseDraft, onBack }: {
  cases: ChaseCase[];
  item: ChaseCase;
  onSelect: (id: string) => void;
  agents: WorkflowAgent[];
  busy: boolean;
  error: string;
  configured: boolean | null;
  model: string;
  consent: boolean;
  setConsent: (value: boolean) => void;
  onRun: () => void;
  onUseDraft: () => void;
  onBack: () => void;
}) {
  const complete = agents.length === workflowAgentTemplate.length && agents.every((agent) => agent.status === "complete");
  const checkerOutput = agents.find((agent) => agent.id === "review")?.output ?? "";
  const reviewPassed = /^verdict\s*:\s*pass\b/im.test(checkerOutput.replace(/\*{1,2}/g, ""));
  const draftOutput = agents.find((agent) => agent.id === "draft")?.output;
  const draftAgentRef = useRef<HTMLElement | null>(null);
  const [analystReviewed, setAnalystReviewed] = useState(false);

  useEffect(() => {
    setAnalystReviewed(false);
  }, [busy, item.id, reviewPassed]);
  useEffect(() => {
    if (draftOutput) draftAgentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [draftOutput]);

  return (
    <>
      <div className="breadcrumb"><button onClick={onBack}>Queue</button><Icon name="chevron_right" /><strong>Supervised AI workflow</strong><span className="live-indicator"><i /> Human approval required</span></div>
      <section className="page-heading ai-heading">
        <div><div className="eyebrow"><span className="eyebrow-dot" /> NORTHGATE BANK · CONTROLLED AI PROTOTYPE</div><h1>AI chase workflow</h1><p>Four specialist Gemini agents review a synthetic case, draft a client chase, and independently check it.</p></div>
        <Badge tone={configured ? "green" : "amber"}><Icon name={configured ? "cloud_done" : "key"} />{configured ? `Gemini connected · ${model}` : configured === null ? "Checking Gemini connection" : "Gemini setup required"}</Badge>
      </section>

      <section className="ai-privacy-banner"><Icon name="privacy_tip" /><div><strong>Privacy-first demo</strong><span>Only synthetic sample case details are sent to Gemini. Do not enter real customer data, uploaded documents, or personal identifiers.</span></div><Badge tone="blue">No email sending</Badge></section>

      <section className="ai-case-selector panel">
        <div><span className="overline">Select synthetic case</span><strong>Choose which sample case to process</strong></div>
        <select aria-label="Select case for AI workflow" value={item.id} onChange={(event) => onSelect(event.target.value)} disabled={busy}>
          {cases.map((caseItem) => <option key={caseItem.id} value={caseItem.id}>{caseItem.company} · {caseItem.id}</option>)}
        </select>
        <div className="ai-case-summary"><span><Icon name="domain" />{item.segment} · {item.country}</span><span><Icon name="person" />RM: {item.owner}</span><span><Icon name="description" />{item.missing.length} listed missing items</span></div>
      </section>

      <section className="ai-workflow-grid">
        <div className="ai-agent-list">
          <div className="ai-section-title"><div><h2>Agent workflow</h2><p>Sequential review · Gemini {model || "gemini-3.8-flash"}</p></div><Badge>{agents.filter((agent) => agent.status === "complete").length}/{workflowAgentTemplate.length} complete</Badge></div>
          {agents.map((agent, index) => (
            <article key={agent.id} ref={agent.id === "draft" ? draftAgentRef : undefined} className={`ai-agent-card ${agent.status === "running" ? "agent-running" : ""} ${agent.status === "complete" ? "agent-complete" : ""}`}>
              <div className={`agent-step ${agent.status}`}><span>{agent.status === "complete" ? <Icon name="check" /> : agent.status === "running" ? <span className="agent-spinner" /> : index + 1}</span></div>
              <div className="agent-main"><div className="agent-heading"><div><strong>{agent.name}</strong><span>{agent.label}</span></div><Badge tone={agent.status === "complete" ? "green" : agent.status === "running" ? "blue" : "neutral"}>{agent.status === "complete" ? "Complete" : agent.status === "running" ? "Working" : "Ready"}</Badge></div>
                {agent.output ? <FormattedAgentOutput text={agent.output} draft={agent.id === "draft"} item={item} /> : <p className="agent-hint">{agent.status === "running" ? "Gemini is reviewing this stage…" : "Waiting for the previous stage to finish."}</p>}
              </div>
            </article>
          ))}
          {error && <div className="workflow-error" role="alert"><Icon name="error" /><span>{error}</span></div>}
          <div className="ai-controls">
            <label className="ai-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} disabled={busy} /><span>I confirm this workflow uses synthetic demonstration data only. I understand the case summary is sent to Google Gemini for processing.</span></label>
            <button className="button button-primary ai-run-button" onClick={onRun} disabled={busy || configured !== true || !consent}><Icon name={busy ? "progress_activity" : "play_arrow"} />{busy ? "Agents are working…" : complete ? "Run again" : "Run 4-agent workflow"}</button>
            {configured === false && <p className="ai-setup-note">Configure <code>GEMINI_API_KEY</code> in your local <code>.env</code> file and restart <code>npm run dev</code>. The key remains server-side.</p>}
          </div>
        </div>

        <aside className="panel ai-review-panel">
          <div className="ai-section-title"><div><h2><Icon name="fact_check" /> Maker-checker gate</h2><p>Human review is mandatory before a draft can move to the composer.</p></div></div>
          <div className="ai-review-rule"><Icon name="block" /><div><strong>No automated decisions</strong><span>Agents cannot determine customer risk, eligibility, or account restrictions.</span></div></div>
          <div className="ai-review-rule"><Icon name="mark_email_unread" /><div><strong>No external actions</strong><span>This prototype does not send emails, contact clients, or modify bank systems.</span></div></div>
          <div className="ai-review-rule"><Icon name="rule" /><div><strong>Independent review</strong><span>The final agent checks the proposed draft for unsupported details.</span></div></div>
          <div className="ai-approval-note"><Icon name="verified_user" /><span>Use the maker-checker result as an aid, not a compliance determination. An authorized analyst remains responsible for review.</span></div>
          <label className="ai-analyst-review"><input type="checkbox" checked={analystReviewed} disabled={!complete || !reviewPassed || busy} onChange={(event) => setAnalystReviewed(event.target.checked)} /><span>I reviewed the complete draft and the independent checker’s notes.</span></label>
          <button className="button button-primary button-full" disabled={!complete || !reviewPassed || busy || !analystReviewed} onClick={onUseDraft}><Icon name="edit_note" /> Review draft in composer</button>
          {!complete && <p className="draft-unavailable">Complete all four agents to review the generated draft.</p>}
          {complete && !reviewPassed && <p className="draft-unavailable">The maker-checker requested revisions. Do not approve this draft.</p>}
          {complete && reviewPassed && <p className="draft-unavailable">Review the draft and checker’s notes before opening the composer.</p>}
        </aside>
      </section>
    </>
  );
}

function renderInline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`)/g).map((part, index) => {
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

function FormattedAgentOutput({ text, draft = false, item }: { text: string; draft?: boolean; item: ChaseCase }) {
  if (!draft) return <div className="agent-output"><FormattedText text={text} /></div>;
  const parsed = parseGeneratedDraft(text, item);
  return (
    <div className="agent-output generated-draft">
      <div className="generated-subject"><span>SUBJECT</span><strong>{renderInline(parsed.subject)}</strong></div>
      <div className="generated-body"><span>MESSAGE BODY</span><FormattedText text={parsed.body} /></div>
    </div>
  );
}

function FormattedText({ text }: { text: string }) {
  const lines = text.replace(/```(?:\w+)?/g, "").split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      blocks.push(<h4 key={`heading-${index}`}>{renderInline(heading[1])}</h4>);
      index += 1;
      continue;
    }
    if (/^(?:[-*•]|\d+[.)])\s+/.test(line)) {
      const list: React.ReactNode[] = [];
      const ordered = /^\d+[.)]\s+/.test(line);
      while (index < lines.length && /^(?:[-*•]|\d+[.)])\s+/.test(lines[index].trim())) {
        const item = lines[index].trim().replace(/^(?:[-*•]|\d+[.)])\s+/, "");
        list.push(<li key={`list-${index}`}>{renderInline(item)}</li>);
        index += 1;
      }
      blocks.push(ordered ? <ol key={`ordered-${index}`}>{list}</ol> : <ul key={`unordered-${index}`}>{list}</ul>);
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^#{1,3}\s+/.test(lines[index].trim()) && !/^(?:[-*•]|\d+[.)])\s+/.test(lines[index].trim())) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`}>{paragraph.map((part, partIndex) => <Fragment key={partIndex}>{partIndex > 0 && <br />}{renderInline(part)}</Fragment>)}</p>);
  }
  return <div className="formatted-text">{blocks}</div>;
}

function parseGeneratedDraft(output: string, item: ChaseCase): { subject: string; body: string } {
  const cleanOutput = output
    .replace(/```(?:text|markdown|md)?/gi, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
  const [firstLine = "", ...remainingLines] = cleanOutput.split(/\r?\n/);
  const subjectMatch = firstLine.match(/^\s*subject\s*:\s*(.+)$/i);
  const subject = subjectMatch?.[1]?.trim() ?? makeDraftSubject(item);
  const bodySource = subjectMatch ? remainingLines.join("\n") : cleanOutput;
  const body = bodySource.replace(/^\s*(?:body|email body|message body)\s*:\s*/i, "").trim();
  return { subject, body };
}

type QueueProps = {
  cases: ChaseCase[];
  allCases: ChaseCase[];
  query: string;
  setQuery: (value: string) => void;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  ownerFilter: string;
  setOwnerFilter: (value: string) => void;
  segmentFilter: string;
  setSegmentFilter: (value: string) => void;
  sortBy: string;
  setSortBy: (value: string) => void;
  onOpen: (item: ChaseCase, view?: View) => void;
  onWorkflow: (item: ChaseCase) => void;
  onNotify: (message: string) => void;
  onSetView: (view: View) => void;
};

function QueueView(props: QueueProps) {
  const { cases, allCases, query, setQuery, statusFilter, setStatusFilter, ownerFilter, setOwnerFilter, segmentFilter, setSegmentFilter, sortBy, setSortBy, onOpen, onWorkflow, onNotify, onSetView } = props;
  const overdue = allCases.filter((item) => item.status === "Overdue").length;
  const waiting = allCases.filter((item) => item.status === "Waiting on client").length;
  return (
    <>
      <div className="breadcrumb"><span>Operations</span><Icon name="chevron_right" /><strong>Active Chase Worklist</strong><span className="live-indicator"><i /> Live</span></div>
      <section className="page-heading">
        <div><div className="eyebrow"><span className="eyebrow-dot" /> OPERATIONAL DISPATCH · TIER-1 HUB</div><h1>Chase queue</h1><p>Manage and prioritize corporate onboarding files awaiting documentation.</p></div>
        <div className="heading-actions"><div className="dispatch-pill"><span className="dispatch-dot" />Batch dispatch: 14 ready for review</div><button className="button button-primary" onClick={() => onWorkflow(allCases[0])}><Icon name="neurology" /> Run AI workflow</button><button className="button button-secondary" onClick={() => onNotify("The review outbox is up to date.")}><Icon name="outbox" /> Review outbox</button></div>
      </section>
      <section className="stats-grid" aria-label="Queue summary">
        <StatCard label="Open files" value="38" suffix="of 42 total active" icon="folder_open" note="90% intake capacity" tone="blue" />
        <StatCard label="Waiting on client" value={String(waiting + 18)} suffix="55.2% of cohort" icon="hourglass_top" note="Avg. turnaround 6.2d" tone="blue" />
        <StatCard label="Overdue" value={String(overdue + 5)} suffix=">14d escalation zone" icon="warning" note="Escalation protocol triggered" tone="red" />
        <StatCard label="Chased this week" value="14" suffix="+4 from last cycle" icon="mark_email_read" note="78% opened" tone="blue" />
      </section>
      <section className="filter-panel">
        <div className="filter-top">
          <label className="search-field"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by client entity, KYC ID (e.g. Corvane, Halden, 0412)..." /><kbd>⌘ K</kbd></label>
          <div className="sort-control"><span>Sort by:</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option>Urgency</option><option>Days waiting</option><option>Recent activity</option></select></div>
        </div>
        <div className="filter-bottom">
          <div className="filter-selects">
            <select aria-label="Relationship manager" value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}><option>All managers</option><option>Tomas Reyes</option><option>Priya Nair</option></select>
            <select aria-label="Segment" value={segmentFilter} onChange={(event) => setSegmentFilter(event.target.value)}><option>All segments</option>{Array.from(new Set(allCases.map((item) => item.segment))).map((segment) => <option key={segment}>{segment}</option>)}</select>
            <select aria-label="Case status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All statuses</option><option>Overdue</option><option>Waiting on client</option><option>Needs review</option><option>Approval required</option></select>
          </div>
          <div className="filter-summary">Showing {cases.length} of 38 records <button onClick={() => { setQuery(""); setStatusFilter("All statuses"); setOwnerFilter("All managers"); setSegmentFilter("All segments"); }}>Reset</button></div>
        </div>
      </section>
      <section className="case-table-card">
        <div className="table-scroll">
          <table className="case-table">
            <thead><tr><th>Case ID</th><th>Client &amp; jurisdiction</th><th>RM owner</th><th>Aging</th><th>Missing documentation</th><th>Last chased</th><th>Next due</th><th aria-label="Quick action" /></tr></thead>
            <tbody>{cases.map((item) => (
              <tr key={item.id} className={item.status === "Overdue" ? "row-overdue" : ""} onClick={() => onOpen(item)}>
                <td><span className="case-id">{item.id}</span></td>
                <td><button className="client-name" onClick={(event) => { event.stopPropagation(); onOpen(item); }}>{item.company}</button><span className="client-sub">{item.segment} · {item.city}, {item.country}</span></td>
                <td><span className="owner-pill"><span className="owner-initials">{item.owner === "Tomas Reyes" ? "TR" : "PN"}</span>{item.owner}</span></td>
                <td><Badge tone={statusTone(item.status)}>{item.days} days{item.status === "Overdue" ? " · overdue" : ""}</Badge></td>
                <td>{item.missing.length ? <><span className="missing-count">{item.missing.length} missing item{item.missing.length > 1 ? "s" : ""}</span><span className="missing-preview">{item.missing[0]}{item.missing.length > 1 ? ` (+${item.missing.length - 1} more)` : ""}</span></> : <Badge tone="blue">✓ 2 items received</Badge>}</td>
                <td><span className="muted-cell"><Icon name="history" />{item.lastChased}</span></td>
                <td><span className={item.status === "Overdue" ? "due-cell due-red" : item.status === "Approval required" ? "due-cell due-amber" : "muted-cell"}>{item.nextDue}</span></td>
                <td><button className={`button table-action ${item.status === "Overdue" || item.status === "Approval required" ? "button-primary" : ""}`} onClick={(event) => { event.stopPropagation(); onWorkflow(item); }}><Icon name="neurology" /> AI chase</button></td>
              </tr>
            ))}</tbody>
          </table>
          {cases.length === 0 && <div className="empty-state"><Icon name="search_off" /><strong>No cases match those filters</strong><span>Try a different search or reset your filters.</span></div>}
        </div>
        <div className="table-pagination"><span>Rows per page: <button onClick={() => onNotify("Showing 10 rows per page.")}>10⌄</button></span><span>{cases.length ? `1–${cases.length} of 38 cases` : "0 cases"}</span><div className="pagination-buttons"><button disabled aria-label="Previous page"><Icon name="chevron_left" /></button><button className="page-current">1</button><button onClick={() => onNotify("You’re viewing the latest active cases.")}>2</button><button onClick={() => onNotify("You’re viewing the latest active cases.")}>3</button><button aria-label="Next page" onClick={() => onNotify("You’re viewing the latest active cases.")}><Icon name="chevron_right" /></button></div></div>
      </section>
      <section className="audit-banner"><div className="audit-icon"><Icon name="policy" /></div><div><strong>Synthetic prototype only. No messages are sent.</strong><p>All workflow actions are illustrative and are not connected to Northgate Bank production systems.</p></div><button className="button button-quiet" onClick={() => onSetView("Ops Oversight")}>Audit trail log</button><button className="button button-primary" onClick={() => onNotify("Rulesets are illustrative in this demo.")}>Manage rulesets</button></section>
    </>
  );
}

function StatCard({ label, value, suffix, icon, note, tone }: { label: string; value: string; suffix: string; icon: string; note: string; tone: "blue" | "red" }) {
  return <article className={`stat-card stat-${tone}`}><div className="stat-label">{label}<span className="stat-icon"><Icon name={icon} /></span></div><div className="stat-value">{value}<span>{suffix}</span></div><div className="stat-note">{tone === "red" ? <span className="note-star">✳</span> : <span className="note-blue">↗</span>}{note}</div></article>;
}

function CaseView({ item, docs, checkedDocs, onToggleDoc, onBack, onCompose, onUpdate, onNotify }: { item: ChaseCase; docs: { name: string; state: string; reason: string }[]; checkedDocs: string[]; onToggleDoc: (name: string) => void; onBack: () => void; onCompose: () => void; onUpdate: (item: ChaseCase) => Promise<void>; onNotify: (message: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [company, setCompany] = useState(item.company);
  const [missingDocuments, setMissingDocuments] = useState(item.missing.join("\n"));
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    setCompany(item.company);
    setMissingDocuments(item.missing.join("\n"));
    setEditing(false);
    setSaveError("");
  }, [item.id, item.company, item.missing]);

  async function saveCaseDetails() {
    setSaveError("");
    try {
      await onUpdate({
        ...item,
        company: company.trim(),
        missing: missingDocuments.split(/\r?\n/).map((name) => name.trim()).filter(Boolean),
      });
      setEditing(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save case details.");
    }
  }

  return (
    <>
      <div className="breadcrumb"><button onClick={onBack}>Queue</button><Icon name="chevron_right" /><span>Corporate cases</span><Icon name="chevron_right" /><strong>{item.company} ({item.id})</strong></div>
      <section className="case-heading">
        <div><h1>{item.company}</h1><div className="case-tags"><Badge tone={statusTone(item.status)}>{item.status}, day {item.days}</Badge><Badge>{item.id}</Badge><Badge>{item.owner} (RM)</Badge><Badge>{item.country === "IE" ? "Corporate, Ireland" : `${item.segment}, ${item.country}`}</Badge><Badge>Private Limited Company</Badge></div></div>
        <div className="heading-actions"><button className="button button-secondary" onClick={() => { setEditing((current) => !current); setSaveError(""); }}><Icon name="edit" /> {editing ? "Cancel edit" : "Edit case details"}</button><button className="button button-secondary" onClick={() => onNotify("Audit pack prepared for download.")}><Icon name="download" /> Download audit pack</button><button className="button button-primary" onClick={onCompose}><Icon name="edit_note" /> Compose chase</button></div>
      </section>
      {editing && <section className="panel document-panel">
        <div className="panel-heading"><div><h2>Edit synthetic case details</h2><p>Changes are stored in the local SQLite database.</p></div></div>
        <label className="subject-field"><span>Client name</span><input value={company} maxLength={180} onChange={(event) => setCompany(event.target.value)} /></label>
        <label className="draft-label" htmlFor="missing-documents">MISSING DOCUMENTS <span>One document per line</span></label>
        <textarea id="missing-documents" value={missingDocuments} maxLength={4000} rows={5} onChange={(event) => setMissingDocuments(event.target.value)} />
        {saveError && <div className="workflow-error" role="alert"><Icon name="error" /><span>{saveError}</span></div>}
        <div className="heading-actions"><button className="button button-primary" onClick={() => void saveCaseDetails()}><Icon name="save" /> Save case details</button></div>
      </section>}
      <section className="case-metrics">
        <Metric label="Compliance completion" value={item.missing.length ? "62.5%" : "87.5%"} caption={`${8 - item.missing.length} of 8 clauses certified`} icon="donut_small" />
        <Metric label="Current escalation" value={item.status === "Overdue" ? "Stage 3" : "Stage 2"} caption={item.status === "Overdue" ? "Final notice pre-freeze" : "Client follow-up"} icon="notifications_active" tone="red" />
        <Metric label="Days in queue" value={`${item.days} days`} caption={`Target SLA: ${item.days > 21 ? "21" : "21"} days`} icon="schedule" />
        <Metric label="Entity risk profile" value={item.risk} caption="AML Directive 5 Sub-Annex" icon="shield" tone="amber" />
      </section>
      <div className="detail-grid">
        <div className="detail-main">
          <section className="panel document-panel">
            <div className="panel-heading"><div><h2>Required Documentation Checklist</h2><p>Statutory compliance verification criteria under corporate jurisdiction</p></div><select aria-label="Filter documents"><option>All 8 Documents</option><option>Missing only</option><option>Needs review</option></select></div>
            <div className="document-header"><span>Document</span><span>Status</span><span>Required because</span><span>Last updated</span><span className="sr-only">Review</span></div>
            {docs.map((doc, index) => {
              const isMissing = doc.state === "Missing" || doc.state === "Expired";
              return <div className={`document-row ${isMissing ? "document-attention" : ""}`} key={doc.name}>
                <div className="document-name"><Icon name={isMissing ? "error" : index === 0 ? "description" : "task_alt"} /><span>{doc.name}</span></div>
                <div><Badge tone={doc.state === "Received" ? "blue" : doc.state === "Missing" || doc.state === "Expired" ? "red" : "neutral"}>{doc.state}</Badge></div>
                <div className="document-reason">{doc.reason}</div>
                <div className="document-date">{doc.state === "Missing" ? "Never submitted" : index === 0 ? "02 Nov 2026" : "04 Nov 2026"}</div>
                <div>{isMissing && <button className={`check-document ${checkedDocs.includes(doc.name) ? "checked" : ""}`} onClick={() => onToggleDoc(doc.name)} aria-label={`${checkedDocs.includes(doc.name) ? "Unmark" : "Mark"} ${doc.name} for chase`}><Icon name={checkedDocs.includes(doc.name) ? "check" : "add"} /></button>}</div>
              </div>;
            })}
            <div className="checklist-foot"><span>{checkedDocs.length} selected for chase</span><button onClick={onCompose}>Compose request <Icon name="arrow_forward" /></button></div>
          </section>
          <section className="panel registry-panel"><div className="registry-title"><Icon name="account_balance" /><strong>Registry Snapshot</strong><span>Live sync: 14 Nov 2026 04:00 GMT</span></div><div className="registry-grid"><div><small>Company number</small><strong>IE-694821</strong><span>Incorporated March 2014</span></div><div><small>Registered office</small><strong>Customs House Quay, Dublin 1</strong><span>Verified via AD-02</span></div><div><small>Listed primary officers</small><strong>2 Directors / 1 Secretary</strong><span>Awaiting Director Register</span></div></div></section>
        </div>
        <aside className="detail-aside">
          <section className="panel timeline-panel"><div className="panel-heading"><div><h2>Chase History</h2><p>5 events · full audit trail</p></div><button className="text-button" onClick={() => onNotify("Showing all case history events.")}>Filter timeline</button></div>
            <TimelineItem color="red" name={`${item.owner} (RM)`} date="14 Nov, 11:30" title={`Reminder 3: Missing ${item.missing[0] ?? "onboarding documents"}`} kind="Email outbound" status="No reply yet" />
            <TimelineItem color="blue" name="Priya Nair (Ops)" date="11 Nov, 15:45" title="Document check: Annual accounts received, awaiting remaining KYC items" kind="Email outbound" status="Opened by client" />
            <TimelineItem color="gray" name={`${item.owner} (RM)`} date="07 Nov, 09:20" title={`First formal reminder: KYC documentation required for ${item.company}`} kind="Email outbound" status="Opened by client" />
            <TimelineItem color="blue" name="Inbound Document Upload" date="04 Nov, 14:10" title="Proof of address uploaded via client portal" kind="Client portal" status="Verified by analyst" />
            <TimelineItem color="gray" name="Ops Intake Desk" date="28 Oct, 10:00" title="Case opened & initial onboarding pack dispatched by Ops team" kind="Initial dispatch" status="Completed" last />
          </section>
          <section className="panel protocol-panel"><div className="protocol-icon"><Icon name="schedule" /></div><h3>Chase Desk Protocol Engine</h3><p>Illustrative next chase date: <strong>18 Nov 2026, 09:00 GMT</strong> (Final Pre-Account Restrict Notice).</p><div className="protocol-foot"><span>Template: D-4 Escalation</span><button className="text-button" onClick={() => onNotify("Previewing the D-4 escalation template.")}>Preview text <Icon name="arrow_forward" /></button></div></section>
        </aside>
      </div>
      <section className="case-footer"><Icon name="shield" /><span>Synthetic demo case. No messages are sent.</span><small>Sample Analyst ID: 884-STRL</small><button className="button button-secondary" onClick={() => onNotify("Rules engine specifications are illustrative in this demo.")}>View rules engine specs</button></section>
    </>
  );
}

function Metric({ label, value, caption, icon, tone = "blue" }: { label: string; value: string; caption: string; icon: string; tone?: "blue" | "red" | "amber" }) {
  return <article className={`metric-card metric-${tone}`}><div className="metric-label">{label}<Icon name={icon} /></div><strong>{value}</strong><span>{caption}</span></article>;
}

function TimelineItem({ color, name, date, title, kind, status, last = false }: { color: "red" | "blue" | "gray"; name: string; date: string; title: string; kind: string; status: string; last?: boolean }) {
  return <div className={`timeline-item ${last ? "timeline-last" : ""}`}><span className={`timeline-dot dot-${color}`} /><div className="timeline-content"><div className="timeline-meta"><strong>{name}</strong><span>{date}</span></div><p>“{title}”</p><div className="timeline-tags"><span><Icon name="mail" />{kind}</span><Badge>{status}</Badge></div></div></div>;
}

function makeDraft(item: ChaseCase) {
  const docs = item.missing.length ? item.missing : ["updated compliance documentation"];
  return `Dear ${item.company} team,\n\nWe are following up on your onboarding file (case reference: ${item.id}). To finalize compliance clearance and activate your operational facilities, our regulatory team requires the following outstanding documentation:\n\n${docs.map((doc) => `• ${doc}`).join("\n")}\n\nPlease provide the above at your earliest convenience. If you have any questions, your relationship manager ${item.owner} is available to assist.\n\nKind regards,\n${item.owner}\nChase Desk · Corporate Banking`;
}

function makeDraftSubject(item: ChaseCase) {
  return `[${item.id}] Request for outstanding onboarding documents`;
}

function ComposerView({ item, draft, setDraft, subject, setSubject, attested, setAttested, onSend, onSave, onBack }: { item: ChaseCase; draft: string; setDraft: (value: string) => void; subject: string; setSubject: (value: string) => void; attested: boolean; setAttested: (value: boolean) => void; onSend: () => void; onSave: () => void; onBack: () => void }) {
  const docs = item.missing.length ? item.missing : ["Updated compliance documentation"];
  return (
    <>
      <div className="breadcrumb"><button onClick={onBack}>Queue</button><Icon name="chevron_right" /><button onClick={onBack}>{item.company} ({item.id})</button><Icon name="chevron_right" /><strong>Compose chase message</strong></div>
      <section className="composer-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> ANALYST STAGING · LIVE PREVIEW</div><h1>Review &amp; approve client chase</h1></div><Badge tone="blue">Protocol ID: REL-NOR-2026</Badge></section>
      <section className="composer-case panel"><div><Icon name="account_balance" /><span><strong>{item.company}</strong><small>Case ID: {item.id}</small></span></div><div><span className="overline">Designated recipient</span><strong>Henrik Halden <small>(Managing Director)</small></strong></div><div><span className="overline">Relationship manager</span><strong><Icon name="headset_mic" /> {item.owner} (RM) · Corporate Banking</strong></div><div><Badge tone="red">SLA: Chase overdue by {Math.max(1, item.days - 14)}d</Badge></div></section>
      <div className="composer-grid">
        <aside className="panel request-panel"><div className="panel-heading"><div><h2>Items to request</h2><p>Select missing or expired documents.</p></div><Badge tone="blue">{docs.length} selected</Badge></div>{docs.map((doc) => <label className="request-item" key={doc}><input type="checkbox" defaultChecked /><span><strong>{doc}</strong><small>Required for corporate KYC verification</small></span><Badge tone="red">Missing</Badge></label>)}<div className="repository-status"><Icon name="inventory_2" /><span><strong>Repository status</strong><small>6 of 9 items cleared</small></span><strong>66%</strong></div></aside>
        <section className="panel draft-panel"><div className="draft-toolbar"><div><Icon name="edit_note" /><strong>Draft message</strong><Badge>v1.2</Badge></div><div className="tone-options"><button className="selected">Standard</button><button onClick={(event) => event.currentTarget.classList.toggle("selected")}>Firm</button><button onClick={(event) => event.currentTarget.classList.toggle("selected")}>Friendly</button></div></div><div className="recipient-fields"><div><span>To:</span><strong>Recipient details require analyst verification</strong></div><div><span>CC:</span><strong>{item.owner} <small>(Relationship Manager)</small></strong></div><div className="subject-field"><label htmlFor="draft-subject">Subject:</label><input id="draft-subject" value={subject} onChange={(event) => setSubject(event.target.value)} /></div></div><label className="draft-label" htmlFor="draft-body">EMAIL BODY (ANALYST EDITABLE) <span>Local sample template</span></label><textarea id="draft-body" value={draft} onChange={(event) => setDraft(event.target.value)} /><div className="attachment-row"><Icon name="attach_file" /><span>Attachments are not sent in this demo</span></div><div className="encryption-note"><Icon name="lock" /> Demo only · no message or attachment is transmitted.</div></section>
        <aside className="composer-side">
          <section className="panel safety-panel"><div className="panel-heading"><div><h2><Icon name="verified_user" /> Prototype review checklist</h2><p>Illustrative checks only; review details manually.</p></div><Badge tone="green">3/3 shown</Badge></div><SafetyCheck title="All missing items in body" detail={`${docs.length} active request${docs.length > 1 ? "s" : ""} matched in draft text`} /><SafetyCheck title="Case ID tagged in subject" detail={`${item.id} detected`} /><SafetyCheck title="Recipient matches RM registry" detail="Henrik Halden (verified MD)" /></section>
          <section className="panel followup-panel"><h3><Icon name="autorenew" /> Follow-up cadence</h3><p>Choose an illustrative reminder interval:</p><label><input type="radio" name="followup" defaultChecked /> <span><strong>Remind in 5 days</strong><small>Standard corporate KYC rhythm</small></span></label><label><input type="radio" name="followup" /> <span><strong>Remind in 3 days</strong><small>Expedited review sprint</small></span></label><label><input type="radio" name="followup" /> <span><strong>Remind in 7 days</strong><small>Extended holiday &amp; quarter-close</small></span></label></section>
          <section className="panel approve-panel"><label className="attestation"><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} /><span>I confirm I reviewed this synthetic demo draft. This action does not send an email.</span></label><button className="button button-primary button-full" onClick={onSend}><Icon name="verified_user" /> Record demo approval</button><button className="button button-secondary button-full" onClick={onSave}><Icon name="save" /> Save draft</button><small><Icon name="policy" /> Demo only: no message is sent. A real bank deployment requires authorized systems, security approval, and human governance.</small></section>
        </aside>
      </div>
    </>
  );
}

function SafetyCheck({ title, detail }: { title: string; detail: string }) {
  return <div className="safety-check"><Icon name="check_circle" /><div><strong>{title}</strong><span>{detail}</span></div></div>;
}

function OversightView({ onBack }: { onBack: () => void }) {
  return (
    <>
      <div className="breadcrumb"><span>Operations</span><Icon name="chevron_right" /><strong>Ops oversight</strong></div>
      <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> OPERATIONS INTELLIGENCE · LIVE</div><h1>Ops oversight</h1><p>Track team performance, service levels, and portfolio health.</p></div><select className="select-control"><option>All teams</option><option>Corporate Banking</option><option>Operations</option></select></section>
      <section className="stats-grid oversight-stats"><StatCard label="Active cases" value="38" suffix="across all teams" icon="folder_open" note="6 opened this week" tone="blue" /><StatCard label="SLA compliance" value="84%" suffix="target: 90%" icon="verified" note="+6.2% vs last month" tone="blue" /><StatCard label="Escalations" value="6" suffix="require attention" icon="warning" note="2 high-priority cases" tone="red" /><StatCard label="Avg. resolution" value="6.2d" suffix="target: 7 days" icon="speed" note="0.8d faster this cycle" tone="blue" /></section>
      <div className="charts-grid"><section className="panel chart-panel"><div className="panel-heading"><div><h2>Queue aging distribution</h2><p>Open cases grouped by time in queue</p></div><Badge>Last 30 days</Badge></div><div className="bar-chart">{[{ label: "0–7 days", value: 74 }, { label: "8–14 days", value: 61 }, { label: "15–21 days", value: 42 }, { label: "22–30 days", value: 28 }, { label: "30+ days", value: 21 }].map((bar, index) => <div className="bar-group" key={bar.label}><div className={`bar bar-${index}`} style={{ height: `${bar.value}%` }} /><span>{bar.label}</span></div>)}</div></section><section className="panel chart-panel trend-panel"><div className="panel-heading"><div><h2>Resolution trend</h2><p>Median days to resolution</p></div><Badge tone="green">↓ Improving</Badge></div><div className="trend-chart"><svg viewBox="0 0 480 190" role="img" aria-label="Resolution time trending down from 11 days to 6 days"><defs><linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#0071e3" stopOpacity=".18" /><stop offset="100%" stopColor="#0071e3" stopOpacity="0" /></linearGradient></defs><path d="M20 30 C72 44 82 48 116 62 S174 75 208 87 S264 95 300 117 S358 124 390 139 S442 147 460 154 L460 180 L20 180Z" fill="url(#trendFill)" /><path d="M20 30 C72 44 82 48 116 62 S174 75 208 87 S264 95 300 117 S358 124 390 139 S442 147 460 154" fill="none" stroke="#0071e3" strokeWidth="3" strokeLinecap="round" /><path d="M20 160H460" stroke="#e6e5e8" strokeDasharray="4 5" />{[[20,30],[116,62],[208,87],[300,117],[390,139],[460,154]].map(([x,y]) => <circle key={x} cx={x} cy={y} r="5" fill="#fff" stroke="#0071e3" strokeWidth="3" />)}</svg><div className="trend-labels"><span>Week 1</span><span>Week 2</span><span>Week 3</span><span>Week 4</span><span>Today</span></div></div></section></div>
      <section className="panel team-panel"><div className="panel-heading"><div><h2>Team performance</h2><p>Current cycle · updated 4 minutes ago</p></div><button className="button button-secondary" onClick={onBack}>View queue</button></div><div className="team-table"><div className="team-row team-header"><span>Team member</span><span>Active cases</span><span>Overdue</span><span>Avg. response</span><span>SLA health</span></div>{[{ name: "Tomas Reyes", role: "Relationship Manager", cases: "14", overdue: "3", response: "5.4 days", health: 82 }, { name: "Priya Nair", role: "Operations Analyst", cases: "12", overdue: "1", response: "4.1 days", health: 91 }, { name: "S. Sterling", role: "Lead KYC Analyst", cases: "8", overdue: "2", response: "3.8 days", health: 88 }].map((member) => <div className="team-row" key={member.name}><span className="team-person"><span className="avatar avatar-neutral">{member.name.split(" ").map((part) => part[0]).join("")}</span><span><strong>{member.name}</strong><small>{member.role}</small></span></span><span>{member.cases}</span><span className={member.overdue === "3" ? "due-red" : ""}>{member.overdue}</span><span>{member.response}</span><span className="health-cell"><i><b style={{ width: `${member.health}%` }} /></i>{member.health}%</span></div>)}</div></section>
    </>
  );
}

function SettingsView({ onNotify }: { onNotify: (message: string) => void }) {
  const [notifications, setNotifications] = useState(true);
  const [autoSave, setAutoSave] = useState(true);
  return (
    <>
      <div className="breadcrumb"><span>Operations</span><Icon name="chevron_right" /><strong>Settings</strong></div>
      <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> WORKSPACE PREFERENCES</div><h1>Settings</h1><p>Manage your Chase Desk experience and analyst preferences.</p></div></section>
      <section className="panel settings-panel"><div className="settings-title"><div className="settings-icon"><Icon name="notifications" /></div><div><h2>Notifications</h2><p>Choose when Chase Desk gets your attention.</p></div></div><SettingToggle label="Queue and SLA alerts" description="Get notified when a case becomes overdue or needs escalation." enabled={notifications} onToggle={() => setNotifications(!notifications)} /><SettingToggle label="Daily operations digest" description="Receive a morning summary of your assigned cases." enabled={notifications} onToggle={() => setNotifications(!notifications)} /><div className="settings-title settings-section-title"><div className="settings-icon"><Icon name="edit_note" /></div><div><h2>Workspace</h2><p>Personalize your analyst workspace.</p></div></div><SettingToggle label="Automatically save message drafts" description="Save your progress while composing client chasers." enabled={autoSave} onToggle={() => setAutoSave(!autoSave)} /><div className="settings-bottom"><button className="button button-primary" onClick={() => onNotify("Your preferences have been saved.")}>Save preferences</button></div></section>
      <section className="settings-footnote"><Icon name="shield" /> Chase Desk preferences are stored securely and managed by your organization.</section>
    </>
  );
}

function SettingToggle({ label, description, enabled, onToggle }: { label: string; description: string; enabled: boolean; onToggle: () => void }) {
  return <div className="setting-row"><div><strong>{label}</strong><p>{description}</p></div><button role="switch" aria-checked={enabled} className={`toggle ${enabled ? "toggle-on" : ""}`} onClick={onToggle}><span /></button></div>;
}

export default App;
