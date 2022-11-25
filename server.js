// Generic node.js express init:
const express = require("express");
const app = express();
app.use(express.static("public"));
//const moment = require("moment");
const { DateTime, Duration, Info } = require("luxon");
const yaml = require("js-yaml");
var fs = require("fs"),
  path = require("path"),
  URL = require("url");

const dirTree = require("directory-tree");
var XLSX = require("xlsx");
 
var defaultTimes = {
  "am" : "09:00",
  "10am" : "10:00",
  "pm" : "13:30",
  "p1":"08:45",
  "p3":"11:15",
  "p5":"13:45"
} 

var groupOnDuration = true; //true;

const hbs = require("hbs");
var helpers = require("handlebars-helpers")({
  handlebars: hbs,
});

hbs.registerHelper('asMinutes', function(arg1, options) {
  return arg1.shiftTo('minutes').minutes
}); 

hbs.registerHelper('ifEquals', function(arg1, arg2, options) {
    return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
});  
 
hbs.registerHelper('ifNotEqual', function(arg1, arg2, options) {
    return (arg1 != arg2) ? options.fn(this) : options.inverse(this);
});
   
hbs.registerHelper('join', function(arg1,  options) {
    return arg1.join(", ");
});

var jsonOptions = {header:["ExcelDate","Series","Board","Qual","Code","Subject","Paper","Session","Duration"]};

function getDateFromExcel(date){
   var newDate;
   if(Number.isInteger(parseInt(date))){
     //January 1, 1900, 12:00:00 a.m.
     newDate = DateTime.local(1900,1,1,0,0,0,0,{ zone: "Europe/London"}).plus(Duration.fromObject({days:parseInt(date)-1})); 
   }else{
     newDate = DateTime.fromJSDate(date,{ zone: "Europe/London"});
   }
   //console.log("date", date, "newDate", newDate.toString());
   return newDate;
}

// Luxon
function defaultExamMapping(exam){
  exam.Session = exam.Session.trim();
  exam.Dur = get_duration(exam.Duration)
  const Series = getDateFromExcel(exam.Series).set({
    hour:parseInt(0),
    minutes:parseInt(0),
  });
  exam.Series = Series.toFormat("MMM-yy");//toLocaleString();
  exam.Session = exam.Session.toLowerCase();
  if(exam.Session == "morning"){
    exam.Session = "am";
  }
  if(exam.Session == "afternoon"){
    exam.Session = "pm";
  }
  
  if(exam.Session in defaultTimes){
    exam.StartTime = defaultTimes[exam.Session];
    let time  = exam.StartTime.split(":");
    
    exam.Date = getDateFromExcel(exam.ExcelDate).set({
      hour:parseInt(time[0]),
      minutes:parseInt(time[1]),
    });
    //console.log("exam.ExcelDate", exam.ExcelDate, "exam.Date", typeof exam.Date, exam.Date.toRFC2822(), exam.Code, exam.Board)
    exam.End = exam.Date.plus(exam.Dur);
  } else{
    console.log("exam.Session not found", exam.Session);
  }
  return exam;
}

function getOCRUnit(Title){
  var number = "" ; 
  const regex = /Unit\s+([A-Z0-9]+)\s/;
  const found =Title.match(regex);
  
  if(found){
    number = found[1].padStart(2 ,"0")
    //console.log("number",number)
  }
  return number;
} 

function printExam(label, data, line=0, full=false){
  if(full){
    var str = Object.keys(data[line]).map(key =>{
      return key +":"+ data[line][key].toString()
    }).join(" , ");
    console.log(label, data.length, str);
  } else {  
    console.log(label, data.length, "data=", Object.values(data[line]).join(" , "));
  } 
} 

function printExams(label, data){
  for (var i=0; i<data.length; i++){
    printExam(label + "["+i+"]", data, i, false);
  }
}

