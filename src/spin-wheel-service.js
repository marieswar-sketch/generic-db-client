import { runQuery } from './db.js';

const DAILY_SPIN_LIMIT = 3;

function pickReward(rewards) {
  const totalWeight = rewards.reduce((sum, reward) => sum + reward.probability, 0);
  const randomValue = Math.floor(Math.random() * totalWeight) + 1;

  let cursor = 0;
  for (const reward of rewards) {
    cursor += reward.probability;
    if (randomValue <= cursor) {
      return reward;
    }
  }

  return rewards[0];
}

export async function registerPlayer({ mobileNumber, displayName = null }) {
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
    [mobileNumber, displayName]
  );

  return result.rows[0];
}

export async function getPlayerState(mobileNumber) {
  const playerResult = await runQuery(
    `
      SELECT id, mobile_number, display_name, total_coins, created_at, updated_at
      FROM players
      WHERE mobile_number = $1
    `,
    [mobileNumber]
  );

  if (playerResult.rowCount === 0) {
    return null;
  }

  const player = playerResult.rows[0];

  const spinsTodayResult = await runQuery(
    `
      SELECT COUNT(*)::int AS spins_today
      FROM spin_events
      WHERE player_id = $1
        AND spin_date = CURRENT_DATE
    `,
    [player.id]
  );

  const recentSpinsResult = await runQuery(
    `
      SELECT reward_key, reward_label, coin_value, created_at
      FROM spin_events
      WHERE player_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `,
    [player.id]
  );

  return {
    ...player,
    spins_today: spinsTodayResult.rows[0].spins_today,
    spins_left: Math.max(0, DAILY_SPIN_LIMIT - spinsTodayResult.rows[0].spins_today),
    recent_spins: recentSpinsResult.rows
  };
}

export async function spinForPlayer(mobileNumber) {
  const player = await registerPlayer({ mobileNumber });
  const state = await getPlayerState(mobileNumber);

  if (state.spins_today >= DAILY_SPIN_LIMIT) {
    return {
      status: 'limit_reached',
      spins_left: 0,
      message: 'Daily spin limit reached'
    };
  }

  const rewardsResult = await runQuery(
    `
      SELECT id, reward_key, label, reward_type, coin_value, probability
      FROM rewards
      WHERE is_active = TRUE
      ORDER BY id
    `
  );

  const reward = pickReward(rewardsResult.rows);

  await runQuery(
    `
      INSERT INTO spin_events (player_id, reward_id, reward_key, reward_label, coin_value)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [player.id, reward.id, reward.reward_key, reward.label, reward.coin_value]
  );

  if (reward.coin_value > 0) {
    await runQuery(
      `
        UPDATE players
        SET total_coins = total_coins + $2,
            updated_at = NOW()
        WHERE id = $1
      `,
      [player.id, reward.coin_value]
    );
  }

  const updatedState = await getPlayerState(mobileNumber);

  return {
    status: 'success',
    reward: {
      key: reward.reward_key,
      label: reward.label,
      type: reward.reward_type,
      coin_value: reward.coin_value
    },
    player: updatedState
  };
}

export async function createTransferRequest(mobileNumber, coinsRequested) {
  const state = await getPlayerState(mobileNumber);

  if (!state) {
    throw new Error('Player not found');
  }

  if (coinsRequested <= 0) {
    throw new Error('Coins requested must be greater than zero');
  }

  if (coinsRequested > state.total_coins) {
    throw new Error('Requested coins exceed available balance');
  }

  const transferResult = await runQuery(
    `
      INSERT INTO transfer_requests (player_id, coins_requested, status)
      VALUES ($1, $2, 'pending')
      RETURNING id, player_id, coins_requested, status, notes, created_at
    `,
    [state.id, coinsRequested]
  );

  await runQuery(
    `
      UPDATE players
      SET total_coins = total_coins - $2,
          updated_at = NOW()
      WHERE id = $1
    `,
    [state.id, coinsRequested]
  );

  return transferResult.rows[0];
}
