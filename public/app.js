const state = {
  config: null,
  mobileNumber: localStorage.getItem('user_mobile') || '',
  isLoggedIn: Boolean(localStorage.getItem('user_mobile')),
  spinState: {
    spins_used: 0,
    max_spins: 3,
    total_winnings: 0,
    transferred_today: false
  },
  spinning: false,
  transferring: false,
  wheelRotation: 0
};

const elements = {
  topBar: document.getElementById('topBar'),
  walletCoins: document.getElementById('walletCoins'),
  transferArea: document.getElementById('transferArea'),
  loginView: document.getElementById('loginView'),
  loadingView: document.getElementById('loadingView'),
  wheelView: document.getElementById('wheelView'),
  loginForm: document.getElementById('loginForm'),
  mobileInput: document.getElementById('mobileInput'),
  spinButton: document.getElementById('spinButton'),
  spinCooldownCard: document.getElementById('spinCooldownCard'),
  spinCooldownText: document.getElementById('spinCooldownText'),
  testerPanel: document.getElementById('testerPanel'),
  forcedRewardSelect: document.getElementById('forcedRewardSelect'),
  customTransferInput: document.getElementById('customTransferInput'),
  resetTesterButton: document.getElementById('resetTesterButton'),
  statusDots: document.getElementById('statusDots'),
  spinsCaption: document.getElementById('spinsCaption'),
  termsList: document.getElementById('termsList'),
  modalTermsList: document.getElementById('modalTermsList'),
  errorBanner: document.getElementById('errorBanner'),
  termsButton: document.getElementById('termsButton'),
  logoutButton: document.getElementById('logoutButton'),
  termsModal: document.getElementById('termsModal'),
  closeTermsButton: document.getElementById('closeTermsButton'),
  rewardModal: document.getElementById('rewardModal'),
  rewardIcon: document.getElementById('rewardIcon'),
  rewardTitle: document.getElementById('rewardTitle'),
  rewardDescription: document.getElementById('rewardDescription'),
  closeRewardButton: document.getElementById('closeRewardButton'),
  transferModal: document.getElementById('transferModal'),
  closeTransferButton: document.getElementById('closeTransferButton'),
  wheelMain: document.getElementById('wheelMain'),
  segmentLabels: document.getElementById('segmentLabels')
};

let spinCountdownInterval = null;
let transferCountdownInterval = null;

function normalizeMobile(value) {
  return String(value || '').replace(/\D/g, '').replace(/^91/, '');
}

function isTester() {
  return state.config?.testerMobileNumbers?.includes(state.mobileNumber);
}

function showError(message) {
  if (!message) {
    elements.errorBanner.classList.add('hidden');
    elements.errorBanner.textContent = '';
    return;
  }

  elements.errorBanner.textContent = message;
  elements.errorBanner.classList.remove('hidden');
}

function showView(viewName) {
  elements.loginView.classList.add('hidden');
  elements.loadingView.classList.add('hidden');
  elements.wheelView.classList.add('hidden');
  elements[viewName].classList.remove('hidden');
}

function renderWheel() {
  const sections = state.config.wheelSections;
  const size = 360 / sections.length;
  elements.wheelMain.style.background = `conic-gradient(${sections.map((section, index) => `${section.color} ${index * size}deg ${(index + 1) * size}deg`).join(', ')})`;
  elements.segmentLabels.innerHTML = '';
  elements.forcedRewardSelect.innerHTML = '<option value="">Default (Random)</option>';

  sections.forEach((section, index) => {
    const label = document.createElement('div');
    label.className = 'segment-label-item';
    label.style.transform = `rotate(${index * size + size / 2}deg)`;
    label.innerHTML = `
      <span class="label-icon">${section.icon}</span>
      <span class="label-text" style="color:${section.text}">${section.label}</span>
    `;
    elements.segmentLabels.appendChild(label);

    const option = document.createElement('option');
    option.value = section.id;
    option.textContent = section.label;
    elements.forcedRewardSelect.appendChild(option);
  });
}

