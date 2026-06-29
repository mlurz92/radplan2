export const WORKPLACES = [
  { code: "MR", label: "MRT", bg: "#DBEAFE", fg: "#1D4ED8" },
  { code: "CT", label: "CT", bg: "#FFEDD5", fg: "#C2410C" },
  { code: "US", label: "Sonographie", bg: "#CCFBF1", fg: "#0F766E" },
  { code: "AN", label: "Angiographie", bg: "#F3E8FF", fg: "#7E22CE" },
  { code: "MA", label: "Mammographie", bg: "#FCE7F3", fg: "#BE185D" },
  { code: "KUS", label: "Kinder-US", bg: "#DCFCE7", fg: "#15803D" },
  { code: "W", label: "Wermsdorf", bg: "#FEF9C3", fg: "#854D0E" },
  { code: "T", label: "Teleradiologie", bg: "#E0E7FF", fg: "#3730A3" },
];

export const STATUSES = [
  { code: "F", label: "Frei", bg: "#F1F5F9", fg: "#475569" },
  { code: "U", label: "Urlaub", bg: "#EDE9FE", fg: "#5B21B6" },
  { code: "ZU", label: "Zusatzurlaub", bg: "#DDD6FE", fg: "#4C1D95" },
  { code: "SU", label: "Sonderurlaub", bg: "#C4B5FD", fg: "#2E1065" },
  { code: "FZA", label: "FZA", bg: "#E0E7FF", fg: "#3730A3" },
  { code: "K", label: "Krank", bg: "#FEE2E2", fg: "#991B1B" },
  { code: "KK", label: "Kind Krank", bg: "#FECACA", fg: "#7F1D1D" },
  { code: "§15c", label: "§15c", bg: "#CFFAFE", fg: "#155E75" },
  { code: "WB", label: "Weiterbildung", bg: "#FEF3C7", fg: "#78350F" },
];

export const CODE_MAP = {};
[...WORKPLACES, ...STATUSES].forEach((x) => {
  CODE_MAP[x.code] = x;
});

export const RBN_ROW_KEY = "__RBN_NEURORAD__";
export const RBN_ROW_LABEL = "RD Neurorad";
export const RBN_ROW_START = { year: 2025, month: 5 };

export const RBN_OPTIONS = [
  "Prof. Schob (NRAD)",
  "Dr. Maybaum (NRAD)",
  "Dr. Bailis (NRAD)",
  "Dr. Schüngel (NRAD)",
  "Fr. Dalitz (RAD)",
  "Fr. Thaler (RAD)",
  "Dr. Martin (RAD)",
  "Hr. El Houba (RAD)",
];

export const RBN_THALER_LAST_MONTH = { year: 2026, month: 2 };

export const EMPLOYEE_DEPARTURES = {
  // month ist 0-basiert und markiert den ERSTEN Monat OHNE die Person.
  // Fr. Thaler hat die Abteilung zum 1.4.2026 verlassen → ab April (m=3) inaktiv.
  "Fr. Thaler": { year: 2026, month: 3, reason: "ausgeschieden" },
  // Hr. Torki hat die Abteilung zum 1.7.2026 verlassen → ab Juli (m=6) inaktiv.
  "Hr. Torki": { year: 2026, month: 6, reason: "gekündigt" },
};

export function isEmployeeActiveInMonth(name, y, m) {
  const departure = EMPLOYEE_DEPARTURES[name];
  if (!departure) return true;
  return y < departure.year || (y === departure.year && m < departure.month);
}

export function reconcileEmployeesForMonth(md, y, m) {
  if (!md || typeof md !== "object") return false;

  let changed = false;

  if (Array.isArray(md.employees)) {
    const activeEmployees = md.employees.filter((emp) => isEmployeeActiveInMonth(emp, y, m));
    changed = activeEmployees.length !== md.employees.length;
    md.employees = activeEmployees;
  }

  if (md.assignments && typeof md.assignments === "object") {
    Object.keys(md.assignments).forEach((emp) => {
      if (!isEmployeeActiveInMonth(emp, y, m)) {
        delete md.assignments[emp];
        changed = true;
      }
    });
  }

  if (md.comments && typeof md.comments === "object") {
    Object.keys(md.comments).forEach((emp) => {
      if (!isEmployeeActiveInMonth(emp, y, m)) {
        delete md.comments[emp];
        changed = true;
      }
    });
  }

  return changed;
}

