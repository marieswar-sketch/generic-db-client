import dotenv from 'dotenv';
import { runInTransaction, runQuery } from './db.js';

dotenv.config();

const DAILY_SPIN_LIMIT = 3;
const DEFAULT_TESTER_NUMBERS = ['9500365660', '9600692495'];
const COUNTED_TRANSFER_STATUSES = ['submitted', 'success', 'mock_success'];
const REWARD_OPTIONS = [
  { id: 'better_luck', label: 'BETTER LUCK', reward_coins: 0, icon: '☁️', text: '#111827' },
  { id: '10_coins', label: '10 COINS', reward_coins: 10, icon: '🪙', text: '#111827' },
  { id: '50_coins', label: '50 COINS', reward_coins: 50, icon: '💰', text: '#ffffff' },
  { id: '100_coins', label: '100 COINS', reward_coins: 100, icon: '🪙', text: '#111827' },
  { id: 'phone', label: 'PHONE', reward_coins: 0, icon: '📱', text: '#ffffff' },
  { id: 'airpods', label: 'AIRPODS', reward_coins: 0, icon: '🎧', text: '#ffffff' }
];
const WHEEL_SECTIONS = [
  { id: 'better_luck', reward_key: 'better_luck', label: 'BETTER LUCK', color: '#f5f3eb', icon: '☁️',  text: '#111827', reward_coins: 0   },
  { id: '10_coins',    reward_key: '10_coins',    label: '10 COINS',    color: '#fbfaf6', icon: '🪙',  text: '#111827', reward_coins: 10  },
  { id: 'phone',       reward_key: 'phone',       label: 'PHONE',       color: '#cfd3d9', icon: '📱',  text: '#ffffff', reward_coins: 0   },
  { id: '50_coins',    reward_key: '50_coins',    label: '50 COINS',    color: '#f5f3eb', icon: '💰',  text: '#111827', reward_coins: 50  },
  { id: 'airpods',     reward_key: 'airpods',     label: 'AIRPODS',     color: '#cfd3d9', icon: '🎧',  text: '#ffffff', reward_coins: 0   },
  { id: '100_coins',   reward_key: '100_coins',   label: '100 COINS',   color: '#fbfaf6', icon: '🪙',  text: '#111827', reward_coins: 100 },
];

function normalizeMobile(value) {
  const digits = String(value || '').replace(/\D/g, '');

  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }

  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }

  return digits;
}

function getTesterNumbers() {
  const configured = process.env.TESTER_MOBILE_NUMBERS
    ? process.env.TESTER_MOBILE_NUMBERS.split(',').map((value) => normalizeMobile(value.trim())).filter(Boolean)
    : [];

  return configured.length > 0 ? configured : DEFAULT_TESTER_NUMBERS;
}

function isTesterMobile(mobileNumber) {
  return getTesterNumbers().includes(normalizeMobile(mobileNumber));
}

function getRewardOption(rewardKey) {
  return REWARD_OPTIONS.find((item) => item.id === rewardKey) || REWARD_OPTIONS[0];
}

function getCountedStatusesSql(startIndex = 2) {
  return COUNTED_TRANSFER_STATUSES.map((_, index) => `$${startIndex + index}`).join(', ');
}

export function getPublicConfig() {
  return {
    wheelSections: WHEEL_SECTIONS,
    testerRewardOptions: REWARD_OPTIONS,
    testerMobileNumbers: getTesterNumbers(),
    dailySpinLimit: DAILY_SPIN_LIMIT,
    campaign: 'mobile_launch_2024',
    banner: 'main_app',
    terms: [
      'You are entitled to 3 free spins per day.',
      'Wallet transfers are limited to once per day for normal users.',
      'Tester mobile numbers can bypass spin limits and force rewards.',
      'If you win a physical prize, the team can contact you separately for fulfillment.'
    ]
  };
}

export async function registerPlayer({ mobileNumber, displayName = null }) {
  const normalizedMobile = normalizeMobile(mobileNumber);

  const result = await runQuery(
    `
      INSERT INTO players (mobile_number, display_name)
      VALUES ($1, $2)
      ON CONFLICT (mobile_number)
      DO UPDATE SET
        display_name = COALESCE(EXCLUDED.display_name, players.display_name),
        updated_at = NOW()
      RETURNING id, mobile_number, display_name, total_coins, created_at, updated_at
    `,
    [normalizedMobile, displayName]
  );

  return result.rows[0];
}