function getTimetableAQA(wb){
 /* console.log("workbook", wb.SheetNames);
  var ws = wb.Sheets[wb.SheetNames[0]];
  console.log("sheetdata", sheetdata);
  var sheetdata = XLSX.utils.sheet_to_json(ws,jsonOptions)
  console.log("sheetdata AQA", Object.keys(sheetdata[0]).join());
  var data = sheetdata.slice(1).map(defaultExamMapping);
  */
  var data =[{
    "ExcelDate": new Date('October 31, 2022 00:00:00'),//"18/05/2022",
    "Series": new Date('November 1, 2022 00:00:00'),//01/06/2022",
    "Board":"AQA",
    "Qual":"GCSE",
    "Code":"8700/01",
    "Subject":"English Language",
    "Paper":"Explorations in Creative Reading and Writing",
    "Session":"AM",
    "Duration":"1h 45m"
  },
  {
    "ExcelDate": new Date('November 1, 2022 00:00:00'),//"18/05/2022",
    "Series": new Date('November 1, 2022 00:00:00'),//01/06/2022",
    "Board":"Pearson",
    "Qual":"GCSE",
    "Code":"1MA11F/H",
    "Subject":"Mathematics",
    "Paper":"Paper 1: Non-Calculator",
    "Session":"AM",
    "Duration":"1h 30m"
  },
  {
    "ExcelDate": new Date('November 2, 2022 00:00:00'),//"18/05/2022",
    "Series": new Date('November 1, 2022 00:00:00'),//01/06/2022",
    "Board":"AQA",
    "Qual":"GCSE",
    "Code":"8700/02",
    "Subject":"English Language",
    "Paper":"Writers' viewpoints and perspectives",
    "Session":"AM",
    "Duration":"1h 45m"
  },
   {
    "ExcelDate": new Date('November 3, 2022 00:00:00'),//"18/05/2022",
    "Series": new Date('November 1, 2022 00:00:00'),//01/06/2022",
    "Board":"Pearson",
    "Qual":"GCSE",
    "Code":"1MA12F/H",
    "Subject":"Mathematics",
    "Paper":"Paper 2: Calculator",
    "Session":"AM",
    "Duration":"1h 30m"
  },
  {
    "ExcelDate": new Date('November 7, 2022 00:00:00'),//"18/05/2022",
    "Series": new Date('November 1, 2022 00:00:00'),//01/06/2022",
    "Board":"Pearson",
    "Qual":"GCSE",
    "Code":"1MA13F/H",
    "Subject":"Mathematics",
    "Paper":"Paper 3: Calculator",
    "Session":"AM",
    "Duration":"1h 30m"
  }
  

    ].map(defaultExamMapping).map(exam => {
    //exam.Board = "EdExcel";
    exam.Codes = splitExamCodes(exam.Code.replace(" ","/"));
    return exam;
  });
  //printExam("data AQA", data);
  return data; 
}
 

function getTimetableInternal(wb){
  //console.log("getTimetableInternal")
  /*console.log("workbook", wb.SheetNames);
  var ws = wb.Sheets[wb.SheetNames[0]];
  console.log("sheetdata", sheetdata);
  var sheetdata = XLSX.utils.sheet_to_json(ws,jsonOptions)
  console.log("sheetdata AQA", Object.keys(sheetdata[0]).join());
  var data = sheetdata.slice(1).map(defaultExamMapping);
  */
  var data =[{
    "ExcelDate": new Date('June 27, 2022 00:00:00'),//"18/05/2022",
    "Series": new Date('June 1, 2022 00:00:00'),//01/06/2022",
    "Board":"Internal",
    "Qual":"GCSE",
    "Code":"Internal",
    "Subject":"English Literature",
    "Paper":"Paper 1 Blood Brothers",
    "Session":"P1",
    "Duration":"1h 00m"
  },
  {
    "ExcelDate": new Date('June 27, 2022 00:00:00'),//"18/05/2022",
    "Series": new Date('June 1, 2022 00:00:00'),//01/06/2022",
    "Board":"OCR",
    "Qual":"A-Level",
    "Code":"Internal",
    "Subject":"Computer Science",
    "Paper":"",
    "Session":"PM",
    "Duration":"2h 00m"
  },
  {
    "ExcelDate": new Date('June 28, 2022 00:00:00'),//"18/05/2022",
    "Series": new Date('June 1, 2022 00:00:00'),//01/06/2022",
    "Board":"Internal",
    "Qual":"GCSE",
    "Code":"Internal",
    "Subject":"Science",
    "Paper":"Chemistry",
    "Session":"P1",
    "Duration":"1h 30m"
  },  
  {
    "ExcelDate": new Date('June 28, 2022 00:00:00'),//"18/05/2022",
    "Series": new Date('June 1, 2022 00:00:00'),//01/06/2022",
    "Board":"Internal",
    "Qual":"GCSE",
    "Code":"Internal",
    "Subject":"Science",
    "Paper":"Chemistry",
    "Session":"P3",
    "Duration":"1h 30m"
  },  
  {
    "ExcelDate": new Date('June 28, 2022 00:00:00'),//"18/05/2022",
    "Series": new Date('June 1, 2022 00:00:00'),//01/06/2022",
    "Board":"Internal",
    "Qual":"GCSE",
    "Code":"Internal",
    "Subject":"Maths",
    "Paper":"Paper 1",
    "Session":"P5",
    "Duration":"1h 30m"
  }, 

    ].map(defaultExamMapping).map(exam => {
    //exam.Board = "EdExcel";
    exam.Codes = splitExamCodes(exam.Code.replace(" ","/"));
    return exam;
  });
  //printExam("data AQA", data);
  return data; 
}
 