export function formatRbnDisplay(name) {
  if (!name) return "";
  const match = name.match(/(?:Prof\.|Dr\.|Fr\.|Hr\.)?\s*([A-ZÄÖÜ][a-zäöüß]+)/);
  return match ? match[1] : name;
}

export function getRbnOptionsForDate(y, m) {
  const allowThaler =
    y < RBN_THALER_LAST_MONTH.year ||
    (y === RBN_THALER_LAST_MONTH.year && m <= RBN_THALER_LAST_MONTH.month);
  
  if (allowThaler) {
    return [...RBN_OPTIONS];
  }
  
  return RBN_OPTIONS.filter((opt) => opt !== "Fr. Thaler (RAD)");
}

export const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"
];

export const MONTHS_SHORT = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"
];

export const DOW_ABBR = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
export const DOW_LONG = [
  "Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"
];

export const STORAGE_KEY = "radplan_v3";
export const ABSENCE_CODES = ["U", "ZU", "SU", "FZA", "K", "KK", "§15c", "WB"];
export const VACATION_CODES = ["U", "ZU", "SU", "§15c"];
// "Urlaubsähnliche" Codes: echter Urlaub plus Freizeitausgleich (FZA) und
// Weiterbildung (WB). Wird für die Sperre "kein Dienst am Tag vor Urlaub"
// herangezogen, damit auch urlaubsähnliche Folgetage einen Dienst blockieren.
export const VACATION_LIKE_CODES = [...VACATION_CODES, "FZA", "WB"];

export const WISH_TYPES = [
  {
    code: "NO_DUTY",
    label: "Kein Dienst",
    icon: "✗",
    bg: "#FEE2E2",
    fg: "#991B1B",
    border: "#FCA5A5",
  },
  {
    code: "BD_WISH",
    label: "BD Wunsch",
    icon: "D",
    bg: "#FEE2E2",
    fg: "#B91C1C",
    border: "#F87171",
  },
  {
    code: "HG_WISH",
    label: "HG Wunsch",
    icon: "H",
    bg: "#E0F2FE",
    fg: "#0369A1",
    border: "#7DD3FC",
  },
];

export const WISH_MAP = {};
WISH_TYPES.forEach((w) => {
  WISH_MAP[w.code] = w;
});

