import { priceList } from "../../data/pricing/priceList";
import { demosPriceListTemplate } from "./demosCatalog";

export const systemPriceListTemplate = {
  ...demosPriceListTemplate,
  prices: {
    ...demosPriceListTemplate.prices,
    "cmp.leg.adjustable.100.black": priceList.prices["cmp.leg.adjustable.100.black"],
    "cmp.leg.adjustable.100.white": priceList.prices["cmp.leg.adjustable.100.white"],
    "cmp.leg.adjustable.150.black": priceList.prices["cmp.leg.adjustable.150.black"],
    "cmp.leg.adjustable.150.inox": priceList.prices["cmp.leg.adjustable.150.inox"],
    "cmp.clip.plinth.standard": priceList.prices["cmp.clip.plinth.standard"],
    "cmp.clip.plinth.heavy": priceList.prices["cmp.clip.plinth.heavy"]
  }
};
