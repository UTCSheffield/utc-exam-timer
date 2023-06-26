// Generic node.js express init:
const express = require("express");
const app = express();
app.use(express.static("public"));
//const moment = require("moment");
const { DateTime, Duration, Info } = require("luxon");
const yaml = require("js-yaml");
var dcopy = require("deep-copy");
const { parse } = require("csv-parse/sync");
const consoleOnce = require("console-once");

var fs = require("fs"),
  path = require("path"),
  URL = require("url");

const dirTree = require("directory-tree");
var XLSX = require("xlsx");

var defaultTimes = {
  am: "09:00",
  "10am": "10:00",
  one: "13:00",
  pm: "13:30",
  p1: "08:45",
  p3: "11:15",
  p3l: "11:25",
  p4a: "12:10",
  p4b: "12:40",
  p4c: "13:10",
  p5: "13:40",
  p5l: "13:50",
};

const MORNING = {
    hour: 8,
    minute: 0,
    second: 0,
    millisecond: 0,
  };

var groupOnDuration = false; //true;

const hbs = require("hbs");
var helpers = require("handlebars-helpers")({
  handlebars: hbs,
});

hbs.registerHelper("asMinutes", function (arg1, options) {
  if (typeof arg1.shiftTo !== "function") {
    arg1 = Duration.fromObject(arg1.values);
  }
  return arg1.shiftTo("minutes").minutes;
});

hbs.registerHelper("ifEquals", function (arg1, arg2, options) {
  return arg1 == arg2 ? options.fn(this) : options.inverse(this);
});

hbs.registerHelper("ifNotEqual", function (arg1, arg2, options) {
  return arg1 != arg2 ? options.fn(this) : options.inverse(this);
});

hbs.registerHelper("join", function (arg1, options) {
  return arg1.join(", ");
});

hbs.registerHelper('loud', function (aString) {
    return aString.toUpperCase()
})

var jsonOptions = {
  header: [
    "ExcelDate",
    "Series",
    "Board",
    "Qual",
    "Code",
    "Subject",
    "Paper",
    "Session",
    "Duration",
  ],
};

function getDateFromExcel(date) {
  var newDate;
  if (Number.isInteger(parseInt(date))) {
    //January 1, 1900, 12:00:00 a.m.
    newDate = DateTime.local(1900, 1, 1, 0, 0, 0, 0, {
      zone: "Europe/London",
    }).plus(Duration.fromObject({ days: parseInt(date) - 1 }));
  } else {
    newDate = DateTime.fromJSDate(date, { zone: "Europe/London" });
  }
  return newDate;
}

// Luxon
function defaultExamMapping(exam) {
  exam.Code = exam.Code.trim();
  exam.Session = exam.Session.trim();
  exam.Qual = exam.Qual.trim()
  exam.Duration = exam.Duration.trim()
  exam.Board = exam.Board.trim()
  exam.Paper = exam.Paper.replace(/ ?[-:] ?Written Paper/,"").trim()
  exam.Subject = exam.Subject.trim()

  exam.Dur = get_duration(exam.Duration);
  const Series = getDateFromExcel(exam.Series).set({
    hour: parseInt(0),
    minutes: parseInt(0),
  });
  exam.Series = Series.toFormat("MMM-yy"); //toLocaleString();
  exam.Session = exam.Session.toLowerCase();

  if (typeof exam.Rooms == "undefined") {
    // This should be a look up f local data
    exam.Rooms = [{ Room: "Multi Purpose Hall 2028" }];
  }

  if (exam.Session == "morning") {
    exam.Session = "am";
  }
  if (exam.Session == "afternoon") {
    exam.Session = "pm";
  }

  if (exam.Session in defaultTimes) {
    exam.StartTime = defaultTimes[exam.Session];
    let time = exam.StartTime.split(":");

    exam.Date = getDateFromExcel(exam.ExcelDate).set({
      hour: parseInt(time[0]),
      minutes: parseInt(time[1]),
    });
    exam.End = exam.Date.plus(exam.Dur);
  } else {
    console.log("exam.Session not found", exam.Session);
  }
  return exam;
}

