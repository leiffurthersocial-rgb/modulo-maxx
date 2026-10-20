"use client";

import { useRef, useState } from "react";
import { downscale } from "@/lib/mog";
import { BUILDS, getBuild } from "@/lib/builds";
import type { Subject } from "@/lib/state";
import { BodyFigure } from "../BodyFigure";
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
  const [buildId, setBuildId] = useState(getBuild(subject.buildId).id);
  const [photo, setPhoto] = useState(subject.photo);
  const [photoError, setPhotoError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoError(false);
    try {
      setPhoto(await downscale(file, 480));
    } catch {
      setPhotoError(true);
    }
  }

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

  const build = getBuild(buildId);

  return (
    <Screen top={top}>
      <h1 className="text-4xl font-semibold tracking-tight">About him</h1>

      <div className="mt-8 flex flex-col gap-8">
        <div>
          <span className="mb-2 block text-sm text-muted">Photo (optional)</span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-24 shrink-0 overflow-hidden rounded-xl border border-dashed border-line text-sm text-muted"
              aria-label={photo ? "Change photo" : "Add photo"}
            >
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="" className="aspect-[4/5] w-full object-cover object-[50%_25%]" />
              ) : (
                <div className="flex aspect-[4/5] items-center justify-center">+ Photo</div>
              )}
            </button>
            <p className="text-sm text-muted">
              Shows his photo next to each celeb for a side-by-side comparison. It stays on this device.
              {photo && (
                <>
                  {" "}
                  <button type="button" className="underline underline-offset-4" onClick={() => setPhoto(undefined)}>
                    Remove
                  </button>
                </>
              )}
            </p>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} />
          {photoError && <p className="mt-2 text-sm text-accent">Couldn&apos;t read that image. Try another one.</p>}
        </div>

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
            <span className="text-sm text-muted">Body type</span>
            <span className="text-xl font-medium">{build.label}</span>
          </div>
          <div role="radiogroup" aria-label="Body type" className="grid grid-cols-5 gap-2">
            {BUILDS.map((b) => {
              const on = b.id === buildId;
              return (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={b.label}
                  onClick={() => setBuildId(b.id)}
                  className={`flex flex-col items-center rounded-xl border px-1 pb-1.5 pt-2 transition-colors ${
                    on ? "border-accent text-accent" : "border-line text-muted hover:text-fg"
                  }`}
                >
                  <BodyFigure shape={b.shape} className="aspect-[4/5] w-full" />
                  <span className="mt-1 text-[11px] leading-tight">{b.label}</span>
                </button>
              );
            })}
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
              photo,
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
