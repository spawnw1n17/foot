import { AVATARS, COMMANDERS, CATALOG } from './meta.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);

async function waitForMetaApi() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (window.NeonDominionQA?.getMeta && window.NeonDominionQA?.openMeta) return window.NeonDominionQA;
    await sleep(50);
  }
  return null;
}

function buildDock() {
  const homeCard = document.querySelector('#homeOverlay .home-card');
  if (!homeCard || document.querySelector('#homeProfileDock')) return null;
  homeCard.classList.add('home-command-center');
  const dock = document.createElement('section');
  dock.id = 'homeProfileDock';
  dock.className = 'home-profile-dock';
  dock.setAttribute('aria-label', 'Профиль игрока и разделы Arsenal');
  homeCard.prepend(dock);
  return dock;
}

function renderDock(dock, meta) {
  const avatar = AVATARS.find((item) => item.id === meta.equipped.avatar) || AVATARS[0];
  const frame = CATALOG.find((item) => item.id === meta.equipped.frame) || CATALOG.find((item) => item.id === 'frame-cyan');
  const commander = COMMANDERS.find((item) => item.id === meta.commander) || COMMANDERS[0];
  const current = Number(meta.level?.current || 0);
  const next = Math.max(1, Number(meta.level?.next || 1));
  const xpPercent = Math.max(0, Math.min(100, current / next * 100));
  const owned = Array.isArray(meta.owned) ? meta.owned.length : 0;
  const seasonLevel = Math.min(20, Math.floor((meta.season?.xp || 0) / 120) + 1);
  const dailyReady = (meta.daily?.tasks || []).filter((task) => task.progress >= task.target && !task.claimed).length;
  const weeklyReady = (meta.weekly?.tasks || []).filter((task) => task.progress >= task.target && !task.claimed).length;

  dock.style.setProperty('--home-frame', frame?.preview || '#54f5ff');
  dock.innerHTML = `
    <button class="home-profile-main" data-home-tab="profile" type="button" aria-label="Открыть полный профиль">
      <span class="home-profile-avatar">${avatar.glyph}<small>${meta.rank?.icon || 'Ⅰ'}</small></span>
      <span class="home-profile-copy">
        <small>ПРОФИЛЬ ИГРОКА · ${escapeHtml(meta.localId)}</small>
        <strong>${escapeHtml(meta.name)}</strong>
        <em>${escapeHtml(meta.rank?.name || 'Рекрут')} · уровень ${meta.level?.level || 1}</em>
        <span class="home-xp-track"><i style="width:${xpPercent}%"></i></span>
        <b>${Math.floor(current)} / ${next} XP</b>
      </span>
      <span class="home-profile-arrow">ОТКРЫТЬ <i>→</i></span>
    </button>

    <div class="home-profile-economy" aria-label="Баланс игрока">
      <span><small>КРЕДИТЫ</small><b>◈ ${meta.credits || 0}</b></span>
      <span><small>ОСКОЛКИ</small><b>✦ ${meta.shards || 0}</b></span>
      <span><small>КОЛЛЕКЦИЯ</small><b>${owned} / ${CATALOG.length}</b></span>
      <span><small>СЕЗОН</small><b>УР. ${seasonLevel}</b></span>
    </div>

    <div class="home-commander-card">
      <i>${commander.glyph}</i>
      <span><small>АКТИВНЫЙ КОМАНДИР</small><b>${escapeHtml(commander.name)}</b><em>${escapeHtml(commander.role)}</em></span>
      <button data-home-tab="commanders" type="button">СМЕНИТЬ</button>
    </div>

    <nav class="home-arsenal-actions" aria-label="Разделы профиля">
      <button data-home-tab="profile" type="button"><i>◆</i><span>ПРОФИЛЬ<small>Статистика и имя</small></span></button>
      <button data-home-tab="shop" type="button"><i>◈</i><span>МАГАЗИН<small>Скины и темы</small></span></button>
      <button data-home-tab="collection" type="button"><i>⬡</i><span>КОЛЛЕКЦИЯ<small>${owned} предметов</small></span></button>
      <button data-home-tab="missions" type="button"><i>◎</i><span>ЗАДАНИЯ<small>${dailyReady + weeklyReady ? `Наград: ${dailyReady + weeklyReady}` : 'Ежедневные и недельные'}</small></span></button>
      <button data-home-tab="season" type="button"><i>✦</i><span>СЕЗОН<small>Уровень ${seasonLevel} из 20</small></span></button>
    </nav>`;
}

async function initHomeProfile() {
  const api = await waitForMetaApi();
  const dock = buildDock();
  if (!api || !dock) return;

  const refresh = () => {
    try { renderDock(dock, api.getMeta()); } catch (error) { console.error('Home profile refresh failed', error); }
  };

  dock.addEventListener('click', (event) => {
    const target = event.target.closest('[data-home-tab]');
    if (!target) return;
    api.openMeta(target.dataset.homeTab || 'profile');
  });

  const arsenal = document.querySelector('#arsenalOverlay');
  if (arsenal) new MutationObserver(() => {
    if (!arsenal.classList.contains('visible')) refresh();
  }).observe(arsenal, { attributes: true, attributeFilter: ['class'] });

  const home = document.querySelector('#homeOverlay');
  if (home) new MutationObserver(() => {
    if (home.classList.contains('visible')) refresh();
  }).observe(home, { attributes: true, attributeFilter: ['class'] });

  window.addEventListener('storage', refresh);
  window.NeonDominionHomeProfile = { refresh, dock };
  refresh();
}

initHomeProfile();
