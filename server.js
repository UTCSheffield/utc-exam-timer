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
const ics = require('ics')

var fs = require("fs"),
  path = require("path"),
  URL = require("url"); 

const dirTree = require("directory-tree");
var XLSX = require("xlsx");

const bShowInternalOnTimerScreen = true;

var defaultTimes = {
  am: "09:00",
  "10am": "10:00",
  one: "13:00",
  pm: "13:00",
  p1: "08:45",
  p3: "11:15",
  p3l: "11:25",
  p4a: "12:10",
  p4b: "12:45",
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

var groupOnDuration = true;//false;//true;

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
    newDate = DateTime.local(1900, 1, 1, 3, 0, 0, 0, {
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
  
  var bDebug = false;
  if(exam.Code.substring(0, 4) == "R184" || exam.Code=="J205"){
    bDebug = true;
  }
  
  if(bDebug){
    console.log("defaultExamMapping exam", exam.Code, "exam.Session", exam.Session);
   }


  

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
  
    

      if(bDebug){
        console.log("defaultExamMapping end exam ", exam.Code, "exam.Session", exam.Session);
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
  console.log("getTimetableSIMS start")
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
      if(exam.Qual == "CAMX" && exam.Code.substring(exam.Code.length - 2) == "01"){
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
        //examCode = exam.Code
        exam.Code = "0" + exam.Code.substring(0, 4) + "/" + exam.Code.substring(4, 6);
        //console.log("examCode", examCode, "exam.Code", exam.Code)
      }
      if (exam.Qual == "CNAT") {
        exam.Qual = "Cambridge National";
      }

      exam.Session = "pm";
      /*
      if ((exam.Date.weekday == 1 || exam.Date.weekday == 5) && exam.Date.hour == 13 && exam.Date.minute == 0) {
        console.log("exam.Date.hour", exam.Date.weekday , exam.Date.hour,  exam.Date.minute)
        exam.Session = "one"; 
      }else 
      */
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
        // This should be a look up of local data
        exam.Rooms = [{ Room: exam.Room }];
      }
      exam.Codes = splitExamCodes(exam.Code.replace(" ", "/"), exam.Board);
      
      //consoleOnce.log("exam", "exam", exam)
      if(exam.Code == "R184/01" || exam.Code=="J205/01"){
        bDebug = true
      }
      if(bDebug){
        console.log("getTimetableSIMS exam", exam.Code, exam.Session, exam.StartTime)
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
        exam.Codes = splitExamCodes(exam.Code.replace(" ", "/"), exam.Board);
        return exam;
      });

    //printExam("data YAML", data);
    return data; 
  } catch (e) {
    console.log("Error", e);
  } 
}

