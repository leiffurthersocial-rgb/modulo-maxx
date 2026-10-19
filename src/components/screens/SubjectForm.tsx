"use client";

import { useState } from "react";
import { BUILDS, getBuild } from "@/lib/builds";
import type { Subject } from "@/lib/state";
import { Button, Screen, SegmentedToggle } from "../ui";

const CM_PER_IN = 2.54;
const KG_PER_LB = 0.45359237;
const HEIGHT_RANGE = [120, 230] as const;
const WEIGHT_RANGE = [35, 250] as const;

const num = (s: string) => (s.trim() === "" ? undefined : Number(s.replace(",", ".")));
const str = (x: number | undefined, digits = 0) => (x === undefined ? "" : String(+x.toFixed(digits)));

function toFtIn(cm: number | undefined): { ft: string; inch: string } {
  if (cm === undefined) return { ft: "", inch: "" };
  const total = Math.round(cm / CM_PER_IN);
  return { ft: String(Math.floor(total / 12)), inch: String(total % 12) };
}

function Unit({ unit, children }: { unit: string; children: React.ReactNode }) {
  return (
    <div className="relative w-full">
      {children}
      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted">{unit}</span>
    </div>
  );
}

const inputCls =
  "h-14 w-full rounded-xl border border-line bg-transparent px-4 text-xl outline-none focus:border-accent placeholder:text-muted/60";

export function SubjectForm({ subject, onDone, top }: { subject: Subject; onDone: (s: Subject) => void; top: React.ReactNode }) {
  const [name, setName] = useState(subject.name);
  const [heightUnit, setHeightUnit] = useState(subject.heightUnit);
  const [weightUnit, setWeightUnit] = useState(subject.weightUnit);
  const [cm, setCm] = useState(str(subject.heightCm));
  const [{ ft, inch }, setFtIn] = useState(toFtIn(subject.heightCm));
  const [kg, setKg] = useState(str(subject.weightKg));
  const [lb, setLb] = useState(str(subject.weightKg === undefined ? undefined : subject.weightKg / KG_PER_LB));
  const [buildIndex, setBuildIndex] = useState(BUILDS.indexOf(getBuild(subject.buildId)));

  const heightCm = (() => {
    if (heightUnit === "cm") return num(cm);
    const f = num(ft);
    const i = num(inch);
    if (f === undefined && i === undefined) return undefined;
    return ((f ?? 0) * 12 + (i ?? 0)) * CM_PER_IN;
  })();
  const weightKg = (() => {
    const w = weightUnit === "kg" ? num(kg) : num(lb);
    return w === undefined ? undefined : weightUnit === "kg" ? w : w * KG_PER_LB;
  })();

  const heightBad = heightCm !== undefined && !(heightCm >= HEIGHT_RANGE[0] && heightCm <= HEIGHT_RANGE[1]);
  const weightBad = weightKg !== undefined && !(weightKg >= WEIGHT_RANGE[0] && weightKg <= WEIGHT_RANGE[1]);

  function switchHeight(u: Subject["heightUnit"]) {
    if (u === heightUnit) return;
    if (u === "ftin") setFtIn(toFtIn(heightCm));
    else setCm(str(heightCm));
    setHeightUnit(u);
  }
  function switchWeight(u: Subject["weightUnit"]) {
    if (u === weightUnit) return;
    if (u === "lb") setLb(str(weightKg === undefined ? undefined : weightKg / KG_PER_LB));
    else setKg(str(weightKg));
    setWeightUnit(u);
  }

  const build = BUILDS[buildIndex];

  return (
    <Screen top={top}>
      <h1 className="text-4xl font-semibold tracking-tight">About him</h1>

      <div className="mt-8 flex flex-col gap-8">
        <label className="block">
          <span className="mb-2 block text-sm text-muted">Name (optional)</span>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" maxLength={40} />
        </label>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-muted">Height</span>
            <SegmentedToggle
              label="Height unit"
              value={heightUnit}
              onChange={switchHeight}
              options={[
                { value: "cm", label: "cm" },
                { value: "ftin", label: "ft / in" },
              ]}
            />
          </div>
          {heightUnit === "cm" ? (
            <Unit unit="cm">
              <input
                className={inputCls}
                inputMode="decimal"
                placeholder="178"
                value={cm}
                onChange={(e) => setCm(e.target.value)}
                aria-label="Height in cm"
              />
            </Unit>
          ) : (
            <div className="flex gap-3">
              <Unit unit="ft">
                <input
                  className={inputCls}
                  inputMode="numeric"
                  placeholder="5"
                  value={ft}
                  onChange={(e) => setFtIn({ ft: e.target.value, inch })}
                  aria-label="Feet"
                />
              </Unit>
              <Unit unit="in">
                <input
                  className={inputCls}
                  inputMode="numeric"
                  placeholder="10"
                  value={inch}
                  onChange={(e) => setFtIn({ ft, inch: e.target.value })}
                  aria-label="Inches"
                />
              </Unit>
            </div>
          )}
          {heightBad && <p className="mt-2 text-sm text-accent">That height looks off.</p>}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-muted">Weight</span>
            <SegmentedToggle
              label="Weight unit"
              value={weightUnit}
              onChange={switchWeight}
              options={[
                { value: "kg", label: "kg" },
                { value: "lb", label: "lb" },
              ]}
            />
          </div>
          <Unit unit={weightUnit}>
            <input
              className={inputCls}
              inputMode="decimal"
              placeholder={weightUnit === "kg" ? "78" : "172"}
              value={weightUnit === "kg" ? kg : lb}
              onChange={(e) => (weightUnit === "kg" ? setKg(e.target.value) : setLb(e.target.value))}
              aria-label={`Weight in ${weightUnit}`}
            />
          </Unit>
          {weightBad && <p className="mt-2 text-sm text-accent">That weight looks off.</p>}
        </div>

        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-sm text-muted">Build</span>
            <span className="text-xl font-medium">{build.label}</span>
          </div>
          <input
            type="range"
            min={0}
            max={BUILDS.length - 1}
            step={1}
            value={buildIndex}
            onChange={(e) => setBuildIndex(Number(e.target.value))}
            aria-label="Build"
            aria-valuetext={build.label}
            className="w-full accent-[var(--accent)]"
          />
          <div className="mt-1 flex justify-between px-[7px]" aria-hidden>
            {BUILDS.map((b, i) => (
              <span key={b.id} className={`h-2 w-px ${i === buildIndex ? "bg-accent" : "bg-muted"}`} />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted" aria-hidden>
            <span>{BUILDS[0].label}</span>
            <span>{BUILDS[BUILDS.length - 1].label}</span>
          </div>
        </div>
      </div>

      <div className="mt-auto pt-10">
        <Button
          disabled={heightBad || weightBad}
          onClick={() =>
            onDone({
              name: name.trim(),
              heightCm: heightCm && !heightBad ? Math.round(heightCm * 10) / 10 : undefined,
              weightKg: weightKg && !weightBad ? Math.round(weightKg * 10) / 10 : undefined,
              buildId: build.id,
              heightUnit,
              weightUnit,
            })
          }
        >
          Continue
        </Button>
      </div>
    </Screen>
  );
}