function getOCRUnit(Title) {
  var number = "";
  const regex = /Unit\s+([A-Z0-9]+)\s/;
  const found = Title.match(regex);

  if (found) {
    number = found[1].padStart(2, "0");
  }
  return number;
}

function printExam(label, data, line = 0, full = false) {
  if (full) {
    var str = Object.keys(data[line])
      .map((key) => {
        return key + ":" + data[line][key].toString();
      })
      .join(" , ");
    consoleOnce.log(label, label, data.length, str);
  } else {
    consoleOnce.log(
      label,
      label,
      data.length,
      "data=",
      Object.values(data[line]).join(" , ")
    );
    //console.log("Rooms : ", data[line].Rooms);
  }
}

function printExams(label, data) {
  for (var i = 0; i < data.length; i++) {
    printExam(label + "[" + i + "]", data, i, false);
  }
}

function getTimetableSIMS(file) {
  try {
    const doc = fs.readFileSync(file, "utf8");
    const lines = doc.split("/n");
    const series = lines[0].split(":")[1];

    const records = parse(doc, {
      columns: true,
      skip_empty_lines: true,
      from_line: 5,
    });

    var data = records.map((exam) => {
      var sExamDate = exam.Date.trim() + " " + exam["Start Time"].trim();
      var sDateFormat = "dd/MM/yyyy h:mma";
      exam.ExcelDate = DateTime.fromFormat(sExamDate, sDateFormat);

      exam.StartTime = exam.ExcelDate.toLocaleString(DateTime.TIME_24_SIMPLE);
      exam.Date = exam.ExcelDate;
      exam.Qual = exam.Qualification;
      var Paper = exam["Component Title"].trim();
      var aParts = Paper.split(":");
      if (aParts.length > 1) {
        exam.Subject = aParts[0].trim();
        exam.Paper = aParts[1].trim();
      } else {
        var aParts = Paper.split("Paper");
        if (aParts.length > 1) {
          exam.Subject = aParts[0].trim();
          exam.Paper = "Paper " + aParts[1].trim();
        } else {
          exam.Subject = Paper;
        }
      }
      exam.Series = series; //new Date(exam.Series);
      exam.Code = exam["Component Code"];
      var bDebug = false;
      if(exam.Code == "H156/02"){
        //bDebug = true;
      }
      
      if (exam.Board == "DOM") {
        exam.Board = "Internal";
      }
      
      if (exam.Board == "RSA") {
        exam.Board = "OCR";
      }

      if (exam.Qual == "CAMX") {
        exam.Qual = "Cambridge Technicals Level 3";
        exam.Code = "0" + exam.Code.substring(0, 4) + "/" + exam.Code.substring(4, 6);
      }
      if (exam.Qual == "CNAT") {
        exam.Qual = "Cambridge National";
      }

      exam.Session = "pm";

      if (exam.Date.hour < 10) {
        exam.Session = "am";
      }else if (exam.Date.hour < 12) {
        exam.Session = "p3";
      }

      var momentopts = {
        minute: exam.Length,
      };

      var duration_moment = Duration.fromObject(momentopts);
      exam.Dur = duration_moment;
      exam.Duration = duration_moment.toHuman().replace(",")
      exam.End = exam.Date.plus(exam.Dur);
      if (typeof exam.Rooms == "undefined") {
        // This should be a look up f local data
        exam.Rooms = [{ Room: exam.Room }];
      }
      exam.Codes = splitExamCodes(exam.Code.replace(" ", "/"));
      
      //consoleOnce.log("exam", "exam", exam)
      
      if(bDebug){
        console.log("exam", exam)
      }
      
      exam.aMatchedBoardExam = null;
      return exam;
    });

    //printExam("data SIMS", data);
    return data;
  } catch (e) {
    console.log("Error", e);
  }
}

