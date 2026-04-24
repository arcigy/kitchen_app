import "./style.css";
import { startApp } from "./app";
import { initDomI18n } from "./i18n";
import { initializeInstallableApp } from "./pwa/installController";

const viewer = document.getElementById("viewer");
const ribbon = document.getElementById("ribbon");
const properties = document.getElementById("properties");

if (!viewer || !ribbon || !properties) {
  throw new Error("Missing required DOM elements (viewer/ribbon/properties).");
}

initDomI18n(document.body);
initializeInstallableApp();

startApp({
  viewerEl: viewer,
  ribbonEl: ribbon,
  propertiesEl: properties
});
