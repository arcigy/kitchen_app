import type { PriceList } from "./types";

const priceEntries = [
  ["mat.board.body.dtd.white.18", 24.5],
  ["mat.board.body.dtd.grey.18", 26.8],
  ["mat.board.body.dtd.anthracite.18", 29.9],
  ["mat.board.body.dtd.black.18", 31.5],
  ["mat.board.body.dtd.oak_natural.18", 34.5],
  ["mat.board.body.dtd.halifax_oak.18", 39.8],
  ["mat.board.body.plywood.birch.18", 46.5],
  ["mat.board.body.moisture_resistant.green.18", 51.9],

  ["mat.board.front.mdf.white_supermat.18", 54],
  ["mat.board.front.mdf.white_supermat.19", 55],
  ["mat.board.front.mdf.cashmere_supermat.19", 61],
  ["mat.board.front.mdf.graphite_supermat.19", 63.5],
  ["mat.board.front.mdf.blue_supermat.19", 67.5],
  ["mat.board.front.mdf.olive_supermat.19", 68],
  ["mat.board.front.mdf.sand_beige_supermat.19", 59.5],
  ["mat.board.front.acrylic.white_gloss.18", 72],
  ["mat.board.front.acrylic.black_gloss.18", 79],
  ["mat.board.front.veneer.oak_natural.19", 88],
  ["mat.board.front.veneer.walnut.19", 96],

  ["mat.board.back.hdf.white.6", 12.5],
  ["mat.board.back.hdf.grey.6", 13.8],
  ["mat.board.back.hdf.white.8", 18.5],
  ["mat.board.back.hdf.grey.8", 19.8],

  ["mat.board.drawer_box.plywood.birch.13", 34],
  ["mat.board.drawer_box.plywood.grey.13", 36],
  ["mat.board.drawer_box.plywood.white.13", 35.5],
  ["mat.board.drawer_box.multiplex.birch.15", 49],

  ["mat.board.drawer_bottom.hdf.white.8", 16.5],
  ["mat.board.drawer_bottom.hdf.grey.8", 17.8],
  ["mat.board.drawer_bottom.plywood.birch.8", 31.5],
  ["mat.board.drawer_bottom.hdf.anthracite.8", 19.5],

  ["mat.board.shelf.dtd.white.18", 24],
  ["mat.board.shelf.dtd.grey.18", 26.5],
  ["mat.board.shelf.dtd.oak_natural.18", 34],
  ["mat.board.shelf.plywood.birch.18", 46],

  ["mat.board.worktop.laminate_oak.38", 68],
  ["mat.board.worktop.laminate_walnut.38", 74],
  ["mat.board.worktop.laminate_white_marble.38", 82],
  ["mat.board.worktop.laminate_black_stone.38", 88],
  ["mat.board.worktop.compact.black.12", 138],
  ["mat.board.worktop.compact.white.12", 145],

  ["mat.edge.body.abs.white.0_8", 0.55],
  ["mat.edge.body.abs.white.2", 1.15],
  ["mat.edge.body.abs.grey.0_8", 0.62],
  ["mat.edge.body.abs.grey.2", 1.25],
  ["mat.edge.body.abs.anthracite.0_8", 0.68],
  ["mat.edge.body.abs.anthracite.2", 1.32],
  ["mat.edge.body.abs.black.0_8", 0.74],
  ["mat.edge.body.abs.oak_natural.2", 1.48],
  ["mat.edge.body.abs.halifax_oak.2", 1.68],
  ["mat.edge.front.abs.white.1", 0.95],
  ["mat.edge.front.abs.white.2", 1.4],
  ["mat.edge.front.abs.cashmere.1", 1.08],
  ["mat.edge.front.abs.cashmere.2", 1.54],
  ["mat.edge.front.abs.blue.1", 1.18],
  ["mat.edge.front.abs.blue.2", 1.72],
  ["mat.edge.front.abs.graphite.1", 1.12],
  ["mat.edge.drawer_box.abs.grey.1", 0.88],
  ["mat.edge.drawer_box.abs.white.1", 0.84],
  ["mat.edge.shelf.abs.white.2", 1.22],
  ["mat.edge.shelf.abs.oak_natural.2", 1.52],
  ["mat.edge.worktop.abs_oak.2", 2.1],
  ["mat.edge.worktop.abs_black_stone.2", 2.55],

  ["cmp.runner.pair.300.standard", 9.8],
  ["cmp.runner.pair.350.standard", 11.2],
  ["cmp.runner.pair.400.standard", 13.5],
  ["cmp.runner.pair.450.standard", 15.9],
  ["cmp.runner.pair.500.standard", 18.8],
  ["cmp.runner.pair.400.premium_softclose", 26.5],
  ["cmp.runner.pair.450.premium_softclose", 31],
  ["cmp.runner.pair.500.premium_softclose", 36.5],

  ["cmp.handle.bar.160.black", 5.2],
  ["cmp.handle.bar.160.inox", 4.9],
  ["cmp.handle.bar.160.brass", 8.8],
  ["cmp.handle.bar.192.black", 5.9],
  ["cmp.handle.bar.192.inox", 5.4],
  ["cmp.handle.bar.192.brass", 9.6],
  ["cmp.handle.profile.aluminium", 12.5],
  ["cmp.handle.profile.black", 14.2],
  ["cmp.handle.knob.round.black", 3.9],
  ["cmp.handle.knob.round.brass", 6.8],

  ["cmp.leg.adjustable.100.black", 1.45],
  ["cmp.leg.adjustable.100.white", 1.55],
  ["cmp.leg.adjustable.150.black", 2.1],
  ["cmp.leg.adjustable.150.inox", 2.95],

  ["cmp.clip.plinth.standard", 0.42],
  ["cmp.clip.plinth.heavy", 0.78],

  ["cmp.fastener.carcass.standard", 0.12],
  ["cmp.fastener.confirmat.7x50", 0.14],
  ["cmp.fastener.shelf_pin.standard", 0.08],
  ["cmp.fastener.handle_screw.m4", 0.06],
  ["cmp.fastener.euro_screw.6_3x13", 0.07],
  ["cmp.fastener.drawer_fixing_screw.3_5x16", 0.09],

  ["cmp.hinge.clip_on.standard", 3.2],
  ["cmp.hinge.clip_on.softclose", 5.6],
  ["cmp.hinge.corner.45.softclose", 7.8],
  ["cmp.hinge.wide_angle.155.softclose", 9.5],
  ["cmp.hinge.fridge_integrated.softclose", 5.6],

  ["cmp.push_to_open.standard.grey", 5.4],
  ["cmp.push_to_open.magnetic.white", 8.9],

  ["cmp.hanging_bracket.wall.standard", 3.4],
  ["cmp.hanging_bracket.wall.heavy", 5.8],

  ["cmp.shelf_support.standard.nickel", 0.15],
  ["cmp.shelf_support.glass.nickel", 0.32],

  ["cmp.drawer_insert.cutlery.standard.grey", 18.5],
  ["cmp.drawer_insert.cutlery.premium.anthracite", 34],

  ["cmp.lift_up.standard.600", 39],
  ["cmp.lift_up.softclose.600", 68],

  ["cmp.waste_bin.pull_out.400.standard", 58],
  ["cmp.led_profile.drawer.500.warmwhite", 24]
] as const satisfies ReadonlyArray<readonly [string, number]>;

export const priceList: PriceList = {
  id: "pricelist.demo.kitchen_modules.sk.2026",
  name: "Demo Kitchen Pricing Catalog SK 2026",
  currency: "EUR",
  isActive: true,
  prices: Object.fromEntries(priceEntries)
};

export function getUnitPriceForCatalogId(catalogId: string): number | null {
  return priceList.prices[catalogId] ?? null;
}