export const EMP_META = {
  "Prof. Schäfer": {
    fullName: "Prof. Dr. Arnd-Oliver Schäfer",
    position: "CA",
    posLabel: "Chefarzt",
    type: "FA für Radiologie",
    area: "",
    deputy: "Dr. Lurz",
    since: 2018,
    fte: 100,
    phone: "4001",
    tags: ["Radiologie", "Interventionelle Radiologie", "MRT", "CT"],
  },
  "Dr. Lurz": {
    fullName: "Dr. med. Markus Lurz",
    position: "LOA",
    posLabel: "Leitender Oberarzt",
    type: "FA für Radiologie",
    area: "MRT · Röntgen KV",
    deputy: "Prof. Schäfer / Dr. Polednia",
    since: 2015,
    fte: 100,
    phone: "4002",
    tags: ["Radiologie", "MRT", "Röntgen KV"],
  },
  "Dr. Polednia": {
    fullName: "Dr. med. Alexander Polednia",
    position: "OA",
    posLabel: "Oberarzt",
    type: "FA für Radiologie · Kinderradiologie",
    area: "Leiter Kinderradiologie",
    deputy: "",
    since: 2016,
    fte: 100,
    phone: "4003",
    tags: ["Radiologie", "Kinderradiologie", "Sonographie"],
  },
  "Fr. Dalitz": {
    fullName: "Bettina Dalitz",
    position: "OÄ",
    posLabel: "Oberärztin",
    type: "FÄ für Radiologie · Neuroradiologie",
    area: "Leiterin Mammographie",
    deputy: "",
    since: 2017,
    fte: 100,
    phone: "4004",
    tags: ["Radiologie", "Neuroradiologie", "Mammographie"],
  },
  "Fr. Thaler": {
    fullName: "Fr. Thaler",
    position: "FÄ",
    posLabel: "Fachärztin",
    type: "FÄ für Radiologie",
    area: "",
    deputy: "",
    since: 2020,
    fte: 100,
    phone: "4005",
    tags: ["Radiologie"],
  },
  "Dr. Becker": {
    fullName: "Dr. med. Juliane Becker",
    position: "OÄ",
    posLabel: "Oberärztin",
    type: "FÄ für Radiologie · FÄ für Nuklearmedizin",
    area: "CT",
    deputy: "Dr. Martin",
    since: 2019,
    fte: 100,
    phone: "4006",
    tags: ["Radiologie", "Nuklearmedizin", "CT"],
  },
  "Dr. Martin": {
    fullName: "Dr. med. Arno Martin",
    position: "FA",
    posLabel: "Facharzt",
    type: "FA für Radiologie",
    area: "",
    deputy: "",
    since: 2021,
    fte: 100,
    phone: "4007",
    tags: ["Radiologie"],
  },
  "Hr. El Houba": {
    fullName: "Abdelilah El Houba",
    position: "AA",
    posLabel: "Assistenzarzt",
    type: "AA für Radiologie",
    area: "",
    deputy: "",
    since: 2022,
    fte: 100,
    phone: "4008",
    tags: ["Radiologie (WB)"],
  },
  "Fr. Licenji": {
    fullName: "Johanna Licenji",
    position: "AÄ",
    posLabel: "Assistenzärztin",
    type: "AÄ für Radiologie",
    area: "",
    deputy: "",
    since: 2023,
    fte: 100,
    phone: "4009",
    tags: ["Radiologie (WB)"],
  },
  "Hr. Torki": {
    fullName: "Mohamed Torki",
    position: "AA",
    posLabel: "Assistenzarzt",
    type: "AA für Radiologie",
    area: "",
    deputy: "",
    since: 2023,
    fte: 100,
    phone: "4010",
    tags: ["Radiologie (WB)"],
  },
  "Hr. Sebastian": {
    fullName: "Ron Sebastian",
    position: "AA",
    posLabel: "Assistenzarzt",
    type: "AA für Radiologie",
    area: "",
    deputy: "",
    since: 2024,
    fte: 100,
    phone: "4011",
    tags: ["Radiologie (WB)"],
  },
  "Dr. Placzek": {
    fullName: "Dr. Placzek",
    position: "OA",
    posLabel: "Oberarzt",
    type: "FA für Radiologie",
    area: "CT",
    deputy: "",
    since: 2022,
    fte: 100,
    phone: "",
    tags: ["Radiologie", "CT"],
  },
  "Hr. Krzykowski": {
    fullName: "Hr. Krzykowski",
    position: "FA",
    posLabel: "Facharzt",
    type: "FA für Radiologie",
    area: "",
    deputy: "",
    since: 2022,
    fte: 100,
    phone: "",
    tags: ["Radiologie"],
  },
  "Fr. Stöckel": {
    fullName: "Fr. Stöckel",
    position: "FÄ",
    posLabel: "Fachärztin",
    type: "FÄ für Radiologie · Kinderradiologie",
    area: "Kinderradiologie",
    deputy: "",
    since: 2022,
    fte: 100,
    phone: "",
    tags: ["Radiologie", "Kinderradiologie"],
  },
  "Hr. Zill": {
    fullName: "Hr. Zill",
    position: "FA",
    posLabel: "Facharzt",
    type: "FA für Radiologie",
    area: "",
    deputy: "",
    since: 2022,
    fte: 100,
    phone: "",
    tags: ["Radiologie"],
  },
  "Fr. Apitz": {
    fullName: "Fr. Apitz",
    position: "AÄ",
    posLabel: "Assistenzärztin",
    type: "AÄ für Radiologie",
    area: "",
    deputy: "",
    since: 2024,
    fte: 100,
    phone: "",
    tags: ["Radiologie (WB)"],
  },
  "Dr. Fröhlich": {
    fullName: "Dr. Fröhlich",
    position: "AÄ",
    posLabel: "Assistenzärztin",
    type: "AÄ für Radiologie",
    area: "",
    deputy: "",
    since: 2024,
    fte: 100,
    phone: "",
    tags: ["Radiologie (WB)"],
  },
  "Dr. Gazis": {
    fullName: "Dr. Gazis",
    position: "LOA",
    posLabel: "Leitender Oberarzt",
    type: "FA für Radiologie · Neuroradiologie",
    area: "Neuroradiologie",
    deputy: "",
    since: 2020,
    fte: 100,
    phone: "",
    tags: ["Radiologie", "Neuroradiologie"],
  },
  "Hr. Faragallah": {
    fullName: "Hr. Faragallah",
    position: "AA",
    posLabel: "Assistenzarzt",
    type: "AA für Radiologie",
    area: "",
    deputy: "",
    since: 2024,
    fte: 100,
    phone: "",
    tags: ["Radiologie (WB)"],
  },
  "Dr. Meisel": {
    fullName: "Dr. Meisel",
    position: "AA",
    posLabel: "Assistenzarzt",
    type: "AA für Radiologie",
    area: "",
    deputy: "",
    since: 2024,
    fte: 100,
    phone: "",
    tags: ["Radiologie (WB)"],
  },
  "Dr. Melzer": {
    fullName: "Dr. Melzer",
    position: "AA",
    posLabel: "Assistenzarzt",
    type: "AA für Radiologie",
    area: "",
    deputy: "",
    since: 2024,
    fte: 100,
    phone: "",
    tags: ["Radiologie (WB)"],
  },
  "Fr. Koumasi": {
    fullName: "Fr. Koumasi",
    position: "AÄ",
    posLabel: "Assistenzärztin",
    type: "AÄ für Radiologie",
    area: "",
    deputy: "",
    since: 2024,
    fte: 100,
    phone: "",
    tags: ["Radiologie (WB)"],
  },
};