function getTimetableYAML(file){
  try {
    const doc = yaml.load(fs.readFileSync(file, 'utf8'));
    console.log(doc);
    var data = doc.map(exam => {
      exam.ExcelDate = new Date(exam.ExcelDate);
      exam.Series = new Date(exam.Series);
      return exam;
    }).map(defaultExamMapping).map(exam => {
      exam.Codes = splitExamCodes(exam.Code.replace(" ","/"));
      return exam;
    });
    printExam("data YAML", data);
    return data; 

  } catch (e) {
    console.log(e);
  }

    
}
 


function getTimetableOCR(wb){
  //console.log("workbook", wb.SheetNames);
  var ws = wb.Sheets[wb.SheetNames[0]]
  //console.log("sheetdata", sheetdata);
  var sheetdata = XLSX.utils.sheet_to_json(ws,jsonOptions)
  //console.log("sheetdata OCR", Object.keys(sheetdata[0]).join());
  var data = sheetdata.slice(1).map(defaultExamMapping).map(exam => {
    exam.Subject = exam.Subject.replace("(","").replace(")","")
    var Codes = splitExamCodes(exam.Code);
    exam.Codes = Codes;
    var Unit = getOCRUnit(exam.Paper); 
    if (Unit){
      var codes = Codes.map(Code => {
        return Code+"/"+Unit;
      });
      exam.Codes = codes;
    }
    return exam;
  });  
   
  //printExam("data OCR", data);
  return data; 
} 

function getTimetablePearson(wb){
  var ws = wb.Sheets['All papers']
  var sheetdata = XLSX.utils.sheet_to_json(ws, jsonOptions)
  var data = sheetdata.slice(1).map(defaultExamMapping).map(exam => {
    //exam.Board = "EdExcel";
    exam.Codes = splitExamCodes(exam.Code.replace(" ","/"));
    return exam;
  }); 
  //printExam("data Pearson", data);
  return data;
}

const tree = dirTree('./exams/');//, {extensions:/\.xlsx$/});

var allExams = [];
tree.children.forEach(dir=>{
  dir.children.forEach(fileEntry=>{
    const opts = {cellDates:true};
    var workbook = XLSX.readFile(fileEntry.path, opts);
    //workbook.SheetNames is an ordered list of the sheets in the workbook
    switch (dir.name){
      case "OCR":
        allExams = allExams.concat(getTimetableOCR(workbook));
        break;
      case "Pearson":
        allExams = allExams.concat(getTimetablePearson(workbook));
        break;
      case "AQA":
        allExams = allExams.concat(getTimetableAQA(workbook));
        break;
      case "internal":
        //allExams = allExams.concat(getTimetableInternal(workbook));
        break;
      case "YAML":
        allExams = allExams.concat(getTimetableYAML(fileEntry.path));
        break;
    }
  })
}); 

allExams.sort(examCompare);
//printExam("allExams", allExams,0, true);
//printExams("allExams", allExams);

//console.log("allExams", allExams.length);

