/*global
luxon today
*/
const bShowCountDown = false;

var lLoadTime = luxon.DateTime.local({ zone: "Europe/London" });
//console.log("lLoadTime", lLoadTime);

function roundUp(m) {
  return m.second() || m.millisecond()
    ? m.add(1, "minute").startOf("minute")
    : m.startOf("minute");
}

function showTime() {
  var lToday = luxon.DateTime.fromMillis(today, { zone: "Europe/London" });
  //console.log("Today",lToday.toISODate());
  var date = new Date();
  var h = date.getHours();
  var m = date.getMinutes();
  var s = date.getSeconds();

  h = h < 10 ? h : h;
  m = m < 10 ? "0" + m : m;
  s = s < 10 ? "0" + s : s;

  var clockTime = h + ":" + m + ":" + s + " "; // + session;
  document.getElementById("DigitalCLOCK").innerText = clockTime;
  document.getElementById("DigitalCLOCK").textContent = clockTime;

  var els = document.getElementsByClassName("starttime");
  const nowtime = luxon.DateTime.local({ zone: "Europe/London" }); // luxon.DateTime().now().setLocale("gb")

  var latestfinish = 0;

  const regExp = /[snSN]/g;
  const regExp2 = /[hH]/g;

  for (var i = 0; i < els.length; i++) {
    var dur_el = els[i].parentNode.parentNode.childNodes[2].lastChild.innerHTML;
    var dur_val =
      els[i].parentNode.parentNode.childNodes[2].lastChild.getAttribute(
        "data-dur"
      );
    var dur = luxon.Duration.fromObject({ minutes: dur_val });
    var hoursmins = dur.shiftTo("hours", "minutes"); //=> 51984

    var finish_el =
      els[i].parentNode.parentNode.childNodes[4].lastChild.innerHTML;

    var style_el = els[i].parentNode.parentNode.parentNode;
    var section_el = style_el.parentNode.parentNode;
    var lastValid = els[i].getAttribute("data-lastvalid");
    if (lastValid == null) {
      lastValid = els[i].innerHTML;
      els[i].setAttribute("data-lastvalid", lastValid);
    }
    var time = luxon.DateTime.fromFormat(lastValid, "HH:mm");

    // If change
    if (els[i].innerHTML != lastValid) {
      var newTime = luxon.DateTime.fromFormat(els[i].innerHTML, "HH:mm");
      if (newTime.invalid != null) {
        //Hides the group if you put h into thte start time
        if (section_el.style.display == "" && regExp2.test(els[i].innerHTML)) {
          section_el.style.display = "none";
          newTime = time;
        } else if (regExp.test(els[i].innerHTML)) {
          // typing s(Start) or n for now will set the start time to the next minute
          newTime = luxon.DateTime.local({ zone: "Europe/London" }).plus(
            luxon.Duration.fromObject({ minutes: 1 })
          );
        } else if (els[i].innerHTML.includes("+")) {
          newTime = time.plus(luxon.Duration.fromObject({ minutes: 1 }));
        } else if (els[i].innerHTML.includes("d")) {
          newTime = time.plus(luxon.Duration.fromObject({ minutes: 5 }));
        } else if (els[i].innerHTML.includes("-")) {
          newTime = time.minus(luxon.Duration.fromObject({ minutes: 1 }));
        } else if (els[i].innerHTML.includes("<br>")) {
          newTime = luxon.DateTime.fromFormat(
            els[i].innerHTML.replaceAll("<br>", "").trim(),
            "HH:mm"
          );
        }
      }
      if (newTime.invalid == null) {
        time = newTime;
        els[i].innerHTML = time.toLocaleString(luxon.DateTime.TIME_24_SIMPLE);
        els[i].setAttribute("data-lastvalid", els[i].innerHTML);
      }
    }

    var extra25 = time.plus(
      luxon.Duration.fromObject({ minutes: Math.ceil(dur_val * 1.25) })
    );
    var extra30 = time.plus(
      luxon.Duration.fromObject({ minutes: Math.ceil(dur_val * 1.3) })
    );

    //console.log("location.pathname", location.pathname)
    if (section_el.style.display == "" && extra30 > latestfinish) {
      latestfinish = extra30;
    }

    var finish = time.plus(dur);
    if (nowtime > extra25) {
      style_el.className = "done";
      style_el.parentNode.className = "done";
    } else if (
      bShowCountDown && nowtime > extra25.minus(luxon.Duration.fromObject({ minutes: 5 }))
    ) {
      style_el.className = "extranearly";
      style_el.parentNode.className = "extranearly";
    } else if (nowtime > finish) {
      style_el.className = "extra";
      style_el.parentNode.className = "extra";
    } else if (
      bShowCountDown && nowtime > finish.minus(luxon.Duration.fromObject({ minutes: 5 }))
    ) {
      style_el.className = "nearly";
      style_el.parentNode.className = "nearly";
    } else if (nowtime >= time) {
      style_el.className = "started";
      style_el.parentNode.className = "started";
    } else {
      style_el.className = "beforestarted";
      style_el.parentNode.className = "beforestarted";
    }
    if (hoursmins.hours == 1) {
      var hourminout = "" + hoursmins.hours + " hour ";
    } else {
      var hourminout = "" + hoursmins.hours + " hours ";
    }
    if (hoursmins.minutes > 0) {
      hourminout += hoursmins.minutes + " minutes";
    }
    els[i].parentNode.parentNode.childNodes[2].lastChild.innerHTML = hourminout;
    els[i].parentNode.parentNode.childNodes[4].lastChild.innerHTML = finish
      .toFormat("HH:mm")
      .toLowerCase();
    if (nowtime <= finish && nowtime + finish.diff(time) >= finish) {
      els[i].parentNode.parentNode.childNodes[6].lastChild.innerHTML = finish
        .diff(nowtime)
        .plus({ seconds: 1 })
        .toFormat("hh:mm:ss")
        .toLowerCase();
    } else if (nowtime <= finish) {
      els[i].parentNode.parentNode.childNodes[6].lastChild.innerHTML = finish
        .diff(time)
        .toFormat("hh:mm:ss")
        .toLowerCase();
    } else {
      els[i].parentNode.parentNode.childNodes[6].lastChild.innerHTML =
        "00:00:00";
    }
    els[i].parentNode.parentNode.childNodes[8].lastChild.innerHTML = extra25
      .toFormat("HH:mm")
      .toLowerCase();
    if (nowtime <= extra25 && nowtime + extra25.diff(time) >= extra25) {
      els[i].parentNode.parentNode.childNodes[10].lastChild.innerHTML = extra25
        .diff(nowtime)
        .plus({ seconds: 1 })
        .toFormat("hh:mm:ss")
        .toLowerCase();
    } else if (nowtime <= extra25) {
      els[i].parentNode.parentNode.childNodes[10].lastChild.innerHTML = extra25
        .diff(time)
        .toFormat("hh:mm:ss")
        .toLowerCase();
    } else {
      els[i].parentNode.parentNode.childNodes[10].lastChild.innerHTML =
        "00:00:00";
    }
    /*els[i].parentNode.parentNode.childNodes[8].lastChild.innerHTML = extra30
      .toFormat("HH:mm")
      .toLowerCase();
*/
    //console.log(dur_val, els[i].innerHTML, time.toFormat("h ma"), finish.toFormat("h:mma"), extra.toFormat("h:ma"));
  }
  //If after last finish time reload
  //console.log("latestfinish",latestfinish)
  if (
    location.pathname == "/current" &&
    nowtime > latestfinish &&
    latestfinish &&
    lToday.toISODate() == latestfinish.toISODate()
  ) {
    //console.log("Checking load time")
    if (nowtime > lLoadTime + luxon.Duration.fromObject({ minutes: 1 })) {
      location.reload();
    }
  }

  setTimeout(showTime, 200);
}

function boosters() {
  setTimeout(_boosters, 60000); //delay of 1 minutes
}

function _boosters() {
  //check it is the minute of 13:35
  var lToday = luxon.DateTime.fromMillis(today, { zone: "Europe/London" }).plus(
    luxon.Duration.fromObject({ minutes: 5 })
  );
  const lNow = luxon.DateTime.local({ zone: "Europe/London" });
  const iDif = lToday.diff(lNow).as("seconds");
  //console.log("iDif", iDif)
  if (iDif < 0) {
    location.reload();
  }
  setTimeout(_boosters, 30000); // delay 30 seconds
}
