import type { ProjectSaveFile } from "../../core/project-save/project-save-types";
import type { ProjectRecoveryEnvelopeV1 } from "./projectRecoveryTypes";

export type ProjectRecoveryDecision =
  | { kind: "server"; save: ProjectSaveFile; archiveLocal: boolean }
  | { kind: "local"; save: ProjectSaveFile; envelope: ProjectRecoveryEnvelopeV1 }
  | { kind: "offline-local"; envelope: ProjectRecoveryEnvelopeV1 };

function serverRevision(save: ProjectSaveFile): number {
  return save.integrity.saveRevision ?? 0;
}

export function mergeRecoveryWithAuthoritativeServer(
  server: ProjectSaveFile,
  envelope: ProjectRecoveryEnvelopeV1
): ProjectSaveFile {
  return {
    ...server,
    appState: {
      ...envelope.appState,
      // These domains have their own revision-checked server owners. A generic
      // browser draft must never roll them back.
      materialAssignments: server.appState.materialAssignments,
      quoteSettings: server.appState.quoteSettings,
      pricingSettings: server.appState.pricingSettings
    }
  };
}

export function decideProjectRecovery(args: {
  server: ProjectSaveFile | null;
  envelope: ProjectRecoveryEnvelopeV1 | null;
  offline: boolean;
}): ProjectRecoveryDecision | null {
  if (!args.envelope) return args.server ? { kind: "server", save: args.server, archiveLocal: false } : null;
  if (!args.server) return args.offline ? { kind: "offline-local", envelope: args.envelope } : null;
  const currentRevision = serverRevision(args.server);
  if (args.envelope.baseServerRevision !== currentRevision) {
    return { kind: "server", save: args.server, archiveLocal: true };
  }
  const localTime = Date.parse(args.envelope.updatedAt);
  const serverTime = Date.parse(args.server.integrity.savedAt);
  if (!Number.isFinite(localTime) || !Number.isFinite(serverTime)) {
    return { kind: "server", save: args.server, archiveLocal: true };
  }
  if (localTime <= serverTime) {
    return { kind: "server", save: args.server, archiveLocal: false };
  }
  return { kind: "local", save: mergeRecoveryWithAuthoritativeServer(args.server, args.envelope), envelope: args.envelope };
}
