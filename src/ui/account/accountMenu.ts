import type { OrganizationUser } from "../../core/client/client-types";
import {
  findOrganizationUser,
  organizationUserEmail,
  organizationUserInitial,
  organizationUserPhotoUrl
} from "../../core/client/organization-users";
import { logoutClient } from "../../app/logoutClient";

type AccountMenuArgs = {
  mount: HTMLElement;
  users: readonly OrganizationUser[];
  currentUserId: string;
  showName?: boolean;
  onLogoutStart?: () => void;
  onLogoutError?: (message: string) => void;
};

type AccountMenuItemArgs = {
  label: string;
  sublabel?: string;
  icon: string;
  danger?: boolean;
  chevron?: boolean;
  onClick?: () => void;
};

const icons = {
  theme: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="M4 9h16"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v14"/><path d="M18 5v14"/><path d="M6 9h.1"/><path d="M18 15h.1"/><path d="M12 5v14"/><path d="M12 11h.1"/></svg>`,
  desktop: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v12"/><path d="m8 12 4 4 4-4"/><path d="M5 20h14"/></svg>`,
  community: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20v-2a4 4 0 0 0-8 0v2"/><circle cx="12" cy="8" r="4"/><path d="M19 10v4"/><path d="M21 12h-4"/></svg>`,
  add: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M13 5h6v14h-6"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5.5 4 4"/><path d="M4 20l1.4-5.3L16.7 3.4a2 2 0 0 1 2.9 2.9L8.3 17.6z"/></svg>`
};

export function createAccountMenu(args: AccountMenuArgs): void {
  const user = findOrganizationUser(args.users, args.currentUserId) ?? args.users.find((item) => item.isActive) ?? null;
  const email = organizationUserEmail(user);
  args.mount.innerHTML = "";

  const root = document.createElement("div");
  root.className = "account-menu-root";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "account-menu-trigger";
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", "Pouzivatelske menu");

  if (args.showName) {
    const copy = document.createElement("span");
    copy.className = "account-menu-trigger-copy";
    const name = document.createElement("strong");
    name.textContent = user?.name ?? "Pouzivatel";
    const position = document.createElement("small");
    position.textContent = user?.position ?? "Organizacia Arcigy";
    copy.append(name, position);
    trigger.appendChild(copy);
  }

  trigger.appendChild(renderAvatar(user, "account-menu-trigger-avatar"));

  const panel = document.createElement("div");
  panel.className = "account-menu-panel";
  panel.setAttribute("role", "menu");
  panel.hidden = true;

  const header = document.createElement("div");
  header.className = "account-menu-header";
  const largeAvatarWrap = document.createElement("div");
  largeAvatarWrap.className = "account-menu-large-avatar-wrap";
  largeAvatarWrap.appendChild(renderAvatar(user, "account-menu-large-avatar"));
  const edit = document.createElement("span");
  edit.className = "account-menu-edit";
  edit.innerHTML = icons.edit;
  largeAvatarWrap.appendChild(edit);
  const name = document.createElement("strong");
  name.textContent = user?.name ?? "Pouzivatel";
  const mail = document.createElement("span");
  mail.textContent = email;
  header.append(largeAvatarWrap, name, mail);

  const items = document.createElement("div");
  items.className = "account-menu-items";
  items.append(
    menuItem({ label: "Theme", icon: icons.theme, chevron: true }),
    menuItem({ label: "Settings", icon: icons.settings }),
    menuItem({ label: "Get desktop app", icon: icons.desktop }),
    sectionBreak(),
    menuItem({ label: "Create a community profile", sublabel: email, icon: icons.community }),
    sectionBreak(),
    menuItem({ label: "Add account", icon: icons.add }),
    sectionBreak(),
    menuItem({
      label: "Log out",
      icon: icons.logout,
      danger: true,
      onClick: async () => {
        close();
        args.onLogoutStart?.();
        try {
          await logoutClient();
        } catch (error) {
          args.onLogoutError?.(error instanceof Error ? error.message : String(error));
        }
      }
    })
  );

  panel.append(header, items);
  root.append(trigger, panel);
  args.mount.appendChild(root);

  const close = () => {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  };

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = panel.hidden;
    panel.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
  });
  panel.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", close);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
}

function renderAvatar(user: OrganizationUser | null, className: string): HTMLElement {
  const avatar = document.createElement("span");
  avatar.className = className;
  const photoUrl = organizationUserPhotoUrl(user);
  if (photoUrl) {
    const image = document.createElement("img");
    image.src = photoUrl;
    image.alt = user?.name ?? "";
    image.loading = "eager";
    image.decoding = "async";
    avatar.appendChild(image);
  } else {
    avatar.textContent = organizationUserInitial(user);
  }
  return avatar;
}

function menuItem(args: AccountMenuItemArgs): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = args.danger ? "account-menu-item is-danger" : "account-menu-item";
  button.setAttribute("role", "menuitem");
  const icon = document.createElement("span");
  icon.className = "account-menu-item-icon";
  icon.innerHTML = args.icon;
  const copy = document.createElement("span");
  copy.className = "account-menu-item-copy";
  const label = document.createElement("strong");
  label.textContent = args.label;
  copy.appendChild(label);
  if (args.sublabel) {
    const sublabel = document.createElement("small");
    sublabel.textContent = args.sublabel;
    copy.appendChild(sublabel);
  }
  button.append(icon, copy);
  if (args.chevron) {
    const chevron = document.createElement("span");
    chevron.className = "account-menu-chevron";
    chevron.textContent = "›";
    button.appendChild(chevron);
  }
  if (args.onClick) button.addEventListener("click", () => void args.onClick?.());
  return button;
}

function sectionBreak(): HTMLElement {
  const divider = document.createElement("span");
  divider.className = "account-menu-divider";
  return divider;
}
