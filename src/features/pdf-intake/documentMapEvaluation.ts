import { normalizeText } from "./normalization";
import type {
  DocumentMap,
  DocumentMapEvaluationReport,
  DocumentMapPage,
  DocumentMapRoom,
  RoomPageLink
} from "./types";

const RELEVANT_PAGE_TYPES = new Set(["furniture_floor_plan", "furniture_technical_sheet", "visualization"]);
const AREA_TOLERANCE = 0.2;

export function evaluateDocumentMap(generated: DocumentMap, expected: DocumentMap): DocumentMapEvaluationReport {
  const pageMatches = expected.pages.map((expectedPage) => ({
    expected: expectedPage,
    actual: generated.pages.find((page) => page.pageNumber === expectedPage.pageNumber)
  }));
  const evaluatedPages = pageMatches.filter((match) => match.actual).length;
  const correctPageTypes = pageMatches.filter((match) => match.actual?.pageType === match.expected.pageType).length;
  const expectedRelevant = expected.pages.filter((page) => RELEVANT_PAGE_TYPES.has(page.pageType));
  const foundRelevant = expectedRelevant.filter((page) =>
    generated.pages.some((candidate) => candidate.pageNumber === page.pageNumber && RELEVANT_PAGE_TYPES.has(candidate.pageType))
  );
  const expectedFurniturePlans = expected.pages.filter((page) => page.pageType === "furniture_floor_plan");
  const foundFurniturePlans = expectedFurniturePlans.filter((page) =>
    generated.pages.some((candidate) => candidate.pageNumber === page.pageNumber && candidate.pageType === "furniture_floor_plan")
  );
  const expectedFloors = new Set(expected.pages.map((page) => page.floorId).filter((floorId): floorId is string => Boolean(floorId)));
  const floorMatches = expected.pages.filter((page) => page.floorId).filter((page) =>
    generated.pages.some((candidate) => candidate.pageNumber === page.pageNumber && candidate.floorId === page.floorId)
  );
  const expectedPrimaryFloors = expected.floors.filter((floor) => floor.primaryFurniturePlanPages.length > 0 || floor.fallbackMeasurementPlanPages.length > 0);
  const foundPrimaryFloors = expectedPrimaryFloors.filter((floor) => {
    const generatedFloor = generated.floors.find((candidate) => candidate.floorId === floor.floorId);
    if (!generatedFloor) return false;
    return generatedFloor.primaryFurniturePlanPages.length > 0 || generatedFloor.fallbackMeasurementPlanPages.length > 0;
  });
  const expectedRooms = expected.floors.flatMap((floor) => floor.rooms);
  const generatedRooms = generated.floors.flatMap((floor) => floor.rooms);
  const roomMatches = expectedRooms.map((expectedRoom) => ({
    expected: expectedRoom,
    actual: findMatchingRoom(generatedRooms, expectedRoom)
  }));
  const expectedLinks = expected.roomPageLinks.filter((link) => link.roomId);
  const generatedLinks = generated.roomPageLinks.filter((link) => link.roomId);
  const linkMatches = expectedLinks.filter((link) => findMatchingLink(generatedLinks, link));
  const falsePositiveTechnicalAsFurniture = expected.pages.filter((expectedPage) => expectedPage.pageType === "technical_floor_plan").filter((expectedPage) =>
    generated.pages.some((page) => page.pageNumber === expectedPage.pageNumber && page.pageType === "furniture_floor_plan")
  ).length;
  const warnings = [
    ...pageMatches.filter((match) => match.actual && match.actual.pageType !== match.expected.pageType).map((match) => `page ${match.expected.pageNumber}: expected ${match.expected.pageType}, got ${match.actual?.pageType}`),
    ...roomMatches.filter((match) => !match.actual).map((match) => `missing room ${roomKey(match.expected)}`),
    ...expectedLinks.filter((link) => !findMatchingLink(generatedLinks, link)).map((link) => `missing link ${link.roomId ?? link.roomType}: pages ${link.pageNumbers.join(",")}`)
  ];

  return {
    fileName: generated.fileName,
    pageTypeAccuracy: expected.pages.length > 0 ? round(correctPageTypes / expected.pages.length) : 0,
    relevantPageRecall: expectedRelevant.length > 0 ? round(foundRelevant.length / expectedRelevant.length) : 0,
    furnitureFloorPlanRecall: expectedFurniturePlans.length > 0 ? round(foundFurniturePlans.length / expectedFurniturePlans.length) : 0,
    floorDetectionAccuracy: expectedFloors.size > 0 ? round(floorMatches.length / expected.pages.filter((page) => page.floorId).length) : 0,
    falsePositiveTechnicalAsFurniture,
    evaluatedPages,
    primaryFurniturePlan: {
      expectedFloors: expectedPrimaryFloors.length,
      foundFloors: foundPrimaryFloors.length,
      missingFloorIds: expectedPrimaryFloors.filter((floor) => !foundPrimaryFloors.includes(floor)).map((floor) => floor.floorId)
    },
    rooms: {
      expected: expectedRooms.length,
      found: roomMatches.filter((match) => match.actual).length,
      missing: roomMatches.filter((match) => !match.actual).map((match) => roomKey(match.expected)),
      roomTypeMatches: roomMatches.filter((match) => match.actual?.roomType === match.expected.roomType).length,
      areaMatches: roomMatches.filter((match) => areasMatch(match.actual, match.expected)).length,
      areaTolerance: AREA_TOLERANCE
    },
    roomPageLinks: {
      expected: expectedLinks.length,
      found: linkMatches.length,
      missing: expectedLinks.filter((link) => !findMatchingLink(generatedLinks, link)).map((link) => `${link.roomId ?? link.roomType}:${link.pageNumbers.join(",")}`)
    },
    warnings
  };
}

