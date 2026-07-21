export const COLD_OPEN_DURATION_SECONDS = 30;

export const COLD_OPEN_SCENES = [
  {
    id: "counterfactual",
    start: 0,
    end: 7,
    label: "Résumé prediction",
    title: "The profile decides before the work exists.",
  },
  {
    id: "veil",
    start: 7,
    end: 12,
    label: "Seal the labels",
    title: "Pedigree disappears. Qualifications remain.",
  },
  {
    id: "attention",
    start: 12,
    end: 18,
    label: "Stake the attention",
    title: "Candidate work stays locked until Sarah reserves review.",
  },
  {
    id: "proof",
    start: 18,
    end: 27,
    label: "Test the work",
    title: "The same job risk produces different evidence.",
  },
  {
    id: "reversal",
    start: 27,
    end: 30,
    label: "Prediction disagreement",
    title: "Résumé picked A. Work evidence surfaced B.",
  },
] as const;

export type ColdOpenScene = (typeof COLD_OPEN_SCENES)[number];
export type ColdOpenSceneId = ColdOpenScene["id"];

export function clampColdOpenTime(seconds: number): number {
  if (!Number.isFinite(seconds)) {
    return 0;
  }

  return Math.min(COLD_OPEN_DURATION_SECONDS, Math.max(0, seconds));
}

export function getColdOpenScene(seconds: number): ColdOpenScene {
  const elapsed = clampColdOpenTime(seconds);

  for (let index = COLD_OPEN_SCENES.length - 1; index >= 0; index -= 1) {
    const scene = COLD_OPEN_SCENES[index];
    if (scene && elapsed >= scene.start) {
      return scene;
    }
  }

  return COLD_OPEN_SCENES[0];
}

export function getColdOpenProgress(seconds: number): number {
  return (clampColdOpenTime(seconds) / COLD_OPEN_DURATION_SECONDS) * 100;
}

export function formatColdOpenTime(seconds: number): string {
  const elapsed = Math.floor(clampColdOpenTime(seconds));
  return `0:${elapsed.toString().padStart(2, "0")}`;
}
