// Shared settings definitions, loaded by both the content script and the options page.
"use strict";

const YTPIN_SETTINGS_KEY = "settings";

// Where a pinned channel should link to. The value is appended to the channel URL.
const YTPIN_LINK_TARGETS = [
  { value: "", label: "Channel home" },
  { value: "/videos", label: "Videos" },
];

const YTPIN_DEFAULT_SETTINGS = {
  linkTarget: "",
};

const ytpinNormalizeSettings = (raw) => {
  const settings = { ...YTPIN_DEFAULT_SETTINGS, ...(raw || {}) };
  if (!YTPIN_LINK_TARGETS.some((t) => t.value === settings.linkTarget)) {
    settings.linkTarget = YTPIN_DEFAULT_SETTINGS.linkTarget;
  }
  return settings;
};

const ytpinLoadSettings = async () =>
  ytpinNormalizeSettings((await browser.storage.sync.get(YTPIN_SETTINGS_KEY))[YTPIN_SETTINGS_KEY]);

const ytpinSaveSettings = (settings) =>
  browser.storage.sync.set({ [YTPIN_SETTINGS_KEY]: settings });
