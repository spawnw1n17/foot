'use strict';

(() => {
  const applySkins = () => {
    const aircraft = document.querySelector('#aircraft');
    const modelId = aircraft?.dataset.model || document.querySelector('#modelSelect')?.value;

    if (aircraft && modelId && (aircraft.dataset.skin !== modelId || !aircraft.classList.contains('uav-skin'))) {
      aircraft.dataset.skin = modelId;
      aircraft.classList.add('uav-skin');
    }

    const preview = document.querySelector('#modelCard .model-icon');
    if (preview && modelId && (preview.dataset.skin !== modelId || !preview.classList.contains('uav-skin-preview') || preview.textContent)) {
      preview.textContent = '';
      preview.dataset.skin = modelId;
      preview.classList.add('uav-skin-preview');
      preview.setAttribute('role', 'img');
      preview.setAttribute('aria-label', document.querySelector('#modelSelect option:checked')?.textContent || 'БПЛА');
    }

    document.querySelectorAll('.hangar-item[data-model]').forEach(item => {
      const thumb = item.querySelector(':scope > span');
      const id = item.dataset.model;
      if (!thumb || !id) return;
      if (thumb.dataset.skin !== id || !thumb.classList.contains('uav-skin-thumb') || thumb.textContent) {
        thumb.textContent = '';
        thumb.dataset.skin = id;
        thumb.classList.add('uav-skin-thumb');
        thumb.setAttribute('aria-hidden', 'true');
      }
    });
  };

  const observer = new MutationObserver(applySkins);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-model']
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applySkins, {once: true});
  } else {
    applySkins();
  }

  window.addEventListener('pageshow', applySkins);
})();