async function getPlayerByMobile(client, mobileNumber) {
  const normalizedMobile = normalizeMobile(mobileNumber);
  const result = await client.query(
    `
      SELECT id, mobile_number, display_name, total_coins, created_at, updated_at
      FROM players
      WHERE mobile_number = $1
    `,
    [normalizedMobile]
  );

  return result.rows[0] || null;
}

async function getDayNumber(client, playerId) {
  const result = await client.query(
    `
      SELECT COUNT(DISTINCT spin_date)::int AS completed_days
      FROM spin_events
      WHERE player_id = $1
        AND spin_date < CURRENT_DATE
    `,
    [playerId]
  );

  return result.rows[0].completed_days + 1;
}

async function getCurrentDateKey(client) {
  const result = await client.query(
    `
      SELECT CURRENT_DATE::text AS current_date
    `
  );

  return result.rows[0].current_date;
}

async function getSpinsToday(client, playerId) {
  const result = await client.query(
    `
      SELECT COUNT(*)::int AS spins_today
      FROM spin_events
      WHERE player_id = $1
        AND spin_date = CURRENT_DATE
    `,
    [playerId]
  );

  return result.rows[0].spins_today;
}

async function getTransferredToday(client, playerId) {
  const result = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM transfer_requests
        WHERE player_id = $1
          AND status IN (${getCountedStatusesSql()})
          AND created_at >= date_trunc('day', NOW())
          AND created_at < date_trunc('day', NOW()) + interval '1 day'
      ) AS transferred_today
    `,
    [playerId, ...COUNTED_TRANSFER_STATUSES]
  );

  return result.rows[0].transferred_today;
}

async function getTransferredCoins(client, playerId) {
  const result = await client.query(
    `
      SELECT COALESCE(SUM(coins_requested), 0)::int AS transferred_coins
      FROM transfer_requests
      WHERE player_id = $1
        AND status IN (${getCountedStatusesSql()})
    `,
    [playerId, ...COUNTED_TRANSFER_STATUSES]
  );

  return result.rows[0].transferred_coins;
}

async function getRecentSpins(client, playerId) {
  const result = await client.query(
    `
      SELECT reward_key, reward_label, coin_value, created_at
      FROM spin_events
      WHERE player_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `,
    [playerId]
  );

  return result.rows;
}

export async function getPlayerState(mobileNumber) {
  return runInTransaction(async (client) => {
    const player = await getPlayerByMobile(client, mobileNumber);

    if (!player) {
      return null;
    }

    const spinsToday = await getSpinsToday(client, player.id);
    const transferredToday = await getTransferredToday(client, player.id);
    const transferredCoins = await getTransferredCoins(client, player.id);
    const recentSpins = await getRecentSpins(client, player.id);

    let pendingNotification = null;
    try {
      const notifResult = await client.query(
        `SELECT id, coins_requested FROM transfer_requests
         WHERE player_id=$1 AND notify_user=TRUE ORDER BY created_at DESC LIMIT 1`,
        [player.id]
      );
      pendingNotification = notifResult.rows[0] || null;
    } catch (_) {}

    return {
      id: player.id,
      mobile_number: player.mobile_number,
      display_name: player.display_name,
      spins_used: spinsToday,
      max_spins: DAILY_SPIN_LIMIT,
      total_winnings: Math.max(0, Number(player.total_coins) - transferredCoins),
      transferred_today: transferredToday,
      recent_spins: recentSpins,
      pending_notification: pendingNotification
    };
  });
}

function getDailyRewardSpin({ playerId, currentDateKey }) {
  const source = `${playerId}-${currentDateKey}`;
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }

  return (hash % DAILY_SPIN_LIMIT) + 1;
}

function determineReward({ dayNumber, spinNumberToday, forcedReward, isTester, playerId, currentDateKey }) {
  if (isTester && forcedReward) {
    const testerReward = REWARD_OPTIONS.find((item) => item.id === forcedReward);
    if (!testerReward) {
      throw new Error(`Invalid forced reward: ${forcedReward}`);
    }
    return testerReward;
  }

  const dailyRewardSpin = getDailyRewardSpin({ playerId, currentDateKey });
  const dailyRewardType = dayNumber % 5 === 0 ? '50_coins' : '10_coins';

  if (spinNumberToday === dailyRewardSpin) {
    return getRewardOption(dailyRewardType);
  }

  return getRewardOption('better_luck');
}

export async function spinForPlayer(mobileNumber, forcedReward = null) {
  const normalizedMobile = normalizeMobile(mobileNumber);
  const tester = isTesterMobile(normalizedMobile);

  return runInTransaction(async (client) => {
    let player = await getPlayerByMobile(client, normalizedMobile);

    if (!player) {
      const insertResult = await client.query(
        `
          INSERT INTO players (mobile_number)
          VALUES ($1)
          RETURNING id, mobile_number, display_name, total_coins, created_at, updated_at
        `,
        [normalizedMobile]
      );
      player = insertResult.rows[0];
    }

    const dayNumber = await getDayNumber(client, player.id);
    const currentDateKey = await getCurrentDateKey(client);
    const spinsToday = await getSpinsToday(client, player.id);

    if (!tester && spinsToday >= DAILY_SPIN_LIMIT) {
      return {
        status: 'error',
        reason: 'daily_limit_reached'
      };
    }

    const spinNumberToday = spinsToday + 1;
    const reward = determineReward({
      dayNumber,
      spinNumberToday,
      forcedReward,
      isTester: tester,
      playerId: player.id,
      currentDateKey
    });

    await client.query(
      `
        INSERT INTO spin_events (player_id, reward_key, reward_label, coin_value)
        VALUES ($1, $2, $3, $4)
      `,
      [player.id, reward.id, reward.label, reward.reward_coins]
    );

    if (reward.reward_coins > 0) {
      await client.query(
        `
          UPDATE players
          SET total_coins = total_coins + $2,
              updated_at = NOW()
          WHERE id = $1
        `,
        [player.id, reward.reward_coins]
      );
      player.total_coins = Number(player.total_coins) + reward.reward_coins;
    }

    const transferredToday = await getTransferredToday(client, player.id);
    const transferredCoins = await getTransferredCoins(client, player.id);

    return {
      status: 'ok',
      reward: reward.id,
      reward_label: reward.label,
      reward_coins: reward.reward_coins,
      spin_number_today: spinNumberToday,
      user_day_number: dayNumber,
      player: {
        id: player.id,
        mobile_number: player.mobile_number,
        spins_used: spinNumberToday,
        max_spins: DAILY_SPIN_LIMIT,
        total_winnings: Math.max(0, Number(player.total_coins) - transferredCoins),
        transferred_today: transferredToday
      }
    };
  });
}

async function notifySlack(message) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message })
    });
  } catch (error) {
    console.error('Slack notification failed:', error.message);
  }
}

async function lookupExternalUserId(mobileNumber, queryId) {
  const apiKey = process.env.REDASH_API_KEY;

  if (!apiKey || !queryId) {
    return { userId: null, reason: 'lookup_not_configured' };
  }

  const redashPostUrl = `https://analytics.getlokalapp.com/api/queries/${queryId}/results`;
  const response = await fetch(redashPostUrl, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ parameters: { mobile_numbers: mobileNumber } })
  });

  const data = await response.json();
  const findMatch = (rows = []) => rows.find((row) => normalizeMobile(row.mobile_no) === mobileNumber);

  if (data.query_result) {
    const match = findMatch(data.query_result.data.rows);
    return { userId: match?.user_id || null, reason: match ? null : 'not_registered' };
  }

  if (data.job?.id) {
    for (let index = 0; index < 10; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const jobCheck = await fetch(`https://analytics.getlokalapp.com/api/jobs/${data.job.id}`, {
        headers: { Authorization: `Key ${apiKey}` }
      });
      const jobData = await jobCheck.json();

      if (jobData.job.status === 3) {
        const finalRes = await fetch(`https://analytics.getlokalapp.com/api/query_results/${jobData.job.query_result_id}`, {
          headers: { Authorization: `Key ${apiKey}` }
        });
        const finalData = await finalRes.json();
        const match = findMatch(finalData.query_result.data.rows);
        return { userId: match?.user_id || null, reason: match ? null : 'not_registered' };
      }

      if (jobData.job.status === 4) {
        throw new Error(jobData.job.error || 'Redash job failed');
      }
    }
  }

  return { userId: null, reason: 'not_registered' };
}