function getTimetableYAML(file) {
  try {
    const doc = yaml.load(fs.readFileSync(file, "utf8"));
    var data = doc
      .map((exam) => {
        exam.ExcelDate = new Date(exam.ExcelDate);
        exam.Series = new Date(exam.Series);
        return exam;
      })
      .map(defaultExamMapping)
      .map((exam) => {
        exam.Codes = splitExamCodes(exam.Code.replace(" ", "/"));
        return exam;
      });

    //printExam("data YAML", data);
    return data; 
  } catch (e) {
    console.log("Error", e);
  }
}

function getTimetableOCR(wb) {
  var ws = wb.Sheets[wb.SheetNames[0]];
  var sheetdata = XLSX.utils.sheet_to_json(ws, jsonOptions);
  var data = sheetdata
    .slice(1)
    .map(defaultExamMapping)
    .map((exam) => {
      exam.Subject = exam.Subject.replace("(", "").replace(")", "");
      var Codes = splitExamCodes(exam.Code);
      exam.Codes = Codes;
      var Unit = getOCRUnit(exam.Paper);
      if (Unit) {
        var codes = Codes.map((Code) => {
          return Code + "/" + Unit;
        });
        exam.Codes = codes;
        exam.Code = exam.Code
      }
      
      return exam;
    });

  //printExam("data OCR", data);
  return data;
}

function getTimetablePearson(wb) {
  var ws = wb.Sheets["All papers"];
  var sheetdata = XLSX.utils.sheet_to_json(ws, jsonOptions);
  var data = sheetdata
    .slice(1)
    .map(defaultExamMapping)
    .map((exam) => {
      //exam.Board = "EdExcel";
      exam.Codes = splitExamCodes(exam.Code.replace(" ", "/"));
      return exam;
    });
  //printExam("data Pearson", data);
  return data;
}

const tree = dirTree("./exams/"); //, {extensions:/\.xlsx$/});

function getBoosterYAML(file) {
  try {
    const doc = yaml.load(fs.readFileSync(file, "utf8"));
    var data = {};
    doc.forEach((day) => {
        var sDateFormat = "EEEE d MMMM yyyy"; 
        var ExcelDate = DateTime.fromFormat(day.Date, sDateFormat);
        day.Sessions.forEach((session) => {
          var newSession = dcopy(session)
          if (newSession.Session in defaultTimes) {
            var StartTime = defaultTimes[newSession.Session];
            let time = StartTime.split(":");

            newSession.ExcelDate = ExcelDate.set({
              hour: parseInt(time[0]),
              minutes: parseInt(time[1]),
            });
          } else {
            console.log("newSession.Session not found", newSession.Session);
          }

          const SessionName =
            ExcelDate.toLocaleString(DateTime.DATE_HUGE) + " " + newSession.Session;
          newSession.SessionName = SessionName;
          
          data[SessionName] = dcopy(newSession.Boosters);
        })
      });

    return data;
    
  } catch (e) {
    console.log("Error", e);
  }
}

var boosterYAML = getBoosterYAML("boosters.yml");

function getExtrasYAML(file) {
  try {
    const doc = yaml.load(fs.readFileSync(file, "utf8"));
    return doc;
  } catch (e) {
    console.log("Error", e);
  }
}

var extrasYAML = getExtrasYAML("extras.yml");

var boardExams = [];
var simsExams = [];
var yamlExams = [];
tree.children.forEach((dir) => {
  dir.children.forEach((fileEntry) => {
    const opts = { cellDates: true };
    var workbook = XLSX.readFile(fileEntry.path, opts);
    //workbook.SheetNames is an ordered list of the sheets in the workbook
    switch (dir.name) {
      case "OCR":
        boardExams = boardExams.concat(getTimetableOCR(workbook));
        break;
      case "Pearson":
        boardExams = boardExams.concat(getTimetablePearson(workbook));
        break;
      case "YAML":
        yamlExams = getTimetableYAML(fileEntry.path);
        break;
      case "SIMS":
        //allExams = allExams.concat(getTimetableSIMS(fileEntry.path));
        simsExams = getTimetableSIMS(fileEntry.path);
        break;
    }
  });
});

