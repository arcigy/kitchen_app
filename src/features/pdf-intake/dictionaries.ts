import { normalizeText } from "./normalization";
import type { FurnitureType, RoomType } from "./types";

export type DictionaryEntry = {
  normalized: string;
  synonyms: string[];
};

type FurnitureDictionary = Record<Exclude<FurnitureType, "unknown">, string[]>;
type RoomDictionary = Record<Exclude<RoomType, "unknown">, string[]>;

export const FURNITURE_DICT: FurnitureDictionary = {
  built_in_cabinet: ["vstavana skrina", "built-in cabinet", "built in cabinet", "einbauschrank", "einbaumobel", "\u0432\u0441\u0442\u0440\u043e\u0435\u043d\u043d\u044b\u0439 \u0448\u043a\u0430\u0444"],
  wardrobe: ["skrina", "skrin", "wardrobe", "closet", "schrank", "\u0448\u043a\u0430\u0444"],
  kitchen: ["kuchyna", "kuchynska linka", "kitchen", "kitchen unit", "kuche", "kuchenzeile", "\u043a\u0443\u0445\u043d\u044f", "\u043a\u0443\u0445\u043e\u043d\u043d\u044b\u0439 \u0433\u0430\u0440\u043d\u0438\u0442\u0443\u0440"],
  laundry_cabinet: ["laundry cabinet", "skrinka do pracovne", "skrinka do pradelne"],
  cabinet: ["skrinka", "cabinet", "\u0442\u0443\u043c\u0431\u0430"],
  shelves: ["police", "polica", "policky", "shelves", "shelf", "regal", "ablage", "\u043f\u043e\u043b\u043a\u0438", "\u043f\u043e\u043b\u043a\u0430"],
  tv_unit: ["tv skrinka", "tv konzola", "tv unit", "tv console", "tv mobel", "tv lowboard", "\u0442\u0432 \u043a\u043e\u043d\u0441\u043e\u043b\u044c", "tv \u043a\u043e\u043d\u0441\u043e\u043b\u044c"],
  vanity: ["vanity", "umyvadlova skrinka", "skrinka pod umyvadlo"],
  desk: ["pracovny stol", "pisaci stol", "desk", "schreibtisch", "\u043f\u0438\u0441\u044c\u043c\u0435\u043d\u043d\u044b\u0439 \u0441\u0442\u043e\u043b", "\u0440\u0430\u0431\u043e\u0447\u0438\u0439 \u0441\u0442\u043e\u043b"],
  bench: ["lavica", "bench", "bank", "\u043b\u0430\u0432\u043a\u0430", "\u0441\u043a\u0430\u043c\u044c\u044f"],
  dresser: ["komoda", "dresser", "kommode", "\u043a\u043e\u043c\u043e\u0434"],
  wall_panel: ["obklad", "stenovy panel", "wall panel", "wandpaneel", "\u0441\u0442\u0435\u043d\u043e\u0432\u044b\u0435 \u043f\u0430\u043d\u0435\u043b\u0438", "\u043f\u0430\u043d\u0435\u043b\u044c"],
  partition: ["priecka", "partition", "trennwand", "\u043f\u0435\u0440\u0435\u0433\u043e\u0440\u043e\u0434\u043a\u0430"],
  island: ["ostrov", "island", "kucheninsel", "\u043e\u0441\u0442\u0440\u043e\u0432"],
  countertop: ["pracovna doska", "countertop", "arbeitsplatte", "\u0441\u0442\u043e\u043b\u0435\u0448\u043d\u0438\u0446\u0430"],
  mirror: ["zrkadlo", "mirror", "spiegel", "\u0437\u0435\u0440\u043a\u0430\u043b\u043e"],
  tv: ["tv", "television", "fernseher"],
  sofa: ["sedacka", "gauc", "sofa", "\u0434\u0438\u0432\u0430\u043d"],
  table: ["jedalensky stol", "stol", "dining table", "table", "esstisch", "tisch", "\u043e\u0431\u0435\u0434\u0435\u043d\u043d\u044b\u0439 \u0441\u0442\u043e\u043b", "\u0441\u0442\u043e\u043b"],
  chair: ["barova stolicka", "stolicka", "bar stool", "chair", "barstuhl", "stuhl", "\u0431\u0430\u0440\u043d\u044b\u0439 \u0441\u0442\u0443\u043b", "\u0441\u0442\u0443\u043b"],
  armchair: ["kreslo", "armchair", "sessel", "\u043a\u0440\u0435\u0441\u043b\u043e"],
  rug: ["koberec", "rug", "teppich", "\u043a\u043e\u0432\u0435\u0440"],
  lighting: ["svetlo", "osvetlenie", "lighting", "leuchte", "beleuchtung"],
  appliance: ["chladnicka", "rura", "mikrovlnka", "varna doska", "pracka", "susicka", "fridge", "oven", "microwave", "hob", "washing machine", "dryer", "kuhlschrank", "backofen", "mikrowelle", "kochfeld", "waschmaschine", "trockner", "\u0445\u043e\u043b\u043e\u0434\u0438\u043b\u044c\u043d\u0438\u043a", "\u0434\u0443\u0445\u043e\u0432\u043a\u0430", "\u043c\u0438\u043a\u0440\u043e\u0432\u043e\u043b\u043d\u043e\u0432\u043a\u0430", "\u0432\u0430\u0440\u043e\u0447\u043d\u0430\u044f \u043f\u0430\u043d\u0435\u043b\u044c", "\u0441\u0442\u0438\u0440\u0430\u043b\u044c\u043d\u0430\u044f \u043c\u0430\u0448\u0438\u043d\u0430", "\u0441\u0443\u0448\u0438\u043b\u044c\u043d\u0430\u044f \u043c\u0430\u0448\u0438\u043d\u0430"],
  sink: ["umyvadlo", "drez", "sink", "waschbecken", "spule", "\u0443\u043c\u044b\u0432\u0430\u043b\u044c\u043d\u0438\u043a", "\u043c\u043e\u0439\u043a\u0430", "\u0440\u0430\u043a\u043e\u0432\u0438\u043d\u0430"],
  toilet: ["wc", "toilet", "\u0443\u043d\u0438\u0442\u0430\u0437"],
  bathtub: ["vana", "bathtub", "badewanne", "\u0432\u0430\u043d\u043d\u0430"],
  shower: ["sprcha", "shower", "dusche", "\u0434\u0443\u0448\u0435\u0432\u0430\u044f \u0441\u0438\u0441\u0442\u0435\u043c\u0430"],
  decor: ["dekor", "decor", "decoration"],
  drying_rack: ["susiak", "drying rack", "waschestander", "\u0441\u0443\u0448\u043a\u0430"],
  picture: ["obraz", "picture", "bild", "\u043a\u0430\u0440\u0442\u0438\u043d\u0430"],
  air_conditioner: ["klimatizacia", "air conditioner", "klimaanlage", "\u043a\u043e\u043d\u0434\u0438\u0446\u0438\u043e\u043d\u0435\u0440"],
  bed: ["postel", "bed", "bett", "\u043a\u0440\u043e\u0432\u0430\u0442\u044c"]
};