async function uploadCoinsToProvider(userId, amount) {
  const authKey = process.env.DOSTT_AUTH_KEY;

  if (!authKey) {
    return {
      ok: true,
      providerRef: 'mock-transfer',
      message: 'Mock transfer completed because DOSTT_AUTH_KEY is not configured.'
    };
  }

  const csvContent = `user_id,coins\n${userId},${amount}`;
  const formData = new FormData();
  const blob = new Blob([csvContent], { type: 'text/csv' });
  formData.append('file', blob, 'transfer.csv');
  formData.append('name', 'Spin the wheel');

  const response = await fetch('https://api.dostt.in/payments/free-coins/upload/', {
    method: 'POST',
    headers: { 'x-n8n-auth-key': authKey },
    body: formData
  });

  const text = await response.text();

  return {
    ok: response.ok || text.includes('Bulk upload started'),
    providerRef: String(userId),
    message: text
  };
}

export async function createTransferRequest(mobileNumber, coinsRequested) {
  const normalizedMobile = normalizeMobile(mobileNumber);
  const tester = isTesterMobile(normalizedMobile);

  return runInTransaction(async (client) => {
    const player = await getPlayerByMobile(client, normalizedMobile);
    if (!player) {
      throw new Error('Player not found');
    }

    const spinsUsed = await getSpinsToday(client, player.id);
    const transferredToday = await getTransferredToday(client, player.id);
    const transferredCoins = await getTransferredCoins(client, player.id);
    const totalWinnings = Math.max(0, Number(player.total_coins) - transferredCoins);

    if (coinsRequested <= 0) {
      throw new Error('Coins requested must be greater than zero');
    }

    if (!tester && transferredToday) {
      throw new Error('Transfer already completed for today');
    }

    if (coinsRequested > totalWinnings) {
      throw new Error('Requested coins exceed available balance');
    }

    const transferMode = process.env.TRANSFER_MODE || 'mock';
    let status = 'submitted';
    let notes = 'Transfer submitted successfully';
    let errorMessage = null;
    let providerRef = null;

    if (transferMode === 'mock') {
      status = 'mock_success';
      notes = 'Mock transfer completed locally';
      providerRef = 'mock-transfer';
    } else {
      const queryIds = [
        process.env.REDASH_QUERY_ID,
        process.env.REDASH_QUERY_ID_2,
        process.env.REDASH_QUERY_ID_3
      ].filter(Boolean);

      let lookup = { userId: null, reason: 'lookup_not_configured' };
      let usedQueryId = null;

      for (const qId of queryIds) {
        if (lookup.userId) break;
        if (usedQueryId) await new Promise((resolve) => setTimeout(resolve, 1500));
        lookup = await lookupExternalUserId(normalizedMobile, qId);
        if (lookup.userId) usedQueryId = qId;
        else usedQueryId = qId;
      }

      if (!lookup.userId) {
        status = 'failed_not_registered';
        errorMessage = 'This number was not registered with Dostt App. Please use your registered number.';
        notes = lookup.reason || 'User lookup failed';

        const failedResult = await client.query(
          `
            INSERT INTO transfer_requests (player_id, coins_requested, status, notes, error_message)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, player_id, coins_requested, status, notes, error_message, provider_ref, created_at
          `,
          [player.id, coinsRequested, status, notes, errorMessage]
        );

        await notifySlack(`⚠️ Spin Wheel Transfer Failed\nMobile: +${normalizedMobile}\nCoins: ${coinsRequested}\nReason: ${errorMessage}\nQueries tried: ${queryIds.join(', ')}`);
        return {
          ...failedResult.rows[0],
          public_error: errorMessage
        };
      }

      const providerResult = await uploadCoinsToProvider(lookup.userId, coinsRequested);
      providerRef = providerResult.providerRef || String(lookup.userId);

      if (!providerResult.ok) {
        status = 'failed_provider';
        notes = 'External provider transfer failed';
        errorMessage = providerResult.message || 'Transfer failed at provider';

        const failedResult = await client.query(
          `
            INSERT INTO transfer_requests (player_id, coins_requested, status, notes, error_message, provider_ref)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, player_id, coins_requested, status, notes, error_message, provider_ref, created_at
          `,
          [player.id, coinsRequested, status, notes, errorMessage, providerRef]
        );

        await notifySlack(`⚠️ Spin Wheel Transfer Failed\nMobile: +${normalizedMobile}\nCoins: ${coinsRequested}\nReason: ${errorMessage}\nQuery used: ${usedQueryId}`);
        return {
          ...failedResult.rows[0],
          public_error: 'We could not complete the transfer right now. Please try again shortly.'
        };
      }

      notes = providerResult.message || 'Transfer submitted to provider';
      await notifySlack(`🚀 Spin Wheel Transfer Submitted\nMobile: +${normalizedMobile}\nCoins: ${coinsRequested}\nProvider Ref: ${providerRef}\nQuery used: ${usedQueryId}`);
    }

    const transferResult = await client.query(
      `
        INSERT INTO transfer_requests (player_id, coins_requested, status, notes, error_message, provider_ref)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, player_id, coins_requested, status, notes, error_message, provider_ref, created_at
      `,
      [player.id, coinsRequested, status, notes, errorMessage, providerRef]
    );

    return {
      ...transferResult.rows[0],
      player: {
        id: player.id,
        mobile_number: player.mobile_number,
        spins_used: spinsUsed,
        max_spins: DAILY_SPIN_LIMIT,
        total_winnings: Math.max(0, totalWinnings - coinsRequested),
        transferred_today: true
      }
    };
  });
}

