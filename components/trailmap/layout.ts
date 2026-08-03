import { EDUCATION, EXPERIENCE, SKILLS } from "@/lib/content";

export interface BadgeItem {
  id: string;
  iconKey: string;
  title: string;
  subtitle?: string;
  detail?: string;
  /** small tool-used icons shown alongside the detail card (Experience entries only) */
  toolKeys?: string[];
}

export interface LaidOutBadge extends BadgeItem {
  x: number;
  y: number;
}

export interface LaidOutSection {
  title: string;
  centerX: number;
  height: number;
  badges: LaidOutBadge[];
}

export const BADGE_SIZE = 1.5;
const GAP_X = 0.55;
const GAP_Y = 0.75;
const COLS = 4;
const SECTION_GAP = 2.2;

interface RawSection {
  title: string;
  items: BadgeItem[];
}

function layoutGrid(items: BadgeItem[]) {
  const rows = Math.max(1, Math.ceil(items.length / COLS));
  const height = rows * BADGE_SIZE + (rows - 1) * GAP_Y;
  const badges: LaidOutBadge[] = items.map((item, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const rowCount = Math.min(COLS, items.length - row * COLS);
    const rowWidth = rowCount * BADGE_SIZE + (rowCount - 1) * GAP_X;
    const x = -rowWidth / 2 + col * (BADGE_SIZE + GAP_X) + BADGE_SIZE / 2;
    const y = height / 2 - row * (BADGE_SIZE + GAP_Y) - BADGE_SIZE / 2;
    return { ...item, x, y };
  });
  const cols = Math.min(COLS, items.length);
  const width = cols * BADGE_SIZE + Math.max(cols - 1, 0) * GAP_X;
  return { badges, width, height };
}

function buildRawSections(): RawSection[] {
  const sections: RawSection[] = [
    {
      title: "Education",
      items: EDUCATION.map((e) => ({
        id: e.id,
        iconKey: e.iconKey,
        title: e.title,
        subtitle: e.role,
        detail: `${e.period} — ${e.description}`,
      })),
    },
    {
      title: "Experience",
      items: EXPERIENCE.map((e) => ({
        id: e.id,
        iconKey: e.iconKey,
        title: e.title,
        subtitle: e.role,
        detail: `${e.period} — ${e.description}`,
        toolKeys: e.toolKeys,
      })),
    },
  ];
  for (const group of SKILLS) {
    sections.push({
      title: group.category,
      items: group.items.map((name) => ({ id: name, iconKey: name, title: name })),
    });
  }
  return sections;
}

function buildLayout(): { sections: LaidOutSection[]; totalWidth: number } {
  let cursorX = 0;
  const sections: LaidOutSection[] = [];
  for (const raw of buildRawSections()) {
    const { badges, width, height } = layoutGrid(raw.items);
    const centerX = cursorX + width / 2;
    sections.push({
      title: raw.title,
      centerX,
      height,
      badges: badges.map((b) => ({ ...b, x: b.x + centerX })),
    });
    cursorX += width + SECTION_GAP;
  }
  return { sections, totalWidth: Math.max(cursorX - SECTION_GAP, 0) };
}

/** Computed once — Education/Experience/Skills sections laid out left-to-right, each a grid of badge positions. */
export const TRAILMAP_LAYOUT = buildLayout();
