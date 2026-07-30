import type { DocumentAnalysis } from "../domain/schema.ts";
import {
  VISUALIZATION_METHODS,
  type MethodSupport,
  type VisualizationMethodDefinition,
} from "../visualizations/registry.ts";

export type UserGoal =
  | "whole-genealogy"
  | "ancestors"
  | "descendants"
  | "neighborhood"
  | "chronology"
  | "printing"
  | "comparison";

export interface MethodRecommendation {
  method: VisualizationMethodDefinition;
  score: number;
  selectable: boolean;
  reasons: string[];
  cautions: string[];
}

export interface RecommendationResult {
  recommended: MethodRecommendation[];
  all: MethodRecommendation[];
}

// The reproducible scale harness confirms this as the point where Canvas-backed
// GeneaQuilt should lead whole-document recommendations over dense SVG methods.
export const LARGE_GENEALOGY_THRESHOLD = 1_000;

export function recommendMethods(analysis: DocumentAnalysis, goal: UserGoal): RecommendationResult {
  const all = VISUALIZATION_METHODS.map((method) => scoreMethod(method, analysis, goal)).sort(
    (left, right) =>
      Number(right.selectable) - Number(left.selectable) ||
      right.score - left.score ||
      left.method.name.localeCompare(right.method.name),
  );
  return {
    recommended: all.filter((recommendation) => recommendation.selectable).slice(0, 3),
    all,
  };
}

function scoreMethod(
  method: VisualizationMethodDefinition,
  analysis: DocumentAnalysis,
  goal: UserGoal,
): MethodRecommendation {
  const reasons = new Set<string>();
  const cautions = new Set<string>();
  let score = goalScore(method, goal, reasons, cautions);

  if (analysis.people >= LARGE_GENEALOGY_THRESHOLD) {
    score += scaleScore(method.practicalScale) * 4;
    if (method.practicalScale === "very-large") {
      reasons.add(
        `Its documented scale is a strong match for ${analysis.people.toLocaleString()} people.`,
      );
    } else if (method.practicalScale === "small") {
      cautions.add(
        `This method is not intended to show ${analysis.people.toLocaleString()} people at once.`,
      );
    }
  }
  if (analysis.disconnected_family_groups > 1) {
    score += supportScore(method.traits.disconnectedGroups) * 3;
    if (method.traits.disconnectedGroups === "strong") {
      reasons.add(
        `It can retain all ${analysis.disconnected_family_groups} disconnected Family Groups.`,
      );
    } else if (method.scope !== "whole") {
      cautions.add("A focused Projection will not show every disconnected Family Group.");
    }
  }
  if (analysis.people_with_multiple_spouses > 0) {
    score += supportScore(method.traits.multipleMarriages) * 3;
    if (method.traits.multipleMarriages === "strong") {
      reasons.add(
        `It keeps the tree's ${analysis.people_with_multiple_spouses} people with multiple spouses understandable.`,
      );
    } else if (method.traits.multipleMarriages === "none") {
      cautions.add("This method does not naturally express multiple marriages.");
    }
  }
  if (analysis.half_sibling_structures > 0) {
    score += supportScore(method.traits.halfSiblings) * 3;
    if (method.traits.halfSiblings === "strong") {
      reasons.add(
        `It preserves ${analysis.half_sibling_structures} half-sibling parentage structures.`,
      );
    } else if (method.traits.halfSiblings === "none") {
      cautions.add("Half-sibling parentage may be omitted or unclear.");
    }
  }
  if (analysis.reconvergence_points > 0) {
    score += supportScore(method.traits.pedigreeCollapse) * 4;
    if (method.traits.pedigreeCollapse === "strong") {
      reasons.add(
        `It handles the tree's ${analysis.reconvergence_points} reconvergence points without pretending they are cycles.`,
      );
    } else if (method.traits.pedigreeCollapse === "none") {
      cautions.add(
        "Reconvergent people must be repeated, omitted, or marked outside the native tree layout.",
      );
    }
  }
  if (analysis.largest_sibling_group >= 10) {
    score += supportScore(method.traits.siblings) * 2 + supportScore(method.traits.availableSpace);
    if (method.traits.siblings === "strong") {
      reasons.add(
        `It retains the largest ${analysis.largest_sibling_group}-child sibling group explicitly.`,
      );
    }
  }
  if (analysis.date_coverage_percent >= 40) {
    score += supportScore(method.traits.chronology) * 4;
    if (method.traits.chronology === "strong") {
      reasons.add(
        `The ${analysis.date_coverage_percent.toFixed(0)}% date coverage supports a chronological view.`,
      );
    }
  } else if (goal === "chronology") {
    cautions.add(
      `Only ${analysis.date_coverage_percent.toFixed(0)}% of Person and Family records have usable dates.`,
    );
  }

  const selectable = method.availability === "available" && !analysis.blocks_interactive;
  if (method.availability === "in-development") {
    cautions.add("Its Native Visualization is still in development and cannot be selected yet.");
  }
  if (analysis.blocks_interactive) {
    cautions.add("Tree Analysis found a blocking relationship error that must be corrected first.");
  }
  if (reasons.size === 0) {
    reasons.add(method.bestUse);
  }

  return {
    method,
    score,
    selectable,
    reasons: [...reasons],
    cautions: [...cautions],
  };
}

function goalScore(
  method: VisualizationMethodDefinition,
  goal: UserGoal,
  reasons: Set<string>,
  cautions: Set<string>,
): number {
  switch (goal) {
    case "whole-genealogy": {
      if (method.scope === "whole") {
        reasons.add("It is designed for a Whole-dataset View.");
      } else {
        cautions.add(
          "It uses a focused or rooted Projection rather than the whole Genealogy Document.",
        );
      }
      return (method.scope === "whole" ? 12 : 0) + supportScore(method.traits.availableSpace) * 3;
    }
    case "ancestors":
      return scoreGoalTrait(
        method.traits.ancestors,
        "It is strong for recorded ancestry.",
        reasons,
      );
    case "descendants":
      return scoreGoalTrait(
        method.traits.descendants,
        "It is strong for following descendant branches.",
        reasons,
      );
    case "neighborhood":
      return (
        scoreGoalTrait(
          method.traits.interactiveExploration,
          "It supports interactive person-by-person exploration.",
          reasons,
        ) + (method.scope === "focus" ? 6 : 0)
      );
    case "chronology":
      return scoreGoalTrait(
        method.traits.chronology,
        "Time is part of the method's primary reading axis.",
        reasons,
      );
    case "printing":
      return (
        scoreGoalTrait(method.traits.printing, "It is well suited to print output.", reasons) +
        supportScore(method.traits.availableSpace) * 2
      );
    case "comparison":
      return (
        supportScore(method.traits.ancestors) +
        supportScore(method.traits.descendants) +
        supportScore(method.traits.partners) +
        supportScore(method.traits.pedigreeCollapse)
      );
  }
}

function scoreGoalTrait(
  support: MethodSupport,
  strongReason: string,
  reasons: Set<string>,
): number {
  if (support === "strong") {
    reasons.add(strongReason);
  }
  return supportScore(support) * 6;
}

function supportScore(support: MethodSupport): number {
  switch (support) {
    case "none":
      return 0;
    case "limited":
      return 1;
    case "strong":
      return 2;
  }
}

function scaleScore(scale: VisualizationMethodDefinition["practicalScale"]): number {
  switch (scale) {
    case "small":
      return 0;
    case "medium":
      return 1;
    case "large":
      return 2;
    case "very-large":
      return 3;
  }
}
