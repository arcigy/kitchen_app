import { describe, expect, it } from "vitest";
import type { OrganizationUser } from "./client-types";
import { organizationUserInitial, organizationUserPhotoUrl } from "./organization-users";

function user(photoUrl: string): OrganizationUser {
  return {
    id: "user_test",
    name: "Aleš Rohrich",
    position: "Owner",
    role: "administrator",
    permissions: [],
    photoUrl,
    isActive: true
  };
}

describe("organization user presentation", () => {
  it("uses initials instead of requesting the known missing default avatar", () => {
    const organizationUser = user("/organization/default-user.png");

    expect(organizationUserPhotoUrl(organizationUser)).toBeNull();
    expect(organizationUserInitial(organizationUser)).toBe("A");
  });

  it("preserves configured organization photos", () => {
    expect(organizationUserPhotoUrl(user("/organization/ales.png"))).toBe("/organization/ales.png");
  });
});
