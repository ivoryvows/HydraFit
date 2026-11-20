
(function () {
  const API = "https://hydrafit-reminders.ivoryvows.workers.dev";

  function decodeBase64Url(value) {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding)
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const raw = atob(base64);
    return Uint8Array.from(raw, char => char.charCodeAt(0));
  }

  function getInterval() {
    const label = document.getElementById("water-interval-label");
    const match = label?.textContent.match(/\d+/);
    return match ? Number(match[0]) : 30;
  }

  async function getPublicKey() {
    const response = await fetch(API + "/vapid-public-key");
    if (!response.ok) throw new Error("Could not get public key");

    const data = await response.json();
    if (!data.publicKey) throw new Error("Public key missing");

    return data.publicKey;
  }

  async function sendSubscription(subscription) {
    const response = await fetch(API + "/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        interval_minutes: getInterval(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
          || "Africa/Kinshasa"
      })
    });

    if (!response.ok) {
      throw new Error("Could not update notification settings");
    }

    return response.json();
  }

  async function syncExistingSubscription() {
    if (localStorage.getItem("hydrafit_push_enabled") !== "yes") return;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await sendSubscription(subscription);
    }
  }

  async function enableNotifications(button, status) {
    if (!("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)) {
      throw new Error("Notifications are not supported here. Open the installed HydraFit app.");
    }

    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      throw new Error("Notification permission was not granted.");
    }

    const publicKey = await getPublicKey();
    const registration = await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeBase64Url(publicKey)
      });
    }

    await sendSubscription(subscription);

    localStorage.setItem("hydrafit_push_enabled", "yes");

    button.textContent = "Phone Notifications On ✓";
    status.textContent = "Your phone notifications are enabled.";
  }

  async function disableNotifications(button, status) {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      const response = await fetch(API + "/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint })
      });

      if (!response.ok) {
        throw new Error("Could not disable notifications on server");
      }

      await subscription.unsubscribe();
    }

    localStorage.removeItem("hydrafit_push_enabled");

    button.textContent = "Enable Phone Notifications";
    status.textContent = "Phone notifications are turned off.";
  }

  function init() {
    const reminderPanel = document.getElementById("reminder-edit-panel");
    if (!reminderPanel || document.getElementById("hydrafit-push-btn")) return;

    const button = document.createElement("button");
    button.id = "hydrafit-push-btn";
    button.type = "button";
    button.className =
      "hydrafi-pill-btn w-full mt-3 py-3 px-4 rounded-xl bg-[#9d174d] text-white text-xs font-bold shadow-sm";
    button.textContent = "Enable Phone Notifications";

    const status = document.createElement("p");
    status.id = "hydrafit-push-status";
    status.className = "text-[11px] text-[#7c5866] mt-2 text-center";
    status.textContent = "Get water reminders even when HydraFit is closed.";

    reminderPanel.insertAdjacentElement("afterend", button);
    button.insertAdjacentElement("afterend", status);

    button.addEventListener("click", async function () {
      button.disabled = true;
      status.textContent = "Please wait...";

      try {
        if (localStorage.getItem("hydrafit_push_enabled") === "yes") {
          await disableNotifications(button, status);
        } else {
          await enableNotifications(button, status);
        }
      } catch (error) {
        status.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });

    if (localStorage.getItem("hydrafit_push_enabled") === "yes") {
      button.textContent = "Phone Notifications On ✓";

      syncExistingSubscription().catch(error => {
        status.textContent = error.message;
      });
    }

    const intervalLabel = document.getElementById("water-interval-label");

    if (intervalLabel && "MutationObserver" in window) {
      let lastInterval = getInterval();

      const observer = new MutationObserver(function () {
        const newInterval = getInterval();

        if (newInterval === lastInterval) return;
        lastInterval = newInterval;

        syncExistingSubscription()
          .then(() => {
            status.textContent = "Reminder interval updated.";
          })
          .catch(error => {
            status.textContent = error.message;
          });
      });

      observer.observe(intervalLabel, {
        childList: true,
        characterData: true,
        subtree: true
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