function getTimetableOCR(wb) {
  console.log("getTimetableOCR start")
  var ws = wb.Sheets[wb.SheetNames[0]];
  var sheetdata = XLSX.utils.sheet_to_json(ws, jsonOptions);
  var data = sheetdata
    .slice(1)
    .map(defaultExamMapping)
    .map((exam) => {
      exam.Subject = exam.Subject.replace("(", "").replace(")", "");
      var bDebug = false;
      if(exam.Code.substring(0, 4) == "R184" || exam.Code=="J205"){
        bDebug = true;
      }

      if(bDebug){
        console.log("getTimetableOCR exam", exam.Code, "exam.Session", exam.Session);
       }

      
      var Codes = splitExamCodes(exam.Code, "OCR");
      if(bDebug){
          console.log("exam.Code",exam.Code ,"Codes", Codes)
        }
      exam.Codes = Codes;
      var Unit = getOCRUnit(exam.Paper);
      if (Unit) {
        var codes = Codes.map((Code) => {
          return Code + "/" + Unit;
        });
        exam.Codes = codes;
        if(bDebug){
          console.log("exam.Codes", exam.Codes)
        }
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

function removeusingSet(arr) {
    let outputArray = Array.from(new Set(arr))
    //console.log("removeusingSet", arr, arr.length, "reduced to",outputArray.length, outputArray )
    return outputArray
}

function removewithfilter(arr) {
    let outputArray = arr.filter(function (v, i, self) {
 
        // It returns the index of the first
        // instance of each value
        return i == self.indexOf(v);
    });
  if(arr.length == outputArray.length){
    //console.log("removewithfilter", arr, arr.length, "reduced to",outputArray.length, outputArray )
  }
    return outputArray;
}

function removeDuplicateRooms(Arr){
  let outputArray = [];
 
  // Count variable is used to add the
  // new unique value only once in the
  // outputArray.
  let count = 0;

  // Start variable is used to set true
  // if a repeated duplicate value is
  // encontered in the output array.
  let start = false;

  for (let j = 0; j < Arr.length; j++) {
      for (let k = 0; k < outputArray.length; k++) {
          if (Arr[j]['Room'] == outputArray[k]['Room']) {
              start = true;
          }
      }
      count++;
      if (count == 1 && start == false) {
          outputArray.push(Arr[j]);
      }
      start = false;
      count = 0;
      
  }  
  //console.log("removeDuplicateRooms", Arr, Arr.length, "reduced to",outputArray.length, outputArray )
  return outputArray
}

boardExams = boardExams.map(createID);
simsExams = simsExams.map(createID);
yamlExams = yamlExams.map(createID);

var aSimsRooms = []
simsExams.forEach((exam)=>{
  if (!(exam.Code in aSimsRooms)){
    aSimsRooms[exam.Code] = [];
  } 
  aSimsRooms[exam.Code] = removeusingSet(aSimsRooms[exam.Code].concat(exam.Rooms))
})

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
      if(bBoardCodeInSimsData && sBoardCode == "R184/01"){
        console.log("oSimsExamCodes.includes("+sBoardCode+")", oSimsExamCodes, bBoardCodeInSimsData)
      }
      return bBoardCodeInSimsData
    })){
      oSimsExam.aMatchedBoardExam = oBoardExam.ID
      //console.log("oBoardExam:"+oBoardExam.ID, oBoardExam.Qual, oBoardExam.Subject, oBoardExam.Paper, oSimsExam.ID, oSimsExam.Codes);
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
      boardExam.Date = simsExams[found].Date
      boardExam.StartTime = simsExams[found].StartTime
      
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
  if(sRoom.length < 5){
    return sRoom
  }
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

console.assert(room = getShortRoom('Multi Purpose Hall 2028') == "MPH", room)
console.assert(room = getShortRoom('H&S Development Base G019') == "HSDB", room)
console.assert(room = getShortRoom('H&S Learning Base G018' ) == "HSLB", room)
console.assert(room = getShortRoom('Computing Lab 4 1023' ) == "CL4", room)
console.assert(room = getShortRoom('CL4' ) == "CL4", room)

hbs.registerHelper("getShortRoom", function (arg1) {
  return getShortRoom(arg1);
});

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
  exam.Rooms = removeDuplicateRooms(exam.Rooms)
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
  var bDebug = false
  
  if(exam.Code == "R184/01" || exam.Code=="J205/01"){
        bDebug = true;
  }
  
  if(bDebug){ 
    console.log("setSessionAndGroup exam", exam.Code, "exam.Session", exam.Session);
   }
  
  const SessionName =
    exam.Date.toLocaleString(DateTime.DATE_HUGE) + " " + exam.Session;
  exam.SessionName = SessionName;
  //consoleOnce.log("setSessionAndGroup (once) exam.Date", "setSessionAndGroup (once) exam.Date", exam.Date.toLocaleString(DateTime.DATETIME_MED), "exam.SessionName", exam.SessionName);

  
  if(bDebug){
    console.log("exam.SessionName", exam.SessionName);
  }
  
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
  
  if(bDebug){
    /*console.log("setSessionAndGroup exam", exam.Code, exam.Date.toLocaleString(DateTime.DATETIME_MED))
    console.log("exam.Session", exam.Session);
    console.log("exam.SessionName", exam.SessionName);
    console.log("exam.GroupKey", exam.GroupKey)*/
  }
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
    if (/^\+?\d+$/.test(from) && /^\+?\d+$/.test(to) ){
      var iFrom = parseInt(from)
      var iTo = parseInt(to)
    
      for(i = iFrom ; i <= iTo; i++){
        result.push(i.toString()) 
      }
    } else {
      var innerRange = createRange(from.substring(1), to.substring(1));
      for (var i = from.charCodeAt(0); i <= to.charCodeAt(0); i++) {
          for (var j = 0; j < innerRange.length; j++) {
              result.push(String.fromCharCode(i) + innerRange[j]);
          }
      }

      
    }

    return result;
}

var range;
console.assert(JSON.stringify(range = createRange("1A","1C")) == JSON.stringify(["1A","1B","1C"]), "1A","1C", range)
console.assert(JSON.stringify(range = createRange("5838","5842")) == JSON.stringify(["5838","5839","5840","5841","5842"]),["5838","5842"],range)




function splitExamCodes(name, board = "") {
  var bDebug = false;
  if(name == "5877CC"){
    bDebug = true; 
  }
  
  var chunks = name.split(/[ &]+/);
  var stage2 = chunks.map((chunk)=>{
    if(bDebug){
      console.log("chunk", JSON.stringify(chunk));
    }
    var codePaper = chunk.trim().split("/");
    var stage3 = codePaper.map((part) => {
        var  partRange = part.trim().split("-");
        if(bDebug){
          console.log("partRange", JSON.stringify(partRange));
        }
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
  var stage1 = stage2.flat().map((codeFrag)=>
    {
      if(board=="OCR" && !isNaN(parseInt(codeFrag))){
        return codeFrag.padStart(5, "0");  
      }
      return codeFrag
  })
  if(bDebug){
    console.log("stage1", JSON.stringify(stage1)); 
  }
  return stage1
}

//console.assert(JSON.stringify(splitExamCodes("5877/CC", "OCR")) == JSON.stringify(['05877/CC']), "5877/CC") 
console.assert(JSON.stringify(splitExamCodes("05822", "OCR")) == JSON.stringify([ '05822']), "05822")
console.assert(JSON.stringify(splitExamCodes("05822-05825 & 05873", "OCR") ) == JSON.stringify( [ '05822', '05823', '05824', '05825', '05873' ]),"05822-05825 & 05873")
console.assert(JSON.stringify(splitExamCodes("05826-05829 & 05872", "OCR")) == JSON.stringify( [ '05826', '05827', '05828', '05829', '05872' ]), "05826-05829 & 05872")
console.assert(JSON.stringify(splitExamCodes("05838-05842 & 05877", "OCR")) == JSON.stringify( [ '05838', '05839', '05840', '05841', '05842', '05877' ]), "05838-05842 & 05877")

console.assert(JSON.stringify(splitExamCodes("05833 & 05871", "OCR")) == JSON.stringify( [ '05833', '05871' ]), "05833 & 05871")
console.assert(JSON.stringify(splitExamCodes("1RA0/1A-1C") ) == JSON.stringify( [ '1RA0/1A', '1RA0/1B','1RA0/1C' ]), "1RA0/1A-1C")
console.assert(JSON.stringify(splitExamCodes("R184", "OCR")) == JSON.stringify([ 'R184']), "R184") 
console.assert(JSON.stringify(splitExamCodes("R184", "OCR")) == JSON.stringify([ 'R184']), "R184") 


function getAccess(aExams) {
  //console.log("getAccess(aExams)", aExams[0].SessionName, aExams[0].Rooms)
  
  
  return aExams.reduce((examAccumulator, exam) =>{
    exam.Rooms.forEach(room => {
      //console.log("room", room, "examAccumulator", examAccumulator)
      Object.keys(examAccumulator).forEach(key => {
        if (key in room) {
         examAccumulator[key] = examAccumulator[key] + room[key]
        }
      });
    });
    return examAccumulator
    }, {"Writers":0, "Readers":0}
  );
  
}


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
      bShow : bShowInternalOnTimerScreen || (aGroupExams[0].Board != "Internal"),
      Duration: aGroupExams[0].Duration,
      Dur: aGroupExams[0].Dur,
      StartTime: aGroupExams[0].StartTime,
      papers: aGroupExams,
      summary:aGroupExams.map(exam =>{
        return exam["Component Title"]
      }).join(", ")
    };
    //console.log("aGroupExams[0]", aGroupExams[0])
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
      access: getAccess(aRoomExams),
    };
    return aRoom;
  });
  
  if(aExams.length > 0){
    var sLabel = "No Date"
    sLabel = (aExams[0].Date.toFormat("a")=="AM"?"Morning - ":"Afternoon - ")+aExams[0].Date.toFormat("h:mma").toLowerCase();
    
    var durations = aGroups.map(group =>{
        return group.Dur
      });
    var oDur = Duration.fromMillis(Math.max(...durations)).rescale(); 
    
    return {
      name: sSession,
      id: iIndex,
      next: iIndex + 1,
      Date: aExams[0].Date,
      Label: sLabel, 
      sDate: aExams[0].Date.toLocaleString(DateTime.DATE_HUGE),
      summary: aGroups.map(group =>{
        return group.summary
      }).join(", "),
      duration: oDur.toObject(),
      End: aExams[aExams.length - 1].End,
      groups: aGroups,
      rooms: aRooms,
      boosters: boosterYAML[sSession],
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
      thispage : "current",
      bShowInternalOnTimerScreen : bShowInternalOnTimerScreen
    };
    response.render("noexams", data);
  }
});

