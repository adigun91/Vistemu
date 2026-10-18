import { getAllDevices } from "../devices/registry";
import { getLastUrl } from "../lib/storage";
import { sendMessage } from "../lib/messaging";
import { initFooterYear } from "../lib/footer";

const form = document.getElementById("launch-form") as HTMLFormElement;
const urlInput = document.getElementById("url-input") as HTMLInputElement;
const deviceSelect = document.getElementById("device-select") as HTMLSelectElement;

async function init() {
  const devices = await getAllDevices();
  for (const device of devices) {
    const option = document.createElement("option");
    option.value = device.id;
    option.textContent = device.custom ? `${device.name} (custom)` : device.name;
    deviceSelect.appendChild(option);
  }
  urlInput.value = await getLastUrl();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  await sendMessage({
    type: "OPEN_EMULATOR",
    url: urlInput.value || undefined,
    deviceId: deviceSelect.value || undefined,
  });
  window.close();
});

void init();
initFooterYear();
