"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Issue = {
  id: string;
  title: string;
  status: string;
  source_url: string | null;
  pr_url: string | null;
  description: string | null;
  manual_instructions: string | null;
  error_message: string | null;
  created_at?: string;
};

const statuses = [
  "all",
  "reported",
  "approved",
  "rejected",
  "in_progress",
  "pr_raised",
  "done",
  "failed"
] as const;

// Remove citation markers like "citeturn6view0" from text
function stripCitations(text: string | null): string {
  if (!text) return "";
  // Remove citation patterns in various formats
  return text
    // Remove markdown-style links/badges that might contain citations
    .replace(/\[cite[^\]]*\]/gi, "")
    .replace(/\[turn[^\]]*\]/gi, "")
    .replace(/\[view[^\]]*\]/gi, "")
    // Remove plain text citations
    .replace(/\bcite\w*\d*\w*/gi, "")
    .replace(/\bturn\w*\d*\w*/gi, "")
    .replace(/\bview\w*\d*\w*/gi, "")
    // Remove all emojis and special symbols (comprehensive unicode ranges)
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/[\u{2600}-\u{26FF}]/gu, "")
    .replace(/[\u{2700}-\u{27BF}]/gu, "")
    // Remove any trailing non-alphanumeric characters except basic punctuation
    .replace(/[^\w\s.,!?;:()"'-]+$/g, "")
    // Clean up extra whitespace
    .replace(/\s+/g, " ")
    .trim();
}

export default function IssuesPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [statusFilter, setStatusFilter] = useState<(typeof statuses)[number]>("all");
  const [loading, setLoading] = useState(false);
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);

  const loadIssues = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("issues")
      .select("id, title, status, source_url, pr_url, description, manual_instructions, error_message, created_at")
      .order("created_at", { ascending: false });

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;
    if (error) {
      console.error(error);
    }
    setIssues((data ?? []) as Issue[]);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    // Data-fetching effect; React lint warns about setState in effects, but this is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadIssues();
  }, [loadIssues]);

  async function handle(action: "approve" | "reject", id: string) {
    const rpc = action === "approve" ? "approve_issue" : "reject_issue";
    const { error } = await supabase.rpc(rpc, { issue_id: id });
    if (error) {
      console.error(error);
    }
    await loadIssues();
    if (activeIssue?.id === id) {
      setActiveIssue(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-blue-500">Site Scanner</p>
            <h1 className="text-3xl font-semibold text-slate-900">Issue Queue</h1>
            <p className="text-sm text-slate-500">
              Approve or reject issues before the worker picks them up.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-slate-500">Status</label>
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value as (typeof statuses)[number])}
            >
              {statuses.map(status => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <button
              onClick={loadIssues}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300"
              disabled={loading}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <Link
              href="/issues/new"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700"
            >
              + New Manual Issue
            </Link>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-md">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-widest text-slate-400">
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">PR</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {issues.map(issue => (
                <tr
                  key={issue.id}
                  className={`border-t text-slate-700 transition hover:bg-slate-50 ${
                    activeIssue?.id === issue.id ? "bg-blue-50/60" : "bg-white"
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{issue.title}</div>
                    <p className="text-xs text-slate-400">
                      {issue.created_at
                        ? new Date(issue.created_at).toLocaleString()
                        : "Unknown date"}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs uppercase text-slate-500">
                    {issue.status}
                  </td>
                  <td className="px-4 py-3">
                    {issue.source_url ? (
                      <a
                        href={issue.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 underline"
                      >
                        View page
                      </a>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {issue.pr_url ? (
                      <a
                        href={issue.pr_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 underline"
                      >
                        PR link
                      </a>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-400"
                        onClick={() => setActiveIssue(issue)}
                      >
                        Details
                      </button>
                      {issue.status === "reported" && (
                        <>
                          <button
                            className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-600"
                            onClick={() => handle("approve", issue.id)}
                          >
                            Approve
                          </button>
                          <button
                            className="rounded-full bg-red-500 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-red-600"
                            onClick={() => handle("reject", issue.id)}
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {issue.status === "failed" && (
                        <button
                          className="rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-600"
                          onClick={() => handle("approve", issue.id)}
                        >
                          Re-approve
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {issues.length === 0 && !loading && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-400" colSpan={5}>
                    No issues for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <aside className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-md backdrop-blur">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Issue Details</h2>
            {activeIssue && (
              <button
                className="text-sm text-slate-400 hover:text-slate-600"
                onClick={() => setActiveIssue(null)}
              >
                Clear
              </button>
            )}
          </div>
          {activeIssue ? (
            <div className="mt-4 space-y-4 text-sm text-slate-600">
              <div>
                <p className="text-xs uppercase text-slate-400">Title</p>
                <p className="font-medium text-slate-900">{activeIssue.title}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-400">Description</p>
                <p className="whitespace-pre-wrap">{stripCitations(activeIssue.description) || "No description provided."}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-400">Manual instructions</p>
                <p className="whitespace-pre-wrap">
                  {activeIssue.manual_instructions || "None supplied."}
                </p>
              </div>
              {activeIssue.status === "failed" && activeIssue.error_message && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-xs uppercase text-red-600">Error Message</p>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-red-800">
                    {activeIssue.error_message}
                  </p>
                </div>
              )}
              <div className="flex gap-2">
                {activeIssue.source_url && (
                  <a
                    href={activeIssue.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-blue-600"
                  >
                    View Source
                  </a>
                )}
                {activeIssue.pr_url && (
                  <a
                    href={activeIssue.pr_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-blue-600"
                  >
                    Open PR
                  </a>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-6 text-sm text-slate-400">
              Select an issue from the table to preview its description and instructions.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

