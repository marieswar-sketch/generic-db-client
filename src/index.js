import { runQuery } from './db.js';

async function main() {
  const insertResult = await runQuery(
    `
      INSERT INTO app_users (name, email)
      VALUES ($1, $2)
      RETURNING id, name, email, created_at
    `,
    ['Demo User', 'demo@example.com']
  );

  console.log('Inserted row:', insertResult.rows[0]);

  const allUsers = await runQuery(
    'SELECT id, name, email, created_at FROM app_users ORDER BY id DESC LIMIT 10'
  );

  console.log('Recent rows:', allUsers.rows);
}

main().catch((error) => {
  console.error('Demo failed:', error.message);
  process.exit(1);
});