// ─── Admin Service Functions ────────────────────────────────────────────────

export async function getAdminStats() {
  const { rows: overview } = await runQuery(`
    SELECT
      (SELECT COUNT(*)::int FROM players) AS total_players,
      (SELECT COUNT(*)::int FROM players WHERE DATE(created_at AT TIME ZONE 'Asia/Kolkata') = CURRENT_DATE AT TIME ZONE 'Asia/Kolkata') AS today_new_players,
      (SELECT COUNT(*)::int FROM spin_events) AS total_spins,
      (SELECT COUNT(*)::int FROM spin_events WHERE spin_date = CURRENT_DATE AT TIME ZONE 'Asia/Kolkata') AS today_spins,
      (SELECT COALESCE(SUM(total_coins),0)::int FROM players) AS total_coins_won,
      (SELECT COALESCE(SUM(coins_requested),0)::int FROM transfer_requests WHERE status IN ('success','mock_success')) AS total_coins_transferred,
      (SELECT COUNT(*)::int FROM transfer_requests WHERE status IN ('failed_provider','failed_not_registered')) AS total_failed_transfers
  `);

  const { rows: dailySpins } = await runQuery(`
    SELECT spin_date::text AS date, COUNT(*)::int AS count
    FROM spin_events
    WHERE spin_date >= CURRENT_DATE - INTERVAL '29 days'
    GROUP BY spin_date ORDER BY spin_date
  `);

  const { rows: dailyPlayers } = await runQuery(`
    SELECT DATE(created_at AT TIME ZONE 'Asia/Kolkata')::text AS date, COUNT(*)::int AS count
    FROM players
    WHERE created_at >= NOW() - INTERVAL '29 days'
    GROUP BY DATE(created_at AT TIME ZONE 'Asia/Kolkata') ORDER BY date
  `);

  const { rows: dailyTransfers } = await runQuery(`
    SELECT DATE(created_at AT TIME ZONE 'Asia/Kolkata')::text AS date,
           status, COUNT(*)::int AS count
    FROM transfer_requests
    WHERE created_at >= NOW() - INTERVAL '29 days'
    GROUP BY DATE(created_at AT TIME ZONE 'Asia/Kolkata'), status ORDER BY date
  `);

  const { rows: rewardsBreakdown } = await runQuery(`
    SELECT reward_key, COUNT(*)::int AS count FROM spin_events GROUP BY reward_key
  `);

  const { rows: transferStatusBreakdown } = await runQuery(`
    SELECT status, COUNT(*)::int AS count FROM transfer_requests GROUP BY status
  `);

  const { rows: dailyActiveUsers } = await runQuery(`
    SELECT spin_date::text AS date, COUNT(DISTINCT player_id)::int AS count
    FROM spin_events
    WHERE spin_date >= CURRENT_DATE - INTERVAL '29 days'
    GROUP BY spin_date ORDER BY spin_date
  `);

  // Retention
  const { rows: retentionRows } = await runQuery(`
    SELECT
      ROUND(100.0 * COUNT(*) FILTER (WHERE has_d1) / NULLIF(COUNT(*),0), 1) AS day1,
      ROUND(100.0 * COUNT(*) FILTER (WHERE has_d3) / NULLIF(COUNT(*) FILTER (WHERE eligible_d3),0), 1) AS day3,
      ROUND(100.0 * COUNT(*) FILTER (WHERE has_d7) / NULLIF(COUNT(*) FILTER (WHERE eligible_d7),0), 1) AS day7,
      ROUND(100.0 * COUNT(*) FILTER (WHERE has_d14) / NULLIF(COUNT(*) FILTER (WHERE eligible_d14),0), 1) AS day14,
      ROUND(100.0 * COUNT(*) FILTER (WHERE has_d30) / NULLIF(COUNT(*) FILTER (WHERE eligible_d30),0), 1) AS day30
    FROM (
      SELECT
        p.id,
        EXISTS(SELECT 1 FROM spin_events se WHERE se.player_id=p.id AND se.spin_date = p.created_at::date + 1) AS has_d1,
        EXISTS(SELECT 1 FROM spin_events se WHERE se.player_id=p.id AND se.spin_date = p.created_at::date + 3) AS has_d3,
        p.created_at < NOW() - INTERVAL '3 days' AS eligible_d3,
        EXISTS(SELECT 1 FROM spin_events se WHERE se.player_id=p.id AND se.spin_date = p.created_at::date + 7) AS has_d7,
        p.created_at < NOW() - INTERVAL '7 days' AS eligible_d7,
        EXISTS(SELECT 1 FROM spin_events se WHERE se.player_id=p.id AND se.spin_date = p.created_at::date + 14) AS has_d14,
        p.created_at < NOW() - INTERVAL '14 days' AS eligible_d14,
        EXISTS(SELECT 1 FROM spin_events se WHERE se.player_id=p.id AND se.spin_date = p.created_at::date + 30) AS has_d30,
        p.created_at < NOW() - INTERVAL '30 days' AS eligible_d30
      FROM players p WHERE p.created_at < NOW() - INTERVAL '1 day'
    ) t
  `);

  // Player behaviour
  const { rows: behaviour } = await runQuery(`
    SELECT
      (SELECT COUNT(DISTINCT player_id)::int FROM spin_events WHERE spin_date = CURRENT_DATE AT TIME ZONE 'Asia/Kolkata' GROUP BY player_id HAVING COUNT(*) >= 3 LIMIT 1) AS full_engagement_today,
      (SELECT COUNT(*)::int FROM players WHERE id NOT IN (SELECT DISTINCT player_id FROM transfer_requests WHERE status IN ('success','mock_success'))) AS never_transferred,
      (SELECT COUNT(*)::int FROM players WHERE id NOT IN (SELECT DISTINCT player_id FROM spin_events WHERE spin_date >= CURRENT_DATE - 7)) AS churned_7days,
      (SELECT COUNT(*)::int FROM players WHERE id NOT IN (SELECT DISTINCT player_id FROM spin_events WHERE spin_date >= CURRENT_DATE - 30)) AS churned_30days,
      (SELECT COALESCE(AVG(total_coins),0)::numeric(10,1) FROM players) AS avg_coins_per_player
  `);

  const { rows: topPlayers } = await runQuery(`
    SELECT p.mobile_number, p.display_name,
           p.total_coins,
           COALESCE((SELECT SUM(tr.coins_requested) FROM transfer_requests tr WHERE tr.player_id=p.id AND tr.status IN ('success','mock_success')),0)::int AS transferred,
           (p.total_coins - COALESCE((SELECT SUM(tr.coins_requested) FROM transfer_requests tr WHERE tr.player_id=p.id AND tr.status IN ('success','mock_success')),0))::int AS wallet_balance
    FROM players p ORDER BY p.total_coins DESC LIMIT 10
  `);

  const pendingCoins = (overview[0].total_coins_won || 0) - (overview[0].total_coins_transferred || 0);

  return {
    overview: { ...overview[0], pending_coins: Math.max(0, pendingCoins) },
    charts: { dailySpins, dailyPlayers, dailyTransfers, rewardsBreakdown, transferStatusBreakdown, dailyActiveUsers },
    retention: retentionRows[0] || {},
    behaviour: { ...behaviour[0], topPlayers },
  };
}

