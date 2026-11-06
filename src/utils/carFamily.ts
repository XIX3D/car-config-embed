/*
  Copied from the studio (src/lib/carFamily.ts): the same rule, so a car is the same family here.
  ONE CAR, ONE NAME, WHEREVER IT IS LOOKED UP. "F-150 Raptor" and "F-150" are
  both the F-150, "911 GT3" and "Turbo S" are both the 911, a G 63 is a G-Class.
  First written for "Seen on the <car>" (seenOn.ts, whose family rule mirrors the
  gallery builder's table: change both together); History's search reads the
  same table (CD, 16 October: "'f150' ... in one box"), so a dealer's typing and
  the gallery agree about what a car is. No imports: a check runs it under node.
*/

export const normCar = (s?: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")

const TWO = new Set(["model", "range", "grand", "land", "sierra", "super", "new"])

/** Per make: the first model words that fold into one family, and that family. */
export const FAMILY_ALIAS: Record<string, [Set<string>, string]> = {
  porsche: [new Set(["gt3", "gt3rs", "gt2", "gt2rs", "turbo", "turbos", "tts", "carrera", "targa", "992", "991", "997", "996", "993", "gts", "sportclassic", "dakar", "s"]), "911"],
  chevrolet: [new Set(["z06", "zr1", "stingray", "c8", "c7", "c6", "z51", "eray"]), "corvette"],
  ford: [new Set(["raptor"]), "f150"],
  mercedesbenz: [new Set(["g550", "g63", "g500", "g55", "gwagon", "gwagen", "gclass", "g"]), "gclass"],
}

/** How a family folded by an alias is written (the others take the model's own words). */
export const FAMILY_NAME: Record<string, string> = {
  "porsche|911": "911",
  "chevrolet|corvette": "Corvette",
  "ford|f150": "F-150",
  "mercedesbenz|gclass": "G-Class",
}

/** The ways a make is typed, to the make as the garage writes it (normalised). */
export const MAKE_ALIAS: Record<string, string> = {
  chevy: "chevrolet",
  merc: "mercedesbenz",
  mercedes: "mercedesbenz",
  benz: "mercedesbenz",
  mb: "mercedesbenz",
  vw: "volkswagen",
  bimmer: "bmw",
  beemer: "bmw",
  lambo: "lamborghini",
  landy: "landrover",
  caddy: "cadillac",
}

/** "make|family" for a car, or null when either half is missing.
 *  `makes` folds a make's other spellings (seen-on.json carries the gallery's). */
export function carFamily(makeIn?: string, model?: string, makes?: Record<string, string>): string | null {
  let make = normCar(makeIn)
  make = makes?.[make] ?? MAKE_ALIAS[make] ?? make
  let toks = (model ?? "").replace(/\(.*?\)/g, " ").split(/[\s/]+/).filter(Boolean)
  if (toks.length && normCar(toks[0]) === make) toks = toks.slice(1)
  if (make === "dodge" && toks.length && normCar(toks[0]) === "ram") {
    make = "ram"
    toks = toks.slice(1)
  }
  if (!make || !toks.length) return null
  const al = FAMILY_ALIAS[make]
  if (al && (al[0].has(normCar(toks[0])) || al[0].has(normCar(toks.slice(0, 2).join(""))))) return `${make}|${al[1]}`
  const fam = TWO.has(normCar(toks[0])) && toks.length > 1 ? toks.slice(0, 2) : toks.slice(0, 1)
  return `${make}|${normCar(fam.join(" "))}`
}

/** The family's own words for a screen: "F-150", "G-Class", "Model Y", "Range Rover". */
export function familyLabel(family: string, model?: string): string {
  const named = FAMILY_NAME[family]
  if (named) return named
  const toks = (model ?? "").replace(/\(.*?\)/g, " ").split(/[\s/]+/).filter(Boolean)
  return (TWO.has(normCar(toks[0])) && toks.length > 1 ? toks.slice(0, 2) : toks.slice(0, 1)).join(" ")
}