function createID(exam){
  exam.ID = exam.Codes.sort().join(";")
  return exam
}

boardExams = boardExams.map(createID);
simsExams = simsExams.map(createID);
yamlExams = yamlExams.map(createID);

//console.log("boardExams.IDs", boardExams.map((exam)=>{return exam.ID;}).join(" "))
//console.log("simsExams.IDs", simsExams.map((exam)=>{return exam.ID;}).join(" "))
//console.log("yamlExams.IDs", yamlExams.map((exam)=>{return exam.ID;}).join(" "))

var aSimsRooms = []
simsExams.forEach((exam)=>{
  if (!(exam.Code in aSimsRooms)){
    aSimsRooms[exam.Code] = [];
  } 
  aSimsRooms[exam.Code] = aSimsRooms[exam.Code].concat(exam.Rooms)
})

//console.log("aSimsRooms", aSimsRooms);

// DONE : Load board format exams
// TODO : Don't flattern Codes check against the full Codes[] structure

boardExams.sort(examCompare);
yamlExams.sort(examCompare);
simsExams.sort(examCompare);

var usedCodes = [];

// TODO : Keep board exams that are in the SIMS exams
function simsExamForBoardExam(oBoardExam, oSimsExam){
  if( oSimsExam.aMatchedBoardExam == null ){
    var oBoardExamCodes = dcopy(oBoardExam.Codes)
    var oSimsExamCodes = dcopy(oSimsExam.Codes)
    if (oBoardExamCodes.some((sBoardCode)=>{
      const bBoardCodeInSimsData =  oSimsExamCodes.includes(sBoardCode)
      if(bBoardCodeInSimsData){
        //console.log("oSimsExamCodes.includes("+sBoardCode+")", oSimsExamCodes, bBoardCodeInSimsData)
      }
      return bBoardCodeInSimsData
    })){
      oSimsExam.aMatchedBoardExam = oBoardExam.ID
      //console.log("oBoardExam:"+oBoardExam.ID, "oBoardExam:"+oBoardExam.ID, oBoardExam.Qual, oBoardExam.Subject, oBoardExam.Paper, oSimsExam.ID, oSimsExam.Codes);
    }
  }
  return oSimsExam; 
}

var aListedExams = []
var ourExams = []
boardExams.forEach((boardExam) => {
    simsExams = simsExams.map((oSimsExam) => {
      return simsExamForBoardExam(boardExam, oSimsExam);
    })
    //return false;
    const found = simsExams.findIndex(element => element.aMatchedBoardExam == boardExam.ID);
    if((found > -1) && !aListedExams.includes(boardExam.ID)){
      aListedExams.push(boardExam.ID);
      ourExams.push(boardExam);
    }
  });
  

// DONE : group the SIMS exams and add them to ourExams
// DONE : find the minium duration one for the code and add the details of that to ourExams probably running setSessionAndGroup
var missingExams = simsExams.filter((exam) => {
  return exam.aMatchedBoardExam == null;
});



var missingIDs = Array.from(new Set(missingExams.map((exam)=>{
  return exam.ID;
})));

var matchingExams = {};
  
var requiredSIMSExamsCodes = []
var requiredSIMSExams = missingIDs.map((ID) => {
  missingExams.forEach((exam)=>{
    if (exam.ID == ID ){
      if (exam.ID in matchingExams ){
        if(matchingExams[exam.ID].End > exam.End ){
          matchingExams[exam.ID] = exam  
        }
      } else {
        matchingExams[exam.ID] = exam
      }
    }
  }); 
})
ourExams = ourExams.concat(Object.values(matchingExams));
//ourExams = ourExams.concat(Array.from(matchingExams));


/*missingExams.forEach((missingExam) => {
    if( !aListedExams.includes(missingExam.Code)){
      aListedExams.push(missingExam.Code);
      ourExams.push(missingExam);
    }
  });
*/