// Optionale Rollen-Overrides für Personen, die (noch) keinen EMP_META-Eintrag
// haben. Konfigurierbar als { "Name": "FA" | "AA" }. Leer per Default; ohne
// Eintrag gilt der dokumentierte Fallback (siehe isAssistenzarzt: AA).
export const EMP_ROLE_OVERRIDES = {};

const FA_POSITIONS = ["CA", "LOA", "OA", "OÄ", "FA", "FÄ"];
const AA_POSITIONS = ["AA", "AÄ"];

export function isFacharzt(empName) {
  const override = EMP_ROLE_OVERRIDES[empName];
  if (override) return FA_POSITIONS.includes(override) || override === "FA";
  const m = EMP_META[empName];
  if (m) {
    return FA_POSITIONS.includes(m.position);
  }
  return false;
}

export function isAssistenzarzt(empName) {
  const override = EMP_ROLE_OVERRIDES[empName];
  if (override) return AA_POSITIONS.includes(override) || override === "AA";
  const m = EMP_META[empName];
  if (m) {
    return AA_POSITIONS.includes(m.position);
  }
  return true;
}

// Liefert true, wenn für die Person weder EMP_META noch ein Rollen-Override
// existiert. Solche Personen werden vom Planer als AA behandelt (Fallback) und
// sollten in den Stammdaten ergänzt werden.
export function hasKnownRole(empName) {
  return !!(EMP_ROLE_OVERRIDES[empName] || EMP_META[empName]);
}

/**
 * Zentrale, datengetriebene Konfiguration aller personen- und paarbezogenen
 * Sonderregeln. Ersetzt die früher über den Algorithmus verstreuten
 * namentlichen Sonderfälle (Empfehlung §9 der Algorithmus-Kriterien).
 */
export const SPECIAL_RULES = {
  // Komplett dienstbefreite Personen (BD-Ziel 0).
  dutyExempt: ["Prof. Schäfer"],
  // Reduzierte Standard-BD-Ziele (sonst Default 4).
  reducedBdTarget: { "Dr. Polednia": 3, "Dr. Becker": 3, "Hr. Sebastian": 3 },
  // Wochentage (0=So…6=Sa), an denen die Person keinen D leisten darf.
  noBdWeekdays: { "Dr. Polednia": [0, 2, 4] },
  // Wochentage, an denen die Person keinen HG übernehmen darf, WENN der
  // BD-Halter desselben Tages ein AA ist (harte Sperre).
  noHgFromAaWeekdays: { "Dr. Polednia": [0, 2, 4] },
  // Reihenfolge der Personen, die einen unvermeidbaren Überhang-Dienst
  // (Dienst über dem eigenen Monatsziel hinaus) bevorzugt absorbieren, WENN
  // alle BD bereits gleichmäßig und fair am Ziel verteilt sind und keine
  // Wünsche etwas anderes erzwingen. Dr. Lurz erhält damit als Erster einen
  // fünften Dienst, bevor jemand anderes über das Ziel hinaus belastet wird.
  surplusBdPreference: ["Dr. Lurz"],
  // Personen, die Samstags-D nur als Ultima Ratio (im gelockerten Modus)
  // bekommen und nach einem Samstags-D zwingend einen FZA-Tag erhalten.
  saturdayUltimaRatio: ["Dr. Becker"],
  saturdayFzaCompensation: ["Dr. Becker"],
  // Gegenseitiges Vertretungspaar (CT-Leitung): nie gleichzeitig abwesend/F
  // an Werktagen.
  ctLeadershipPairs: [["Dr. Becker", "Dr. Martin"]],
  // HG-Konfliktpaare: Person darf an den genannten Wochentagen keinen HG
  // übernehmen, wenn einer der conflictBd-Personen den BD desselben Tages hat.
  hgConflictRules: [
    {
      person: "Fr. Dalitz",
      weekdays: [0, 1],
      conflictBd: ["Hr. Torki", "Hr. Sebastian"],
    },
  ],
};

