import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center gap-6 p-8">
      <div>
        <p className="text-sm uppercase tracking-widest text-neutral-500">SiteScanner AI</p>
        <h1 className="text-4xl font-semibold">Ops Portal</h1>
        <p className="mt-2 text-neutral-600">
          Review scanner output, approve issues for the worker, and file manual tasks when needed.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/issues"
          className="rounded border border-black bg-black px-4 py-2 text-sm font-semibold text-white"
        >
          Open Issues
        </Link>
        <Link
          href="/issues/new"
          className="rounded border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700"
        >
          New Manual Issue
        </Link>
      </div>
    </main>
  );
}
