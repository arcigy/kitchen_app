export type KitchenEditTopbarIntent = "accept" | "discard";

export type KitchenEditTopbarAction =
  | { type: "exit-module-editor"; discard: boolean }
  | { type: "exit-kitchen-group"; discard: boolean };

export function resolveKitchenEditTopbarAction(args: {
  moduleEditorActive: boolean;
  intent: KitchenEditTopbarIntent;
}): KitchenEditTopbarAction {
  const discard = args.intent === "discard";
  return args.moduleEditorActive
    ? { type: "exit-module-editor", discard }
    : { type: "exit-kitchen-group", discard };
}
