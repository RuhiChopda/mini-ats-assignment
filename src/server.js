const { createApp } = require('./app');
const { openDb } = require('./db');
const { seed } = require('./seed');

const db = openDb();
if (process.env.SEED !== 'false') seed(db); // demo data on first run
const port = process.env.PORT || 3000;
createApp(db).listen(port, () => console.log(`Mini ATS running on http://localhost:${port}`));
