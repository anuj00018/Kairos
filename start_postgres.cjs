const EmbeddedPostgres = require('embedded-postgres').default || require('embedded-postgres');
const path = require('path');
const fs = require('fs');

const pgDataDir = path.join(__dirname, 'backend', 'postgres_data');

async function run() {
  console.log('[PostgreSQL] Initializing local database directory at:', pgDataDir);
  
  const isFirstRun = !fs.existsSync(pgDataDir) || fs.readdirSync(pgDataDir).length === 0;

  const pg = new EmbeddedPostgres({
    databaseDir: pgDataDir,
    port: 5432,
    user: 'postgres',
    password: 'password',
    persistent: true
  });

  try {
    if (isFirstRun) {
      console.log('[PostgreSQL] Initialising cluster for the first time...');
      await pg.initialise();
      console.log('[PostgreSQL] Cluster initialised successfully.');
    }

    console.log('[PostgreSQL] Starting PostgreSQL server on localhost:5432...');
    await pg.start();
    console.log('[PostgreSQL] PostgreSQL server is RUNNING on port 5432!');

    // Create database 'resolveai' if it does not exist
    try {
      console.log('[PostgreSQL] Creating application database "resolveai"...');
      await pg.createDatabase('resolveai');
      console.log('[PostgreSQL] Database "resolveai" is ready!');
    } catch (e) {
      if (e.message && e.message.includes('already exists')) {
        console.log('[PostgreSQL] Database "resolveai" already exists.');
      } else {
        console.log('[PostgreSQL] Database notice:', e.message);
      }
    }

    console.log('----------------------------------------------------');
    console.log('PostgreSQL Connection Details:');
    console.log('Host: 127.0.0.1');
    console.log('Port: 5432');
    console.log('Database: resolveai');
    console.log('User: postgres');
    console.log('Password: password');
    console.log('URL: postgresql://postgres:password@127.0.0.1:5432/resolveai');
    console.log('----------------------------------------------------');

    // Keep process alive
    process.stdin.resume();

  } catch (err) {
    console.error('[PostgreSQL] Error starting PostgreSQL:', err);
    process.exit(1);
  }
}

run();

