"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BORROWER_TYPE_LABEL, BORROWER_TYPES, FREQUENCIES, PURPOSE_LABEL, PURPOSES, RESIDENCY, type Profile,
} from "@/lib/profile/schema";
import { COUNTRY_NAMES, US_STATES } from "@/lib/profile/geo";
import type { MissingField } from "@/lib/profile/normalize";

type Kind = "text" | "number" | "select" | "tri";
interface FieldDef {
  key: Exclude<keyof Profile, "assumptions">;
  label: string;
  kind: Kind;
  options?: Array<[string, string]>;
  suffix?: string;
  required?: MissingField;
  wide?: boolean;
}

const COUNTRY_OPTS: Array<[string, string]> = Object.entries(COUNTRY_NAMES).map(([c, n]) => [c, n]);
const STATE_OPTS: Array<[string, string]> = Object.entries(US_STATES).map(([c, n]) => [c, `${n} (${c})`]);

const SECTIONS: Array<{ title: string; fields: FieldDef[] }> = [
  {
    title: "Borrower",
    fields: [
      { key: "borrowerType", label: "Borrower type", kind: "select", options: BORROWER_TYPES.map((t) => [t, BORROWER_TYPE_LABEL[t]]) },
      { key: "industry", label: "Industry", kind: "text" },
      { key: "ownerResidency", label: "Owner citizenship / residency", kind: "select", options: RESIDENCY.map((r) => [r, r.replace(/_/g, " ")]) },
    ],
  },
  {
    title: "Location",
    fields: [
      { key: "ownerCountry", label: "Owner country", kind: "select", options: COUNTRY_OPTS, required: "location" },
      { key: "ownerState", label: "Owner state", kind: "select", options: STATE_OPTS },
      { key: "businessCountry", label: "Business country", kind: "select", options: COUNTRY_OPTS, required: "location" },
      { key: "businessState", label: "Business state", kind: "select", options: STATE_OPTS, required: "location" },
    ],
  },
  {
    title: "Business",
    fields: [
      { key: "timeInBusinessMonths", label: "Time in business", kind: "number", suffix: "months (0 = not launched)", required: "timeInBusiness" },
      { key: "monthlyRevenue", label: "Monthly revenue", kind: "number", suffix: "USD" },
      { key: "annualRevenue", label: "Annual revenue", kind: "number", suffix: "USD" },
    ],
  },
  {
    title: "Credit",
    fields: [
      { key: "ficoMin", label: "Personal FICO — low", kind: "number", required: "credit" },
      { key: "ficoMax", label: "Personal FICO — high", kind: "number", required: "credit" },
      { key: "businessCreditScore", label: "Business credit score", kind: "number" },
      { key: "businessCreditScoreType", label: "Score type (e.g. Paydex)", kind: "text" },
      { key: "recentDefaults", label: "Defaults in last 24 months", kind: "tri" },
      { key: "hasBankruptcy", label: "Bankruptcy", kind: "tri" },
      { key: "bankruptcyYearsAgo", label: "Years since bankruptcy", kind: "number" },
      { key: "hasTaxLiens", label: "Tax liens", kind: "tri" },
    ],
  },
  {
    title: "What you need",
    fields: [
      { key: "amountNeeded", label: "Amount needed", kind: "number", suffix: "USD", required: "amount" },
      { key: "purpose", label: "Purpose", kind: "select", options: PURPOSES.map((p) => [p, PURPOSE_LABEL[p]]), required: "purpose" },
      { key: "preferredTermMonths", label: "Preferred term", kind: "number", suffix: "months" },
      { key: "repaymentFrequency", label: "Repayment frequency", kind: "select", options: FREQUENCIES.map((f) => [f, f.replace("_", " ")]) },
      { key: "speedNeededDays", label: "Funds needed within", kind: "number", suffix: "days" },
    ],
  },
  {
    title: "Security & guarantees",
    fields: [
      { key: "collateralAvailable", label: "Collateral available", kind: "tri" },
      { key: "collateralDescription", label: "Collateral description", kind: "text" },
      { key: "willingPersonalGuarantee", label: "Willing to give a personal guarantee", kind: "tri" },
      { key: "willingUccLien", label: "Willing to accept a UCC lien", kind: "tri" },
    ],
  },
  {
    title: "Business expectation",
    fields: [
      { key: "growthPlan", label: "Growth plan", kind: "text", wide: true },
      { key: "expectedRevenueLiftPct", label: "Expected revenue lift", kind: "number", suffix: "%" },
      { key: "cashFlowForecast", label: "Cash-flow forecast", kind: "text", wide: true },
    ],
  },
];

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-600 dark:bg-slate-950";

