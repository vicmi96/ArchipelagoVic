// Builds ArchipelagoClient.html: the text client as one self-contained file
// you can open in any browser (no Archipelago install or Electron needed).
const fs = require("fs"), path = require("path");
const dir = path.join(__dirname, "..", "renderer");
let html = fs.readFileSync(path.join(dir, "client.html"), "utf8");
const css = fs.readFileSync(path.join(dir, "styles.css"), "utf8");
const js = fs.readFileSync(path.join(dir, "client.js"), "utf8");
const before = html;
html = html
  .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\r?\n/, "")
  .replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script src="client.js"></script>', () => `<script>\n${js}\n</script>`);
if (html === before || html.includes('src="client.js"') || html.includes('href="styles.css"')) { console.error("client.html changed shape; standalone not built."); process.exit(1); }
const out = path.join(__dirname, "..", "ArchipelagoClient.html");
fs.writeFileSync(out, html);
console.log("Wrote " + out);
