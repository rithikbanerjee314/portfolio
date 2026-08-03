/**
 * Merged Projects + Hobbies data, one entry per world station.
 * Adding a project/hobby = editing this file; anchors/physics widgets are
 * wired in components/world/path.ts + the *Station.tsx components.
 */

export interface ProjectLink {
  name: string;
  stack: string[];
  description: string;
  github?: string;
  demo?: string;
  /** Published paper / preprint (rendered as its own labelled link, not as a "demo"). */
  paper?: string;
  highlight?: string;
}

export interface StationContent {
  id: string;
  title: string;
  emoji: string;
  tagline: string;
  blurb: string;
  accent: string;
  interactionHint: string;
  projects: ProjectLink[];
}

export const STATIONS: StationContent[] = [
  {
    id: "chess",
    title: "Chess Engine Development",
    emoji: "♞",
    tagline: "C++ systems programming & competitive engine design",
    blurb:
      "I design and build chess engines from first principles. Crucible, my from-scratch C++20 UCI engine, uses magic-bitboard move generation and a full modern search stack — transposition tables, null-move pruning, late-move reductions, principal variation search, and quiescence search with static exchange evaluation — to play at roughly 2468 Elo, verified against a 120-game Stockfish gauntlet and a depth-6 perft of exactly 119,060,324 nodes.",
    accent: "#2f6bff",
    interactionHint: "Drag the king and let go to toss it",
    projects: [
      {
        name: "Crucible — UCI Chess Engine",
        stack: ["C++20", "CMake", "Magic Bitboards"],
        description:
          "A from-scratch UCI chess engine with in-place make/unmake move generation, magic-bitboard attack tables, and incremental Zobrist hashing. Full search stack: negamax/PVS, null-move and futility pruning, late-move reductions, aspiration windows, quiescence search with SEE, killer moves, and history heuristics. Rated ~2468 ± 85 Elo (95% CI) against Stockfish — a ~340 Elo jump over the earlier JavaScript engine it replaced.",
        github: "https://github.com/rithikbanerjee314/crucible",
        highlight: "~2468 Elo",
      },
      {
        name: "Multiplayer Chess (browser)",
        stack: ["Node.js", "WebSockets", "JavaScript"],
        description:
          "A ~7,700-line browser chess platform with its own Stockfish-style evaluation/search engine running in a Web Worker, plus a WebSocket multiplayer server with server-authoritative clocks, reconnect, resign/draw offers, and rematch flows. Deployed on Vercel and Render.",
        github: "https://github.com/rithikbanerjee314/chess",
        demo: "https://chess-smoky-xi.vercel.app",
      },
    ],
  },
  {
    id: "soccer",
    title: "Automation Engineering",
    emoji: "⚽",
    tagline: "Autonomous decision systems in Rust",
    blurb:
      "As a lifelong Manchester United supporter, I channeled the obsession into code: fpl-bot, a Rust service that autonomously manages a real Fantasy Premier League team end-to-end, every gameweek, with zero manual input.",
    accent: "#8fd6ff",
    interactionHint: "Click near the ball to strike it toward goal",
    projects: [
      {
        name: "fpl-bot",
        stack: ["Rust", "Tokio", "GitHub Actions"],
        description:
          "A Rust service that manages a real Fantasy Premier League team via the official API on a 6-hour GitHub Actions cron: scores every player on a multi-week horizon (form, expected points, fixture difficulty) to decide transfers, selects the highest-scoring valid lineup and captain each gameweek, and automates chip usage (Triple Captain, Bench Boost) — gated behind a dry-run safety mode and idempotency checks against real transfer history.",
        github: "https://github.com/rithikbanerjee314/fpl-bot",
      },
    ],
  },
  {
    id: "tokamak",
    title: "Fusion Energy Research",
    emoji: "⚛",
    tagline: "Plasma physics & tokamak-stellarator optimization",
    blurb:
      "I lead coil-optimization software development for a hybrid tokamak-stellarator fusion reactor at Columbia's Fusion Research Center — work that has shaped the design of real experimental hardware and been published as an arXiv preprint.",
    accent: "#4f8fdb",
    interactionHint: "Drag to rotate the tokamak",
    projects: [
      {
        name: "C-REX — Columbia Reconfigurable Experiment",
        stack: ["Python", "SIMSOPT", "Stellarator Optimization", "Plasma Physics"],
        description:
          "Coil-optimization software for a hybrid tokamak-stellarator reactor, built on SIMSOPT. The optimized coil geometries directly inform the design of physical experimental hardware at the Columbia Fusion Research Center. Published as an arXiv preprint.",
        paper: "https://doi.org/10.48550/arXiv.2606.13326",
        github: "https://github.com/jhalpern30/simsopt/tree/accessibility",
        highlight: "Published",
      },
    ],
  },
  {
    id: "piano",
    title: "Music",
    emoji: "🎹",
    tagline: "Piano & trumpet performance",
    blurb:
      "Ten years of piano and seven years of trumpet, including time as section leader — now playing in Columbia's Wind Ensemble and Columbia Pops. Music scratches the same itch as engineering: structure, precision, and knowing exactly when to improvise.",
    accent: "#8fd6ff",
    interactionHint: "Press the keys or use your computer keyboard",
    projects: [
      {
        name: "Music Analysis & Orchestration Tool",
        stack: ["Python", "Music Theory", "Audio DSP"],
        description:
          "In progress: software that analyzes a score or recording and automates parts of the orchestration process — arranging a line across sections, checking voice leading and instrument ranges, and suggesting reharmonizations. Grew directly out of arranging for ensembles by hand.",
        highlight: "Upcoming",
      },
    ],
  },
  {
    id: "fish",
    title: "Real-Time Multiplayer Systems",
    emoji: "🐟",
    tagline: "Authoritative game-server architecture",
    blurb:
      "A WebSocket server and browser client for Fish (Literature), a 6-player hidden-information card game. The server is the sole authority over all hidden state — clients see only their own hand plus public history — with AI bots, token-based reconnect, and dedicated headless test harnesses validating every rule edge case.",
    accent: "#2f6bff",
    interactionHint: "Click the fish to make it flop",
    projects: [
      {
        name: "Fish (Literature) Multiplayer",
        stack: ["Node.js", "WebSockets", "JavaScript"],
        description:
          "An authoritative Node.js WebSocket server enforcing every rule of Fish (Literature) — asking, declaring, and endgame edge cases — with AI bots that reason only from public information, token-based reconnect that restores seat and hand, and safety-cap timers for abandoned actions. Deployed on Render and Vercel.",
        github: "https://github.com/rithikbanerjee314/fish-multiplayer",
        demo: "https://fish-multiplayer.onrender.com/",
      },
    ],
  },
  {
    id: "vault",
    title: "Additional Projects",
    emoji: "🗝",
    tagline: "A growing archive of side builds",
    blurb:
      "Not every project fits on the main trail. This chest holds smaller side builds — starting with the Fish multiplayer server — that I keep adding to over time. More projects are on the way, so check back as the archive grows. Open it up and look around.",
    accent: "#e8b923",
    interactionHint: "Click the chest to open it and step inside",
    projects: [],
  },
];

export function getStationContent(id: string): StationContent | undefined {
  return STATIONS.find((s) => s.id === id);
}
