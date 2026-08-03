/**
 * Central place for all site copy and personal details.
 * Sourced from the master resume database (July 2026 compile).
 */

export const SITE = {
  name: "Rithik Banerjee",
  title: "Rithik Banerjee — AI Solutions Engineer & Software Engineer",
  description:
    "Portfolio of Rithik Banerjee — a Columbia University computer science & applied physics student building production AI systems at C Spire, leading fusion energy research, and engineering chess engines, autonomous automation, and real-time multiplayer systems.",
  email: "rb3736@columbia.edu",
  github: "https://github.com/rithikbanerjee314",
  linkedin: "https://www.linkedin.com/in/rithik-banerjee",
  resumeHref: "/resume.pdf",
};

export const ROLES = [
  "AI Solutions Engineer",
  "Software Engineer",
  "Fusion Research Lead",
  "Systems Programmer",
];

export const INTRO = {
  heading: "Hi, I'm Rithik.",
  paragraphs: [
    "I'm a Computer Science student at Columbia University with a minor in Applied Physics. I've always been drawn to understanding how things work, whether that's software, physical systems, or the mathematics that connects them. What I enjoy most is taking an idea from first principles, building it from the ground up, and watching it become something real.",
    "Outside of class, I spend most of my time building projects. Some solve practical problems, some exist simply because I wanted to see if I could make them work. Along the way I've explored AI, distributed systems, optimization, graphics, embedded systems, game development, and anything else that captures my curiosity. More than any particular technology, I enjoy learning new fields and applying them to problems that matter.",
    "I'm especially interested in the intersection of software, artificial intelligence, and the physical world — building systems that are not only intelligent, but reliable, efficient, and useful. Whether that's research, infrastructure, or developer tools, I enjoy work that combines deep technical thinking with tangible impact.",
    "When I'm away from a keyboard, you'll usually find me playing piano or trumpet, playing chess, hiking, watching soccer, or probably starting another project I convinced myself would only take a weekend.",
  ],
};

export const SKILLS: { category: string; items: string[] }[] = [
  {
    category: "Languages",
    items: ["Python", "C++", "Rust", "TypeScript", "JavaScript", "Java", "C", "Julia", "SQL"],
  },
  {
    category: "AI & Backend Engineering",
    items: [
      "LLM Agent Development",
      "Vercel AI Gateway",
      "gRPC",
      "WebSockets",
      "Apache Kafka",
      "Redis",
      "Microservices Architecture",
    ],
  },
  {
    category: "Cloud & DevOps",
    items: ["AWS", "Vercel", "Render", "GitHub Actions", "Git", "CI/CD"],
  },
  {
    category: "Systems & Performance",
    items: ["Bitboards & Search Algorithms", "RAII & Move Semantics", "Multithreading", "CMake"],
  },
  {
    category: "Frontend & Graphics",
    items: ["React", "Next.js", "Node.js", "three.js", "Rapier Physics", "Tailwind CSS"],
  },
  {
    category: "Scientific Computing",
    items: ["SIMSOPT", "NumPy", "Data Visualization", "Jupyter Notebooks"],
  },
];

export const RESEARCH = {
  title: "Fusion Energy Research",
  paragraphs: [
    "I'm the project lead for the Columbia Reconfigurable Experiment (C-REX) at Columbia's Fusion Research Center, where I write coil-optimization software for a hybrid tokamak-stellarator fusion reactor.",
    "Using SIMSOPT, a stellarator/tokamak optimization library, I've built 10+ single-stage coil-optimization scripts and generated 100+ plasma and coil-set models — the best configurations reaching field errors around 0.01%.",
    "This work directly informs the design of physical coils being tested on Columbia's HBT experiment, and is published as an arXiv preprint (I'm a co-author), alongside presentations at the Fusion Research Center's Summer Student Poster Symposium and the Columbia University Undergraduate Research Symposium.",
    "The structure ahead shows charged particles spiraling along helical magnetic field lines inside a torus — the core geometry that makes magnetic confinement fusion possible. Drag it to explore from any angle.",
  ],
};

/** A single node on the trail map's Education or Experience timeline. */
export interface TrailMapEntry {
  id: string;
  /** institution or company */
  title: string;
  /** degree or job title */
  role: string;
  period: string;
  /** one-liner, revealed only on hover/click — keep short */
  description: string;
  /** key into components/trailmap/icons.ts's ICONS map */
  iconKey: string;
}

export interface ExperienceEntry extends TrailMapEntry {
  /** keys into the same ICONS map — small tool badges shown on the node */
  toolKeys?: string[];
}

export const EDUCATION: TrailMapEntry[] = [
  {
    id: "columbia",
    title: "Columbia University",
    role: "B.S. Computer Science, Minor in Applied Physics",
    period: "2023 – 2027",
    description:
      "Fu Foundation School of Engineering and Applied Science. GPA 3.95, Dean's List. IEEE, CU Informs, Wind Ensemble, Formula SAE Racing.",
    iconKey: "columbia",
  },
];

export const EXPERIENCE: ExperienceEntry[] = [
  {
    id: "cspire",
    title: "C Spire",
    role: "AI Solutions Engineer, AI Rapid Response Engineering",
    period: "May 2026 – Present",
    description:
      "Shipped a production voice-AI billing agent (WebEx → gRPC → AWS bridge → Vercel AI Gateway, ~1.5s latency) that saved $3M+ and became the company-wide voice-agent template; also built an HR onboarding bot. Promoted from Systems Integration Intern as one of two interns selected company-wide.",
    iconKey: "work",
    toolKeys: ["ai", "grpc", "aws"],
  },
  {
    id: "fusion-research",
    title: "Columbia Fusion Research Center",
    role: "Project Lead, Columbia Reconfigurable Experiment (C-REX)",
    period: "Feb 2025 – Present",
    description:
      "Lead coil-optimization software (SIMSOPT) for a tokamak-stellarator fusion reactor; results published on arXiv and feeding real hardware design for the HBT experiment.",
    iconKey: "research",
    toolKeys: ["python", "julia"],
  },
  {
    id: "brown",
    title: "Brown University",
    role: "Teaching Assistant, Computational Math & Data Visualization",
    period: "Jun 2024 – Aug 2024",
    description:
      "Taught linear algebra, calculus, recursion, and NumPy to 20+ pre-college students; graded programming projects and wrote assignment solutions.",
    iconKey: "work",
    toolKeys: ["python"],
  },
];

export const TRAILMAP = {
  signText: "Trail Map",
  signCaption: "education & experience",
  overlayIntro: "A map of my education, work experience, and technical skills.",
  accent: "#ffb84d",
};