ourExams = ourExams.concat(yamlExams)

var getShortRoom = function(sRoom){
  var aWords = sRoom.split(" ")
  var sShort = aWords.map((word)=>{
    if (word.search(/[A-Z]&[A-Z]+/i) > -1 ){
      //console.log("word", word)
      return word.replace("&","")
    }
    
    if (word.search(/[0-9][0-9][0-9]+/i) > -1 ){
      return ""
    }
    return word[0]
  }).join("")
  //console.log("sShort", sShort)
  return sShort
}
 
function setRooms(exam){
  if(exam.Code in aSimsRooms){
      exam.Rooms = exam.Rooms.concat(aSimsRooms[exam.Code]) 
  } 
  var examExtra = extrasYAML.find((examExtra)=>{
    return examExtra.Code == exam.Code;
  })
  if (examExtra){
    exam.Rooms = exam.Rooms.map((oExamRoom) => {
      const sExamShortRoom = getShortRoom(oExamRoom.Room)
      const examExtraRoom = examExtra.Rooms.find((oExtraRoom)=>{
        return oExtraRoom.Room == sExamShortRoom;
      })
      
      if(examExtraRoom){
        oExamRoom = Object.assign(examExtraRoom, oExamRoom)
      }
      
      return oExamRoom
    })
  } 
  return exam
} 

ourExams.sort(examCompare).map(setRooms).map(setSessionAndGroup);

/*
ourExams = ourExams.map((exam) => {
  var matchingSimsExams = simsExams.filter((simsExam) => {
    return simsExam.Codes.some((code) => {
      return exam.Codes.includes(code);
    });
  });
  var simsRooms = [
    ...new Set(
      matchingSimsExams.map((simsExam) => {
        return simsExam.Room;
      })
    ),
  ];

  exam.Rooms = simsRooms.map((sRoomName) => {
    return { Room: sRoomName };
  });
  return exam;
});
*/
// TODO : Add in all YAML exams
// TODO : run around the sims exams and add all the rooms we have and add them to ourExams

function setSessionAndGroup(exam) {
  const SessionName =
    exam.Date.toLocaleString(DateTime.DATE_HUGE) + " " + exam.Session;
  exam.SessionName = SessionName;
  //consoleOnce.log("setSessionAndGroup (once) exam.Date", "setSessionAndGroup (once) exam.Date", exam.Date.toLocaleString(DateTime.DATETIME_MED), "exam.SessionName", exam.SessionName);

  var GroupKey = exam.Date.toLocaleString() + " : " + exam.Code;
  //consoleOnce.log("typeof exam.Dur","typeof exam.Dur", typeof exam.Dur)
  if (groupOnDuration && typeof exam.Dur == "object") {
    consoleOnce.log("Grouping on Duration")
    GroupKey =
      exam.Date.toLocaleString() +
      " : " +
      exam.Board +
      " : " +
      exam.Qual +
      " : " +
      exam.Dur.toHuman({ unitDisplay: "short" });
  }

  exam.GroupKey = GroupKey;
  return exam;
}

function roundUp(m) {
  return m.second() || m.millisecond()
    ? m.add(1, "minute").startOf("minute")
    : m.startOf("minute");
}

function get_duration(Dur) {
  const aduration = Dur.match("([0-3]?) ?[hours]* *([0-9]?[0-9]?) ?[minutes]*");
  //console.log("aduration", aduration)
  var mins = 0;
  if (typeof aduration[2] != "undefined") {
    mins = aduration[2];
  }

  var momentopts = {
    minute: mins,
    hour: aduration[1],
  };

  if (aduration[1] == "") {
    console.log("Dur", Dur, "momentopts", momentopts); 
  }
  var duration_moment = Duration.fromObject(momentopts);

  if (duration_moment.isValid) {
    return duration_moment;
  }
  console.warning(duration_moment, "at", duration_moment.invalidExplanation);

  //dur.toHuman({ unitDisplay: "short" })
}
function createRange(from, to) {
    if (from.length === 0) {
        return [ "" ];
    }

    var result = [];
    var innerRange = createRange(from.substring(1), to.substring(1));

    for (var i = from.charCodeAt(0); i <= to.charCodeAt(0); i++) {
        for (var j = 0; j < innerRange.length; j++) {
            result.push(String.fromCharCode(i) + innerRange[j]);
        }
    }

    return result;
}


