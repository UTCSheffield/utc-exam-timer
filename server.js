// Generic node.js express init:
const express = require("express");
const app = express();
app.use(express.static("public"));
const moment = require("moment");
const yaml = require("js-yaml");
var fs = require("fs"),
  path = require("path"),
  URL = require("url");


// These next lines allow us to use "response.render" with handlebars files!
// https://www.npmjs.com/package/express-handlebars
//
const hbs = require("hbs");
var helpers = require("handlebars-helpers")({
  handlebars: hbs,
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

//
// The partials directory hold additional files that we're allowed to use inside of
// our other templates using the partials syntax, e.g.: {{< head}}
// see http://handlebarsjs.com/partials.html
//
hbs.registerPartials(__dirname + "/views/partials");

//
// This next pair of lines teaches Express that if I ask to render a file, say "index",
// it's allowed to use any file named "index" that ends with 'hbs' and is contained in
// the "views" folder
app.set("view engine", "hbs");
app.set("views", __dirname + "/views");

const grouponduration = false; //true;

function roundUp(m) {
  return m.second() || m.millisecond()
    ? m.add(1, "minute").startOf("minute")
    : m.startOf("minute");
}
function get_paper_moment(datetimetext) {
  var paper_moment = moment(datetimetext, "dddd Do MMMM YYYY HH:mm");

  if (!paper_moment.isValid()) {
    console.warning(paper_moment, "at", paper_moment.invalidAt());
  } else {
    if (paper_moment.hours() > 17) {
      console.log("Too Late", paper_moment);
    } else if (paper_moment.year() != moment().year()) {
      console.log("Wrong Year", paper_moment);
    }
    else{
      return paper_moment;
    }
  }
}

function get_duration_moment(Duration) {
  const aduration = Duration.match(
    "([1-3]?) ?[hours]* *([0-9]?[0-9]?) ?[minutes]*"
  );
  //console.log("aduration", aduration)
  var mins = 0;
  if (typeof aduration[2] != "undefined") {
    mins = aduration[2];
  }
  var momentopts = {
    minutes: mins,
    hours: aduration[1],
  };

  var duration_moment = moment.duration(momentopts);

  if (duration_moment.isValid()) {
     return duration_moment;
  }
  console.warning(duration_moment, "at", duration_moment.invalidAt());
}

var data, errors;
try {
  //https://codebeautify.org/excel-to-json
  data = fs.readFileSync("./march-2022.json", "utf8");
  errors=[];
} catch (err) {
  errors.append("Read Failed")
  console.error("Read Failed", err);
}
var ws;
try {
  const jdata = JSON.parse(data);
  const worksheetsnames = Object.keys(jdata);
  ws = jdata[worksheetsnames[0]];
} catch (err) {
  errors.append("JSON Parse Failed")
  console.error("JSON Parse Failed", err);
}

var Sessions = [];
var AllRooms = [];

//console.log(ws);
var lines = ws.map((line) => {
  //console.log(line)
  //Create date moment
  //Create full Session name
  for (var key in line) {
    if (key != "DATE") {
      const SessionName = line.DATE + " : " + key;
      var SessionsRooms = [];
      var sessionmoment = false
      var sessionend = false
      
      var doc;
      try {
        //console.log("SessionName", SessionName);
        doc = yaml.load(line[key].trim());
      } catch (e) {
        console.log("YAML Error", e);
        errors.append("YAML Error"+e)
      }
      if (typeof doc == "object") {
        var oGroups = {};

        for (var paper in doc) {
          var Paper = doc[paper];
          Paper.Paper = paper;
          //console.log(Paper, Paper);
          const start_time = Paper["Start Time"];
          if(!start_time){
            console.warning("Start Time missing for", paper)
            errors.append("Start Time missing for", paper)
          }
           
          var datetimetext = line.DATE + " " + start_time;
          var paper_moment = get_paper_moment(datetimetext);
          //get duration as minutes
           

          //console.log("Paper.Duration", Paper.Duration);
          const duration_moment = get_duration_moment(Paper.Duration);
          var paper_mins = duration_moment.asMinutes();
          //console.log("paper_mins", paper_mins);
          
          var paper_end = paper_moment+(1*duration_moment);
          //console.log(paper_moment, duration_moment, paper_end)
          
          if(!sessionmoment || paper_moment < sessionmoment){
            sessionmoment =  paper_moment
          }
          if(!sessionend || paper_end > sessionend){
            sessionend =  paper_end
          }
          
          //create groupkey with paper name
          var groupkey = SessionName + " : " + paper;
          if (grouponduration) {
            groupkey = SessionName + " : " + start_time + " : " + paper_mins;
          }
 
          if (groupkey in oGroups) {
            oGroups[groupkey].papers.push(Paper);
          } else {
            oGroups[groupkey] = {
              name: paper,
              start_time: start_time,
              durationmins: paper_mins, //duration,
              papers: [Paper],
              rooms: []
            };
          }
        
          var Rooms = Paper.Rooms.trim()
          if(Rooms.length){
            var PaperRooms = Rooms.split(/[\&,]/);
            //console.log("PaperRooms", PaperRooms);

            PaperRooms.forEach((Room)=>{
              var RoomA = Room.trim(); 
              //console.log("RoomA", RoomA);
              
              if (!oGroups[groupkey].rooms.includes(RoomA)){
                oGroups[groupkey].rooms.push(RoomA)
              }
              
              if (!SessionsRooms.includes(RoomA)){
                SessionsRooms.push(RoomA)
              }
              
              if (!AllRooms.includes(RoomA)){
                AllRooms.push(RoomA)
              }
            })
          }
        }
        Sessions.push({
          name: SessionName,
          id:Sessions.length,
          next: Sessions.length + 1,
          groups: Object.values(oGroups),
          rooms: SessionsRooms,
          sessionmoment:sessionmoment,
          endmoment:sessionend,
        });
      }
    }
  }
  return line; 
});

hbs.localsAsTemplateData(app);
//app.locals.errors = errors

//sessionnmoment
app.get("/current", (request, response) => {
  let dt = new moment(); //.add(3, "hours");
  let id = Sessions.findIndex((session) => {
    return session.endmoment > dt;
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


//sessionnmoment
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

//
// Ok, now let's handle requests but render a handlebars file instead of the normal index.html!
//
app.get("/session/:id", (request, response) => {
  let dt = new Date();
  let data = Sessions[request.params.id];
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
  

  /*const filtered = Sessions.filter((session)=>{
    return session.sessionmoment>dt
  })
  if(filtered.length > 0){
    Sessions = filtered;
  }*/
  let data = {
    sessions: Sessions,
    allrooms: AllRooms,
    errors:errors 
  };

  // Now we render 'views/index.handlebars' with our data object.
  // There are a lot of other ways to call handlebars, too.
  // see http://handlebarsjs.com/
  response.render("index", data);
});

// And we end with some more generic node stuff -- listening for requests :-)
let listener = app.listen(process.env.PORT, () => {
  console.log("Your app is listening on port " + listener.address().port);
});