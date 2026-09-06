import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");

function read(relativePath) {
  return readFileSync(resolve(REPOSITORY_ROOT, relativePath), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[runtime-ui-input] ${message}`);
  }
}

const main = read("src/main.ts");
const hud = read("src/runtime/AnimationBlendingHud.ts");
const uiVisibility = read("src/runtime/UiVisibilityController.ts");
const hudSettingsUi = read("src/runtime/HudSettingsController.ts");
const hudSettingsStore = read("src/runtime/HudSettingsStore.ts");
const input = read("src/controls/ThirdPersonInput.ts");
const controller = read("src/controls/ThirdPersonController.ts");
const joystick = read("src/controls/MobileJoystick.ts");
const fly = read("src/controls/FlyController.ts");
const download = read("src/app/TextDownload.ts");
const grassMenu = read("src/app/GrassArtMenu.ts");
const foliageMenu = read("src/app/DetailFoliageTuningMenu.ts");
const riverMenu = read("src/app/RiverArtMenu.ts");

assert(
  main.includes('const animationHudEnabled = params.get("diagnostics") === "1"') &&
    main.includes("if (character && animationHudEnabled)") &&
    main.includes("let detachObserver: (() => void) | undefined") &&
    main.indexOf("animationHud = {") < main.indexOf("hud.attachCharacter(character)"),
  "The skeletal blending HUD must stay diagnostics-only and publish its cleanup owner before attachment can fail.",
);
assert(
  /try \{[\s\S]*?document\.body\.appendChild\(this\.container\);[\s\S]*?this\.bindEvents\(\);[\s\S]*?\} catch \(error\) \{[\s\S]*?window\.removeEventListener\("keydown", this\.handleKeyDown\);[\s\S]*?this\.container\.remove\(\);[\s\S]*?throw error;/.test(
    hud,
  ) &&
    hud.includes("Crouch: C · Dodge roll: R") &&
    !hud.includes("this.character.setCrouch(") &&
    !hud.includes("this.character.triggerRoll(") &&
    hud.includes("this.character?.clearLookTarget()"),
  "The diagnostics HUD must roll back failed publication and keep gameplay crouch/roll actions owned by the real controller/input path.",
);

const bootstrapTry = main.indexOf("  try {");
const uiInitialize = main.indexOf("uiController.initialize()", bootstrapTry);
const bootstrapCatch = main.indexOf("  } catch (error) {", bootstrapTry);
assert(
  bootstrapTry >= 0 && uiInitialize > bootstrapTry && uiInitialize < bootstrapCatch,
  "UI initialization must run inside bootstrap's cleanup transaction.",
);
assert(
  uiVisibility.includes('from "./HudSettingsController"') &&
    uiVisibility.includes("private readonly settingsController =") &&
    uiVisibility.includes("this.settingsController.initialize()") &&
    uiVisibility.includes("this.settingsController.dispose()") &&
    uiVisibility.includes("this.settingsController.close()"),
  "HUD settings must share the interface lifecycle and close before the HUD is minimized.",
);
assert(
  hudSettingsUi.includes('heading.textContent = "HUD Settings"') &&
    hudSettingsUi.includes('movementText.textContent = "Invert left/right movement"') &&
    hudSettingsUi.includes("hudSettingsStore.setInvertHorizontalMovement(") &&
    hudSettingsUi.includes('document.addEventListener("keydown", this.handleKeyDown)') &&
    hudSettingsUi.includes('document.removeEventListener("keydown", this.handleKeyDown)'),
  "HUD settings must expose the movement preference with symmetric keyboard lifecycle cleanup.",
);
assert(
  hudSettingsStore.includes("invertHorizontalMovement: false") &&
    hudSettingsStore.includes('localStorage.getItem(STORAGE_KEY)') &&
    hudSettingsStore.includes('localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))') &&
    hudSettingsStore.includes("parsed.invertHorizontalMovement === true"),
  "Horizontal movement inversion must default to normal controls and persist only validated boolean state.",
);
assert(
  input.includes('from "../runtime/HudSettingsStore"') &&
    input.includes("const rawHorizontalMovement = keyboardX + touch.x + joystick.x") &&
    /const horizontalMovement = hudSettingsStore\.getInvertHorizontalMovement\(\)[\s\S]*?\? rawHorizontalMovement[\s\S]*?: -rawHorizontalMovement;/.test(
      input,
    ) &&
    input.includes("THREE.MathUtils.clamp(horizontalMovement, -1, 1)"),
  "Keyboard, touch movement, and the joystick must use normal horizontal camera-relative movement by default with one shared inversion preference.",
);

const setJumpStart = input.indexOf("const setJump = (");
const setSprintStart = input.indexOf("const setSprint = (", setJumpStart);
const jumpSource = input.slice(setJumpStart, setSprintStart);
const sprintSource = input.slice(setSprintStart, input.indexOf("document.body.appendChild(controls)", setSprintStart));
assert(
  setJumpStart >= 0 &&
    setSprintStart > setJumpStart &&
    jumpSource.indexOf("button.setPointerCapture(event.pointerId)") >= 0 &&
    jumpSource.indexOf("button.setPointerCapture(event.pointerId)") <
      jumpSource.indexOf("this.mobileJumpHeld = active") &&
    sprintSource.indexOf("button.setPointerCapture(event.pointerId)") >= 0 &&
    sprintSource.indexOf("button.setPointerCapture(event.pointerId)") <
      sprintSource.indexOf("this.mobileSprint = active"),
  "Mobile JUMP/RUN held state must not publish before pointer capture succeeds.",
);
assert(
  input.includes("private mobileJumpButton?: HTMLButtonElement") &&
    input.includes("private mobileRunButton?: HTMLButtonElement") &&
    input.includes("private setMobileButtonState(") &&
    /private clearTransientInput\(\): void \{[\s\S]*?this\.mobileSprint = false;[\s\S]*?this\.mobileJumpHeld = false;[\s\S]*?this\.setMobileButtonState\(this\.mobileRunButton, false\);[\s\S]*?this\.setMobileButtonState\(this\.mobileJumpButton, false\);/.test(
      input,
    ) &&
    input.includes("this.mobileJumpButton = undefined") &&
    input.includes("this.mobileRunButton = undefined"),
  "Blur, visibility loss, and disposal must clear both gameplay and visible/ARIA state for compact JUMP/RUN controls.",
);

assert(
  controller.includes(
    "if (this.input.consumeJump() && !this.character.isRolling())",
  ) &&
    /this\.jumpBufferRemaining = 0;[\s\S]*?this\.jumpHoldRemaining = 0;[\s\S]*?this\.character\.triggerRoll\(\)/.test(
      controller,
    ),
  "Rolls must take precedence over same-frame or active-roll jump requests so action triggers cannot remain queued across landing.",
);

assert(
  controller.includes("private coyoteJumpAvailable = true") &&
    /if \(wasGrounded\) \{[\s\S]*?this\.coyoteJumpAvailable = true;/.test(
      controller,
    ) &&
    /const canUseCoyoteTime =[\s\S]*?this\.coyoteJumpAvailable[\s\S]*?characterCoyoteTime/.test(
      controller,
    ) &&
    /this\.jumpBufferRemaining > 0[\s\S]*?this\.coyoteJumpAvailable = false;[\s\S]*?this\.grounded = false;/.test(
      controller,
    ),
  "Coyote time must be consumed by a real jump so a second takeoff press cannot reset vertical velocity.",
);

const pointerDownStart = joystick.indexOf("private readonly handlePointerDown");
const pointerMoveStart = joystick.indexOf("private readonly handlePointerMove", pointerDownStart);
const pointerDownSource = joystick.slice(pointerDownStart, pointerMoveStart);
assert(
  pointerDownStart >= 0 &&
    pointerMoveStart > pointerDownStart &&
    pointerDownSource.indexOf("this.element.setPointerCapture(event.pointerId)") >= 0 &&
    pointerDownSource.indexOf("this.element.setPointerCapture(event.pointerId)") <
      pointerDownSource.indexOf("this.pointerId = event.pointerId"),
  "Joystick active state must not publish before pointer capture succeeds.",
);

const pointerReleaseStart = joystick.indexOf("private readonly handlePointerRelease");
const lostCaptureStart = joystick.indexOf(
  "private readonly handleLostPointerCapture",
  pointerReleaseStart,
);
const releaseSource = joystick.slice(pointerReleaseStart, lostCaptureStart);
const lostSource = joystick.slice(lostCaptureStart);
assert(
  /try \{[\s\S]*?releasePointerCapture[\s\S]*?\} finally \{[\s\S]*?this\.reset\(\);[\s\S]*?this\.onInput\(\);/.test(
    releaseSource,
  ) &&
    lostSource.includes("this.reset()") &&
    lostSource.includes("this.onInput()"),
  "Joystick release and spontaneous capture loss must always clear movement and notify the input owner.",
);

assert(
  /constructor\([\s\S]*?try \{[\s\S]*?this\.bindEvents\(\);[\s\S]*?this\.createMobileControls\(\);[\s\S]*?\} catch \(error\) \{[\s\S]*?this\.unbindEvents\(\);[\s\S]*?this\.canvas\.style\.touchAction = this\.previousTouchAction;[\s\S]*?throw error;/.test(
    fly,
  ) &&
    /dispose\(\): void \{[\s\S]*?this\.unbindEvents\(\);/.test(fly) &&
    fly.includes("private unbindEvents(): void"),
  "Fly input construction must roll back partially-bound listeners and canvas state, using the same unbind path as normal disposal.",
);

assert(
  fly.includes("button.setPointerCapture(event.pointerId)") &&
    fly.includes('button.addEventListener("lostpointercapture"') &&
    !fly.includes('button.addEventListener("pointerleave", deactivate)'),
  "Compact flight vertical controls must capture their pointer and clear thrust after release, cancellation, or spontaneous capture loss.",
);

assert(
  download.includes("URL.createObjectURL") &&
    download.includes("anchor.remove()") &&
    download.includes("window.setTimeout(() => URL.revokeObjectURL(url)") &&
    /finally \{[\s\S]*?if \(!revokeScheduled\) \{[\s\S]*?URL\.revokeObjectURL\(url\)/.test(
      download,
    ),
  "Tuning downloads must remove their temporary anchor and revoke Blob URLs even when publication or scheduling fails.",
);
for (const [name, source] of [
  ["grass", grassMenu],
  ["foliage", foliageMenu],
  ["river", riverMenu],
]) {
  assert(
    source.includes('from "./TextDownload"') &&
      source.includes("downloadTextFile(") &&
      !source.includes("URL.createObjectURL") &&
      !source.includes("requestAnimationFrame(() =>"),
    `${name} tuning exports must use the shared deterministic download lifecycle.`,
  );
}
assert(
  riverMenu.includes("const originX = origin.x") &&
    riverMenu.includes("const originZ = origin.z") &&
    riverMenu.includes("findWorldVisualLocations(this.host.field, originX, originZ)") &&
    /this\.locations = await task;[\s\S]*?this\.locationsOriginX = originX;[\s\S]*?this\.locationsOriginZ = originZ;/.test(
      riverMenu,
    ),
  "River QA landmark caching must record the numeric search origin rather than a mutable controller position after await.",
);

console.log(
  "[runtime-ui-input] HUD movement settings, diagnostics ownership, mobile visual reset, action/coyote precedence, transactional compact/fly input, and tuning UI lifecycle verified.",
);