export async function getAdminTableData(type, filters = {}) {
  if (type === 'players') {
    const { rows } = await runQuery(`
      SELECT p.id, p.mobile_number, p.display_name, p.total_coins,
             COALESCE((SELECT SUM(tr.coins_requested) FROM transfer_requests tr WHERE tr.player_id=p.id AND tr.status IN ('success','mock_success')),0)::int AS transferred_coins,
             (p.total_coins - COALESCE((SELECT SUM(tr.coins_requested) FROM transfer_requests tr WHERE tr.player_id=p.id AND tr.status IN ('success','mock_success')),0))::int AS wallet_balance,
             (SELECT COUNT(*)::int FROM spin_events se WHERE se.player_id=p.id) AS total_spins,
             p.created_at AT TIME ZONE 'Asia/Kolkata' AS created_at
      FROM players p ORDER BY p.created_at DESC LIMIT 5000
    `);
    return rows;
  }

  if (type === 'spins') {
    const dateFilter = filters.date ? `AND se.spin_date = $1::date` : '';
    const params = filters.date ? [filters.date] : [];
    const { rows } = await runQuery(`
      SELECT se.id, p.mobile_number, p.display_name, se.reward_key, se.reward_label,
             se.coin_value, se.spin_date, se.created_at AT TIME ZONE 'Asia/Kolkata' AS created_at
      FROM spin_events se
      JOIN players p ON p.id = se.player_id
      WHERE 1=1 ${dateFilter}
      ORDER BY se.created_at DESC LIMIT 10000
    `, params);
    return rows;
  }

  if (type === 'transfers') {
    const conditions = ['1=1'];
    const params = [];
    if (filters.status) { params.push(filters.status); conditions.push(`tr.status = $${params.length}`); }
    if (filters.date) { params.push(filters.date); conditions.push(`DATE(tr.created_at AT TIME ZONE 'Asia/Kolkata') = $${params.length}::date`); }
    if (filters.mobile) { params.push(`%${filters.mobile}%`); conditions.push(`p.mobile_number LIKE $${params.length}`); }
    const { rows } = await runQuery(`
      SELECT tr.id, p.mobile_number, p.display_name, tr.coins_requested, tr.status,
             tr.error_message, tr.notes, tr.provider_ref, tr.notify_user,
             tr.created_at AT TIME ZONE 'Asia/Kolkata' AS created_at,
             (p.total_coins - COALESCE((SELECT SUM(tr2.coins_requested) FROM transfer_requests tr2 WHERE tr2.player_id=p.id AND tr2.status IN ('success','mock_success','submitted')),0))::int AS wallet_balance
      FROM transfer_requests tr
      JOIN players p ON p.id = tr.player_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY tr.created_at DESC LIMIT 5000
    `, params);
    return rows;
  }

  return [];
}

