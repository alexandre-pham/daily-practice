// "Google account" section of the settings sheet.
import { $ } from "../util.js";
import { t } from "../i18n.js";
import { on } from "../bus.js";
import { toast } from "./dialogs.js";
import { account, canSignIn, signIn, signOut, initCloud } from "../cloud.js";

function render() {
  const a = account,
    st = a.status;
  $("acctDot").className = "sdot" + (st === "in" ? " ok" : st === "busy" ? " busy" : a.error ? " err" : "");
  $("acctTxt").textContent =
    st === "in" ? t("acctIn", a.email) : st === "busy" ? t("acctBusy") : a.error ? t("acctErr_" + a.error) : t("acctOut");
  $("gIn").classList.toggle("hide", st !== "out");
  $("gIn").disabled = !canSignIn();
  $("gOut").classList.toggle("hide", st !== "in");
}

export function initAccount() {
  let was = account.status;
  on("account", () => {
    if (was === "busy" && account.status === "in" && sessionStorage.getItem("dp-just-signed-in")) {
      sessionStorage.removeItem("dp-just-signed-in");
      toast(t("acctWelcome", account.email));
    }
    was = account.status;
    render();
  });
  on("lang", render);
  $("gIn").addEventListener("click", () => {
    sessionStorage.setItem("dp-just-signed-in", "1");
    signIn();
  });
  $("gOut").addEventListener("click", async () => {
    await signOut();
    toast(t("acctSignedOut"));
  });
  render();
  initCloud();
}
