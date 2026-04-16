import dotenv from 'dotenv';
import express from 'express';
import {
  createTransferRequest,
  getPlayerState,
  registerPlayer,
  spinForPlayer
} from './spin-wheel-service.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json());

function cleanMobileNumber(value) {
  return String(value || '').replace(/\D/g, '').replace(/^91/, '');
}

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'generic-spin-wheel-backend'
  });
});

app.post('/api/players/register', async (req, res) => {
  try {
    const mobileNumber = cleanMobileNumber(req.body.mobileNumber);
    const displayName = req.body.displayName || null;

    if (mobileNumber.length !== 10) {
      return res.status(400).json({ error: 'Valid 10-digit mobile number is required' });
    }

    const player = await registerPlayer({ mobileNumber, displayName });
    res.status(201).json(player);
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

    if (mobileNumber.length !== 10) {
      return res.status(400).json({ error: 'Valid 10-digit mobile number is required' });
    }

    const result = await spinForPlayer(mobileNumber);
    if (result.status === 'limit_reached') {
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
    res.status(201).json(transfer);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Spin wheel backend running on http://localhost:${port}`);
});