export async function retryTransfer(transferId) {
  const { rows } = await runQuery(`
    SELECT tr.*, p.mobile_number, p.total_coins, p.id AS pid
    FROM transfer_requests tr
    JOIN players p ON p.id = tr.player_id
    WHERE tr.id = $1
  `, [transferId]);

  if (!rows[0]) throw new Error('Transfer not found');

  const transfer = rows[0];
  if (!['failed_provider', 'failed_not_registered'].includes(transfer.status)) {
    throw new Error('Transfer is not in a failed state');
  }

  const { rows: tcRows } = await runQuery(`
    SELECT COALESCE(SUM(coins_requested),0)::int AS transferred
    FROM transfer_requests WHERE player_id=$1 AND status IN ('submitted','success','mock_success')
  `, [transfer.pid]);

  const walletBalance = Math.max(0, Number(transfer.total_coins) - tcRows[0].transferred);
  if (walletBalance <= 0) {
    return { success: false, reason: 'no_balance', message: 'Player has no coins to transfer' };
  }

  const retryQueryId = process.env.RETRY_REDASH_QUERY_ID;
  const lookup = await lookupExternalUserId(transfer.mobile_number, retryQueryId);

  if (!lookup.userId) {
    await runQuery(`UPDATE transfer_requests SET error_message=$1, notes=$2 WHERE id=$3`,
      ['Retry: user not found in Dostt system', 'Admin retry failed — not registered', transferId]);
    return { success: false, reason: 'not_registered' };
  }

  const result = await uploadCoinsToProvider(lookup.userId, walletBalance);

  if (!result.ok) {
    await runQuery(`UPDATE transfer_requests SET error_message=$1, notes=$2 WHERE id=$3`,
      [result.message || 'Provider error on retry', 'Admin retry failed — provider error', transferId]);
    return { success: false, reason: 'provider_error', message: result.message };
  }

  await runQuery(`
    INSERT INTO transfer_requests (player_id, coins_requested, status, notes, provider_ref, notify_user)
    VALUES ($1, $2, 'success', 'Admin retry successful', $3, TRUE)
  `, [transfer.pid, walletBalance, result.providerRef]);

  await runQuery(`UPDATE transfer_requests SET notes='Superseded by admin retry' WHERE id=$1`, [transferId]);

  await notifySlack(`✅ Admin Retry Success\nMobile: ${transfer.mobile_number}\nCoins: ${walletBalance}\nRef: ${result.providerRef}`);

  return { success: true, coins: walletBalance };
}

