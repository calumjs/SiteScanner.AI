"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function NewIssuePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    const { error } = await supabase.from("issues").insert({
      title,
      source_url: sourceUrl || null,
      description: description || null,
      manual_instructions: instructions || null,
      status: "reported"
    });

    setSaving(false);

    if (error) {
      console.error(error);
      return;
    }

    router.push("/issues");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Report Manual Issue</h1>
        <p className="text-sm text-neutral-500">
          Provide as much context as possible to help the worker succeed.
        </p>
      </div>
      <form className="space-y-4" onSubmit={onSubmit}>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Title</span>
          <input
            className="w-full rounded border px-3 py-2"
            value={title}
            onChange={event => setTitle(event.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Source URL</span>
          <input
            className="w-full rounded border px-3 py-2"
            value={sourceUrl}
            onChange={event => setSourceUrl(event.target.value)}
            placeholder="https://example.com/page"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Description</span>
          <textarea
            className="w-full rounded border px-3 py-2"
            rows={3}
            value={description}
            onChange={event => setDescription(event.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Manual Instructions</span>
          <textarea
            className="w-full rounded border px-3 py-2"
            rows={4}
            value={instructions}
            onChange={event => setInstructions(event.target.value)}
            placeholder="e.g. update footer year, rename CTA button text..."
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className="rounded border bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Create Issue"}
        </button>
      </form>
    </div>
  );
}

