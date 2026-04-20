import "./style.css";
import { startApp } from "./app";

const viewer = document.getElementById("viewer");
const ribbon = document.getElementById("ribbon");
const properties = document.getElementById("properties");

if (!viewer || !ribbon || !properties) {
  throw new Error("Missing required DOM elements (viewer/ribbon/properties).");
}

startApp({
  viewerEl: viewer,
  ribbonEl: ribbon,
  propertiesEl: properties
});
