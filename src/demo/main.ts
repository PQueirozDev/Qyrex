// Demo web do QrzSpace (portfólio): a interface REAL do app, com `window.workspace`
// simulado. A simulação é instalada antes de importar o app.
import { resetDemo, workspaceMock } from "./workspaceMock";

window.workspace = workspaceMock;

// Idioma pedido pelo portfólio (?lang=en).
const lang = new URLSearchParams(location.search).get("lang");
// Só reaplica quando o portfólio muda de idioma: a troca feita dentro da demo continua valendo.
if (lang && sessionStorage.getItem("qrz-demo-lang") !== lang) {
  sessionStorage.setItem("qrz-demo-lang", lang);
  localStorage.setItem("qrz.language", lang === "en" ? "en" : "pt");
  void workspaceMock.settings.update({ language: lang === "en" ? "en" : "pt" });
}

const en = (localStorage.getItem("qrz.language") ?? "pt") === "en";
const badge = document.createElement("div");
badge.className = "demo-badge";
badge.innerHTML = `<span class="demo-dot"></span><b>${en ? "Demo" : "Demo"}</b><span>${en ? "sample data · changes last only this visit" : "dados fictícios · alterações valem só nesta visita"}</span><button type="button">${en ? "Reset" : "Restaurar"}</button>`;
badge.querySelector("button")!.addEventListener("click", resetDemo);
document.body.appendChild(badge);

void import("../renderer/main");
