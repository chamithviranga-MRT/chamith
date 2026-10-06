import { DISCLAIMER } from "@/lib/config";

export function Disclaimer({ className = "" }: { className?: string }) {
  return (
    <p
      role="note"
      className={`rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100 ${className}`}
    >
      <strong className="font-semibold">Notice: </strong>
      {DISCLAIMER}
    </p>
  );
}
