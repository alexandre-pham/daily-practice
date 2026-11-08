// "Account" section of the settings sheet: email and password sign-in.
import { $ } from "../util.js";
import { t } from "../i18n.js";
import { on } from "../bus.js";
import { toast } from "./dialogs.js";
import { account, signIn, signOut, resetPassword, initCloud } from "../cloud.js";

function render() {
  const a = account,
    st = a.status;
  $("acctDot").className = "sdot" + (st === "in" ? " ok" : st === "busy" ? " busy" : a.error ? " err" : "");
  $("acctTxt").textContent =
    st === "in" ? t("acctIn", a.email) : st === "busy" ? t("acctBusy") : a.error ? t("acctErr_" + a.error) : t("acctOut");
  $("acctForm").classList.toggle("hide", st === "in");
  $("acctSubmit").disabled = st === "busy";
  $("gOut").classList.toggle("hide", st !== "in");
}

export function initAccount() {
  on("account", render);
  on("lang", render);
  $("acctForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const ok = await signIn($("acctEmail").value, $("acctPass").value);
    if (ok) {
      $("acctPass").value = "";
      toast(t("acctWelcome", account.email));
    }
  });
  $("acctForgot").addEventListener("click", async () => {
    const email = $("acctEmail").value.trim();
    if (!email) {
      account.error = "needEmail";
      render();
      $("acctEmail").focus();
      return;
    }
    if (await resetPassword(email)) toast(t("acctResetSent", email), { duration: 6000 });
  });
  $("gOut").addEventListener("click", async () => {
    await signOut();
    toast(t("acctSignedOut"));
  });
  render();
  initCloud();
}
