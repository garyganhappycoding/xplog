const NOTION_VERSION = "2026-03-11";

export async function POST(req) {
  const { text, photoUrl, entryId, skill } = await req.json();

  if (!text || !entryId) {
    return Response.json({ error: "text and entryId required" }, { status: 400 });
  }

  const token = process.env.NOTION_API_KEY;
  const dataSourceId = process.env.NOTION_IDEA_VAULT_DATA_SOURCE_ID;
  if (!token || !dataSourceId) {
    return Response.json({ error: "Notion sync not configured" }, { status: 500 });
  }

  const title = text.trim().slice(0, 80);
  const properties = {
    Name: { title: [{ text: { content: title } }] },
    Notes: { rich_text: [{ text: { content: text.slice(0, 2000) } }] },
    Status: { select: { name: "Inbox" } },
    "XPLog ID": { rich_text: [{ text: { content: entryId } }] },
  };
  if (skill) properties.Skill = { rich_text: [{ text: { content: skill } }] };
  if (photoUrl) properties.Screenshot = { files: [{ type: "external", name: "photo", external: { url: photoUrl } }] };

  try {
    const res = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { type: "data_source_id", data_source_id: dataSourceId },
        properties,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return Response.json({ error: data.message || "notion create failed" }, { status: 500 });
    }
    return Response.json({ pageId: data.id });
  } catch (err) {
    return Response.json({ error: err.message || "notion sync failed" }, { status: 500 });
  }
}
