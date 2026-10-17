import { describe, expect, it } from "vitest";
import { withoutEndCustomerData } from "../../server/feedbackReportEndpoint";
import { FEEDBACK_KINDS, normalizeFeedbackKind } from "./feedback-kinds";

describe("feedback kinds", () => {
  it("offers the client success types with the former bug meaning as default", () => {
    expect(FEEDBACK_KINDS.map((kind) => kind.value)).toEqual(["usability_error", "price_error", "wish", "question", "other"]);
  });

  it("maps legacy kinds from older clients and drafts", () => {
    expect(normalizeFeedbackKind("bug")).toBe("usability_error");
    expect(normalizeFeedbackKind("feature_request")).toBe("wish");
    expect(normalizeFeedbackKind("improvement")).toBe("wish");
    expect(normalizeFeedbackKind("price_error")).toBe("price_error");
    expect(normalizeFeedbackKind("sql_injection")).toBeNull();
    expect(normalizeFeedbackKind(undefined)).toBeNull();
  });
});

describe("feedback project snapshot", () => {
  it("removes the end customer's name, contact and address before the snapshot leaves the app", () => {
    const snapshot = {
      project: {
        projectId: "kitchen-1",
        name: "Kuchyňa Novák",
        contact: { name: "Ján Novák", email: "jan@example.com", phone: "+421 900 000 000" },
        location: { address: "Hlavná 1", city: "Brno" },
        status: "draft"
      },
      saveRevision: 7,
      appState: { modules: [] }
    };
    expect(withoutEndCustomerData(snapshot)).toEqual({
      project: { projectId: "kitchen-1", name: { redacted: true }, contact: { redacted: true }, location: { redacted: true }, status: "draft" },
      saveRevision: 7,
      appState: { modules: [] }
    });
    expect(snapshot.project.contact.email).toBe("jan@example.com");
  });

  it("leaves snapshots without project metadata untouched", () => {
    expect(withoutEndCustomerData({ projectId: "project-a", objects: [] })).toEqual({ projectId: "project-a", objects: [] });
    expect(withoutEndCustomerData(null)).toBeNull();
  });
});