function splitExamCodes(name) {
  var bDebug = false;
  if(name == "H156/02"){
    //bDebug = true;
  }
  
  var chunks = name.split(/[ &]+/);
  var stage2 = chunks.map((chunk)=>{
    var codePaper = chunk.trim().split("/");
    var stage3 = codePaper.map((part) => {
        var  partRange = part.trim().split("-");
        var spread = partRange;
        if (partRange.length > 1){
            spread = createRange(partRange[0],partRange[1]);
        }    
        return spread;
    })
    if(bDebug){
      console.log("stage3", JSON.stringify(stage3));
    }
    if(stage3.length == 2){
        var out = []
        stage3[0].forEach((code)=>{
            stage3[1].forEach((paper)=>{
                out.push(code+"/"+paper)
            })
        }) 
        return out;
    }
    return stage3.flat();
  })
  if(bDebug){
    console.log("stage2", JSON.stringify(stage2));
  }
  return stage2.flat()
}

console.assert(JSON.stringify(splitExamCodes("05822")) == JSON.stringify([ '05822']))
console.assert(JSON.stringify(splitExamCodes("05822-05825 & 05873") ) == JSON.stringify( [ '05822', '05823', '05824', '05825', '05873' ]))
console.assert(JSON.stringify(splitExamCodes("05826-05829 & 05872")) == JSON.stringify( [ '05826', '05827', '05828', '05829', '05872' ]))
console.assert(JSON.stringify(splitExamCodes("05833 & 05871")) == JSON.stringify( [ '05833', '05871' ]))
console.assert(JSON.stringify(splitExamCodes("1RA0/1A-1C") ) == JSON.stringify( [ '1RA0/1A', '1RA0/1B','1RA0/1C' ]))


function getGroups(aExams) {
  var aGroupKeys = Array.from(
    new Set(
      aExams.map((exam) => {
        return exam.GroupKey;
      })
    )
  );

  //console.log("aGroupKeys", aGroupKeys);

  var aGroups = aGroupKeys.map(sGroupKey =>{
    var aInGroup = []; 
    var aGroupExams = aExams.filter(exam => {
      if (aInGroup.includes(exam.Paper)){
        return false;
      }
      
      if (exam.GroupKey == sGroupKey)
      {
        aInGroup.push(exam.Paper)
        return true
      }
      return false
    });

    var aGroup = {
      name: aGroupExams[0].Board + " " + aGroupExams[0].Qual,
      Duration: aGroupExams[0].Duration,
      Dur: aGroupExams[0].Dur,
      StartTime: aGroupExams[0].StartTime,
      papers: aGroupExams,
    };
    /*aGroupExams[0];
    aGroup.name=  aGroupExams[0].Qual; //aGroupExams.map(exam=>{return exam.Paper}).join("<br>"),
    //Session      : aGroupExams[0].Session,
    aGroup.papers = aGroupExams*/
    return aGroup;
  });
  return aGroups;
}


var examCompare = function (a, b) {
  if (a.Date < b.Date) {
    return -1;
  }
  if (a.Date > b.Date) {
    return 1;
  }
  if (a.End < b.End) {
    return -1;
  }
  if (a.End > b.End) {
    return 1;
  }
  return 0;
};




hbs.registerPartials(__dirname + "/views/partials");
app.set("view engine", "hbs");
app.set("views", __dirname + "/views");

var data, errors;
var Sessions = [];
var AllRooms = [];

