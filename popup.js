document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('toggle-enabled');
  const statusDesc = document.getElementById('status-desc');

  function updateLabel(isEnabled) {
    statusDesc.textContent = isEnabled ? 'Сканирование активно' : 'Отключено';
    statusDesc.style.color = isEnabled ? '#a1a1aa' : '#71717a';
  }

  // Считываем сохраненное состояние (по умолчанию включено)
  chrome.storage.local.get({ isEnabled: true }, (res) => {
    toggle.checked = res.isEnabled;
    updateLabel(res.isEnabled);
  });

  // Записываем изменение
  toggle.addEventListener('change', () => {
    const isEnabled = toggle.checked;
    chrome.storage.local.set({ isEnabled });
    updateLabel(isEnabled);
  });
});