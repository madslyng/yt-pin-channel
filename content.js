(() => {
  "use strict";

  const STORAGE_KEY = "pins";
  const ORIGIN = "https://www.youtube.com";
  const CHANNEL_PATH_RE = /^\/(@[^/]+|channel\/UC[\w-]+|c\/[^/]+|user\/[^/]+)/;

  let pins = [];
  let bar = null;

  const loadPins = async () => {
    const data = await browser.storage.sync.get(STORAGE_KEY);
    pins = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
  };

  const savePins = () => browser.storage.sync.set({ [STORAGE_KEY]: pins });

  // One-time move of pins saved by older versions in storage.local.
  const migrateLocalPins = async () => {
    const old = (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
    if (!Array.isArray(old) || old.length === 0) return;
    await loadPins();
    for (const p of old) if (!pins.some((q) => q.id === p.id)) pins.push(p);
    await savePins();
    await browser.storage.local.remove(STORAGE_KEY);
  };

  // Returns the channel base path (e.g. "/@name") for the current page, if any.
  const currentChannelPath = () => {
    const direct = location.pathname.match(CHANNEL_PATH_RE);
    if (direct) return "/" + direct[1];

    if (location.pathname === "/watch") {
      const link = document.querySelector(
        "ytd-watch-metadata ytd-video-owner-renderer a[href], #owner ytd-channel-name a[href]"
      );
      const m = link && new URL(link.href, ORIGIN).pathname.match(CHANNEL_PATH_RE);
      if (m) return "/" + m[1];
    }

    if (location.pathname.startsWith("/shorts/")) {
      const link = document.querySelector(
        "ytd-reel-video-renderer[is-active] a[href^='/@'], ytd-reel-video-renderer[is-active] a[href^='/channel/']"
      );
      const m = link && new URL(link.href, ORIGIN).pathname.match(CHANNEL_PATH_RE);
      if (m) return "/" + m[1];
    }
    return null;
  };

  // Fetch the channel page and read name/avatar/canonical URL from its meta tags.
  const fetchChannelInfo = async (path) => {
    // Cookies are needed, otherwise EU users get redirected to consent.youtube.com.
    const res = await fetch(ORIGIN + path, { credentials: "include" });
    if (!res.ok || !res.url.startsWith(ORIGIN + "/")) throw new Error(`Unexpected response from ${res.url}`);
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    const meta = (p) => doc.querySelector(`meta[property="${p}"]`)?.getAttribute("content") || "";

    const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute("href") || "";
    const id = (canonical.match(/\/channel\/(UC[\w-]+)/) || [])[1] || path;
    const avatar = meta("og:image");

    return {
      id,
      url: ORIGIN + path,
      name: meta("og:title") || path.replace(/^\//, ""),
      avatar: /^https:\/\//.test(avatar) ? avatar : "",
    };
  };

  // Fallback: read name/avatar from the currently rendered page.
  const scrapeChannelInfo = (path) => {
    const q = (sel) => document.querySelector(sel);
    const isWatch = location.pathname === "/watch";
    const nameEl = isWatch
      ? q("ytd-watch-metadata ytd-video-owner-renderer #channel-name a, #owner ytd-channel-name a")
      : q("#page-header h1, yt-page-header-renderer h1, ytd-c4-tabbed-header-renderer #channel-name #text");
    const imgEl = isWatch
      ? q("ytd-watch-metadata ytd-video-owner-renderer #avatar img, #owner #avatar img")
      : q("#page-header yt-avatar-shape img, yt-page-header-renderer img, ytd-c4-tabbed-header-renderer #avatar img");
    const avatar = imgEl?.src || "";

    return {
      id: path,
      url: ORIGIN + path,
      name: nameEl?.textContent.trim() || path.replace(/^\//, ""),
      avatar: /^https:\/\//.test(avatar) ? avatar : "",
    };
  };

  const pinCurrent = async (button) => {
    const path = currentChannelPath();
    if (!path) return;
    button.disabled = true;
    try {
      let info;
      try {
        info = await fetchChannelInfo(path);
      } catch (err) {
        console.warn("[ytpin] Fetch failed, using page data instead:", err);
        info = scrapeChannelInfo(path);
      }
      await loadPins();
      if (!pins.some((p) => p.id === info.id)) {
        pins.push(info);
        await savePins();
      }
    } catch (err) {
      console.error("[ytpin] Failed to pin channel:", err);
    } finally {
      render();
    }
  };

  const unpin = async (id) => {
    await loadPins();
    pins = pins.filter((p) => p.id !== id);
    await savePins();
  };

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  };

  const DRAG_TYPE = "application/x-ytpin-index";
  let dragIndex = null;

  const clearDropMarkers = () =>
    bar?.querySelectorAll(".ytpin-drop-before, .ytpin-drop-after").forEach((n) =>
      n.classList.remove("ytpin-drop-before", "ytpin-drop-after")
    );

  const dropsAfter = (item, e) => {
    const rect = item.getBoundingClientRect();
    return e.clientX > rect.left + rect.width / 2;
  };

  const movePin = async (from, to) => {
    if (from === to) return;
    const [moved] = pins.splice(from, 1);
    pins.splice(to, 0, moved);
    render();
    await savePins();
  };

  const addDragHandlers = (item, index) => {
    item.addEventListener("dragstart", (e) => {
      dragIndex = index;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(DRAG_TYPE, String(index));
      item.classList.add("ytpin-dragging");
    });
    item.addEventListener("dragend", () => {
      dragIndex = null;
      item.classList.remove("ytpin-dragging");
      clearDropMarkers();
    });
    item.addEventListener("dragover", (e) => {
      if (dragIndex === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const after = dropsAfter(item, e);
      clearDropMarkers();
      item.classList.add(after ? "ytpin-drop-after" : "ytpin-drop-before");
    });
    item.addEventListener("drop", (e) => {
      if (dragIndex === null) return;
      e.preventDefault();
      let to = index + (dropsAfter(item, e) ? 1 : 0);
      if (dragIndex < to) to--;
      const from = dragIndex;
      dragIndex = null;
      clearDropMarkers();
      movePin(from, to);
    });
  };

  const render = () => {
    if (!bar) return;
    bar.replaceChildren();

    const path = currentChannelPath();
    const alreadyPinned = path && pins.some((p) => p.url === ORIGIN + path);
    const add = el("button", "ytpin-item ytpin-add");
    add.disabled = !path || alreadyPinned;
    add.title = !path
      ? "Open a channel or video to pin its channel"
      : alreadyPinned
        ? "Channel already pinned"
        : "Pin this channel";
    add.append(el("span", "ytpin-avatar", "+"), el("span", "ytpin-name", "Pin"));
    add.addEventListener("click", () => pinCurrent(add));
    bar.append(add);

    pins.forEach((pin, index) => {
      const item = el("a", "ytpin-item");
      item.href = pin.url.startsWith(ORIGIN + "/") ? pin.url : ORIGIN;
      item.title = pin.name;
      item.draggable = true;
      addDragHandlers(item, index);

      const img = el("img", "ytpin-avatar");
      img.alt = "";
      img.loading = "lazy";
      img.draggable = false;
      img.referrerPolicy = "no-referrer";
      if (pin.avatar) img.src = pin.avatar;

      const remove = el("button", "ytpin-remove", "\u00d7");
      remove.title = "Unpin";
      remove.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        unpin(pin.id);
      });

      item.append(img, el("span", "ytpin-name", pin.name), remove);
      bar.append(item);
    });

    if (pins.length === 0) {
      bar.append(el("span", "ytpin-empty", "No pinned channels yet."));
    }
  };

  // YouTube can keep stale or hidden copies of the masthead around; use the rendered one.
  const findContainer = () =>
    [...document.querySelectorAll("#masthead-container")].find((c) => c.getClientRects().length > 0) ||
    null;

  const mount = () => {
    const container = findContainer();
    if (!container) return false;
    if (!bar) {
      bar = el("div");
      bar.id = "ytpin-bar";
    }
    if (bar.parentElement !== container) {
      container.append(bar);
      render();
    }
    return true;
  };

  const intentionallyHidden = () => {
    const app = document.querySelector("ytd-app");
    return !!app && (app.hasAttribute("fullscreen") || app.hasAttribute("masthead-hidden"));
  };

  const barVisible = () =>
    !!bar?.isConnected && bar.parentElement === findContainer() && bar.offsetHeight > 0;

  // Expose the real masthead height; it varies with zoom and layout, so don't assume 56px.
  const syncMastheadHeight = () => {
    const height = bar?.parentElement?.querySelector(":scope > #masthead")?.offsetHeight;
    if (height) document.documentElement.style.setProperty("--ytpin-masthead-height", `${height}px`);
  };

  // Re-mount whenever YouTube re-renders the masthead, and only reserve space while the bar shows.
  const ensureMounted = () => {
    if (document.hidden || intentionallyHidden()) return;
    if (!barVisible()) mount();
    syncMastheadHeight();
    document.documentElement.classList.toggle("ytpin-active", barVisible());
  };

  let checkPending = false;
  const scheduleCheck = () => {
    if (checkPending) return;
    checkPending = true;
    setTimeout(() => {
      checkPending = false;
      ensureMounted();
    }, 250);
  };

  const init = async () => {
    await migrateLocalPins();
    await loadPins();

    ensureMounted();
    new MutationObserver(scheduleCheck).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "style", "class", "fullscreen", "masthead-hidden"],
    });
    document.addEventListener("visibilitychange", scheduleCheck);
    window.addEventListener("resize", scheduleCheck);

    // YouTube is a SPA; re-evaluate the "Pin" button after each navigation.
    document.addEventListener("yt-navigate-finish", () => {
      ensureMounted();
      render();
      // The owner link on watch pages may render slightly after navigation.
      setTimeout(render, 1500);
    });

    browser.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes[STORAGE_KEY]) {
        pins = changes[STORAGE_KEY].newValue || [];
        render();
      }
    });
  };

  init();
})();