ourExams.sort(examCompare);
var aSessions = Array.from(
  new Set(
    ourExams.map((exam) => {
      return exam.SessionName;
    })
  )
);

Sessions = aSessions.map((sSession, iIndex) => {
  var aExams = ourExams.filter((exam) => {
    return exam.SessionName == sSession;
  });

  //printExams("aExams", aExams);
  var aGroups = getGroups(aExams);

  var aRoomNames = Array.from(
    new Set(
      aExams
        .map((exam) => {
          return exam.Rooms.map((room) => {
            return room.Room;
          });
        })
        .flat()
    )
  );

  var aRooms = aRoomNames.map((sRoomKey) => {
    var aRoomExams = dcopy(aExams)
      .filter((exam) => {
        return exam.Rooms.some((room) => {
          return room.Room == sRoomKey;
        });
      })
      .map((exam) => {
        exam.Rooms = exam.Rooms.filter((room) => {
          return room.Room == sRoomKey;
        });
        return exam;
      });

    var aRoom = {
      name: sRoomKey,
      short:getShortRoom(sRoomKey),
      groups: getGroups(aRoomExams),
    };
    return aRoom;
  });
  
  if(aExams.length > 0){
    var sLabel = "No Date"
    //console.log("aExams[0].Date", aExams[0].Date)
    //if(typeof aExams[0].Date == "Object"){
      sLabel = (aExams[0].Date.toFormat("a")=="AM"?"Morning - ":"Afternoon - ")+aExams[0].Date.toFormat("h:mma").toLowerCase();
    //}
    return {
      name: sSession,
      id: iIndex,
      next: iIndex + 1,
      Date: aExams[0].Date,
      Label: sLabel, 
      sDate: aExams[0].Date.toLocaleString(DateTime.DATE_HUGE),
      End: aExams[aExams.length - 1].End,
      groups: aGroups,
      rooms: aRooms,
      boosters: boosterYAML[sSession]
    };
  }
  return {}
});

hbs.localsAsTemplateData(app);
//app.locals.errors = errors

//sessionnmoment
app.get("/current", (request, response) => {
  let dt = DateTime.local({ zone: "Europe/London" });
  let id = Sessions.findIndex((session) => {
    return session.End > dt;
  });

  if (id >= 0) {
    let data = Sessions[id];
    response.render("currentsession", data);
  } else {
    let data = {
      sessions: Sessions,
      allrooms: AllRooms,
      errors: errors,
    };
    response.render("index", data);
  }
});

app.get("/current/room/:room", (request, response) => {
  let dt = DateTime.local({ zone: "Europe/London" });
  let id = Sessions.findIndex((session) => {
    return session.End > dt;
  });
  
  if (id >= 0) {
    let data = dcopy(Sessions[id]);
    var roomId = data.rooms.findIndex((room) => {
      return room.name == request.params.room;
    });
    if (roomId !== -1) {
      data.groups = data.rooms[roomId].groups;
      data.room = data.rooms[roomId];
    }
    response.render("roomsession", data);
  }
});

app.get("/session/:id", (request, response) => {
  let dt = new Date();
  let data = Sessions[request.params.id];
  response.render("session", data);
});

app.get("/session/:id/room/:room", (request, response) => {
  let data = dcopy(Sessions[request.params.id]);
  var roomId = data.rooms.findIndex((room) => {
    return room.name == request.params.room;
  });
  if (roomId !== -1 && typeof data.rooms[roomId] != "undefined") {
    //data.roomid = roomId
    data.groups = data.rooms[roomId].groups;
    data.room = data.rooms[roomId];
  }
   response.render("roomsession", data);
});

app.get("/", (request, response) => {
  // Here's some data that the our server knows:
  let dt = new Date();

  let data = {
    sessions: Sessions,
    allrooms: AllRooms,
    errors: errors,
  };

  response.render("index", data);
});

