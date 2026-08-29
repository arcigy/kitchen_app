# UI icon contract

Action icons are part of the Arcigy interface contract. They explain compact
controls without changing the action, keyboard shortcut, disabled state or
editor command behind the control.

## Required rule for new controls

When a new button needs an icon, the same change must add a suitable unique SVG
symbol to `public/ui-icons/actions.svg`, register its semantic identifier in
`src/ui/actionIcons.ts`, and render it through `actionIconMarkup()`.

- Use one icon for one semantic action. The exact same action may reuse its
  symbol on another screen; a different action must not reuse that drawing.
- Do not use emoji, icon fonts, text glyphs, `?`, `+`, `x`, ellipses or font
  arrows as an action icon.
- SVG symbols use a 24 by 24 viewBox, `currentColor`, clean line geometry and
  no raster image, embedded font, script, external reference or white artboard.
- Icon-only controls must retain an accessible name and use the shared tooltip
  controller. Supply an action-specific title, explanation and shortcut when
  one exists.
- A control with a long, self-explanatory visible label does not need a
  decorative icon. Compact toolbars, row actions, state actions and menu icons
  do.

## Review checklist

- Confirm the icon is not visually shared with another semantic action.
- Confirm hover and keyboard focus show a concise title and explanation.
- Confirm the icon remains distinct at 16 px and in hover, active and disabled
  states.
- Add or update a focused test for the icon registry or its rendered control.