function findMatchingRoom(rooms: DocumentMapRoom[], expected: DocumentMapRoom): DocumentMapRoom | undefined {
  return rooms.find((room) => room.roomId === expected.roomId)
    ?? rooms.find((room) => room.floorId === expected.floorId && room.roomNumber === expected.roomNumber)
    ?? rooms.find((room) => room.floorId === expected.floorId && room.roomType === expected.roomType && namesMatch(room, expected));
}

function findMatchingLink(links: RoomPageLink[], expected: RoomPageLink): RoomPageLink | undefined {
  return links.find((link) => {
    const sameRoom = link.roomId === expected.roomId || (link.roomType === expected.roomType && normalizeText(link.roomNameOriginal ?? "") === normalizeText(expected.roomNameOriginal ?? ""));
    const hasPages = expected.pageNumbers.every((pageNumber) => link.pageNumbers.includes(pageNumber));
    const hasType = expected.linkTypes.every((type) => link.linkTypes.includes(type));
    return sameRoom && hasPages && hasType;
  });
}

function namesMatch(room: DocumentMapRoom, expected: DocumentMapRoom): boolean {
  const left = normalizeText(room.nameOriginal ?? "");
  const right = normalizeText(expected.nameOriginal ?? "");
  return Boolean(left && right && (left.includes(right) || right.includes(left)));
}

function areasMatch(actual: DocumentMapRoom | undefined, expected: DocumentMapRoom): boolean {
  if (!actual) return false;
  const expectedArea = expected.knownParameters.areaM2;
  const actualArea = actual.knownParameters.areaM2;
  if (expectedArea === undefined || expectedArea === null) return true;
  if (actualArea === undefined || actualArea === null) return false;
  return Math.abs(actualArea - expectedArea) <= AREA_TOLERANCE;
}

function roomKey(room: DocumentMapRoom): string {
  return `${room.floorId}:${room.roomNumber ?? ""}:${room.roomType}:${room.nameOriginal ?? ""}`;
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
