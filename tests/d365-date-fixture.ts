// A D365 date field as the live page builds it (Trial balance, "From date"): the field container
// holds the input and a nameless div.lookupButton; the calendar is a jQuery UI date picker appended
// to <body> that writes the date into the input without firing input/change events.
export const d365DateHtml = (() => {
  const days = Array.from({ length: 35 }, (_, i) => (i < 3 || i > 33 ? 0 : i - 2));
  const weeks = Array.from({ length: 5 }, (_, w) =>
    `<tr>${days.slice(w * 7, w * 7 + 7).map((d) => (d ? `<td role="presentation"><a id="idDay-${d}" role="button" aria-label="Day ${d}, July, 2026" class="ui-state-default" href="#">${d}</a></td>` : "<td>&nbsp;</td>")).join("")}</tr>`,
  ).join("");
  return `<!doctype html><html><body><h1>Trial balance</h1>
<div id="ledgertrialbalancelistpage_2_DateGroup" role="group" aria-labelledby="dg"><span id="dg">Date range</span>
 <div role="presentation" class="group_content layout-container layout-horizontal">
  <div id="ledgertrialbalancelistpage_2_StartDate" role="presentation" class="Auto input_container editMode field-hasLookupButton">
   <label id="sdl" for="sd">From date</label><input id="sd" type="text" value="7/1/2026">
   <div class="lookupDock-dockContainer lookupDock-dateTime displayoption"><div role="presentation" class="lookupDock-buttonContainer layout-ignoreArrange"><div class="lookupButton" style="display:inline-block;width:20px;height:20px;background:#ccc"></div></div></div>
  </div>
  <div id="ledgertrialbalancelistpage_2_Vendor" role="presentation" class="Auto input_container editMode field-hasLookupButton">
   <label for="vd">Vendor account</label><input id="vd" type="text" role="combobox">
   <div class="lookupDock-dockContainer"><div class="lookupButton" style="display:inline-block;width:20px;height:20px;background:#ccc"></div></div>
  </div>
 </div>
</div>
<button id="calc" type="button">Calculate balances</button>
<div id="ui-datepicker-div" role="dialog" class="ui-datepicker ui-widget" style="display:none;position:absolute;top:120px;left:20px;background:#fff">
 <table class="ui-datepicker-calendar"><thead><tr>${"Su Mo Tu We Th Fr Sa".split(" ").map((d) => `<th>${d}</th>`).join("")}</tr></thead><tbody>${weeks}</tbody></table>
</div>
<script>
var sd = document.getElementById("sd"), dp = document.getElementById("ui-datepicker-div");
document.querySelector("#ledgertrialbalancelistpage_2_StartDate .lookupButton").addEventListener("click", function () { dp.style.display = "block"; });
dp.addEventListener("click", function (e) {
  var a = e.target.closest("a"); if (!a) return;
  e.preventDefault();
  sd.value = "7/" + a.textContent + "/2026"; // like jQuery UI: no input or change event
  dp.style.display = "none";
});
</script></body></html>`;
})();
