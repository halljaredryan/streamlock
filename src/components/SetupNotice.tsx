"use client";

export interface ProviderStatusView {
  name: string;
  configured: boolean;
  required: boolean;
  detail: string;
}

export function SetupNotice({ providers }: { providers: ProviderStatusView[] }) {
  const blocking = providers.filter((provider) => provider.required && !provider.configured);
  const optional = providers.filter((provider) => !provider.required && !provider.configured);
  if (blocking.length === 0 && optional.length === 0) return null;

  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm ${
        blocking.length > 0
          ? "border-red-400/30 bg-red-500/10 text-red-100"
          : "border-yellow-400/25 bg-yellow-500/5 text-yellow-100/90"
      }`}
    >
      <p className="font-semibold">
        {blocking.length > 0 ? "Setup required" : "Running with reduced coverage"}
      </p>
      <ul className="mt-2 space-y-1">
        {[...blocking, ...optional].map((provider) => (
          <li key={provider.name}>
            <span className="font-mono text-xs uppercase tracking-wide opacity-70">
              {provider.name}
            </span>{" "}
            &mdash; {provider.detail}
          </li>
        ))}
      </ul>
      <p className="mt-2 opacity-60">
        Copy <code className="font-mono">.env.example</code> to{" "}
        <code className="font-mono">.env.local</code> and fill in the keys, or set{" "}
        <code className="font-mono">STREAMLOCK_DEMO=1</code> to preview the UI with canned data.
      </p>
    </div>
  );
}

export function WarningList({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="space-y-1 rounded-xl border border-white/10 bg-ink-900/50 px-4 py-3 text-sm text-white/50">
      {warnings.map((warning) => (
        <li key={warning}>{warning}</li>
      ))}
    </ul>
  );
}
