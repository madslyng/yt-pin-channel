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
})();
