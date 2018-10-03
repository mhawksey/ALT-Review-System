function clearCache(){
  CacheService.getScriptCache().remove('custom_fields');
}

function getCustomFields_(){
  var value = CacheService.getScriptCache().get('custom_fields');
  if (!value){
    var doc = SpreadsheetApp.getActive();
    var range = doc.getSheetByName('custom_fields').getDataRange();
    var value =  JSON.stringify(objectify(range));
    CacheService.getScriptCache().put('custom_fields', value, 604800);
  }
  return value;
}

function createToken_(email, row, mode, reviewer_num) {
  var hashedEmail = getHashedText(email);
  var blob = Utilities.newBlob(JSON.stringify({
    reviewer: hashedEmail,
    row: row,
    reviewer_num: reviewer_num,
    mode: mode
  }));
  return Utilities.base64EncodeWebSafe(blob.getBytes());
}

function decodeToken_(token) {
  try {
    return JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(token)).getDataAsString());
  } catch (e) {
    return {
      mode: 'review'
    };
  }
}

function getHashedText(email) {
  var hash = CacheService.getScriptCache().get('HASH');
  if (!hash) {
    hash = PropertiesService.getScriptProperties().getProperty('HASH');
    CacheService.getScriptCache().put('HASH', hash, 86000)
  }
  // based on https://stackoverflow.com/a/27933459
  var hashedEmail = Utilities.computeHmacSha256Signature(email, hash).reduce(function(str, chr) {
    chr = (chr < 0 ? chr + 256 : chr).toString(16);
    return str + (chr.length == 1 ? '0' : '') + chr;
  }, '');
  return hashedEmail;
}

function objectify(dataRange) {
  // Fetch values for each row in the Range.
  var data = dataRange.getValues();
  var header = data.shift();
  // convert 2d array into object array
  // https://stackoverflow.com/a/22917499/1027723
  // for pretty version see https://mashe.hawksey.info/?p=17869/#comment-184945
  var obj = data.map(function(values) {
    return header.reduce(function(o, k, i) {
      o[k] = values[i];
      return o;
    }, {});
  });
  return obj;
}

// https://stackoverflow.com/a/1026087
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function getEmailTemplate(id) {
  var emailTemp = SpreadsheetApp.getActive().getSheetByName('EmailTemplates');
  var emails = emailTemp.getDataRange();
  var email_obj = objectify(emails);
  return email_obj.filter(idFilter(id))[0];
}

function getGmailTemplate(id) {
  var drafts = GmailApp.getDrafts();
  var draft = drafts.filter(subjectFilter(id))[0];
  for (var d=0; d<drafts.length; d++){
    var subject = drafts[d].getMessage().getSubject();
    if(subject===id){
      var draft = drafts[d];   
      break;
    }
  }
  var msg = draft.getMessage();
  return {text: msg.getPlainBody(), html:msg.getBody()};
}

function subjectFilter(id){
  return function(element) {
    if (element.getMessage().getSubject() === id) {
      return element;
    }
  }
}

function idFilter(id) {
  return function(element) {
    if (element.id === id) {
      return element;
    }
  }
}

// Replaces markers in a template string with values define in a JavaScript data object.
// Arguments:
//   - template: string containing markers, for instance ${"Column name"}
//   - data: JavaScript object with values to that will replace markers. For instance
//           data.columnName will replace marker ${"Column name"}
// Returns a string without markers. If no data is found to replace a marker, it is
// simply removed.
function fillInTemplateFromObject(template, data) {
  var email = template;
  // Search for all the variables to be replaced, for instance ${"Column name"}
  var templateVars = template.match(/{([^}]+)}/g);

  // Replace variables from the template with the actual values from the data object.
  // If no value is available, replace with the empty string.
  for (var i = 0; i < templateVars.length; ++i) {
    // normalizeHeader ignores ${"} so we can call it directly here.
    var variableData = data[templateVars[i].substring(1, templateVars[i].length - 1)];
    email = email.replace(templateVars[i], variableData || "");
  }

  return email;
}

//
function extractBracket(str) {
  var rxp = /\(([^\)]+)\)/g;
  var match;
  var matches = [];
  while ((match = rxp.exec(str)) != null) {
    matches.push(match);
  }
  return matches[matches.length - 1][1];
}

function include(filename) {
  return HtmlService.createTemplateFromFile(filename).evaluate().getContent() //.createHtmlOutputFromFile(filename)
  //.getContent();
}

