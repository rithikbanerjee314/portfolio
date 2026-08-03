import type { IconType } from "react-icons";
import {
  SiCplusplus,
  SiRust,
  SiTypescript,
  SiJavascript,
  SiPython,
  SiC,
  SiJulia,
  SiOpenjdk,
  SiCmake,
  SiReact,
  SiNextdotjs,
  SiNodedotjs,
  SiThreedotjs,
  SiGit,
  SiGithubactions,
  SiVercel,
  SiRender,
  SiApachekafka,
  SiRedis,
  SiTailwindcss,
  SiNumpy,
  SiJupyter,
} from "react-icons/si";
import {
  FaGraduationCap,
  FaBriefcase,
  FaFlask,
  FaCode,
  FaMicrochip,
  FaLayerGroup,
  FaNetworkWired,
  FaCube,
  FaAtom,
  FaVectorSquare,
  FaBrain,
  FaCloud,
  FaDatabase,
  FaServer,
} from "react-icons/fa";

export interface IconMeta {
  Icon: IconType;
  /** approximate brand color — rasterized onto the badge's icon texture */
  color: string;
}

/**
 * Lookup table from a plain string key to an icon + brand color. Keys for
 * skills match the exact strings used in `SKILLS` (lib/content.ts) so that
 * array can be rendered directly without a parallel duplicate list; keys for
 * education/experience match each entry's `iconKey`/`toolKeys`.
 *
 * react-icons' brand set (simple-icons) has no university seals, so
 * education entries fall back to a generic cap icon — real institution
 * logos aren't achievable here without downloaded image assets, which this
 * project deliberately avoids (see CLAUDE.md).
 */
const ICONS: Record<string, IconMeta> = {
  // Languages
  Python: { Icon: SiPython, color: "#3776AB" },
  "C++": { Icon: SiCplusplus, color: "#00599C" },
  Rust: { Icon: SiRust, color: "#CE422B" },
  TypeScript: { Icon: SiTypescript, color: "#3178C6" },
  JavaScript: { Icon: SiJavascript, color: "#F7DF1E" },
  Java: { Icon: SiOpenjdk, color: "#ED8B00" },
  C: { Icon: SiC, color: "#A8B9CC" },
  Julia: { Icon: SiJulia, color: "#9558B2" },
  SQL: { Icon: FaDatabase, color: "#ffb84d" },

  // AI & Backend Engineering (no real brand logo for several — generic icon, trail accent color)
  "LLM Agent Development": { Icon: FaBrain, color: "#ffb84d" },
  "Vercel AI Gateway": { Icon: SiVercel, color: "#e8e8e8" },
  gRPC: { Icon: FaNetworkWired, color: "#ffb84d" },
  WebSockets: { Icon: FaNetworkWired, color: "#ffb84d" },
  // Kafka's brand colour is near-black (#231F20), which is invisible against
  // IconBadge's dark inset (#141922) — it rendered as an empty tile. Badges
  // are rasterized as a flat single-colour silhouette, so there's no dark
  // outline or light fill to fall back on; a light stand-in is the only way
  // this logo reads at all here. Any future icon whose brand colour is
  // near-black needs the same treatment.
  "Apache Kafka": { Icon: SiApachekafka, color: "#E8EAED" },
  Redis: { Icon: SiRedis, color: "#DC382D" },
  "Microservices Architecture": { Icon: FaServer, color: "#ffb84d" },

  // Cloud & DevOps
  AWS: { Icon: FaCloud, color: "#FF9900" },
  Vercel: { Icon: SiVercel, color: "#e8e8e8" },
  Render: { Icon: SiRender, color: "#46E3B7" },
  "GitHub Actions": { Icon: SiGithubactions, color: "#2088FF" },
  Git: { Icon: SiGit, color: "#F05032" },
  "CI/CD": { Icon: FaLayerGroup, color: "#ffb84d" },

  // Systems & Performance (no real brand logo — generic icon, trail accent color)
  "Bitboards & Search Algorithms": { Icon: FaMicrochip, color: "#ffb84d" },
  "RAII & Move Semantics": { Icon: FaCube, color: "#ffb84d" },
  Multithreading: { Icon: FaLayerGroup, color: "#ffb84d" },
  CMake: { Icon: SiCmake, color: "#064F8C" },

  // Frontend & Graphics
  React: { Icon: SiReact, color: "#61DAFB" },
  "Next.js": { Icon: SiNextdotjs, color: "#e8e8e8" },
  "Node.js": { Icon: SiNodedotjs, color: "#339933" },
  "three.js": { Icon: SiThreedotjs, color: "#e8e8e8" },
  "Rapier Physics": { Icon: FaCube, color: "#ffb84d" },
  "Tailwind CSS": { Icon: SiTailwindcss, color: "#38BDF8" },

  // Scientific Computing (no real brand logo for several — generic icon, trail accent color)
  SIMSOPT: { Icon: FaAtom, color: "#ffb84d" },
  NumPy: { Icon: SiNumpy, color: "#4DABCF" },
  "Data Visualization": { Icon: FaVectorSquare, color: "#ffb84d" },
  "Jupyter Notebooks": { Icon: SiJupyter, color: "#F37626" },

  // Education / experience icon keys
  columbia: { Icon: FaGraduationCap, color: "#b9d9eb" },
  work: { Icon: FaBriefcase, color: "#ffb84d" },
  research: { Icon: FaFlask, color: "#ffb84d" },

  // Experience toolKeys (lowercase, distinct from the skill badges above)
  ai: { Icon: FaBrain, color: "#ffb84d" },
  grpc: { Icon: FaNetworkWired, color: "#ffb84d" },
  aws: { Icon: FaCloud, color: "#FF9900" },
  python: { Icon: SiPython, color: "#3776AB" },
  julia: { Icon: SiJulia, color: "#9558B2" },
  typescript: { Icon: SiTypescript, color: "#3178C6" },
  react: { Icon: SiReact, color: "#61DAFB" },
};

const FALLBACK: IconMeta = { Icon: FaCode, color: "#ffb84d" };

/** Icon + brand color for a skill/tool/entry name, falling back to a generic icon for anything without a real logo. */
export function getIconMeta(name: string): IconMeta {
  return ICONS[name] ?? FALLBACK;
}
