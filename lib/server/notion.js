export const NOTION_VERSION = "2026-03-11";

export const notionHeaders = (token = process.env.NOTION_API_KEY) => ({
  Authorization: `Bearer ${token}`,
  "Notion-Version": NOTION_VERSION,
  "Content-Type": "application/json",
});

export const notionConfigured = () =>
  !!(process.env.NOTION_API_KEY && process.env.NOTION_IDEA_VAULT_DATA_SOURCE_ID);

// Fetch against the Notion API; returns parsed JSON and throws with Notion's message on errors.
export async function notionFetch(path, { method = "GET", body, headers } = {}) {
  const res = await fetch(`https://api.notion.com${path}`, {
    method,
    headers: headers || notionHeaders(),
    body: body === undefined ? undefined : typeof body === "string" || body instanceof FormData ? body : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Notion ${res.status}`);
  return data;
}

// Notion's multi_select does NOT auto-create unrecognized option names on
// page create (confirmed against the live API) - an option has to already
// exist in the property's schema first, or the request 400s. Skills are
// created dynamically by the user, so we register any new one here before
// referencing it on the page.
async function ensureSkillOption(dataSourceId, skillName) {
  let ds;
  try {
    ds = await notionFetch(`/v1/data_sources/${dataSourceId}`);
  } catch {
    return;
  }
  const existing = ds.properties?.Skill?.multi_select?.options || [];
  if (existing.some((o) => o.name === skillName)) return;
  await notionFetch(`/v1/data_sources/${dataSourceId}`, {
    method: "PATCH",
    body: { properties: { Skill: { multi_select: { options: [...existing, { name: skillName }] } } } },
  }).catch(() => {});
}

// Pushes one diary entry into the Idea Vault. Ideas are filed as "思考过的事情" (and wait in the
// Inbox for review); everyday diary entries as "琐碎事情" (kept out of the review pipeline).
// Returns { pageId } or { error }.
export async function syncIdeaToNotion({ text, photoUrl, entryId, skill, level = "思考过的事情" }) {
  const dataSourceId = process.env.NOTION_IDEA_VAULT_DATA_SOURCE_ID;
  if (!process.env.NOTION_API_KEY || !dataSourceId) return { error: "Notion sync not configured" };

  const properties = {
    Name: { title: [{ text: { content: text.trim().slice(0, 80) } }] },
    Notes: { rich_text: [{ text: { content: text.slice(0, 2000) } }] },
    "XPLog ID": { rich_text: [{ text: { content: entryId } }] },
  };
  if (level !== "琐碎事情") properties.Status = { select: { name: "Inbox" } };
  if (photoUrl) properties.Screenshot = { files: [{ type: "external", name: "photo", external: { url: photoUrl } }] };

  try {
    if (skill) {
      await ensureSkillOption(dataSourceId, skill);
      properties.Skill = { multi_select: [{ name: skill }] };
    }
    const create = (props) => notionFetch("/v1/pages", {
      method: "POST",
      body: { parent: { type: "data_source_id", data_source_id: dataSourceId }, properties: props },
    });
    let page;
    try {
      page = await create({ ...properties, Level: { select: { name: level } } });
    } catch {
      page = await create(properties); // database without the Level column yet
    }
    return { pageId: page.id };
  } catch (err) {
    return { error: err.message || "notion sync failed" };
  }
}
