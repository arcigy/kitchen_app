import { normalizeText } from "./normalization";
import type { ProjectContextEvaluationReport, ProjectContextExport } from "./types";

const AREA_TOLERANCE_M2 = 0.2;

export function evaluateProjectContext(
  generated: ProjectContextExport,
  expected: ProjectContextExport
): ProjectContextEvaluationReport {
  const floorMatches = expected.floors.map((expectedFloor) => ({
    expected: expectedFloor,
    actual: generated.floors.find((floor) => floor.id === expectedFloor.id || floor.label === expectedFloor.label)
  }));

  const roomMatches = expected.rooms.map((expectedRoom) => ({
    expected: expectedRoom,
    actual: findRoom(generated, expectedRoom)
  }));

  const furnitureMatches = expected.detectedFurniture.map((expectedFurniture) => ({
    expected: expectedFurniture,
    actual: findFurniture(generated, expectedFurniture)
  }));

  const relatedPageChecks = [
    ...roomMatches.flatMap(({ expected: expectedRoom, actual }) =>
      expectedRoom.relatedPages.map((pageNumber) => ({
        expectedOwnerId: expectedRoom.id,
        pageNumber,
        ok: Boolean(actual?.relatedPages.includes(pageNumber)),
        foundOwner: Boolean(actual)
      }))
    ),
    ...furnitureMatches.flatMap(({ expected: expectedFurniture, actual }) =>
      expectedFurniture.relatedPages.map((pageNumber) => ({
        expectedOwnerId: expectedFurniture.id,
        pageNumber,
        ok: Boolean(actual?.relatedPages.includes(pageNumber)),
        foundOwner: Boolean(actual)
      }))
    )
  ];

  const wrongRoomAssignments = furnitureMatches
    .filter(({ expected, actual }) => expected.roomId && actual && actual.roomId !== expected.roomId)
    .map(({ expected, actual }) => ({
      expectedFurnitureId: expected.id,
      expectedRoomId: expected.roomId,
      actualRoomId: actual?.roomId
    }));

  return {
    fileName: generated.fileName,
    floorDetection: {
      expected: expected.floors.length,
      found: floorMatches.filter((match) => match.actual).length,
      missing: floorMatches.filter((match) => !match.actual).map((match) => match.expected.id),
      accuracy: ratio(floorMatches.filter((match) => match.actual).length, expected.floors.length)
    },
    roomDetection: {
      expected: expected.rooms.length,
      found: roomMatches.filter((match) => match.actual).length,
      missing: roomMatches.filter((match) => !match.actual).map((match) => roomLabel(match.expected)),
      nameNormalizedMatches: roomMatches.filter((match) => match.actual?.nameNormalized === match.expected.nameNormalized).length,
      areaMatches: roomMatches.filter((match) => areaMatches(match.expected.areaM2, match.actual?.areaM2)).length,
      areaTolerance: AREA_TOLERANCE_M2
    },
    furnitureDetection: {
      expected: expected.detectedFurniture.length,
      found: furnitureMatches.filter((match) => match.actual).length,
      missing: furnitureMatches.filter((match) => !match.actual).map((match) => match.expected.id || match.expected.typeNormalized),
      typeNormalizedMatches: furnitureMatches.filter((match) => match.actual?.typeNormalized === match.expected.typeNormalized).length,
      roomAssignmentMatches: furnitureMatches.filter((match) => match.actual && (!match.expected.roomId || match.actual.roomId === match.expected.roomId)).length,
      wrongRoomAssignments
    },
    relatedPageAssignment: {
      expected: relatedPageChecks.length,
      correct: relatedPageChecks.filter((check) => check.ok).length,
      wrong: relatedPageChecks.filter((check) => check.foundOwner && !check.ok).length,
      missing: relatedPageChecks.filter((check) => !check.foundOwner).length,
      mistakes: relatedPageChecks
        .filter((check) => !check.ok)
        .map((check) => ({
          expectedOwnerId: check.expectedOwnerId,
          pageNumber: check.pageNumber,
          status: check.foundOwner ? "wrong" : "missing"
        }))
    },
    unassignedPages: generated.unassignedPages
  };
}

function findRoom(generated: ProjectContextExport, expectedRoom: ProjectContextExport["rooms"][number]): ProjectContextExport["rooms"][number] | undefined {
  return generated.rooms.find((room) => {
    if (expectedRoom.id && room.id === expectedRoom.id) return true;
    if (expectedRoom.roomNumber && room.roomNumber === expectedRoom.roomNumber) return true;
    if (room.nameNormalized === expectedRoom.nameNormalized && normalizeText(room.nameOriginal) === normalizeText(expectedRoom.nameOriginal)) return true;
    return false;
  });
}

function findFurniture(
  generated: ProjectContextExport,
  expectedFurniture: ProjectContextExport["detectedFurniture"][number]
): ProjectContextExport["detectedFurniture"][number] | undefined {
  return generated.detectedFurniture.find((item) => {
    if (expectedFurniture.id && item.id === expectedFurniture.id) return true;
    if (item.typeNormalized !== expectedFurniture.typeNormalized) return false;
    return true;
  });
}

function areaMatches(expected: number | undefined, actual: number | undefined): boolean {
  if (expected === undefined) return true;
  if (actual === undefined) return false;
  return Math.abs(expected - actual) <= AREA_TOLERANCE_M2;
}

function roomLabel(room: ProjectContextExport["rooms"][number]): string {
  return room.roomNumber ? `${room.roomNumber} ${room.nameOriginal}` : room.nameOriginal || room.nameNormalized;
}

function ratio(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 10000) / 10000 : 0;
}