export function ProfileCard({
  profile,
  missing,
  disabled,
  onSave,
  onConfirm,
}: {
  profile: Profile;
  missing: MissingField[];
  disabled?: boolean;
  onSave: (edits: Partial<Profile>) => Promise<string[] | null>;
  onConfirm: (edits: Partial<Profile>) => Promise<string[] | null>;
}) {
  const [draft, setDraft] = useState<Profile>(profile);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(profile), [profile]);

  const dirtyKeys = useMemo(
    () => (Object.keys(draft) as Array<keyof Profile>).filter((k) => k !== "assumptions" && JSON.stringify(draft[k]) !== JSON.stringify(profile[k])),
    [draft, profile]
  );
  const edits = () => Object.fromEntries(dirtyKeys.map((k) => [k, draft[k]])) as Partial<Profile>;

  const set = (key: FieldDef["key"], v: unknown) => setDraft((d) => ({ ...d, [key]: v }) as Profile);

  const run = async (fn: (e: Partial<Profile>) => Promise<string[] | null>) => {
    setSaving(true);
    setErrors([]);
    const errs = await fn(edits());
    setSaving(false);
    if (errs?.length) setErrors(errs);
  };

  const missingSet = new Set(missing);

  return (
    <section aria-label="Extracted profile" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Your profile</h2>
        <p className="text-xs text-slate-500">
          {missing.length ? <span className="font-medium text-amber-700 dark:text-amber-300">Still needed: {missing.length} required</span> : "Required details complete"} · edit anything, then confirm
        </p>
      </div>

      <div className="grid gap-5">
        {SECTIONS.map((s) => (
          <fieldset key={s.title} className="grid gap-2">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{s.title}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {s.fields.map((f) => {
                const v = draft[f.key] as unknown;
                const isMissing = f.required && missingSet.has(f.required) && (v === null || v === undefined);
                const id = `pf-${f.key}`;
                return (
                  <label key={f.key} htmlFor={id} className={`grid gap-1 text-xs ${f.wide ? "sm:col-span-2" : ""}`}>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {f.label}
                      {f.required && <span className="text-rose-600"> *</span>}
                    </span>
                    {f.kind === "text" && (
                      <input id={id} className={inputCls} value={(v as string | null) ?? ""} maxLength={400} onChange={(e) => set(f.key, e.target.value === "" ? null : e.target.value)} />
                    )}
                    {f.kind === "number" && (
                      <div className="flex items-center gap-2">
                        <input
                          id={id}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          className={`${inputCls} ${isMissing ? "border-amber-500 ring-1 ring-amber-400" : ""}`}
                          value={(v as number | null) ?? ""}
                          onChange={(e) => set(f.key, e.target.value === "" ? null : Number(e.target.value))}
                        />
                        {f.suffix && <span className="shrink-0 text-[11px] text-slate-500">{f.suffix}</span>}
                      </div>
                    )}
                    {f.kind === "select" && (
                      <select id={id} className={`${inputCls} ${isMissing ? "border-amber-500 ring-1 ring-amber-400" : ""}`} value={(v as string | null) ?? ""} onChange={(e) => set(f.key, e.target.value === "" ? null : e.target.value)}>
                        <option value="">— not stated —</option>
                        {f.options!.map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    )}
                    {f.kind === "tri" && (
                      <select id={id} className={inputCls} value={v === null ? "" : v ? "yes" : "no"} onChange={(e) => set(f.key, e.target.value === "" ? null : e.target.value === "yes")}>
                        <option value="">Unknown / not stated</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      {profile.assumptions.length > 0 && (
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          <p className="mb-1 font-semibold">Assumptions I made (edit the fields above if wrong)</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {profile.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {errors.length > 0 && (
        <ul role="alert" className="mt-3 list-disc rounded-lg bg-rose-50 p-3 pl-7 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          disabled={saving || disabled || dirtyKeys.length === 0}
          onClick={() => run(onSave)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800"
        >
          Save edits
        </button>
        <button
          type="button"
          disabled={saving || disabled || missing.length > 0}
          title={missing.length ? "Fill in the required fields first" : undefined}
          onClick={() => run(onConfirm)}
          className="rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Confirm &amp; research
        </button>
      </div>
    </section>
  );
}
