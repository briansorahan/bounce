import { OnsetFeature } from "./index";

console.log("Step 1: Loading native addon...");
try {
  const addon = require("../build/Release/flucoma_native.node");
  console.log("✅ Native addon loaded");
  console.log("Addon exports:", Object.keys(addon));

  console.log("\nStep 2: Creating OnsetFeature with minimal options...");
  const analyzer = new addon.OnsetFeature({});
  console.log("✅ OnsetFeature created!");

  console.log("\n✅ Success! The binding works.");
} catch (error) {
  console.error("❌ Error:", error);
  if (error instanceof Error) {
    console.error("Stack:", error.stack);
  }
  process.exit(1);
}