export async function retryAllFailed(mobileFilter) {
  const conditions = [`tr.status IN ('failed_provider','failed_not_registered')`];
  const params = [];
  if (mobileFilter) { params.push(`%${mobileFilter}%`); conditions.push(`p.mobile_number LIKE $${params.length}`); }

  const { rows: failed } = await runQuery(`
    SELECT DISTINCT ON (tr.player_id) tr.id
    FROM transfer_requests tr
    JOIN players p ON p.id = tr.player_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY tr.player_id, tr.created_at DESC
  `, params);

  const results = [];
  for (const row of failed) {
    const r = await retryTransfer(row.id);
    results.push({ id: row.id, ...r });
  }
  return results;
}

export async function dismissNotification(mobileNumber) {
  const normalizedMobile = normalizeMobile(mobileNumber);
  await runQuery(`
    UPDATE transfer_requests tr
    SET notify_user = FALSE
    FROM players p
    WHERE tr.player_id = p.id
      AND p.mobile_number = $1
      AND tr.notify_user = TRUE
  `, [normalizedMobile]);
}

// ────────────────────────────────────────────────────────────────────────────

export async function resetTestData(mobileNumber) {
  const normalizedMobile = normalizeMobile(mobileNumber);
  if (!isTesterMobile(normalizedMobile)) {
    throw new Error('Reset is allowed only for tester mobiles');
  }

  return runInTransaction(async (client) => {
    const player = await getPlayerByMobile(client, normalizedMobile);
    if (!player) {
      return { status: 'success', message: 'No player data found to reset' };
    }

    await client.query('DELETE FROM spin_events WHERE player_id = $1', [player.id]);
    await client.query('DELETE FROM transfer_requests WHERE player_id = $1', [player.id]);
    await client.query(
      `
        UPDATE players
        SET total_coins = 0,
            updated_at = NOW()
        WHERE id = $1
      `,
      [player.id]
    );

    return { status: 'success', message: 'Test player reset complete' };
  });
}