app.get("/current/room/:room", (request, response) => {
  let dt = DateTime.local({ zone: "Europe/London" });
  let id = Sessions.findIndex((session) => {
    return session.End > dt;
  });
  
  if (id >= 0) {
    let data = dcopy(Sessions[id]);
    data.bShowInternalOnTimerScreen = bShowInternalOnTimerScreen
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
  data.bShowInternalOnTimerScreen = bShowInternalOnTimerScreen
  response.render("session", data);
});

app.get("/session/:id/room/:room", (request, response) => {
  let data = dcopy(Sessions[request.params.id]);
  data.bShowInternalOnTimerScreen = bShowInternalOnTimerScreen
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
    thispage : ""
  };

  response.render("index", data);
});


app.get("/calendar", (request, response) => {
  // Here's some data that the our server knows:
  let dt = new Date();

  let data = {
    sessions: Sessions,
    allrooms: AllRooms,
    errors: errors,
    thispage : ""
  };
  
  const filename = 'some_file.ics';
   response.set({
    'Content-Type': 'text/calendar',
    'Content-Disposition': `attachment; filename=${filename}`,
  });
  
  var events = Sessions.map(session => {
    return {
      title: "Exams : "+ session.summary,
      start: [session.Date.year, session.Date.month, session.Date.day, (session.Date.hour)-1, session.Date.minute],
      duration: session.duration,
      description: session.summary,
      location: session.rooms.map(room =>{
        return room.short
      }).join(", ")
    }
  })
  
  const { error, value } = ics.createEvents(events
    /*[
    {
      title: 'Lunch',
      start: [2023, 11, 29, 12, 15],
      duration: { minutes: 45 },
      description: 'Annual 10-kilometer run in Boulder, Colorado',
      location: 'Folsom Field, University of Colorado (finish line)',
    },
    {
      title: 'Dinner',
      start: [2023, 11, 30, 12, 15],
      duration: { hours: 1, minutes: 30 }
    }
  ]
  */
  )

  if (error) {
    console.log(error)
    return
  }

  console.log(value)
  response.send(value);
  
  //response.render("index", data);
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
      thispage : "today"
    };

    response.render("today", data);
    return;
  }
  let data = {
    sessions: Sessions,
    allrooms: AllRooms,
    errors: errors,
    thispage : "today"
  };
  response.render("noexams", data);
}); 


app.get("/boosters", (request, response) => {
  // Here's some data that the our server knows:
  var dt = DateTime.local({ zone: "Europe/London" });
  //console.log("dt.toISO()", dt.toISO(), dt.hour, dt.minute)
  if (dt.hour > 13 ||(dt.hour == 13 && dt.minute == 35)){
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
      thispage : "boosters"
    };

    response.render("boosters", data);
    return;
  }
  //response.sendStatus(404)
  let data = {
    sessions: Sessions,
    allrooms: AllRooms,
    errors: errors,
    thispage : "boosters"
  };
  response.status(404).render("noexams", data);
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
      sFolderDate: iDate.toFormat('yyyyLLdd_ccc'),
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
  //console.log("days exam", days[0]["timetable"][0]['exams'][0])

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

app.get("/staff", (request, response) => {
  response.render("table", getTableData(60000, true));
});

app.get("/test", (request, response) => {
  response.send({"cookies":request.cookies,
                 "params":request.params,
                 "query":request.query,
                 "headers":request.headers,
                });
  
});

let listener = app.listen(process.env.PORT, () => {
  console.log("Your app is listening on port " + listener.address().port);
});
