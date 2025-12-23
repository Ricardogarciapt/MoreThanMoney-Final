import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_KEY });

export async function syncPortfolio() {
  const response = await notion.databases.query({
    database_id: process.env.NOTION_DATABASE_ID!
  });
  
  // Processar dados aqui (ex: salvar no Supabase)
  console.log(response.results);
}
