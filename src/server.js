import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createTransferRequest,
  getPlayerState,
  getPublicConfig,
  registerPlayer,
  resetTestData,
  spinForPlayer
} from './spin-wheel-service.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json());
app.use(express.static(publicDir));

function cleanMobileNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');

  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }

  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }

  return digits;
}

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'generic-spin-wheel-backend'
  });
});

app.get('/api/config', (_req, res) => {
  res.json(getPublicConfig());
});

app.post('/api/players/register', async (req, res) => {
  try {
    const mobileNumber = cleanMobileNumber(req.body.mobileNumber);
    const displayName = req.body.displayName || null;

    if (mobileNumber.length !== 10) {
      return res.status(400).json({ error: 'Valid 10-digit mobile number is required' });
    }

    const player = await registerPlayer({ mobileNumber, displayName });
    const state = await getPlayerState(mobileNumber);

    res.status(201).json({
      player,
      state
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/players/:mobileNumber/state', async (req, res) => {
  try {
    const mobileNumber = cleanMobileNumber(req.params.mobileNumber);
    const state = await getPlayerState(mobileNumber);

    if (!state) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.json(state);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/spin', async (req, res) => {
  try {
    const mobileNumber = cleanMobileNumber(req.body.mobileNumber);
    const forcedReward = req.body.forcedReward || null;

    if (mobileNumber.length !== 10) {
      return res.status(400).json({ error: 'Valid 10-digit mobile number is required' });
    }

    const result = await spinForPlayer(mobileNumber, forcedReward);
    if (result.status === 'error' && result.reason === 'daily_limit_reached') {
      return res.status(429).json(result);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/transfers', async (req, res) => {
  try {
    const mobileNumber = cleanMobileNumber(req.body.mobileNumber);
    const coinsRequested = Number(req.body.coinsRequested);

    if (mobileNumber.length !== 10) {
      return res.status(400).json({ error: 'Valid 10-digit mobile number is required' });
    }

    const transfer = await createTransferRequest(mobileNumber, coinsRequested);

    if (transfer.status === 'failed_not_registered') {
      return res.status(404).json({
        error: transfer.public_error || 'We could not verify your Dostt account with this mobile number.',
        transfer
      });
    }

    if (transfer.status === 'failed_provider') {
      return res.status(502).json({
        error: transfer.public_error || 'We could not complete the transfer right now.',
        transfer
      });
    }

    res.status(201).json(transfer);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/test/reset', async (req, res) => {
  try {
    const mobileNumber = cleanMobileNumber(req.body.mobileNumber);
    const result = await resetTestData(mobileNumber);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`Spin wheel backend running on http://localhost:${port}`);
});
