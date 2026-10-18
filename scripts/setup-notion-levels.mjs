// One-time: adds the "Level" column (琐碎事情 / 思考过的事情 / 准备输出的事情) to your Notion Idea Vault.
//   npm run notion:levels
import { ensureLevelProperty } from "../lib/server/memory.js";

if (!process.env.NOTION_API_KEY || !process.env.NOTION_IDEA_VAULT_DATA_SOURCE_ID) {
  console.error("Set NOTION_API_KEY and NOTION_IDEA_VAULT_DATA_SOURCE_ID in .env.local first.");
  process.exit(1);
}
const { changed } = await ensureLevelProperty();
console.log(changed ? "Added the Level column to the Idea Vault." : "Level column already set up.");