var ourExamsList = fs.readFileSync('examsList.txt').toString().split("\n")
ourExamsList = ourExamsList.map(splitExamCodes).flat().filter(examcode=>{return examcode.length});
//console.log("ourExamsList", ourExamsList.length, "=", ourExamsList);


var allExamCodes = allExams.map(exam =>{
  return exam.Codes;
}).flat().sort();

//console.log("allExamCodes", allExamCodes);

var ourExams = allExams.filter(exam => {
  return exam.Codes.some(all_code => {
    return ourExamsList.some(our_code => {
      //console.log(all_code, our_code,all_code.startsWith(our_code))
      return all_code.startsWith(our_code);
    });
  });
}).map(setSessionAndGroup);



function setSessionAndGroup(exam){
  //console.log("exam.StartTime", exam.StartTime);
  const SessionName = exam.Date.toLocaleString(DateTime.DATE_HUGE) + " " + exam.Session;
  var GroupKey = exam.Date.toLocaleString() + " : " + exam.Code;
  if (groupOnDuration) {
      GroupKey = exam.Date.toLocaleString() + " : " + exam.Qual + " : " + exam.Dur.toHuman({ unitDisplay: "short" })
  }
  exam.SessionName = SessionName;
  exam.GroupKey = GroupKey;
  return exam;
} 

function roundUp(m) {
  return m.second() || m.millisecond()
    ? m.add(1, "minute").startOf("minute")
    : m.startOf("minute");
} 

function get_duration(Dur) {
  const aduration = Dur.match(
    "([0-3]?) ?[hours]* *([0-9]?[0-9]?) ?[minutes]*"
  );
  //console.log("aduration", aduration)
  var mins = 0;
  if (typeof aduration[2] != "undefined") {
    mins = aduration[2];
  } 
  
  var momentopts = {
    minute: mins,
    hour: aduration[1],
  };

  if(aduration[1] == ''){
    console.log("Dur", Dur, "momentopts", momentopts);
  }
  var duration_moment = Duration.fromObject(momentopts);

  if (duration_moment.isValid) {
     return duration_moment;
  }
  console.warning(duration_moment, "at", duration_moment.invalidExplanation);
  
  //dur.toHuman({ unitDisplay: "short" })
}

function splitExamCodes(name){
  return name.split(/[- &]+/);
} 
 
var ourExamNames = ourExams.map(exam =>{
  return exam.Paper;
});

var ourExamCodes = ourExams.map(exam =>{
  return exam.Codes;
}).flat().sort()

//console.log("ourExamCodes", ourExamCodes)

var missingExams = ourExamCodes.filter(code => {
  return !allExamCodes.includes(code);
});
 
var sessionNames = ourExams.map(exam =>{
  return exam.Session
});

//console.log("missingExams", missingExams);
//console.log("ourExamNames", ourExamNames.length, ourExamNames.join(" , "));
//console.log("sessionNames", sessionNames)

var examCompare = function(a,b){
  if (a.Date < b.Date){
    return -1;
  }
  if (a.Date > b.Date){
    return 1;
  }
  if (a.End < b.End){
    return -1;
  }
  if (a.End > b.End){
    return 1;
  }
  return 0;
}

ourExams.sort(examCompare);

hbs.registerPartials(__dirname + "/views/partials");
app.set("view engine", "hbs");
app.set("views", __dirname + "/views");

var data, errors;
var Sessions = [];
var AllRooms = [];

var aSessions = Array.from(new Set(ourExams.map(exam=>{
  return exam.SessionName
})));

Sessions = aSessions.map((sSession, iIndex) =>{
  var aExams = ourExams.filter(exam => {
    return (exam.SessionName == sSession);
  });
  
  //printExams("aExams", aExams);
  
  var aGroupKeys = Array.from(new Set(aExams.map(exam=>{
    return exam.GroupKey;
  })));
  
  //console.log("aGroupKeys", aGroupKeys);
  
  var aGroups = aGroupKeys.map(sGroupKey =>{
    var aGroupExams = aExams.filter(exam => {
      return (exam.GroupKey == sGroupKey);
    });
    
    var aGroup = {
      name: aGroupExams[0].Board+" "+aGroupExams[0].Qual,
      Duration:aGroupExams[0].Duration,
      Dur:aGroupExams[0].Dur,
      StartTime:aGroupExams[0].StartTime,
      papers:  aGroupExams
    };  
    /*aGroupExams[0];
    aGroup.name=  aGroupExams[0].Qual; //aGroupExams.map(exam=>{return exam.Paper}).join("<br>"),
    //Session      : aGroupExams[0].Session,
    aGroup.papers = aGroupExams*/
    return aGroup;
  }); 
   
  //console.log("aGroups", aGroups);
  return {
    name        : sSession,
    id          : iIndex,
    next          : iIndex + 1,
    //Session     : aExams[0].Session,
    //start_time  : aExams[0].StartTime,
    Date        : aExams[0].Date,
    End         : aExams[aExams.length-1].End,
    groups      : aGroups
  }
});

