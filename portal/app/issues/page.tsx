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
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);

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
  }

  function toggleIssue(id: string) {
    setExpandedIssueId(expandedIssueId === id ? null : id);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-blue-500">Site Scanner</p>
            <h1 className="text-3xl font-semibold text-slate-900">Issue Queue</h1>
            <p className="text-sm text-slate-500">
              Click any issue to expand and view details.
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

      <div className="space-y-3">
        {issues.length === 0 && !loading && (
          <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-slate-400 shadow-md">
            No issues for this filter.
          </div>
        )}
        {issues.map(issue => {
          const isExpanded = expandedIssueId === issue.id;
          return (
            <div
              key={issue.id}
              className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-md transition-all"
            >
              {/* Accordion Header */}
              <div
                className={`flex cursor-pointer items-center justify-between gap-4 p-4 transition-colors hover:bg-slate-50 ${
                  isExpanded ? "bg-blue-50/60" : ""
                }`}
                onClick={() => toggleIssue(issue.id)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="font-medium text-slate-900">{issue.title}</div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-xs uppercase text-slate-600">
                      {issue.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {issue.created_at
                      ? new Date(issue.created_at).toLocaleString()
                      : "Unknown date"}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {issue.source_url && (
                    <a
                      href={issue.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-blue-600 transition hover:border-blue-300 hover:bg-blue-50"
                      onClick={e => e.stopPropagation()}
                    >
                      View Page
                    </a>
                  )}
                  {issue.pr_url && (
                    <a
                      href={issue.pr_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-blue-600 transition hover:border-blue-300 hover:bg-blue-50"
                      onClick={e => e.stopPropagation()}
                    >
                      PR Link
                    </a>
                  )}
                  
                  {/* Expand/Collapse Icon */}
                  <svg
                    className={`h-5 w-5 text-slate-400 transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </div>

              {/* Accordion Content */}
              {isExpanded && (
                <div className="border-t border-slate-100 bg-slate-50/50 p-6">
                  <div className="grid gap-6 lg:grid-cols-2">
                    {/* Left Column - Details */}
                    <div className="space-y-4">
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Description
                        </p>
                        <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                          {stripCitations(issue.description) || "No description provided."}
                        </p>
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Manual Instructions
                        </p>
                        <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                          {issue.manual_instructions || "None supplied."}
                        </p>
                      </div>
                      {issue.status === "failed" && issue.error_message && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-600">
                            Error Message
                          </p>
                          <p className="whitespace-pre-wrap text-sm text-red-800">
                            {issue.error_message}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Right Column - Actions */}
                    <div className="flex flex-col gap-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Actions
                      </p>
                      {issue.status === "reported" && (
                        <div className="flex flex-col gap-2">
                          <button
                            className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600"
                            onClick={e => {
                              e.stopPropagation();
                              handle("approve", issue.id);
                            }}
                          >
                            ✓ Approve Issue
                          </button>
                          <button
                            className="w-full rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-600"
                            onClick={e => {
                              e.stopPropagation();
                              handle("reject", issue.id);
                            }}
                          >
                            ✕ Reject Issue
                          </button>
                        </div>
                      )}
                      {issue.status === "failed" && (
                        <button
                          className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600"
                          onClick={e => {
                            e.stopPropagation();
                            handle("approve", issue.id);
                          }}
                        >
                          ↻ Re-approve Issue
                        </button>
                      )}
                      {issue.status !== "reported" && issue.status !== "failed" && (
                        <div className="rounded-lg border border-slate-200 bg-white p-4 text-center">
                          <p className="text-sm text-slate-500">
                            No actions available for {issue.status} issues.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