export function getReducedBdTarget(empName) {
  return SPECIAL_RULES.reducedBdTarget[empName];
}

export function isNoBdWeekday(empName, wd) {
  return (SPECIAL_RULES.noBdWeekdays[empName] || []).includes(wd);
}

export function isNoHgFromAaWeekday(empName, wd) {
  return (SPECIAL_RULES.noHgFromAaWeekdays[empName] || []).includes(wd);
}

export function isSaturdayUltimaRatio(empName) {
  return SPECIAL_RULES.saturdayUltimaRatio.includes(empName);
}

// Liefert den 0-basierten Rang einer Person in der Überhang-Präferenzliste
// (0 = erste Wahl für einen unvermeidbaren Dienst über dem Monatsziel), oder
// -1, wenn die Person nicht bevorzugt überhang-belastet werden soll.
export function getSurplusBdPreferenceRank(empName) {
  return (SPECIAL_RULES.surplusBdPreference || []).indexOf(empName);
}

export function needsSaturdayFza(empName) {
  return SPECIAL_RULES.saturdayFzaCompensation.includes(empName);
}

export function getCtLeadershipPartner(empName) {
  for (const pair of SPECIAL_RULES.ctLeadershipPairs) {
    if (pair[0] === empName) return pair[1];
    if (pair[1] === empName) return pair[0];
  }
  return null;
}

// Liefert für eine HG-Vergabe (Person/Wochentag) die Liste der BD-Halter-Namen,
// die diesen HG verbieten würden, oder null wenn keine Regel greift.
export function getHgConflictBd(empName, wd) {
  for (const rule of SPECIAL_RULES.hgConflictRules) {
    if (rule.person === empName && rule.weekdays.includes(wd)) {
      return rule.conflictBd;
    }
  }
  return null;
}

export function getEmpMeta(name) {
  return (
    EMP_META[name] || {
      fullName: name,
      position: "—",
      posLabel: "—",
      type: "—",
      area: "",
      deputy: "",
    }
  );
}

export function posColor(pos) {
  const m = {
    CA: { bg: "#F3E8FF", fg: "#7E22CE", border: "#A855F7" },
    LOA: { bg: "#DBEAFE", fg: "#1D4ED8", border: "#3B82F6" },
    OA: { bg: "#CCFBF1", fg: "#0F766E", border: "#14B8A6" },
    OÄ: { bg: "#CCFBF1", fg: "#0F766E", border: "#14B8A6" },
    FA: { bg: "#DCFCE7", fg: "#15803D", border: "#22C55E" },
    FÄ: { bg: "#DCFCE7", fg: "#15803D", border: "#22C55E" },
    AA: { bg: "#F1F5F9", fg: "#475569", border: "#94A3B8" },
    AÄ: { bg: "#F1F5F9", fg: "#475569", border: "#94A3B8" },
  };
  return m[pos] || { bg: "#F1F5F9", fg: "#475569", border: "#CBD5E1" };
}

export const pad2 = (n) => String(n).padStart(2, "0");

export const dateKey = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;

export const monthKey = (y, m) => `${y}-${m}`;

export const prevMK = (y, m) => (m === 0 ? `${y - 1}-11` : `${y}-${m - 1}`);

export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

export const isRbnMonthVisible = (y, m) => {
  return y > RBN_ROW_START.year || (y === RBN_ROW_START.year && m >= RBN_ROW_START.month);
};

export function normalizeMonthDataShape(md) {
  if (!md || typeof md !== "object") return;
  if (!Array.isArray(md.employees)) md.employees = [];
  if (!md.assignments || typeof md.assignments !== "object") md.assignments = {};
  if (!md.rbn || typeof md.rbn !== "object") md.rbn = {};
  if (!md.comments || typeof md.comments !== "object") md.comments = {};
}

