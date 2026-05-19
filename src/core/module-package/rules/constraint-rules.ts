import type { FurnQuoteModulePackage } from "../module-package-types";

export type ModuleConstraintValidationIssue = {
  code: string;
  message: string;
};

export function validateModuleDimensionConstraints(
  modulePackage: FurnQuoteModulePackage,
  parameters: Record<string, unknown>
): ModuleConstraintValidationIssue[] {
  const issues: ModuleConstraintValidationIssue[] = [];
  const dimensions = modulePackage.constraints.dimensionRules ?? {};
  for (const [key, rule] of Object.entries(dimensions)) {
    const value = parameters[key];
    if (typeof value !== "number") continue;
    if (value < rule.min) issues.push({ code: `constraint.${key}.min`, message: `${key} must be at least ${rule.min}.` });
    if (value > rule.max) issues.push({ code: `constraint.${key}.max`, message: `${key} must be at most ${rule.max}.` });
    if (rule.step && ((value - rule.min) % rule.step) !== 0) {
      issues.push({ code: `constraint.${key}.step`, message: `${key} must follow ${rule.step} mm steps.` });
    }
  }
  return issues;
}
