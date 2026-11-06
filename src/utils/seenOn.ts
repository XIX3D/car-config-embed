import { carFamily } from "./carFamily";

/*
 * "Suggested for <car>": the wheels the brands photographed on each car family, most photos first.
 * The studio's own index (seen-on.json: car family to our wheel ids with photo counts) is read once
 * from render.xix3d.com. Only ids and counts, never a photo. It is asked for when a car is known
 * (after the first render's vehicle_detected), not on page load.
 */
const URL_ = "https://render.xix3d.com/seen-on.json";

interface Doc {
  cars: Record<string, { n: string; p: number; w: [number[], number][] }>;
  makes?: Record<string, string>;
}

export interface Car {
  make?: string;
  model?: string;
  year?: string;
}

let doc: Doc | null = null;
let asking: Promise<Doc | null> | null = null;

export function loadSeenOn(): Promise<Doc | null> {
  if (doc) return Promise.resolve(doc);
  if (!asking) {
    asking = fetch(URL_)
      .then((r) => (r.ok ? (r.json() as Promise<Doc>) : null))
      .then((d) => {
        doc = d?.cars ? d : null;
        if (!doc) asking = null;

        return doc;
      })
      .catch(() => {
        asking = null;

        return null;
      });
  }

  return asking;
}

/** The car's name as the index spells it ("Ferrari F8"), or null when the car is not in it. */
export function carName(car: Car | null | undefined): string | null {
  const k = carFamily(car?.make, car?.model, doc?.makes);

  return (k && doc?.cars[k]?.n) || null;
}

/** Wheels photographed on this car, most photos first, as the first id `has` accepts. */
export function seenOn(car: Car | null | undefined, has: (id: number) => boolean, limit = 12): { id: number; photos: number }[] {
  const k = carFamily(car?.make, car?.model, doc?.makes);
  const e = k ? doc?.cars[k] : undefined;

  if (!e) return [];
  const out: { id: number; photos: number }[] = [];

  for (const [ids, photos] of e.w) {
    const id = ids.find(has);

    if (id != null && !out.some((o) => o.id === id)) out.push({ id, photos });
    if (out.length >= limit) break;
  }

  return out;
}