export const weekday = (y, m, d) => new Date(y, m, d).getDay();

export const isWeekend = (y, m, d) => {
  const w = weekday(y, m, d);
  return w === 0 || w === 6;
};

export const isFriday = (y, m, d) => weekday(y, m, d) === 5;

export function easterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m2 = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m2 + 114) / 31);
  const dy = ((h + l - 7 * m2 + 114) % 31) + 1;
  
  return new Date(year, mo - 1, dy);
}

export const addDays = (dt, n) => {
  const d = new Date(dt);
  d.setDate(d.getDate() + n);
  return d;
};

export const dateToDK = (dt) => dateKey(dt.getFullYear(), dt.getMonth(), dt.getDate());

export function getSaxonyHolidays(year) {
  const e = easterDate(year);
  const nov22 = new Date(year, 10, 22);
  while (nov22.getDay() !== 3) {
    nov22.setDate(nov22.getDate() - 1);
  }
  
  return {
    [dateKey(year, 0, 1)]: "Neujahr",
    [dateToDK(addDays(e, -2))]: "Karfreitag",
    [dateToDK(addDays(e, 1))]: "Ostermontag",
    [dateKey(year, 4, 1)]: "Tag der Arbeit",
    [dateToDK(addDays(e, 39))]: "Christi Himmelfahrt",
    [dateToDK(addDays(e, 50))]: "Pfingstmontag",
    [dateKey(year, 9, 3)]: "Tag der Deutschen Einheit",
    [dateKey(year, 9, 31)]: "Reformationstag",
    [dateToDK(nov22)]: "Buß- und Bettag",
    [dateKey(year, 11, 25)]: "1. Weihnachtstag",
    [dateKey(year, 11, 26)]: "2. Weihnachtstag",
  };
}

const HOLIDAY_CACHE = new Map();

export function getSaxonyHolidaysCached(year) {
  if (!HOLIDAY_CACHE.has(year)) {
    HOLIDAY_CACHE.set(year, getSaxonyHolidays(year));
  }
  return HOLIDAY_CACHE.get(year);
}

export const isHoliday = (y, m, d, hols) => !!hols[dateKey(y, m, d)];

export const isWorkday = (y, m, d, hols) => !isWeekend(y, m, d) && !isHoliday(y, m, d, hols);

export const isTodayCol = (y, m, d, TOD_Y, TOD_M, TOD_D) => {
  return y === TOD_Y && m === TOD_M && d === TOD_D;
};

export function isoWeekNumber(y, m, d) {
  const dt = new Date(y, m, d);
  const thu = new Date(dt);
  thu.setDate(dt.getDate() - (dt.getDay() === 0 ? 6 : dt.getDay() - 1) + 3);
  const ft = new Date(thu.getFullYear(), 0, 4);
  ft.setDate(4 - (ft.getDay() === 0 ? 6 : ft.getDay() - 1));
  return 1 + Math.round((thu - ft) / 604800000);
}

export function nextCalendarDay(y, m, d) {
  const dim = daysInMonth(y, m);
  if (d < dim) {
    return { y, m, d: d + 1 };
  }
  if (m < 11) {
    return { y, m: m + 1, d: 1 };
  }
  return { y: y + 1, m: 0, d: 1 };
}

export function prevCalendarDay(y, m, d) {
  if (d > 1) {
    return { y, m, d: d - 1 };
  }
  if (m > 0) {
    return { y, m: m - 1, d: daysInMonth(y, m - 1) };
  }
  return { y: y - 1, m: 11, d: daysInMonth(y - 1, 11) };
}

export function cellColor(assignment) {
  if (!assignment) {
    return { bg: "transparent", fg: "#374151" };
  }
  const meta = CODE_MAP[assignment.split("/")[0].trim()];
  if (meta) {
    return { bg: meta.bg, fg: meta.fg };
  }
  return { bg: "#F9FAFB", fg: "#374151" };
}

export function empInitials(name) {
  const parts = name.split(/\s+/).filter(Boolean);
  const caps = parts.filter((p) => p.length > 0 && /[A-ZÄÖÜ]/.test(p[0]));
  if (caps.length >= 2) {
    return caps.map((p) => p[0]).slice(0, 2).join("");
  }
  return name.slice(0, 2).toUpperCase();
}

export const MOBILE_BREAKPOINT = 600;
export const TOUCH_DEVICE_RE = /iPhone|iPad|iPod|Android/i;