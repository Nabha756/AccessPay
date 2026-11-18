// "Display & data" page: accessibility preferences and demo data controls.

import { announce, qs, icon, escapeHtml } from '../lib/dom.js';
import { plural } from '../lib/format.js';
import { FONT_SCALES, loadSettings, saveSettings, applySettings } from '../lib/settings.js';

function radio(name, value, label, checked, description = '') {
  const id = `${name}-${value.replace('.', '-')}`;
  return `
    <label class="choice" for="${id}">
      <input type="radio" id="${id}" name="${name}" value="${value}" ${checked ? 'checked' : ''}>
      <span class="choice__text">
        <span class="choice__title">${label}</span>
        ${description ? `<span class="choice__detail">${description}</span>` : ''}
      </span>
    </label>`;
}

function renderDisplay(settings) {
  return `
    <section class="panel" aria-labelledby="display-heading">
      <div class="panel__head">
        <h2 id="display-heading">Display</h2>
      </div>
      <form class="panel__body settings-form" id="display-form">
        <p class="muted">Changes apply straight away and are remembered in this browser.</p>

        <fieldset class="setting">
          <legend>Contrast</legend>
          <div class="choices choices--row">
            ${radio('contrast', 'standard', 'Standard', settings.contrast === 'standard')}
            ${radio('contrast', 'high', 'High contrast', settings.contrast === 'high', 'Black text on white, stronger borders')}
          </div>
        </fieldset>

        <fieldset class="setting">
          <legend>Text size</legend>
          <div class="choices choices--row">
            ${Object.entries(FONT_SCALES).map(([value, label]) =>
              radio('fontScale', value, label, settings.fontScale === value, `${Math.round(Number(value) * 100)}%`)).join('')}
          </div>
        </fieldset>

        <fieldset class="setting">
          <legend>Motion</legend>
          <div class="choices choices--row">
            ${radio('motion', 'system', 'Follow my device', settings.motion === 'system', 'Uses your operating system’s reduce motion setting')}
            ${radio('motion', 'reduce', 'Reduce motion', settings.motion === 'reduce', 'Turns off all animation in AccessPay')}
          </div>
        </fieldset>
      </form>
    </section>`;
}

function renderData(store) {
  const count = store.getAll().length;
  return `
    <section class="panel" aria-labelledby="data-heading">
      <div class="panel__head">
        <h2 id="data-heading">Demo data</h2>
      </div>
      <div class="panel__body stack">
        <p>Your ${plural(count, 'transaction')} ${count === 1 ? 'is' : 'are'} stored only in this browser. Nothing is sent to a server.</p>
        <div class="btn-row">
          <button type="button" class="btn btn--secondary" data-action="restore">Restore sample data</button>
          <button type="button" class="btn btn--danger" data-action="ask-delete" ${count === 0 ? 'aria-disabled="true"' : ''}>Delete all transactions</button>
        </div>
        <div id="delete-confirm" class="confirm" hidden tabindex="-1" role="group" aria-labelledby="delete-confirm-text">
          <p id="delete-confirm-text"><strong>Delete ${plural(count, 'transaction')}?</strong> This can’t be undone, but you can restore the sample data afterwards.</p>
          <div class="btn-row">
            <button type="button" class="btn btn--danger" data-action="confirm-delete">Yes, delete all</button>
            <button type="button" class="btn btn--secondary" data-action="cancel-delete">Keep my transactions</button>
          </div>
        </div>
        <div id="data-status" role="status"></div>
      </div>
    </section>`;
}

export const settingsView = {
  title: 'Display & data',
  render(container, { store }) {
    const settings = loadSettings();

    function draw() {
      container.innerHTML = `
        <div class="page-head">
          <div>
            <h1>Display &amp; data</h1>
            <p>Adjust AccessPay to suit how you read, and manage the demo data.</p>
          </div>
        </div>
        <div class="stack settings">
          ${renderDisplay(settings)}
          ${renderData(store)}
        </div>`;
    }

    function showStatus(message) {
      qs('#data-status', container).innerHTML =
        `<div class="notice notice--success flash">${icon('success')}<p>${escapeHtml(message)}</p></div>`;
    }

    draw();

    container.addEventListener('change', (event) => {
      const { name, value } = event.target;
      if (!['contrast', 'fontScale', 'motion'].includes(name)) return;
      settings[name] = value;
      applySettings(settings);
      saveSettings(settings);

      // Only build the message for the setting that changed: building all
      // three would look up e.g. FONT_SCALES['high'] and throw.
      let message;
      if (name === 'contrast') message = value === 'high' ? 'High contrast on.' : 'Standard contrast on.';
      else if (name === 'fontScale') message = `Text size set to ${FONT_SCALES[value].toLowerCase()}.`;
      else message = value === 'reduce' ? 'Animations turned off.' : 'Following your device motion setting.';
      announce(message);
    });

    container.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button || button.getAttribute('aria-disabled') === 'true') return;
      const confirmBox = qs('#delete-confirm', container);

      switch (button.dataset.action) {
        case 'ask-delete':
          confirmBox.hidden = false;
          confirmBox.focus();
          break;
        case 'cancel-delete':
          confirmBox.hidden = true;
          qs('[data-action="ask-delete"]', container).focus();
          break;
        case 'confirm-delete': {
          const removed = store.getAll().length;
          store.clearAll();
          draw();
          showStatus(`Deleted ${plural(removed, 'transaction')}.`);
          qs('[data-action="restore"]', container).focus();
          break;
        }
        case 'restore':
          store.restoreSampleData();
          draw();
          showStatus(`Sample data restored: ${plural(store.getAll().length, 'transaction')}.`);
          qs('[data-action="restore"]', container).focus();
          break;
        default:
          break;
      }
    });
  },
};