app.get("/today", (request, response) => {
  // Here's some data that the our server knows:
  let dt = new Date();

  let id = Sessions.findIndex((session) => {
    return session.End > dt;
  });

  if (id >= 0) {
    let nextDate = Sessions[id].Date.toISODate();
     var todaysSessions = Sessions.filter((session) => {
      return session.Date.toISODate() == nextDate;
    });

    let data = {
      sessions: todaysSessions,
      allrooms: AllRooms,
      errors: errors,
    };

    response.render("today", data);
    return;
  }
  let data = {
    sessions: Sessions,
    allrooms: AllRooms,
    errors: errors,
  };
  response.render("today", data);
});


app.get("/boosters", (request, response) => {
  // Here's some data that the our server knows:
  var dt = DateTime.local({ zone: "Europe/London" });
  //console.log("dt.toISO()", dt.toISO(), dt.hour, dt.minute)
  if (dt.hour > 13 ||(dt.hour == 13 && dt.minute > 35)){
    dt = dt.plus({ days: 1 }).set(MORNING)  
  }
  //console.log("dt2.toISO()", dt.toISO(), dt.hour, dt.minute)
  
  let id = Sessions.findIndex((session) => {
    return session.Date > dt;
  });

  if (id >= 0) {
    let nextDate = Sessions[id].Date.toISODate();
    var todaysSessions = Sessions.filter((session) => {
      return session.Date.toISODate() == nextDate;
    });

    let data = {
      sessions: todaysSessions,
      allrooms: AllRooms,
      errors: errors,
    };

    response.render("boosters", data);
    return;
  }
  let data = {
    sessions: Sessions,
    allrooms: AllRooms,
    errors: errors,
  };
  response.render("today", data);
});



function getTableData(totaltime = 30000, displayStaff = false) {
  // Here's some data that the our server knows:
  let dt = new Date();

  const start = ourExams[0].Date.set(MORNING);

  const end = ourExams[ourExams.length - 1].End;
  const diff = end.diff(start, "day", {});
  const diffDays = Math.ceil(diff.days);
  
  var days = [];
  for (var i = 0; i < diffDays; i++) {
    const iDate = start.plus(Duration.fromObject({ days: i }));
    const sDate = iDate.toLocaleString(DateTime.DATE_HUGE);

    const infuture =
      iDate >
      DateTime.now().set({ hour: 2, minute: 0, second: 0, millisecond: 0 });

    const dayExams = ourExams.filter((exam) => {
      return exam.Date.toLocaleString(DateTime.DATE_HUGE) == sDate;
    });

    days[i] = {
      Date: iDate,
      sDate: iDate.toLocaleString(DateTime.DATE_HUGE),
      timetable: [
        {
          label: "AM",
          exams: dayExams.filter((exam) => {
            return infuture && exam.Date.hour <= 9;
          }),
        },
        {
          label: "", //Mid Morning",
          exams: dayExams.filter((exam) => {
            return infuture && exam.Date.hour > 9 && exam.Date.hour < 12;
          }),
        },
        {
          label: "PM",
          exams: dayExams.filter((exam) => {
            return infuture && exam.Date.hour >= 12;
          }),
        },
      ],
    };
    days[i].ExamDay =
      days[i].timetable
        .map((tt) => tt.exams.length)
        .reduce((a, b) => a + b, 0) > 0;
  }
  let data = {
    days: days,
    sessions: Sessions,
    allrooms: AllRooms,
    errors: errors,
    totaltime: totaltime,
    displayStaff: displayStaff,
  };
  return data;
}

app.get("/table", (request, response) => {
  response.render("table", getTableData());
});

app.get("/screen", (request, response) => {
  response.render("screen", getTableData());
});

app.get("/readerpapers", (request, response) => {
  response.render("readerpapers", getTableData());
});

app.get("/screen/:time/", (request, response) => {
  response.render("screen", getTableData(request.params.time));
});

app.get("/staff/:time/", (request, response) => {
  response.render("screen", getTableData(request.params.time, true));
});

let listener = app.listen(process.env.PORT, () => {
  console.log("Your app is listening on port " + listener.address().port);
});