function updateStatusDots() {
  elements.statusDots.innerHTML = '';
  for (let index = 1; index <= 3; index += 1) {
    const dot = document.createElement('div');
    dot.className = `status-dot ${index <= state.spinState.spins_used ? 'active' : ''}`;
    elements.statusDots.appendChild(dot);
  }
}

function formatCountdown(msRemaining) {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}h ${minutes}m ${seconds}s`;
}

function startSpinCountdown() {
  clearInterval(spinCountdownInterval);
  if (isTester() || state.spinState.spins_used < state.spinState.max_spins) {
    elements.spinCooldownCard.classList.add('hidden');
    return;
  }

  elements.spinCooldownCard.classList.remove('hidden');
  spinCountdownInterval = setInterval(() => {
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 0);
    elements.spinCooldownText.textContent = formatCountdown(tomorrow.getTime() - Date.now());
  }, 1000);
}

function startTransferCountdown() {
  clearInterval(transferCountdownInterval);
  if (isTester() || !state.spinState.transferred_today) {
    return;
  }

  transferCountdownInterval = setInterval(() => {
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 0);
    const chip = document.getElementById('transferCooldownChip');
    if (chip) {
      chip.textContent = formatCountdown(tomorrow.getTime() - Date.now());
    }
  }, 1000);
}

function renderTransferArea() {
  elements.transferArea.innerHTML = '';

  if (!state.isLoggedIn) {
    return;
  }

  if (!isTester() && state.spinState.transferred_today) {
    const chip = document.createElement('div');
    chip.id = 'transferCooldownChip';
    chip.className = 'transfer-chip disabled';
    chip.textContent = 'Come Back';
    elements.transferArea.appendChild(chip);
    startTransferCountdown();
    return;
  }

  const button = document.createElement('button');
  button.className = 'transfer-chip';
  button.textContent = state.transferring ? 'Sending...' : 'Transfer';
  button.disabled = state.transferring || state.spinState.total_winnings <= 0;
  if (button.disabled) {
    button.classList.add('disabled');
  }
  button.addEventListener('click', handleTransfer);
  elements.transferArea.appendChild(button);
}

function renderTerms() {
  const items = state.config.terms || [];
  elements.termsList.innerHTML = items.map((term) => `<li>${term}</li>`).join('');
  elements.modalTermsList.innerHTML = items.map((term) => `<li>${term}</li>`).join('');
}

function renderAuthState() {
  elements.mobileInput.value = state.mobileNumber;
  elements.logoutButton.classList.toggle('hidden', !state.isLoggedIn);
  elements.topBar.classList.toggle('hidden', !state.isLoggedIn);
}

function renderWheelState() {
  elements.walletCoins.textContent = state.spinState.total_winnings;
  elements.spinsCaption.textContent = `${Math.max(0, state.spinState.max_spins - state.spinState.spins_used)} Spins ready for +${state.mobileNumber}`;
  elements.spinButton.disabled = state.spinning || (!isTester() && state.spinState.spins_used >= state.spinState.max_spins);
  elements.spinButton.textContent = state.spinning ? 'SPINNING...' : 'SPIN THE WHEEL';
  elements.testerPanel.classList.toggle('hidden', !isTester());
  updateStatusDots();
  renderTransferArea();
  startSpinCountdown();
}

function renderLoggedInUi() {
  renderAuthState();
  renderWheelState();
  showView('wheelView');
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

async function loadConfig() {
  state.config = await fetchJson('/api/config');
  renderWheel();
  renderTerms();
}

async function refreshState() {
  if (!state.mobileNumber) {
    return;
  }

  showView('loadingView');
  try {
    const data = await fetchJson(`/api/players/${state.mobileNumber}/state`);
    state.spinState = data;
    showError('');
    renderLoggedInUi();
  } catch (error) {
    if (error.message === 'Player not found') {
      await fetchJson('/api/players/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobileNumber: state.mobileNumber })
      });
      const data = await fetchJson(`/api/players/${state.mobileNumber}/state`);
      state.spinState = data;
      renderLoggedInUi();
    } else {
      showError(error.message);
      showView('loginView');
    }
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const normalizedMobile = normalizeMobile(elements.mobileInput.value);
  if (normalizedMobile.length !== 10) {
    showError('Please enter a valid 10-digit mobile number.');
    return;
  }

  state.mobileNumber = normalizedMobile;
  state.isLoggedIn = true;
  localStorage.setItem('user_mobile', normalizedMobile);
  await fetchJson('/api/players/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobileNumber: normalizedMobile })
  });
  await refreshState();
}

async function handleSpin() {
  if (state.spinning) {
    return;
  }

  state.spinning = true;
  renderWheelState();
  showError('');

  try {
    const payload = {
      mobileNumber: state.mobileNumber,
      forcedReward: isTester() ? elements.forcedRewardSelect.value || null : null
    };
    const result = await fetchJson('/api/spin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const sections = state.config.wheelSections;
    const targetIndex = sections.findIndex((section) => section.id === result.reward);
    const segmentSize = 360 / sections.length;
    const extraSpins = 12 * 360;
    const landingOffset = 360 - (targetIndex * segmentSize + segmentSize / 2);
    state.wheelRotation += extraSpins + (landingOffset - (state.wheelRotation % 360));
    elements.wheelMain.style.transform = `rotate(${state.wheelRotation}deg)`;

    setTimeout(async () => {
      state.spinning = false;
      await refreshState();
      openRewardModal(result);
    }, 5000);
  } catch (error) {
    state.spinning = false;
    showError(error.message);
    renderWheelState();
  }
}

function openRewardModal(result) {
  const reward = state.config.wheelSections.find((item) => item.id === result.reward) || state.config.wheelSections[0];
  elements.rewardIcon.textContent = reward.icon;
  elements.rewardTitle.textContent = reward.reward_coins > 0 ? 'Hooray!' : 'Oh No!';
  elements.rewardDescription.textContent = reward.reward_coins > 0
    ? `Amazing! You won ${reward.label}.`
    : 'Better luck next time!';
  elements.rewardModal.classList.remove('hidden');
}

async function handleTransfer() {
  const coinsRequested = isTester()
    ? Number(elements.customTransferInput.value || state.spinState.total_winnings)
    : state.spinState.total_winnings;

  if (!coinsRequested || coinsRequested <= 0) {
    showError('Enter a valid transfer amount.');
    return;
  }

  state.transferring = true;
  renderTransferArea();
  showError('');

  try {
    await fetchJson('/api/transfers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobileNumber: state.mobileNumber,
        coinsRequested
      })
    });

    elements.customTransferInput.value = '';
    elements.transferModal.classList.remove('hidden');
    await refreshState();
  } catch (error) {
    showError(error.message);
    renderTransferArea();
  } finally {
    state.transferring = false;
    renderTransferArea();
  }
}

async function handleResetTester() {
  try {
    await fetchJson('/api/test/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: state.mobileNumber })
    });
    await refreshState();
    showError('');
  } catch (error) {
    showError(error.message);
  }
}

function handleLogout() {
  localStorage.removeItem('user_mobile');
  state.mobileNumber = '';
  state.isLoggedIn = false;
  state.spinState = {
    spins_used: 0,
    max_spins: 3,
    total_winnings: 0,
    transferred_today: false
  };
  showError('');
  renderAuthState();
  showView('loginView');
}

async function init() {
  await loadConfig();
  renderAuthState();

  elements.loginForm.addEventListener('submit', handleLogin);
  elements.spinButton.addEventListener('click', handleSpin);
  elements.resetTesterButton.addEventListener('click', handleResetTester);
  elements.logoutButton.addEventListener('click', handleLogout);
  elements.termsButton.addEventListener('click', () => elements.termsModal.classList.remove('hidden'));
  elements.closeTermsButton.addEventListener('click', () => elements.termsModal.classList.add('hidden'));
  elements.closeRewardButton.addEventListener('click', () => elements.rewardModal.classList.add('hidden'));
  elements.closeTransferButton.addEventListener('click', () => elements.transferModal.classList.add('hidden'));

  if (state.isLoggedIn) {
    await refreshState();
  } else {
    showView('loginView');
  }
}

init().catch((error) => {
  showError(error.message);
});
