(async () => {
  "use strict";

  const select = document.getElementById("link-target");
  for (const target of YTPIN_LINK_TARGETS) {
    const option = document.createElement("option");
    option.value = target.value;
    option.textContent = target.label;
    select.append(option);
  }

  const settings = await ytpinLoadSettings();
  select.value = settings.linkTarget;

  select.addEventListener("change", () => {
    settings.linkTarget = select.value;
    ytpinSaveSettings(settings);
  });

  const bindCheckbox = (id, key) => {
    const box = document.getElementById(id);
    box.checked = settings[key];
    box.addEventListener("change", () => {
      settings[key] = box.checked;
      ytpinSaveSettings(settings);
    });
  };
  bindCheckbox("confirm-pin", "confirmPin");
  bindCheckbox("confirm-unpin", "confirmUnpin");
  bindCheckbox("sort-by-clicks", "sortByClicks");
})();
