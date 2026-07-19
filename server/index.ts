import cors from 'cors';
import express from 'express';
import { createRouter } from './routes.js';
import { loadLeaderboardFromDisk } from './storage.js';

const app = express();
const port = 3001;

loadLeaderboardFromDisk();

app.use(cors());
app.use(express.json());
app.use('/api', createRouter());

app.listen(port, () => {
  console.log(`Last Signal Station server listening on http://localhost:${port}`);
});