function refreshReviewStats() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var headings = sheet.getDataRange()
    .offset(0, 0, 1)
    .getValues()[0];
  var formulas = sheet.getDataRange()
    .offset(0, 0, 1)
    .getFormulas()[0];
  Logger.log(formulas);
  var calcCols = ['Reviews Assigned', 'Reviews Submitted', 'Reviews Accepted', 'Reviews Declined', 'Reviews Reminded'];
  var calcFormula = {
    "Reviews Assigned": "=ARRAYFORMULA({\"Reviews Assigned\";COUNTIF(AllReviewCols,J$2:J)})",
    "Reviews Submitted": "=ARRAYFORMULA({\"Reviews Submitted\";COUNTIF(Reviews!D:D,\"=\"&A2:A)})",
    "Reviews Accepted": "=ARRAYFORMULA({\"Reviews Accepted\";COUNTIFS(Reviewer1,$J$2:J,Review1Status,\"review_accept\")+COUNTIFS(Reviewer2,$J$2:J,Review2Status,\"review_accept\")+COUNTIFS(Reviewer3,$J$2:J,Review3Status,\"review_accept\")+COUNTIFS(Reviewer4,$J$2:J,Review4Status,\"review_accept\")})",
    "Reviews Declined": "=ARRAYFORMULA({\"Reviews Declined\";COUNTIFS(Reviewer1,$J$2:J,Review1Status,\"review_decline\")+COUNTIFS(Reviewer2,$J$2:J,Review2Status,\"review_decline\")+COUNTIFS(Reviewer3,$J$2:J,Review3Status,\"review_decline\")+COUNTIFS(Reviewer4,$J$2:J,Review4Status,\"review_decline\")})",
    "Reviews Reminded": "=ARRAYFORMULA({\"Reviews Reminded\";COUNTIFS(Reviewer1,$J$2:J,Review1Status,\"review_reminded\")+COUNTIFS(Reviewer2,$J$2:J,Review2Status,\"review_reminded\")+COUNTIFS(Reviewer3,$J$2:J,Review3Status,\"review_reminded\")+COUNTIFS(Reviewer4,$J$2:J,Review4Status,\"review_reminded\")})"
  };

  calcCols.forEach(function(source) {
    var colIdx = headings.indexOf(source) + 1;
    if (colIdx > 0) {
      sheet.getRange(1, colIdx, sheet.getLastRow()).clearContent();
      sheet.getRange(1, colIdx).setFormula(calcFormula[source]);
      SpreadsheetApp.flush();
      var col = sheet.getRange(1, colIdx, sheet.getLastRow())
      var data = col.getValues();
      col.setValues(data);
    }
  });
}

// https://stackoverflow.com/a/2998822
function pad(num, size) {
    var s = "000000000" + num;
    return s.substr(s.length-size);
}

function testBitly(){
  //var url = "https://api-ssl.bitly.com/v4/groups";
  var url = 'https://api-ssl.bitly.com/v4/shorten'
  var headers = {
    authorization: "Bearer "+ PropertiesService.getScriptProperties().getProperty('BITLY_TOKEN')
  };
  
  var options = {
    contentType: 'application/json',
    method : "POST",
    headers : headers,
    payload : JSON.stringify({
      "long_url": "http://google.com",
      "group_guid": PropertiesService.getScriptProperties().getProperty('BITLY_GUID')
    })
  };
  
  var response = UrlFetchApp.fetch(url,options);
}

// https://addyosmani.com/blog/essential-js-namespacing/
// extend.js
// written by andrew dupont, optimized by addy osmani
function extend(destination, source) {
    var toString = Object.prototype.toString,
        objTest = toString.call({});
    for (var property in source) {
        if (source[property] && objTest == toString.call(source[property])) {
            destination[property] = destination[property] || {};
            extend(destination[property], source[property]);
        } else {
            destination[property] = source[property];
        }
    }
    return destination;
};

var UrlShortener = UrlShortener || {};
extend(UrlShortener, {
  Util:{
    getCachedProperty: function (key){
      var cache = CacheService.getScriptCache()
      var value = cache.get(key)
      if (!value){
        var value = PropertiesService.getScriptProperties().getProperty(key);
        cache.put(key, value, 86400);
      }
      return value;
    },
    setToken: function(token){
      PropertiesService.getScriptProperties().setProperty('BITLY_TOKEN', token)
    },
    setGUID: function(guid){
      PropertiesService.getScriptProperties().setProperty('BITLY_GUID', token)
    }
  },
  Url:{
    insert: function (obj){
      var url = 'https://api-ssl.bitly.com/v4/shorten'
      var headers = {
        authorization: "Bearer "+ UrlShortener.Util.getCachedProperty('BITLY_TOKEN')
      };    
      var options = {
        contentType: 'application/json',
        method : "POST",
        headers : headers,
        payload : JSON.stringify({
          "long_url": obj.longUrl,
          "group_guid": UrlShortener.Util.getCachedProperty('BITLY_GUID')
        })
      };
      
      var r = JSON.parse(UrlFetchApp.fetch(url,options));
      return {id:r.link};
    }
  }
});