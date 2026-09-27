export default function Loading() {
  return (
    <div className="animate-pulse space-y-7" role="status" aria-label="Loading workspace">
      <div className="h-7 w-64 rounded bg-slate-200" />
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 rounded-xl bg-white" />
        ))}
      </div>
      <div className="h-80 rounded-xl bg-white" />
      <span className="sr-only">Loading your workspace…</span>
    </div>
  );
}
