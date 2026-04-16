import { runQuery } from '../src/db.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const sqlPath = path.join(__dirname, '..', 'sql', 'create_app_users.sql');
  const sql = await fs.readFile(sqlPath, 'utf8');

  await runQuery(sql);
  console.log('Table creation completed successfully.');
}

main().catch((error) => {
  console.error('Table creation failed:', error.message);
  process.exit(1);
});