//var Sessions = AllRooms = errors = {};
hbs.localsAsTemplateData(app);
//app.locals.errors = errors

//sessionnmoment
app.get("/current", (request, response) => {
  let dt = DateTime.local({ zone: "Europe/London"});
  let id = Sessions.findIndex((session) => {
    return session.End > dt;
  });
  //console.log("id", id) 

  if (id >= 0) {
    let data = Sessions[id];
    response.render("currentsession", data);
  } else {
    let data = {
      sessions: Sessions,
      allrooms: AllRooms,
      errors:errors 
    };
    response.render("index", data);
  } 
});

/*//sessionnmoment
app.get("/current/room/:room", (request, response) => {
    let dt = new moment(); //.add(3, "hours");
    let id = Sessions.findIndex((session) => {
    return session.endmoment > dt;
  });
  
  if (id >= 0) {
    let data = JSON.parse(JSON.stringify(Sessions[id]));  
    data.groups = data.groups.filter((group)=>{
    return group.rooms.includes(request.params.room)
  })
    data.sessionroom = request.params.room
    response.render("roomsession", data);
  } else {
    let data = {
      sessions: Sessions,
      allrooms: AllRooms
    };
    response.render("index", data);
  }
});
*/

//printExam("ourExams", ourExams, 0, true);
//printExams("ourExams", ourExams);

app.get("/session/:id", (request, response) => {
  let dt = new Date();
  let data = Sessions[request.params.id];
  //console.log("/session/"+request.params.id+" data", data);
  response.render("session", data);
});

app.get("/session/room/:room/:id", (request, response) => {
  let dt = new Date();
  let data = JSON.parse(JSON.stringify(Sessions[request.params.id]));
  if(data){
    data.groups = data.groups.filter((group)=>{
      return group.rooms.includes(request.params.room)
    })
  } 
  data.sessionroom = request.params.room
  response.render("roomsession", data);
});

app.get("/", (request, response) => {
  // Here's some data that the our server knows:
  let dt = new Date();
  
  let data = {
    sessions: Sessions,
    allrooms: AllRooms,
    errors:errors 
  };

  response.render("index", data);
});



app.get("/table", (request, response) => {
  // Here's some data that the our server knows:
  let dt = new Date();
  
  const start = ourExams[0].Date
  
  const end = ourExams[ourExams.length-1].End
  const diff = end.diff(start, "day", {});
  const diffDays = Math.ceil(diff.days);
  
  var days = [];
  for (var i = 0; i< diffDays; i++){
    console.log("i", i)
    const iDate = start.plus(Duration.fromObject({days:i}))
    days[i] = {
      Date : iDate,
      sDate: iDate.toLocaleString(DateTime.DATE_HUGE),
      am: ourExams.filter(exam => {
          return ( (exam.Date.toString() == iDate.toString())  && exam.Date.hour <12);
        }),
      pm: ourExams.filter(exam => {
          return ( (exam.Date.toString() == iDate.toString())  && exam.Date.hour >= 12);
        }),
      //weekend: iDate.weekdayLong in ["Saturday", "Sunday"]
    }
    days[i].ExamDay = (days[i].am.length + days[i].pm.length) > 0;
  }
  
  let data = {
    days:days,
    sessions: Sessions,
    allrooms: AllRooms,
    errors:errors 
  };

  response.render("table", data);
});


let listener = app.listen(process.env.PORT, () => {
  console.log("Your app is listening on port " + listener.address().port);
});