export const ROOM_DICT: RoomDictionary = {
  kitchen_living_room: ["kuchyna obyvacka", "kuchyne obyvak", "kitchen living room", "kuche wohnzimmer", "\u043a\u0443\u0445\u043d\u044f-\u0433\u043e\u0441\u0442\u0438\u043d\u0430\u044f", "\u043a\u0443\u0445\u043d\u044f \u0433\u043e\u0441\u0442\u0438\u043d\u0430\u044f"],
  corridor_stairs: ["chodba schodisko", "corridor stairs", "\u043a\u043e\u0440\u0438\u0434\u043e\u0440-\u043b\u0435\u0441\u0442\u043d\u0438\u0446\u0430", "\u043a\u043e\u0440\u0438\u0434\u043e\u0440 \u043b\u0435\u0441\u0442\u043d\u0438\u0446\u0430"],
  utility_laundry: ["technicka miestnost pracovna", "utility laundry", "hauswirtschaftsraum", "\u043a\u043e\u0442\u0435\u043b\u044c\u043d\u0430\u044f-\u043f\u0440\u0430\u0447\u0435\u0447\u043d\u0430\u044f", "\u043a\u043e\u0442\u0435\u043b\u044c\u043d\u0430\u044f \u043f\u0440\u0430\u0447\u0435\u0447\u043d\u0430\u044f"],
  guest_wc: ["guest wc", "host wc", "\u0433\u043e\u0441\u0442\u0435\u0432\u043e\u0439 wc"],
  kitchen: ["kuchyna", "kitchen", "kuche", "\u043a\u0443\u0445\u043d\u044f"],
  living_room: ["obyvacka", "living room", "wohnzimmer", "\u0433\u043e\u0441\u0442\u0438\u043d\u0430\u044f"],
  bedroom: ["spalna", "bedroom", "schlafzimmer", "\u0441\u043f\u0430\u043b\u044c\u043d\u044f"],
  bathroom: ["kupelna", "bathroom", "bad", "\u0432\u0430\u043d\u043d\u0430\u044f"],
  wc: ["wc", "toilet", "toilette", "\u0442\u0443\u0430\u043b\u0435\u0442"],
  entry_hall: ["entry hall", "entrance hall", "foyer", "vestibule", "vstupna hala", "vstupna chodba", "zadverie", "predsien", "eingang", "eingangshalle", "diele", "vorraum", "\u043f\u0440\u0438\u0445\u043e\u0436\u0430\u044f"],
  hallway: ["chodba", "hall", "flur", "\u043a\u043e\u0440\u0438\u0434\u043e\u0440"],
  stairs: ["schodisko", "stairs", "staircase", "treppe", "\u043b\u0435\u0441\u0442\u043d\u0438\u0446\u0430"],
  office: ["pracovna", "office", "buro", "\u043a\u0430\u0431\u0438\u043d\u0435\u0442"],
  children_room: ["detska", "kinderzimmer", "\u0434\u0435\u0442\u0441\u043a\u0430\u044f"],
  boiler_room: ["kotolna", "boiler room", "technikraum", "heizraum", "\u043a\u043e\u0442\u0435\u043b\u044c\u043d\u0430\u044f"],
  utility_room: ["technicka miestnost", "utility room", "technikraum"],
  laundry: ["pradlo", "laundry", "\u043f\u0440\u0430\u0447\u0435\u0447\u043d\u0430\u044f"],
  laundry_room: ["pradelna", "laundry room", "waschkuche", "waschraum"],
  walk_in_closet: ["satnik", "walk in closet", "garderobe", "\u0433\u0430\u0440\u0434\u0435\u0440\u043e\u0431\u043d\u0430\u044f"]
};

export function createDictionaryEntries<T extends string>(dictionary: Record<T, string[]>): Record<T, DictionaryEntry> {
  const entries = {} as Record<T, DictionaryEntry>;

  for (const [key, synonyms] of Object.entries(dictionary) as Array<[T, string[]]>) {
    entries[key] = {
      normalized: key,
      synonyms: Array.from(new Set(synonyms.map(normalizeText)))
    };
  }

  return entries;
}

export const FURNITURE_ENTRIES = createDictionaryEntries(FURNITURE_DICT);
export const ROOM_ENTRIES = createDictionaryEntries(ROOM_DICT);
