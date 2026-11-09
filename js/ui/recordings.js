// Recordings view: every MIDI recording of the current activity, by month, newest first,
// with renaming, tempo analysis, download and deletion.
import { $, el, keyOf, fmtSec } from "../util.js";
import { t, fmt } from "../i18n.js";
import { on } from "../bus.js";
import { state, recordings, updateClip, changed } from "../store.js";
import { account } from "../cloud.js";
import { clipBlob, clipWhere, deleteRecording, recsStatus } from "../cloud-recs.js";
import { ask, toast } from "./dialogs.js";
import { icon, ICON_EDIT, ICON_DEL } from "./render.js";

let actions = {};
let editing = null; // id of the recording being renamed

const MIDI = "audio/midi";
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Name shown for a recording: its own, or the day and time it was made. */
export function recName(c) {
  if (c.name) return c.name;
  const d = new Date(c.at || 0);
  return cap(fmt.short.format(d)) + ", " + fmt.time.format(d);
}
export const fileName = (c) => "piano-" + keyOf(new Date(c.at)) + "-" + fmt.time.format(new Date(c.at)).replace(":", "h") + ".mid";

/** Open the file of a recording for an action, with a message when it can't be had. */
async function withBlob(c, fn) {
  try {
    const blob = await clipBlob(c);
    if (blob) return fn(blob);
    toast(t(c.cloud ? "recSignIn" : "recElsewhere"));
  } catch (e) {
    console.error(e);
    toast(t("recDlFail"));
  }
}

export function download(blob, name) {
  const u = URL.createObjectURL(blob),
    a = el("a");
  a.href = u;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 10000);
}

function rename(key, c, value) {
  const name = value.trim().slice(0, 80);
  updateClip(key, c.id, (x) => {
    if (name && name !== recName(Object.assign({}, x, { name: "" }))) x.name = name;
    else delete x.name;
    return x;
  });
  editing = null;
  changed();
}

function row({ clip: c, key }) {
  const li = el("li"),
    r = el("div", "row"),
    txt = el("div", "txt");
  if (editing === c.id) {
    const inp = el("input", "recname");
    inp.type = "text";
    inp.maxLength = 80;
    inp.value = recName(c);
    inp.setAttribute("aria-label", t("recRename"));
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      if (save) rename(key, c, inp.value);
      else {
        editing = null;
        renderRecs();
      }
    };
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") finish(true);
      else if (e.key === "Escape") {
        e.stopPropagation();
        finish(false);
      }
    });
    inp.addEventListener("blur", () => finish(true));
    txt.append(inp);
    requestAnimationFrame(() => {
      inp.focus();
      inp.select();
    });
  } else txt.append(el("div", "lbl", recName(c)));
  const sub = el("div", "sub", fmtSec(c.dur || 0) + (c.notes ? " · " + t("notes", c.notes) : ""));
  txt.append(sub);
  const where = el("span", "where");
  sub.append(where);
  clipWhere(c).then((w) => {
    const k =
      w === "here" ? (c.cloud ? "recOnline" : account.status === "in" ? "recUploading" : "recLocal") : w === "cloud" ? "recOnline" : w === "signin" ? "recOnlineSignIn" : "recElsewhere";
    where.textContent = " · " + t(k);
    li.classList.toggle("unavailable", w === "elsewhere" || w === "signin");
  });
  const ed = el("button", "ghosticon");
  ed.type = "button";
  ed.appendChild(icon(ICON_EDIT));
  ed.setAttribute("aria-label", t("recRename"));
  ed.addEventListener("click", () => {
    editing = c.id;
    renderRecs();
  });
  const del = el("button", "ghosticon del");
  del.type = "button";
  del.appendChild(icon(ICON_DEL));
  del.setAttribute("aria-label", t("del"));
  del.addEventListener("click", async () => {
    if (await ask(t("recDelT"), t("recDelB", recName(c)), t("del"))) {
      deleteRecording(key, c);
      toast(t("recDeleted"));
    }
  });
  r.append(txt, ed, del);
  const acts = el("div", "recacts");
  const tb = el("button", "cliplink", t("tempoBtn"));
  tb.type = "button";
  tb.addEventListener("click", () => withBlob(c, (b) => actions.openTempo(b, recName(c))));
  const dl = el("button", "cliplink", t("dlMid"));
  dl.type = "button";
  dl.addEventListener("click", () => withBlob(c, (b) => download(b, fileName(c))));
  acts.append(tb, dl);
  li.append(r, acts);
  return li;
}

export function renderRecs() {
  if (state.view !== "recs") return;
  const list = recordings().filter((x) => x.clip.mime === MIDI);
  $("recsEmpty").classList.toggle("hide", !!list.length);
  const info = [];
  if (list.length) info.push(t("recCount", list.length, fmtSec(list.reduce((a, x) => a + (x.clip.dur || 0), 0))));
  if (account.status !== "in") info.push(t("recSignInHint"));
  else if (recsStatus.pending) info.push(t("recPending", recsStatus.pending));
  else if (recsStatus.failed) info.push(t("recFailed"));
  $("recsInfo").textContent = info.join(" · ");
  const box = $("recsList");
  box.textContent = "";
  let month = "",
    ul = null;
  list.forEach((x) => {
    const m = keyOf(new Date(x.clip.at || 0)).slice(0, 7);
    if (m !== month) {
      month = m;
      ul = el("ul", "sess reclist");
      box.append(el("h3", "rec-month", cap(fmt.monthYear.format(new Date(x.clip.at || 0)))), ul);
    }
    ul.appendChild(row(x));
  });
}

export function initRecordings(a) {
  actions = a;
  ["recs", "account", "data", "changed", "lang"].forEach((ev) => on(ev, () => editing === null && renderRecs()));
}
