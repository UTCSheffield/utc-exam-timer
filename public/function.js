function roundUp(m) {
  return m.second() || m.millisecond()
    ? m.add(1, "minute").startOf("minute")
    : m.startOf("minute");
}

function showTime() {
  var lToday = luxon.DateTime. fromMillis(today, { zone: "Europe/London" });
  //console.log("Today",lToday.toISODate());
  var date = new Date();
  var h = date.getHours();
  var m = date.getMinutes();
  var s = date.getSeconds();

  h = h < 10 ? h : h;
  m = m < 10 ? "0" + m : m;
  s = s < 10 ? "0" + s : s;

  var time = h + ":" + m + ":" + s + " "; // + session;
  document.getElementById("DigitalCLOCK").innerText = time;
  document.getElementById("DigitalCLOCK").textContent = time;

  var els = document.getElementsByClassName("starttime");
  const nowtime = Date.now(); // luxon.DateTime().now().setLocale("gb")

  var latestfinish = 0;

  for (var i = 0; i < els.length; i++) {
    var dur_el = els[i].parentNode.parentNode.childNodes[2].lastChild.innerHTML;
    var dur_val =
      els[i].parentNode.parentNode.childNodes[2].lastChild.getAttribute(
        "data-dur"
      );

    var finish_el =
      els[i].parentNode.parentNode.childNodes[4].lastChild.innerHTML;

    // typing s(Start) or n for now will set the start time to the next minute
    var regExp = /[snSN]/g;
    if (regExp.test(els[i].innerHTML)) {
      els[i].innerHTML = luxon.DateTime.local({ zone: "Europe/London" })
        .plus(luxon.Duration.fromObject({ minutes: 1 }))
        .toLocaleString(luxon.DateTime.TIME_24_SIMPLE);
    }

    var time = luxon.DateTime.fromFormat(els[i].innerHTML, "HH:mm");
    var dur = luxon.Duration.fromObject({ minutes: dur_val });
    var hoursmins = dur.shiftTo("hours", "minutes"); //=> 51984

    var style_el = els[i].parentNode.parentNode.parentNode;

    //Hides the group if you put h into thte start time
    var regExp2 = /[hH]/g;
    var section_el = style_el.parentNode.parentNode;
    if (section_el.style.display == "" && regExp2.test(els[i].innerHTML)) {
      section_el.style.display = "none";
    }

    var finish = time.plus(dur);
    if (nowtime > finish) {
      style_el.className = "done";
    } else if (
      nowtime > finish.minus(luxon.Duration.fromObject({ minutes: 15 }))
    ) {
      style_el.className = "nearly";
    } else if (nowtime >= time) {
      style_el.className = "started";
    } else {
      style_el.className = "";
    }

    var extra25 = time.plus(
      luxon.Duration.fromObject({ minutes: Math.ceil(dur_val * 1.25) })
    );
    var extra50 = time.plus(
      luxon.Duration.fromObject({ minutes: Math.ceil(dur_val * 1.5) })
    );

    //console.log("location.pathname", location.pathname)
    if (section_el.style.display == "" && extra50 > latestfinish) {
      latestfinish = extra50;
    }

    var hourminout = "" + hoursmins.hours + " hours ";
    if (hoursmins.minutes > 0) {
      hourminout += hoursmins.minutes + " minutes";
    }
    els[i].parentNode.parentNode.childNodes[2].lastChild.innerHTML = hourminout;
    els[i].parentNode.parentNode.childNodes[4].lastChild.innerHTML = finish
      .toFormat("HH:mm")
      .toLowerCase();
    els[i].parentNode.parentNode.childNodes[6].lastChild.innerHTML = extra25
      .toFormat("HH:mm")
      .toLowerCase();
    els[i].parentNode.parentNode.childNodes[8].lastChild.innerHTML = extra50
      .toFormat("HH:mm")
      .toLowerCase();

    //console.log(dur_val, els[i].innerHTML, time.toFormat("h ma"), finish.toFormat("h:mma"), extra.toFormat("h:ma"));
  }
  //If after last finish time reload
  console.log("latestfinish",latestfinish)
  if (location.pathname == "/current" && nowtime > latestfinish && latestfinish && lToday.toISODate() == latestfinish.toISODate()) {
    location.reload();
  }

  setTimeout(showTime, 1000);
}

document.addEventListener("DOMContentLoaded", () => {
  showTime();
});
